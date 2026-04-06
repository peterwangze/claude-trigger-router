import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import yaml from 'js-yaml';

import { CONFIG_FILE, CONFIG_FILE_JSON, CONFIG_FILE_YML, DEFAULT_CONFIG } from '../constants';
import { run } from '../index';
import { waitForService } from '../service-health';
import { backupConfigFile, normalizeAndValidateConfig, writeConfigFile } from '../utils';
import { killProcess, readServiceInfo } from '../utils/processCheck';
import { decideServiceAction, applyServiceAction } from './service';
import { getRepairFields } from './repair';
import { migrateLegacyConfig } from './migrate';
import { detectSetupEnvironment, RawCurrentConfigResult, RawLegacyConfigResult } from './detect';
import { buildMinimalConfig } from './templates';
import { persistSetupConfig } from './persist';
import { runSetup } from './setup';
import { ISetupConfigDraft } from './types';

interface ISetupIO {
  choose: (message: string, options: string[]) => Promise<string>;
  input: (message: string, defaultValue?: string) => Promise<string>;
  info: (message: string) => void;
}

interface IRunSetupCliDeps {
  readCurrentConfig: () => Promise<RawCurrentConfigResult>;
  readLegacyConfig: () => Promise<RawLegacyConfigResult>;
  probeService: () => Promise<{ kind: 'none' } | { kind: 'self_healthy'; port: number } | { kind: 'self_unhealthy'; port: number } | { kind: 'non_self_occupied'; port: number }>;
  backupCurrentConfig: () => Promise<string | null>;
  writeConfig: (config: any) => Promise<void>;
  executeStart: () => Promise<void>;
  executeReload: () => Promise<void>;
  executeRestart: () => Promise<void>;
  verifyHealth: () => Promise<boolean>;
  enterClaudeCode: () => Promise<void>;
  io: ISetupIO;
}

function createConsoleIO(): ISetupIO {
  const rl = createInterface({ input, output });

  const ask = async (message: string): Promise<string> => {
    const answer = await rl.question(message);
    return answer.trim();
  };

  return {
    async choose(message, options) {
      output.write(`${message}\n`);
      options.forEach((option, index) => {
        output.write(`  ${index + 1}. ${option}\n`);
      });

      while (true) {
        const answer = await ask('> ');
        const pickedIndex = Number(answer);
        if (Number.isInteger(pickedIndex) && pickedIndex >= 1 && pickedIndex <= options.length) {
          return options[pickedIndex - 1];
        }
        const matched = options.find((option) => option === answer);
        if (matched) {
          return matched;
        }
        output.write('请输入选项编号。\n');
      }
    },
    async input(message, defaultValue) {
      const suffix = defaultValue ? ` (${defaultValue})` : '';
      const answer = await ask(`${message}${suffix}: `);
      return answer || defaultValue || '';
    },
    info(message) {
      output.write(`${message}\n`);
    },
  };
}

function readStructuredConfigFile(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  return yaml.load(content);
}

async function readCurrentConfig(): Promise<RawCurrentConfigResult> {
  const candidates = [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON];
  const currentPath = candidates.find((filePath) => existsSync(filePath));
  if (!currentPath) {
    return { kind: 'missing' };
  }

  try {
    return {
      kind: 'found',
      path: currentPath,
      format: currentPath.endsWith('.json') ? 'json' : currentPath.endsWith('.yml') ? 'yml' : 'yaml',
      config: (readStructuredConfigFile(currentPath) ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    return {
      kind: 'parse_error',
      path: currentPath,
      format: currentPath.endsWith('.json') ? 'json' : currentPath.endsWith('.yml') ? 'yml' : 'yaml',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readLegacyConfig(): Promise<RawLegacyConfigResult> {
  const legacyPath = process.env.CTR_SETUP_LEGACY_CONFIG_PATH || join(homedir(), '.ccr', 'config.yaml');
  if (!existsSync(legacyPath)) {
    return { kind: 'missing' };
  }

  try {
    return {
      kind: 'found',
      path: legacyPath,
      config: readStructuredConfigFile(legacyPath),
    };
  } catch (error) {
    return {
      kind: 'read_error',
      path: legacyPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeService() {
  const healthy = await waitForService(DEFAULT_CONFIG.PORT, 500);
  return healthy ? { kind: 'self_healthy' as const, port: DEFAULT_CONFIG.PORT } : { kind: 'none' as const };
}

async function enterClaudeCode(): Promise<void> {
  const cliModule = await import('../cli');
  await cliModule.runClaudeCode();
}

async function executeStart(): Promise<void> {
  const childProcess = await import('child_process');
  childProcess.spawn(process.execPath, [process.argv[1], 'start', '--daemon'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CTR_DAEMON: '1' },
  }).unref();
}

async function executeRestart(): Promise<void> {
  const info = readServiceInfo();
  if (info) {
    try {
      killProcess(info.pid);
    } catch {
      // Ignore stop failures here and rely on the following health check.
    }
  }
  await executeStart();
}

function mapConfigErrorsToRepairFields(errors: string[]) {
  const fields = getRepairFields(errors);
  return fields.includes('manualReview')
    ? { mode: 'manualReview' as const, fields }
    : { mode: 'repair' as const, fields };
}

function toDraftFromConfig(config: any): ISetupConfigDraft {
  const derivedModels = !Array.isArray(config?.Models) && Array.isArray(config?.Providers)
    ? config.Providers.flatMap((provider: any) =>
        (Array.isArray(provider.models) ? provider.models : []).map((model: string) => ({
          id: `${provider.name}_${String(model).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`,
          key: provider.api_key ?? '',
          api_key: provider.api_key ?? '',
          api: provider.api_base_url,
          api_base_url: provider.api_base_url,
          interface: provider.api_base_url?.includes('/v1/messages') ? 'anthropic' : 'openai',
          protocol: provider.api_base_url?.includes('/v1/messages') ? 'anthropic' : 'openai',
          model,
        }))
      )
    : [];

  return {
    Providers: Array.isArray(config?.Providers)
      ? config.Providers.map((provider: any) => ({
          name: provider.name ?? '',
          api_key: provider.api_key ?? '',
          api_base_url: provider.api_base_url,
          models: Array.isArray(provider.models) ? [...provider.models] : [],
          transformer: provider.transformer?.use ? { use: [...provider.transformer.use] } : undefined,
        }))
      : [],
    Models: Array.isArray(config?.Models)
      ? config.Models.map((model: any) => ({
          id: model.id ?? '',
          key: model.key ?? model.api_key ?? '',
          api_key: model.api_key ?? '',
          api: model.api ?? model.api_base_url,
          api_base_url: model.api_base_url,
          interface: model.interface ?? model.protocol,
          protocol: model.protocol,
          model: model.model ?? '',
          thinking: typeof model.thinking === 'string'
            ? model.thinking
            : model.thinking
              ? { ...model.thinking }
              : undefined,
        }))
      : derivedModels,
    Router: {
      default: Array.isArray(config?.Models)
        ? config?.Router?.default
        : Array.isArray(config?.Providers) && typeof config?.Router?.default === 'string' && config.Router.default.includes(',')
          ? derivedModels.find((item) => {
              const [providerName, modelName] = config.Router.default.split(',');
              return item.id.startsWith(`${providerName}_`) && item.model === modelName;
            })?.id
          : config?.Router?.default,
    },
  };
}

async function buildFreshConfig(io: ISetupIO): Promise<ISetupConfigDraft> {
  const preset = await io.choose('选择 provider 预设', ['openrouter', 'deepseek', 'openai-compatible', 'custom']);
  const providerName = await io.input('Provider 名称', preset === 'openai-compatible' ? 'openai-compatible' : preset);
  const apiBaseUrl = preset === 'custom' ? await io.input('API Base URL') : await io.input('API Base URL（留空使用预设）', '');
  const apiKey = await io.input('API Key');
  const model = await io.input('默认模型');

  return buildMinimalConfig({
    providers: [
      {
        name: providerName,
        api_key: apiKey,
        models: [model],
        preset: preset as 'openrouter' | 'deepseek' | 'openai-compatible' | 'custom',
        api_base_url: apiBaseUrl,
      },
    ],
    defaultModel: providerName,
  });
}

async function completeDraft(input: { draft: ISetupConfigDraft; fields: string[]; io: ISetupIO }): Promise<ISetupConfigDraft> {
  const draft = toDraftFromConfig(input.draft);

  if (input.fields.includes('defaultModel')) {
    const defaultProvider = draft.Models?.[0]?.id ?? draft.Providers?.[0]?.name ?? 'provider';
    const defaultModel = draft.Models?.[0]?.model ?? draft.Providers?.[0]?.models?.[0] ?? '';
    const model = await input.io.input('默认模型', defaultModel);
    if (draft.Models?.[0]) {
      draft.Models[0].model = model;
      draft.Router.default = defaultProvider;
    } else if (draft.Providers?.[0]) {
      draft.Providers[0].models = [model];
      draft.Router.default = `${defaultProvider},${model}`;
    }
  }

  if (input.fields.includes('apiKey')) {
    const apiKey = await input.io.input('API Key');
    if (draft.Models?.length) {
      draft.Models = draft.Models.map((model) => ({ ...model, key: model.key || apiKey, api_key: model.api_key || apiKey }));
    } else {
      draft.Providers = draft.Providers?.map((provider) => ({ ...provider, api_key: provider.api_key || apiKey }));
    }
  }

  if (input.fields.includes('apiBaseUrl')) {
    const apiBaseUrl = await input.io.input('API Base URL');
    if (draft.Models?.length) {
      draft.Models = draft.Models.map((model) => ({
        ...model,
        api: model.api || apiBaseUrl,
        api_base_url: model.api_base_url || apiBaseUrl,
      }));
    } else {
      draft.Providers = draft.Providers?.map((provider) => ({
        ...provider,
        api_base_url: provider.api_base_url || apiBaseUrl,
      }));
    }
  }

  return draft;
}

function createDefaultDeps(io = createConsoleIO()): IRunSetupCliDeps {
  return {
    readCurrentConfig,
    readLegacyConfig,
    probeService,
    backupCurrentConfig: backupConfigFile,
    writeConfig: writeConfigFile,
    executeStart,
    executeReload: executeRestart,
    executeRestart,
    verifyHealth: () => waitForService(DEFAULT_CONFIG.PORT, 5000),
    enterClaudeCode,
    io,
  };
}

export async function runSetupCli(customDeps?: Partial<IRunSetupCliDeps>): Promise<void> {
  const defaults = createDefaultDeps(customDeps?.io);
  const deps = { ...defaults, ...customDeps } as IRunSetupCliDeps;

  await runSetup({
    detectSetupEnvironment: () =>
      detectSetupEnvironment({
        readCurrentConfig: deps.readCurrentConfig,
        readLegacyConfig: deps.readLegacyConfig,
        probeService: deps.probeService,
      }),
    chooseCurrentConfigAction: async ({ currentConfig }) => {
      if (currentConfig.kind === 'missing') {
        return 'create';
      }
      if (currentConfig.kind === 'valid') {
        deps.io.info('检测到现有可用配置。');
        if (currentConfig.warnings.length > 0) {
          deps.io.info(`当前配置提示：${currentConfig.warnings.join('; ')}`);
        }
        return (await deps.io.choose('选择下一步', ['reuse', 'overwrite', 'cancel'])) as 'reuse' | 'overwrite' | 'cancel';
      }
      if (currentConfig.kind === 'invalid') {
        deps.io.info(`当前配置校验失败：${currentConfig.errors.join('; ')}`);
        if (currentConfig.warnings.length > 0) {
          deps.io.info(`当前配置提示：${currentConfig.warnings.join('; ')}`);
        }
        return (await deps.io.choose('选择下一步', ['repair', 'overwrite', 'cancel'])) as 'repair' | 'overwrite' | 'cancel';
      }

      deps.io.info(`当前配置无法解析：${currentConfig.error}`);
      return (await deps.io.choose('选择下一步', ['rebuild', 'cancel'])) as 'rebuild' | 'cancel';
    },
    chooseLegacyConfigAction: async ({ legacyConfig }) => {
      if (legacyConfig.kind === 'found') {
        return (await deps.io.choose('检测到旧 ccr 配置，是否迁移？', ['migrate', 'skip'])) as 'migrate' | 'skip';
      }
      if (legacyConfig.kind === 'read_error') {
        deps.io.info(`旧 ccr 配置读取失败：${legacyConfig.error}`);
      }
      return 'skip';
    },
    buildFreshConfig: () => buildFreshConfig(deps.io),
    buildRepairConfig: async ({ currentConfig }) => toDraftFromConfig(currentConfig),
    completeDraft: ({ draft, fields }) => completeDraft({ draft, fields, io: deps.io }),
    migrateLegacyConfig,
    mapConfigErrorsToRepairFields,
    persistConfig: async ({ config, currentConfigPath, hasExistingConfig }) => {
      const normalized = normalizeAndValidateConfig(config as any);
      const persisted = await persistSetupConfig({
        config: normalized.config,
        currentConfigPath,
        hasExistingConfig,
        validateConfig: (inputConfig) => normalizeAndValidateConfig(inputConfig).errors,
        backupCurrentConfig: deps.backupCurrentConfig,
        writeConfig: deps.writeConfig,
      });
      if (normalized.warnings.length > 0) {
        deps.io.info(`配置提示：${normalized.warnings.join('; ')}`);
      }
      return persisted;
    },
    ensureServiceReady: async ({ configChanged, detectedService, reloadSupported }) => {
      const action = decideServiceAction({
        configChanged,
        detectedService,
        reloadSupported,
      });

      await applyServiceAction({
        action,
        executeStart: deps.executeStart,
        executeReload: deps.executeReload,
        executeRestart: deps.executeRestart,
        verifyHealth: deps.verifyHealth,
      });

      return {
        action: action.kind,
        healthChecked: true,
      };
    },
    enterClaudeCode: deps.enterClaudeCode,
    reloadSupported: false,
  });
}
