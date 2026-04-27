import { existsSync, readFileSync } from 'fs';
import { createServer } from 'net';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import JSON5 from 'json5';
import yaml from 'js-yaml';

import { CONFIG_FILE, CONFIG_FILE_JSON, CONFIG_FILE_YML, DEFAULT_CONFIG } from '../constants';
import { getProviderPreset, listProviderPresetKeys } from '../provider-presets';
import { run } from '../index';
import { isTcpPortOccupied, waitForService } from '../service-health';
import { collectCapabilityWarnings } from '../models/compile';
import { backupConfigFile, normalizeAndValidateConfig, writeConfigFile } from '../utils';
import { buildValidationIssueReport, formatValidationIssueReport } from '../utils/validation-contract';
import { isServiceRunning, killProcess, readServiceInfo, waitForProcessExit } from '../utils/processCheck';
import { decideServiceAction, applyServiceAction } from './service';
import { getRepairFields } from './repair';
import { migrateLegacyConfig } from './migrate';
import { detectSetupEnvironment, RawCurrentConfigResult, RawLegacyConfigResult } from './detect';
import { buildMinimalConfig, buildRemoteServiceConfig } from './templates';
import { persistSetupConfig } from './persist';
import { runSetup } from './setup';
import { ISetupConfigDraft, ProviderPresetKey } from './types';

interface ISetupIO {
  choose: (message: string, options: string[]) => Promise<string>;
  input: (message: string, defaultValue?: string) => Promise<string>;
  info: (message: string) => void;
  close?: () => void;
}

type TCapabilityChoice = '默认' | '支持' | '禁用';
type TCapabilityEditChoice = '保持当前值' | '编辑 capability';
type TRoutingBootstrapChoice = '先保持最小配置' | '开启复杂任务规则模板' | '开启复杂任务规则 + 智能兜底';
type TSetupEntryChoice = '本地使用（推荐）' | '连接远程服务';

interface ISetupCollectedModelInput {
  name: string;
  model_id: string;
  api_key: string;
  interface?: 'openai' | 'anthropic';
  models: string[];
  preset: ProviderPresetKey;
  api_base_url?: string;
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
  if (process.env.CTR_SETUP_FORCE_SCRIPTED_INPUT === '1') {
    const scriptedInput = readFileSync(0, 'utf-8');
    const answers = scriptedInput.split(/\r?\n/).map((item) => item.trim()).filter((item) => item.length > 0);
    let cursor = 0;

    const nextAnswer = async (): Promise<string> => answers[cursor++] ?? '';

    return {
      async choose(message, options) {
        output.write(`${message}\n`);
        options.forEach((option, index) => {
          output.write(`  ${index + 1}. ${option}\n`);
        });

        const answer = await nextAnswer();
        const pickedIndex = Number(answer);
        if (Number.isInteger(pickedIndex) && pickedIndex >= 1 && pickedIndex <= options.length) {
          return options[pickedIndex - 1];
        }
        const matched = options.find((option) => option === answer);
        if (matched) {
          return matched;
        }
        throw new Error(`invalid scripted answer for "${message}": ${answer || '<empty>'}`);
      },
      async input(message, defaultValue) {
        const suffix = defaultValue ? ` (${defaultValue})` : '';
        output.write(`${message}${suffix}: `);
        const answer = await nextAnswer();
        return answer || defaultValue || '';
      },
      info(message) {
        output.write(`${message}\n`);
      },
      close() {
        // No-op for scripted stdin.
      },
    };
  }

  if (!input.isTTY) {
    let loaded = false;
    let answers: string[] = [];
    let cursor = 0;

    const loadAnswers = async () => {
      if (loaded) {
        return;
      }
      loaded = true;
      const chunks: string[] = [];
      for await (const chunk of input) {
        chunks.push(String(chunk));
      }
      answers = chunks.join('').split(/\r?\n/).map((item) => item.trim()).filter((item) => item.length > 0);
    };

    const nextAnswer = async (): Promise<string> => {
      await loadAnswers();
      return answers[cursor++] ?? '';
    };

    return {
      async choose(message, options) {
        output.write(`${message}\n`);
        options.forEach((option, index) => {
          output.write(`  ${index + 1}. ${option}\n`);
        });

        const answer = await nextAnswer();
        const pickedIndex = Number(answer);
        if (Number.isInteger(pickedIndex) && pickedIndex >= 1 && pickedIndex <= options.length) {
          return options[pickedIndex - 1];
        }
        const matched = options.find((option) => option === answer);
        if (matched) {
          return matched;
        }
        throw new Error(`invalid scripted answer for "${message}": ${answer || '<empty>'}`);
      },
      async input(message, defaultValue) {
        const suffix = defaultValue ? ` (${defaultValue})` : '';
        output.write(`${message}${suffix}: `);
        const answer = await nextAnswer();
        return answer || defaultValue || '';
      },
      info(message) {
        output.write(`${message}\n`);
      },
      close() {
        // No-op for buffered non-interactive stdin.
      },
    };
  }

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
    close() {
      rl.close();
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

function getCurrentRuntimeFields(): Partial<Record<'HOST' | 'PORT' | 'LOG' | 'LOG_LEVEL' | 'API_TIMEOUT_MS', unknown>> {
  const candidates = [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON];
  const currentPath = candidates.find((filePath) => existsSync(filePath));
  if (!currentPath) {
    return {};
  }

  try {
    const config = readStructuredConfigFile(currentPath) as Record<string, unknown> | null;
    if (!config || typeof config !== 'object') {
      return {};
    }

    const fields: Partial<Record<'HOST' | 'PORT' | 'LOG' | 'LOG_LEVEL' | 'API_TIMEOUT_MS', unknown>> = {};
    for (const key of ['HOST', 'PORT', 'LOG', 'LOG_LEVEL', 'API_TIMEOUT_MS'] as const) {
      if (config[key] !== undefined) {
        fields[key] = config[key];
      }
    }
    return fields;
  } catch {
    return {};
  }
}

function getConfiguredPortFromCurrentFiles(): number {
  const candidates = [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON];
  const currentPath = candidates.find((filePath) => existsSync(filePath));
  if (!currentPath) {
    return DEFAULT_CONFIG.PORT;
  }

  try {
    const config = readStructuredConfigFile(currentPath) as { PORT?: unknown } | null;
    if (config && typeof config.PORT === 'number' && Number.isFinite(config.PORT) && config.PORT > 0) {
      return config.PORT;
    }
  } catch {
    // Fall back to default port when current config cannot be parsed.
  }

  return DEFAULT_CONFIG.PORT;
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  try {
    return await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('failed to resolve available port'));
          return;
        }
        resolve(address.port);
      });
    });
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

function readLegacyConfigFile(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.json')) {
    return JSON5.parse(content);
  }
  return yaml.load(content);
}

interface IReadLegacyConfigDeps {
  homeDir?: string;
  exists?: (filePath: string) => boolean;
  readConfig?: (filePath: string) => unknown;
}

export async function readLegacyConfig(deps: IReadLegacyConfigDeps = {}): Promise<RawLegacyConfigResult> {
  const baseHomeDir = deps.homeDir || homedir();
  const exists = deps.exists || existsSync;
  const readConfig = deps.readConfig || readLegacyConfigFile;
  const overridePath = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
  const candidatePaths = overridePath
    ? [overridePath]
    : [
        join(baseHomeDir, '.ccr', 'config.yaml'),
        join(baseHomeDir, '.claude-code-router', 'config.yaml'),
        join(baseHomeDir, '.claude-code-router', 'config.json'),
      ];

  const legacyPath = candidatePaths.find((filePath) => exists(filePath));
  if (!legacyPath) {
    return { kind: 'missing' };
  }

  try {
    return {
      kind: 'found',
      path: legacyPath,
      config: readConfig(legacyPath),
    };
  } catch (error) {
    return {
      kind: 'read_error',
      path: legacyPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

async function probeService() {
  const port = getConfiguredPortFromCurrentFiles();
  const healthy = await waitForService(port, 500);
  if (healthy) {
    return isServiceRunning()
      ? { kind: 'self_healthy' as const, port }
      : { kind: 'non_self_occupied' as const, port };
  }

  const occupied = await isTcpPortOccupied(port, 500);
  if (!occupied) {
    return { kind: 'none' as const };
  }

  return isServiceRunning()
    ? { kind: 'self_unhealthy' as const, port }
    : { kind: 'non_self_occupied' as const, port };
}

async function enterClaudeCode(): Promise<void> {
  if (process.env.CTR_SETUP_SKIP_ENTER_CODE === '1') {
    return;
  }
  const cliModule = await import('../cli');
  await cliModule.runClaudeCode();
}

function shouldAutoEnterClaudeCodeAfterSetup(): boolean {
  return process.env.CTR_SETUP_AUTO_ENTER_CODE === '1';
}

async function executeStart(): Promise<void> {
  const childProcess = await import('child_process');
  childProcess.spawn(process.execPath, [process.argv[1], 'start'], {
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
      await waitForProcessExit(info.pid, 5000);
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

function formatConfigIssues(input: { errors?: string[]; warnings?: string[] }) {
  return formatValidationIssueReport(buildValidationIssueReport(input)).join('; ');
}

function mapValidCurrentConfigChoice(choice: string): 'reuse' | 'repair' | 'overwrite' | 'fresh' | 'cancel' {
  if (choice === 'reuse' || choice === '直接使用当前配置（推荐）') {
    return 'reuse';
  }
  if (choice === 'repair' || choice === '快速修正配置提示') {
    return 'repair';
  }
  if (choice === 'overwrite' || choice === '检查并调整当前配置') {
    return 'overwrite';
  }
  if (choice === 'fresh' || choice === '放弃当前配置，重新开始') {
    return 'fresh';
  }
  if (choice === 'cancel') {
    return 'cancel';
  }
  throw new Error('invalid current config action');
}

function mapLegacyConfigChoice(choice: string): 'migrate' | 'skip' {
  if (choice === 'migrate' || choice === '迁移旧配置（推荐）') {
    return 'migrate';
  }
  if (choice === 'skip' || choice === '跳过迁移，手动新建') {
    return 'skip';
  }
  throw new Error('invalid legacy config action');
}

function toCapabilityBoolean(choice: TCapabilityChoice): boolean | undefined {
  if (choice === '支持') {
    return true;
  }
  if (choice === '禁用') {
    return false;
  }
  return undefined;
}

function applyCapabilityMetadata(model: any, metadata?: Record<string, unknown>) {
  if (!metadata || !Object.keys(metadata).length) {
    delete model.metadata;
    return model;
  }

  model.metadata = {
    ...(model.metadata ?? {}),
    ...metadata,
  };

  if (!Object.keys(model.metadata || {}).length) {
    delete model.metadata;
  }

  return model;
}

function ensureCapabilityMetadata(model: any) {
  if (!model.metadata || typeof model.metadata !== 'object') {
    model.metadata = {};
  }
  return model.metadata as Record<string, unknown>;
}

function removeCapabilityMetadataField(model: any, field: 'supports_tools' | 'supports_images') {
  if (!model.metadata || typeof model.metadata !== 'object') {
    return;
  }

  delete model.metadata[field];
  if (!Object.keys(model.metadata).length) {
    delete model.metadata;
  }
}

async function promptCapabilityMetadata(io: ISetupIO, currentMetadata?: Record<string, unknown>) {
  const vendorHint = await io.input('Vendor hint（可选）', String(currentMetadata?.vendor_hint ?? ''));
  const reasoningChoice = await io.choose('Reasoning support', ['默认', '支持', '禁用']) as TCapabilityChoice;
  const toolChoice = await io.choose('Tool support', ['默认', '支持', '禁用']) as TCapabilityChoice;
  const imageChoice = await io.choose('Image support', ['默认', '支持', '禁用']) as TCapabilityChoice;

  const nextMetadata: Record<string, unknown> = {};
  if (vendorHint.trim()) {
    nextMetadata.vendor_hint = vendorHint.trim();
  }

  const reasoning = toCapabilityBoolean(reasoningChoice);
  if (reasoning !== undefined) {
    nextMetadata.supports_reasoning = reasoning;
  }

  const tools = toCapabilityBoolean(toolChoice);
  if (tools !== undefined) {
    nextMetadata.supports_tools = tools;
  }

  const images = toCapabilityBoolean(imageChoice);
  if (images !== undefined) {
    nextMetadata.supports_images = images;
  }

  return nextMetadata;
}

async function promptCapabilityWarningFixesForDraft(draft: ISetupConfigDraft, io: ISetupIO): Promise<boolean> {
  const report = collectCapabilityWarnings(draft as any);
  if (!report.entries.length || !draft.Models?.length) {
    return false;
  }

  for (const entry of report.entries) {
    const model = draft.Models.find((item) => item.id === entry.modelId);
    if (!model) {
      continue;
    }

    io.info(`配置提示：${entry.message}`);

    if (entry.code === 'thinking_ignored') {
      const choice = await io.choose(`如何处理模型 ${entry.modelId} 的 thinking warning？`, [
        '移除 thinking（推荐）',
        '标记支持 reasoning',
        '保持当前配置',
      ]);

      if (choice === '移除 thinking（推荐）') {
        delete model.thinking;
      } else if (choice === '标记支持 reasoning') {
        ensureCapabilityMetadata(model).supports_reasoning = true;
      }
      continue;
    }

    if (entry.code === 'tools_text_fallback') {
      const choice = await io.choose(`如何处理模型 ${entry.modelId} 的 tool fallback？`, [
        '恢复默认工具支持（推荐）',
        '接受文本降级',
        '编辑 capability',
      ]);

      if (choice === '恢复默认工具支持（推荐）') {
        removeCapabilityMetadataField(model, 'supports_tools');
      } else if (choice === '编辑 capability') {
        const metadata = await promptCapabilityMetadata(io, model.metadata);
        applyCapabilityMetadata(model, metadata);
      }
      continue;
    }

    if (entry.code === 'images_text_fallback') {
      const choice = await io.choose(`如何处理模型 ${entry.modelId} 的 image fallback？`, [
        '恢复默认图片支持（推荐）',
        '接受文本降级',
        '编辑 capability',
      ]);

      if (choice === '恢复默认图片支持（推荐）') {
        removeCapabilityMetadataField(model, 'supports_images');
      } else if (choice === '编辑 capability') {
        const metadata = await promptCapabilityMetadata(io, model.metadata);
        applyCapabilityMetadata(model, metadata);
      }
    }
  }

  return true;
}

async function promptCapabilityMetadataForDraft(draft: ISetupConfigDraft, io: ISetupIO) {
  if (!draft.Models?.length) {
    return;
  }

  for (const model of draft.Models) {
    const modelLabel = model.id || model.model || 'unnamed-model';
    const editChoice = await io.choose(`是否配置模型 ${modelLabel} 的 capability 提示`, ['保持当前值', '编辑 capability']) as TCapabilityEditChoice;
    if (editChoice !== '编辑 capability') {
      continue;
    }

    const metadata = await promptCapabilityMetadata(io, model.metadata);
    applyCapabilityMetadata(model, metadata);
  }
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
          metadata: model.metadata ? { ...model.metadata } : undefined,
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

function toUniqueSuggestedModelId(preferredId: string, existingIds: string[]): string {
  const normalizedPreferredId = preferredId.trim() || 'model';
  if (!existingIds.includes(normalizedPreferredId)) {
    return normalizedPreferredId;
  }

  let suffix = 2;
  while (existingIds.includes(`${normalizedPreferredId}_${suffix}`)) {
    suffix += 1;
  }
  return `${normalizedPreferredId}_${suffix}`;
}

function appendModelToDraft(
  draft: ISetupConfigDraft,
  modelInput: ISetupCollectedModelInput,
  options: { setAsDefault?: boolean } = {}
): ISetupConfigDraft {
  const fragment = buildMinimalConfig({
    providers: [modelInput],
    defaultModel: options.setAsDefault ? modelInput.model_id : undefined,
  });

  const nextDraft: ISetupConfigDraft = {
    ...draft,
    Models: [...(draft.Models ?? [])],
    Router: { ...(draft.Router ?? {}) },
  };

  if (fragment.Models?.[0]) {
    nextDraft.Models?.push(fragment.Models[0]);
  }

  if (options.setAsDefault) {
    nextDraft.Router.default = modelInput.model_id;
  } else if (!nextDraft.Router.default) {
    nextDraft.Router.default = modelInput.model_id;
  }

  return nextDraft;
}

function createComplexTaskRules(modelId: string) {
  return [
    {
      name: 'architecture',
      priority: 90,
      enabled: true,
      description: '架构设计、系统规划和大范围重构任务',
      patterns: [
        { type: 'exact', keywords: ['架构设计', '系统设计', '技术方案', 'architecture', 'system design'] },
        { type: 'regex', pattern: '(架构|系统设计|技术方案|architecture|system design)' },
      ],
      model: modelId,
    },
    {
      name: 'code_review',
      priority: 80,
      enabled: true,
      description: '代码审查、风险评估和质量分析任务',
      patterns: [
        { type: 'exact', keywords: ['代码审查', 'code review', 'review code', '风险评估'] },
        { type: 'regex', pattern: '(代码|code).{0,6}(审查|review|审核|检查)' },
      ],
      model: modelId,
    },
    {
      name: 'deep_reasoning',
      priority: 70,
      enabled: true,
      description: '复杂推理、深入分析和多步决策任务',
      patterns: [
        { type: 'exact', keywords: ['深入分析', '复杂推理', '严谨分析', 'deep analysis', 'reasoning'] },
        { type: 'regex', pattern: '(深入|复杂|严谨).{0,6}(分析|推理|论证)' },
      ],
      model: modelId,
    },
  ];
}

function applyRoutingBootstrap(
  draft: ISetupConfigDraft,
  choice: TRoutingBootstrapChoice,
  specializedModelId: string
): ISetupConfigDraft {
  if (choice === '先保持最小配置') {
    return draft;
  }

  const defaultModelId = draft.Router.default;
  if (!defaultModelId) {
    return draft;
  }

  const specializedModel = draft.Models?.find((item) => item.id === specializedModelId);
  if (!specializedModel) {
    return draft;
  }

  const nextDraft: ISetupConfigDraft = {
    ...draft,
    SmartRouter: {
      enabled: true,
      analysis_scope: 'last_message',
      rules: createComplexTaskRules(specializedModelId),
      ...(choice === '开启复杂任务规则 + 智能兜底'
        ? {
            router_model: defaultModelId,
            candidates: [
              {
                model: defaultModelId,
                description: '默认模型，适合通用编程、日常修复和快速响应任务',
              },
              {
                model: specializedModelId,
                description: `复杂任务模型（${specializedModel.model}），适合架构设计、代码审查和深入推理`,
              },
            ],
          }
        : {}),
    },
  };

  return nextDraft;
}

async function promptModelConnection(
  io: ISetupIO,
  input: {
    intro?: string;
    modelIdPrompt: string;
    suggestedModelId: string;
  }
): Promise<ISetupCollectedModelInput> {
  if (input.intro) {
    io.info(input.intro);
  }

  const modelId = await io.input(input.modelIdPrompt, input.suggestedModelId);
  const connectMode = await io.choose('这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);

  let preset: ProviderPresetKey = 'custom';
  let providerName = 'provider';
  let apiBaseUrl = '';

  if (connectMode === '使用常见接入模板') {
    const presetOptions = listProviderPresetKeys('setup');
    preset = await io.choose('选择 provider 预设', presetOptions) as ProviderPresetKey;
    providerName = await io.input('Provider 名称', preset);
    apiBaseUrl = preset === 'custom' ? await io.input('API Base URL') : await io.input('API Base URL（留空使用预设）', '');
  } else {
    providerName = await io.input('Provider 名称', 'provider');
    apiBaseUrl = await io.input('API Base URL');
  }

  const apiKey = await io.input('API Key');
  const presetDefinition = getProviderPreset(preset);
  const model = await io.input('上游模型名', presetDefinition?.default_model ?? '');
  const interfaceChoice = connectMode === '手动填写接口'
    ? await io.choose('接口类型', ['openai', 'anthropic']) as 'openai' | 'anthropic'
    : presetDefinition?.interface;

  return {
    name: providerName,
    model_id: modelId,
    api_key: apiKey,
    interface: interfaceChoice,
    models: [model],
    preset,
    api_base_url: apiBaseUrl,
  };
}

async function buildFreshConfig(io: ISetupIO): Promise<ISetupConfigDraft> {
  const setupEntryChoice = await io.choose('当前要本地使用，还是连接远程服务？', [
    '本地使用（推荐）',
    '连接远程服务',
  ]) as TSetupEntryChoice;

  if (setupEntryChoice === '连接远程服务') {
    const baseUrl = await io.input('远程服务 URL');
    const authToken = await io.input('远程服务 Auth Token（可选）', '${CTR_REMOTE_AUTH_TOKEN}');
    io.info('已生成远程服务连接配置，本机不会要求你先填写 provider/model。');
    return buildRemoteServiceConfig({ baseUrl, authToken });
  }

  const primaryModel = await promptModelConnection(io, {
    intro: '我们先创建一份最小可用配置。',
    modelIdPrompt: '这个默认模型在本地要叫什么名字？',
    suggestedModelId: 'sonnet',
  });

  let draft = buildMinimalConfig({
    providers: [primaryModel],
    defaultModel: primaryModel.model_id,
  });

  const addSecondModelChoice = await io.choose('现在要不要继续添加一个“复杂任务专用模型”？', [
    '先不添加',
    '添加一个复杂任务专用模型',
  ]);

  if (addSecondModelChoice === '添加一个复杂任务专用模型') {
    const suggestedSecondModelId = toUniqueSuggestedModelId('reasoner', draft.Models?.map((item) => item.id) ?? []);
    const specializedModel = await promptModelConnection(io, {
      intro: '这个模型通常用于架构设计、代码审查或复杂推理等更重的任务。',
      modelIdPrompt: '这个复杂任务模型在本地要叫什么名字？',
      suggestedModelId: suggestedSecondModelId,
    });
    draft = appendModelToDraft(draft, specializedModel);

    const routingChoice = await io.choose('现在要不要开启高级路由？', [
      '先保持最小配置',
      '开启复杂任务规则模板',
      '开启复杂任务规则 + 智能兜底',
    ]) as TRoutingBootstrapChoice;

    draft = applyRoutingBootstrap(draft, routingChoice, specializedModel.model_id);

    if (routingChoice !== '先保持最小配置') {
      io.info(`已为你生成 SmartRouter 路由模板，默认模型仍是 ${primaryModel.model_id}，复杂任务会优先使用 ${specializedModel.model_id}。`);
    }
  }

  const capabilityMode = await io.choose('是否配置 capability 提示', ['保持默认', '配置 capability 提示']);

  if (capabilityMode === '配置 capability 提示' && draft.Models?.[0]) {
    await promptCapabilityMetadataForDraft(draft, io);
  }

  return draft;
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

  if (input.fields.includes('capabilityHints') && draft.Models?.[0]) {
    const fixedWarnings = await promptCapabilityWarningFixesForDraft(draft, input.io);
    if (!fixedWarnings) {
      await promptCapabilityMetadataForDraft(draft, input.io);
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
    verifyHealth: () => waitForService(getConfiguredPortFromCurrentFiles(), 5000),
    enterClaudeCode,
    io,
  };
}

function printRoutingNextSteps(io: ISetupIO): void {
  io.info('你可以按需继续配置路由能力：');
  io.info('  - SmartRouter.rules：适合高确定性任务，把架构设计、代码审查等请求固定切到指定模型');
  io.info('  - SmartRouter candidates：适合模糊任务，在候选模型之间自动选择更合适的模型');
  io.info('  - 配置模板参考：config/trigger.advanced.yaml');
}

export async function runSetupCli(customDeps?: Partial<IRunSetupCliDeps>): Promise<void> {
  const defaults = createDefaultDeps(customDeps?.io);
  const deps = { ...defaults, ...customDeps } as IRunSetupCliDeps;

  try {
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
          deps.io.info('检测到当前 claude-trigger-router 配置已可用。');
          if (currentConfig.warnings.length > 0) {
            deps.io.info(`当前配置提示：${formatConfigIssues({ warnings: currentConfig.warnings })}`);
          }
          const options = currentConfig.warnings.length > 0
            ? ['直接使用当前配置（推荐）', '快速修正配置提示', '检查并调整当前配置', '放弃当前配置，重新开始']
            : ['直接使用当前配置（推荐）', '检查并调整当前配置', '放弃当前配置，重新开始'];
          return mapValidCurrentConfigChoice(
            await deps.io.choose('你想直接使用它，还是重新调整？', options)
          );
        }
        if (currentConfig.kind === 'invalid') {
          deps.io.info(`当前配置校验失败：${formatConfigIssues({ errors: currentConfig.errors })}`);
          if (currentConfig.warnings.length > 0) {
            deps.io.info(`当前配置提示：${formatConfigIssues({ warnings: currentConfig.warnings })}`);
          }
          return (await deps.io.choose('选择下一步', ['repair', 'overwrite', 'cancel'])) as 'repair' | 'overwrite' | 'cancel';
        }

        deps.io.info(`当前配置无法解析：${currentConfig.error}`);
        return (await deps.io.choose('选择下一步', ['rebuild', 'cancel'])) as 'rebuild' | 'cancel';
      },
      chooseLegacyConfigAction: async ({ legacyConfig }) => {
        if (legacyConfig.kind === 'found') {
          return mapLegacyConfigChoice(
            await deps.io.choose('检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？', [
              '迁移旧配置（推荐）',
              '跳过迁移，手动新建',
            ])
          );
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
      io: deps.io,
      persistConfig: async ({ config, currentConfigPath, hasExistingConfig }) => {
        let normalized = normalizeAndValidateConfig({
          ...(hasExistingConfig ? getCurrentRuntimeFields() : {}),
          ...(config as any),
        });
        {
          const targetPort = normalized.config.PORT ?? DEFAULT_CONFIG.PORT;
          const occupied = await isTcpPortOccupied(targetPort, 500);
          if (occupied && !isServiceRunning()) {
            const fallbackPort = await getAvailablePort();
            deps.io.info(`检测到默认端口 ${targetPort} 已被占用，setup 已自动改用可用端口 ${fallbackPort}。`);
            normalized = normalizeAndValidateConfig({
              ...normalized.config,
              PORT: fallbackPort,
            });
          }
        }
        const persisted = await persistSetupConfig({
          config: normalized.config,
          currentConfigPath,
          hasExistingConfig,
          validateConfig: (inputConfig) => normalizeAndValidateConfig(inputConfig).errors,
          backupCurrentConfig: deps.backupCurrentConfig,
          writeConfig: deps.writeConfig,
        });
        if (normalized.warnings.length > 0) {
          deps.io.info(`配置提示：${formatConfigIssues({ warnings: normalized.warnings })}`);
        }
        return persisted;
      },
      ensureServiceReady: async ({ configChanged, detectedService, reloadSupported }) => {
        const effectiveDetectedService = configChanged
          ? await deps.probeService()
          : detectedService;
        const action = decideServiceAction({
          configChanged,
          detectedService: effectiveDetectedService,
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
      enterClaudeCode: async () => {
        printRoutingNextSteps(deps.io);
        if (!shouldAutoEnterClaudeCodeAfterSetup()) {
          deps.io.info('为避免 setup 结束后接管当前终端，请手动运行：ctr code');
          deps.io.info('如果你明确需要 setup 结束后自动进入 Claude Code，可设置环境变量 CTR_SETUP_AUTO_ENTER_CODE=1');
          return;
        }

        deps.io.close?.();
        await deps.enterClaudeCode();
      },
      reloadSupported: false,
    });
  } finally {
    deps.io.close?.();
  }
}
