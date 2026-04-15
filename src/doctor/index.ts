import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { spawn } from 'child_process';
import JSON5 from 'json5';
import yaml from 'js-yaml';

import { CONFIG_FILE, CONFIG_FILE_JSON, CONFIG_FILE_YML, DEFAULT_CONFIG } from '../constants';
import { normalizeAndValidateConfig, writeConfigFile, backupConfigFile } from '../utils';
import { migrateLegacyConfig } from '../setup/migrate';
import { readLegacyConfig } from '../setup';
import { IAppConfig, IModelEndpointConfig } from '../trigger/types';
import { getModelApi, getModelInterface, getModelKey } from '../models/schema';
import { buildModelRegistry } from '../models/compile';
import { buildProviderDispatchRequest } from '../protocols';
import { isServiceRunning, killProcess, readServiceInfo } from '../utils/processCheck';
import { isTcpPortOccupied, probeServiceHealth, waitForService } from '../service-health';
import { buildUsableMinimalTemplateConfig } from '../setup/templates';

interface IDoctorIO {
  info(message: string): void;
  error(message: string): void;
  choose(message: string, options: string[]): Promise<string>;
  input(message: string, defaultValue?: string): Promise<string>;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  close?(): void;
}

interface IDoctorDeps {
  readLegacyConfig: typeof readLegacyConfig;
  backupCurrentConfig: typeof backupConfigFile;
  writeConfig: typeof writeConfigFile;
  isServiceRunning: typeof isServiceRunning;
  readServiceInfo: typeof readServiceInfo;
  killProcess: typeof killProcess;
  probeServiceHealth: typeof probeServiceHealth;
  isTcpPortOccupied: typeof isTcpPortOccupied;
  waitForService: typeof waitForService;
  io: IDoctorIO;
  startDaemon: () => Promise<void>;
}

interface IConfigLoadResult {
  path: string;
  existed: boolean;
  config?: Partial<IAppConfig>;
  repairedParse: boolean;
  messages: string[];
}

type TProbeResult =
  | { kind: 'success' }
  | { kind: 'failure'; category: 'auth_error' | 'model_not_found' | 'endpoint_unreachable' | 'protocol_mismatch' | 'remote_error'; message: string };

function hasArg(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function createConsoleIO(): IDoctorIO {
  if (process.env.CTR_DOCTOR_FORCE_SCRIPTED_INPUT === '1') {
    const scriptedInput = readFileSync(0, 'utf-8');
    const answers = scriptedInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    let cursor = 0;
    const nextAnswer = async () => answers[cursor++] ?? '';

    return {
      info(message) {
        output.write(`${message}\n`);
      },
      error(message) {
        output.write(`${message}\n`);
      },
      async choose(message, options) {
        output.write(`${message}\n`);
        options.forEach((option, index) => output.write(`  ${index + 1}. ${option}\n`));
        const answer = await nextAnswer();
        const index = Number(answer);
        if (Number.isInteger(index) && index >= 1 && index <= options.length) {
          return options[index - 1];
        }
        return options.find((option) => option === answer) ?? options[0];
      },
      async input(message, defaultValue) {
        output.write(`${message}${defaultValue ? ` (${defaultValue})` : ''}: `);
        const answer = await nextAnswer();
        return answer || defaultValue || '';
      },
      async confirm(message, defaultValue = true) {
        output.write(`${message} ${defaultValue ? '[Y/n]' : '[y/N]'}\n`);
        const answer = (await nextAnswer()).toLowerCase();
        if (!answer) {
          return defaultValue;
        }
        return ['y', 'yes', '1', 'true'].includes(answer);
      },
      close() {
        // noop
      },
    };
  }

  const rl = createInterface({ input, output });
  const ask = async (message: string) => (await rl.question(message)).trim();

  return {
    info(message) {
      output.write(`${message}\n`);
    },
    error(message) {
      output.write(`${message}\n`);
    },
    async choose(message, options) {
      output.write(`${message}\n`);
      options.forEach((option, index) => output.write(`  ${index + 1}. ${option}\n`));
      while (true) {
        const answer = await ask('> ');
        const index = Number(answer);
        if (Number.isInteger(index) && index >= 1 && index <= options.length) {
          return options[index - 1];
        }
        const matched = options.find((option) => option === answer);
        if (matched) {
          return matched;
        }
        output.write('请输入选项编号。\n');
      }
    },
    async input(message, defaultValue) {
      const answer = await ask(`${message}${defaultValue ? ` (${defaultValue})` : ''}: `);
      return answer || defaultValue || '';
    },
    async confirm(message, defaultValue = true) {
      const answer = (await ask(`${message} ${defaultValue ? '[Y/n]' : '[y/N]'}: `)).toLowerCase();
      if (!answer) {
        return defaultValue;
      }
      return ['y', 'yes'].includes(answer);
    },
    close() {
      rl.close();
    },
  };
}

function getConfigCandidates(): string[] {
  return [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON];
}

function inferInterfaceFromApi(api?: string): 'openai' | 'anthropic' | undefined {
  const trimmed = api?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.includes('/v1/messages') ? 'anthropic' : 'openai';
}

function sanitizeModelId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}

function tryLoadStructuredConfig(filePath: string, content: string): { config: Partial<IAppConfig>; repairedParse: boolean; messages: string[] } {
  if (filePath.endsWith('.json')) {
    try {
      return { config: JSON.parse(content), repairedParse: false, messages: [] };
    } catch {
      return {
        config: JSON5.parse(content),
        repairedParse: true,
        messages: ['检测到 JSON 配置包含宽松语法，doctor 已按标准 JSON 结构重新归一化。'],
      };
    }
  }

  try {
    return { config: yaml.load(content) as Partial<IAppConfig>, repairedParse: false, messages: [] };
  } catch (error: any) {
    const sanitized = content.replace(/\t/g, '  ');
    if (sanitized !== content) {
      return {
        config: yaml.load(sanitized) as Partial<IAppConfig>,
        repairedParse: true,
        messages: ['检测到 YAML 使用了 Tab 缩进，doctor 已自动修复为空格缩进。'],
      };
    }
    throw error;
  }
}

function loadCurrentConfig(): IConfigLoadResult {
  const existingPath = getConfigCandidates().find((filePath) => existsSync(filePath));
  const path = existingPath ?? CONFIG_FILE;
  if (!existingPath) {
    return {
      path,
      existed: false,
      repairedParse: false,
      messages: ['未检测到当前 Claude Trigger Router 配置。'],
    };
  }

  const content = readFileSync(existingPath, 'utf-8');
  const loaded = tryLoadStructuredConfig(existingPath, content);
  return {
    path,
    existed: true,
    repairedParse: loaded.repairedParse,
    messages: loaded.messages,
    config: loaded.config,
  };
}

function getModelLookupId(model: Partial<IModelEndpointConfig>): string {
  return model.id?.trim() || sanitizeModelId(model.model ?? '');
}

function repairDeterministicConfig(config: Partial<IAppConfig>): { config: Partial<IAppConfig>; changes: string[] } {
  const nextConfig: Partial<IAppConfig> = {
    ...config,
    HOST: config.HOST ?? DEFAULT_CONFIG.HOST,
    PORT: config.PORT ?? DEFAULT_CONFIG.PORT,
    LOG: config.LOG ?? DEFAULT_CONFIG.LOG,
    LOG_LEVEL: config.LOG_LEVEL ?? DEFAULT_CONFIG.LOG_LEVEL,
  };
  const changes: string[] = [];

  if (Array.isArray(config.Models) && config.Models.length > 0) {
    nextConfig.Models = config.Models.map((item, index) => {
      const api = getModelApi(item);
      const key = getModelKey(item);
      const inferredInterface = getModelInterface(item) ?? inferInterfaceFromApi(api);
      const id = item.id?.trim() || (item.model ? sanitizeModelId(item.model) : `model_${index + 1}`);

      if (!item.id?.trim()) {
        changes.push(`已补全 Models[${index}].id -> ${id}`);
      }
      if (inferredInterface && !getModelInterface(item)) {
        changes.push(`已补全 Models[${index}].interface -> ${inferredInterface}`);
      }
      if (api && item.api !== api) {
        changes.push(`已归一 Models[${index}].api`);
      }
      if (key && item.key !== key) {
        changes.push(`已归一 Models[${index}].key`);
      }

      return {
        ...item,
        id,
        api: api || undefined,
        api_base_url: api || undefined,
        key: key || undefined,
        api_key: key || undefined,
        interface: inferredInterface,
        protocol: inferredInterface,
      };
    });

    if (!nextConfig.Router?.default) {
      if (nextConfig.Models.length === 1) {
        nextConfig.Router = {
          ...(nextConfig.Router ?? {}),
          default: getModelLookupId(nextConfig.Models[0]),
        };
        changes.push(`已补全 Router.default -> ${nextConfig.Router.default}`);
      } else if (typeof config.Router?.default === 'string' && config.Router.default.includes(',')) {
        const [providerName, modelName] = config.Router.default.split(',').map((item) => item.trim());
        const matched = nextConfig.Models.find((item) =>
          item.model === modelName && (item.id === providerName || item.id.startsWith(`${sanitizeModelId(providerName)}_`))
        );
        if (matched) {
          nextConfig.Router = {
            ...(nextConfig.Router ?? {}),
            default: matched.id,
          };
          changes.push(`已归一 Router.default -> ${matched.id}`);
        }
      }
    }
  } else if (Array.isArray(config.Providers) && config.Providers.length > 0) {
    const migrated = migrateLegacyConfig(config as any);
    nextConfig.Models = migrated.draft.Models;
    nextConfig.Router = {
      ...(nextConfig.Router ?? {}),
      ...migrated.draft.Router,
    };
    nextConfig.Providers = [];
    changes.push('已将 legacy Providers 结构归一为 Models 结构。');
  }

  return { config: nextConfig, changes };
}

async function completeMissingModelFields(
  config: Partial<IAppConfig>,
  io: IDoctorIO
): Promise<{ config: Partial<IAppConfig>; changes: string[] }> {
  const changes: string[] = [];
  const nextConfig: Partial<IAppConfig> = {
    ...config,
    Models: Array.isArray(config.Models) ? config.Models.map((item) => ({ ...item })) : [],
    Router: { ...(config.Router ?? {}) },
  };

  for (let index = 0; index < (nextConfig.Models?.length ?? 0); index += 1) {
    const model = nextConfig.Models![index];
    const label = model.id || model.model || `Models[${index}]`;

    if (!model.id?.trim()) {
      model.id = sanitizeModelId(await io.input(`补全 ${label} 的模型 ID`, sanitizeModelId(model.model || `model_${index + 1}`)));
      changes.push(`已补全 ${label} 的模型 ID -> ${model.id}`);
    }
    if (!getModelApi(model)) {
      const api = await io.input(`补全 ${label} 的 API Base URL`);
      model.api = api;
      model.api_base_url = api;
      changes.push(`已补全 ${label} 的 API Base URL`);
    }
    if (!getModelKey(model)) {
      const key = await io.input(`补全 ${label} 的 API Key`);
      model.key = key;
      model.api_key = key;
      changes.push(`已补全 ${label} 的 API Key`);
    }
    if (!getModelInterface(model)) {
      const interfaceChoice = await io.choose(`补全 ${label} 的接口类型`, ['openai', 'anthropic']);
      model.interface = interfaceChoice as 'openai' | 'anthropic';
      model.protocol = model.interface;
      changes.push(`已补全 ${label} 的接口类型 -> ${model.interface}`);
    }
    if (!model.model?.trim()) {
      model.model = await io.input(`补全 ${label} 的上游模型名`);
      changes.push(`已补全 ${label} 的上游模型名`);
    }
  }

  if (!nextConfig.Router?.default) {
    if ((nextConfig.Models?.length ?? 0) === 1) {
      nextConfig.Router!.default = nextConfig.Models![0].id;
      changes.push(`已补全 Router.default -> ${nextConfig.Router!.default}`);
    } else if ((nextConfig.Models?.length ?? 0) > 1) {
      const choice = await io.choose('补全默认模型', nextConfig.Models!.map((item) => item.id));
      nextConfig.Router!.default = choice;
      changes.push(`已补全 Router.default -> ${choice}`);
    }
  }

  return { config: nextConfig, changes };
}

async function probeModelAvailability(model: IModelEndpointConfig): Promise<TProbeResult> {
  const api = getModelApi(model);
  const key = getModelKey(model);
  const modelInterface = getModelInterface(model);

  if (!api || !key || !modelInterface || !model.model) {
    return {
      kind: 'failure',
      category: 'protocol_mismatch',
      message: '模型配置缺少 api/key/interface/model，无法发起探测。',
    };
  }

  try {
    const registry = buildModelRegistry({
      Providers: [],
      Models: [model],
      Router: {
        default: model.id,
      },
    } as IAppConfig);
    const compiledModel = registry.modelMap[model.id];
    const dispatchRequest = compiledModel
      ? buildProviderDispatchRequest({
          model: compiledModel.modelName,
          interface: compiledModel.interface ?? modelInterface,
          compatibilityProfile: compiledModel.compatibilityProfile,
          capabilities: compiledModel.capabilities,
          request: {
            model: compiledModel.id,
            max_tokens: 1,
            stream: true,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'ok',
                  },
                ],
              },
            ],
          },
        })
      : null;

    const response = await fetch(api, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: modelInterface === 'anthropic'
        ? {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          }
        : {
            'content-type': 'application/json',
            authorization: `Bearer ${key}`,
          },
      body: JSON.stringify(dispatchRequest?.body ?? (modelInterface === 'anthropic'
        ? {
            model: model.model,
            max_tokens: 1,
            stream: true,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'ok',
                  },
                ],
              },
            ],
          }
        : {
            model: model.model,
            max_tokens: 1,
            stream: true,
            messages: [
              {
                role: 'user',
                content: 'ok',
              },
            ],
          })),
    });

    if (response.ok) {
      return { kind: 'success' };
    }

    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { kind: 'failure', category: 'auth_error', message: `${response.status} ${body}` };
    }
    if (response.status === 404) {
      return { kind: 'failure', category: 'model_not_found', message: `${response.status} ${body}` };
    }
    if (response.status === 400) {
      return { kind: 'failure', category: 'protocol_mismatch', message: `${response.status} ${body}` };
    }

    return { kind: 'failure', category: 'remote_error', message: `${response.status} ${body}` };
  } catch (error: any) {
    return {
      kind: 'failure',
      category: 'endpoint_unreachable',
      message: error?.message || String(error),
    };
  }
}

async function ensureServiceUsable(config: IAppConfig, deps: IDoctorDeps, configChanged: boolean): Promise<void> {
  const port = config.PORT ?? DEFAULT_CONFIG.PORT;
  const healthy = await deps.probeServiceHealth(port, 500);
  const occupied = await deps.isTcpPortOccupied(port, 500);
  const running = deps.isServiceRunning();

  if (healthy && !configChanged) {
    deps.io.info(`服务健康检查通过：http://127.0.0.1:${port}`);
    return;
  }

  if (occupied && !healthy && !running) {
    throw new Error(`端口 ${port} 已被其他服务占用，doctor 无法自动启动当前服务。`);
  }

  if (running) {
    const info = deps.readServiceInfo();
    if (info) {
      try {
        deps.killProcess(info.pid);
      } catch {
        // ignore and rely on restart probe
      }
    }
  }

  await deps.startDaemon();
  const verified = await deps.waitForService(port, 5000);
  if (!verified) {
    throw new Error(`doctor 自动启动后健康检查仍未通过（端口 ${port}）。`);
  }
  deps.io.info(`服务已就绪：http://127.0.0.1:${port}`);
}

function createDefaultDeps(io = createConsoleIO()): IDoctorDeps {
  return {
    readLegacyConfig,
    backupCurrentConfig: backupConfigFile,
    writeConfig: writeConfigFile,
    isServiceRunning,
    readServiceInfo,
    killProcess,
    probeServiceHealth,
    isTcpPortOccupied,
    waitForService,
    io,
    startDaemon: async () => {
      spawn(process.execPath, [process.argv[1], 'start', '--daemon'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CTR_DAEMON: '1' },
      }).unref();
    },
  };
}

export async function runDoctorCli(customDeps?: Partial<IDoctorDeps>): Promise<void> {
  const defaults = createDefaultDeps(customDeps?.io);
  const deps = { ...defaults, ...customDeps } as IDoctorDeps;
  let configChanged = false;

  try {
    deps.io.info('开始诊断当前 Claude Trigger Router 配置...');
    const current = loadCurrentConfig();
    current.messages.forEach((message) => deps.io.info(message));

    let workingConfig: Partial<IAppConfig> | undefined = current.config;
    if (!workingConfig) {
      const legacy = await deps.readLegacyConfig();
      if (legacy.kind === 'found') {
        deps.io.info('未检测到当前配置，但发现旧 claude-code-router 配置，doctor 将先尝试迁移。');
        const migrated = migrateLegacyConfig(legacy.config as any);
        workingConfig = {
          ...buildUsableMinimalTemplateConfig(),
          ...migrated.draft,
        };
      } else {
        throw new Error('未检测到可诊断的当前配置；请先运行 ctr setup 或 ctr init --force。');
      }
    }

    const deterministic = repairDeterministicConfig(workingConfig);
    workingConfig = deterministic.config;
    deterministic.changes.forEach((message) => deps.io.info(message));

    const completed = await completeMissingModelFields(workingConfig, deps.io);
    workingConfig = completed.config;
    completed.changes.forEach((message) => deps.io.info(message));

    const normalized = normalizeAndValidateConfig(workingConfig);
    if (normalized.errors.length > 0) {
      deps.io.error(`doctor 仍发现无法自动修复的配置错误：${normalized.errors.join('; ')}`);
      throw new Error('doctor could not fully repair config');
    }
    if (normalized.warnings.length > 0) {
      deps.io.info(`配置提示：${normalized.warnings.join('; ')}`);
    }

    const registry = buildModelRegistry(normalized.config);
    for (const model of normalized.config.Models ?? []) {
      const compiledModel = registry.modelMap[model.id];
      if (!compiledModel) {
        continue;
      }
      deps.io.info(
        `模型兼容画像：${model.id} -> ${compiledModel.compatibilityProfile} / ${compiledModel.dispatchFormat}`
      );
    }

    const needWrite = current.repairedParse || deterministic.changes.length > 0 || completed.changes.length > 0 || !current.existed;
    if (needWrite) {
      if (current.existed) {
        const backupPath = await deps.backupCurrentConfig();
        if (backupPath) {
          deps.io.info(`已备份当前配置：${backupPath}`);
        }
      }
      await deps.writeConfig(normalized.config);
      deps.io.info(`已写回修复后的配置：${current.path}`);
      configChanged = true;
    }

    await ensureServiceUsable(normalized.config, deps, configChanged);

    const shouldProbeModels = hasArg('--check-models')
      ? await deps.io.confirm(`即将向 ${normalized.config.Models?.length ?? 0} 个模型发送最小探测请求，可能消耗少量额度，是否继续？`, true)
      : await deps.io.confirm(`是否继续探测 ${normalized.config.Models?.length ?? 0} 个模型的可用性？这会消耗少量额度。`, false);

    if (!shouldProbeModels) {
      deps.io.info('已跳过模型探测。配置和服务诊断已完成。');
      return;
    }

    for (const model of normalized.config.Models ?? []) {
      const result = await probeModelAvailability(model);
      if (result.kind === 'success') {
        deps.io.info(`模型探测成功：${model.id}`);
        continue;
      }

      deps.io.error(`模型探测失败：${model.id} -> ${result.category} -> ${result.message}`);
      deps.io.info('这类远端失败需要你确认并手动处理；doctor 不会自动修改模型语义或远端账号配置。');
    }

    deps.io.info('doctor 诊断完成。');
  } finally {
    deps.io.close?.();
  }
}
