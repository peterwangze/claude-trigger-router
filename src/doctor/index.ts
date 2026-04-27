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
import { buildValidationIssueReport, formatValidationIssueReport } from '../utils/validation-contract';
import { migrateLegacyConfig } from '../setup/migrate';
import { readLegacyConfig } from '../setup';
import { IAppConfig, IModelEndpointConfig } from '../trigger/types';
import { getModelApi, getModelInterface, getModelKey, inferInterfaceFromApiEndpoint } from '../models/schema';
import { buildModelRegistry, describeCompatibilityProfile, describeDispatchFormat } from '../models/compile';
import { buildProviderDispatchRequest, describeProtocolDiagnostic, TProtocolDiagnosticCode } from '../protocols';
import { isServiceRunning, killProcess, readServiceInfo } from '../utils/processCheck';
import { isTcpPortOccupied, probeRemoteServiceStatus, probeServiceHealth, waitForService } from '../service-health';
import { buildUsableMinimalTemplateConfig } from '../setup/templates';
import { managedApiKeySummary } from '../auth/api-keys';

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

interface IProbeFailureExplanation {
  label: string;
  summary: string;
  action: string;
}

function collectCompatibilityPreviewDiagnostics(model: IModelEndpointConfig) {
  const registry = buildModelRegistry({
    Providers: [],
    Models: [model],
    Router: {
      default: model.id,
    },
  } as IAppConfig);
  const compiledModel = registry.modelMap[model.id];
  if (!compiledModel) {
    return [];
  }

  const preview = buildProviderDispatchRequest({
    model: compiledModel.modelName,
    interface: compiledModel.interface ?? 'openai',
    compatibilityProfile: compiledModel.compatibilityProfile,
    capabilities: compiledModel.capabilities,
    request: {
      model: compiledModel.id,
      max_tokens: 32,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'compatibility preview',
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'preview',
              },
            },
          ],
        },
      ],
      tools: [
        {
          name: 'preview_tool',
          description: 'Preview tool',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ],
      tool_choice: {
        type: 'tool',
        name: 'preview_tool',
      },
      thinking: {
        type: 'enabled',
        effort: 'medium',
      },
    },
  });

  return preview.diagnostics.map((code) => describeProtocolDiagnostic(code as TProtocolDiagnosticCode));
}

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
  const ask = async (message: string): Promise<string | undefined> => {
    try {
      return (await rl.question(message)).trim();
    } catch (error: any) {
      if (error?.code === 'ERR_USE_AFTER_CLOSE') {
        return undefined;
      }
      throw error;
    }
  };

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
        if (answer === undefined) {
          return options[0];
        }
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
      const answer = (await ask(`${message} ${defaultValue ? '[Y/n]' : '[y/N]'}: `))?.toLowerCase();
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

function inferInterfaceFromApi(api?: string, modelName?: string): 'openai' | 'anthropic' | undefined {
  return inferInterfaceFromApiEndpoint(api, modelName);
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
      const inferredInterface = getModelInterface(item) ?? inferInterfaceFromApi(api, item.model);
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

function explainProbeFailure(category: TProbeResult extends { kind: 'failure'; category: infer T } ? T : never): IProbeFailureExplanation {
  switch (category) {
    case 'auth_error':
      return {
        label: '鉴权失败',
        summary: '上游接口拒绝了当前 API Key，或当前账号没有访问该模型的权限。',
        action: '请检查 API Key、账号订阅状态，以及当前账号是否具备目标模型权限。',
      };
    case 'model_not_found':
      return {
        label: '模型不存在或无权限',
        summary: '上游接口无法识别当前模型名，或当前账号没有该模型的访问权限。',
        action: '请检查模型名是否正确，以及当前账号是否已开通该模型。',
      };
    case 'endpoint_unreachable':
      return {
        label: '接口不可达',
        summary: 'doctor 无法连接到当前 API 地址，可能是地址、网络、TLS 或代理配置问题。',
        action: '请检查 API Base URL、网络连通性、TLS 证书链，以及是否需要代理。',
      };
    case 'protocol_mismatch':
      return {
        label: '协议兼容失败',
        summary: '当前上游接口与统一消息抽象在 messages、tools、stream 或控制字段上存在兼容差异。',
        action: '请先确认 API Base URL 和 interface 是否配置正确；如果文本请求正常但工具调用失败，请保留原始报错继续收敛兼容层。',
      };
    case 'remote_error':
      return {
        label: '上游返回错误',
        summary: '请求已经到达上游，但上游返回了其他业务或服务端错误。',
        action: '请结合原始错误信息检查上游服务状态、模型配额或账号限制。',
      };
    default:
      return {
        label: category,
        summary: '未知远端错误。',
        action: '请保留原始错误信息后继续排查。',
      };
  }
}

async function ensureServiceUsable(config: IAppConfig, deps: IDoctorDeps, configChanged: boolean): Promise<void> {
  const port = config.PORT ?? DEFAULT_CONFIG.PORT;
  const serviceHealthOptions = config.APIKEY ? { apiKey: config.APIKEY } : {};
  const healthy = await deps.probeServiceHealth(port, 500, serviceHealthOptions);
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
  const verified = await deps.waitForService(port, 5000, serviceHealthOptions);
  if (!verified) {
    throw new Error(`doctor 自动启动后健康检查仍未通过（端口 ${port}）。`);
  }
  deps.io.info(`服务已就绪：http://127.0.0.1:${port}`);
}

async function reportRuntimeServiceContext(config: IAppConfig, deps: IDoctorDeps): Promise<void> {
  const runtimeMode = config.Runtime?.mode ?? 'local';
  const serviceRole = runtimeMode === 'local' ? 'local_agent' : 'router_service';
  const remoteService = config.Runtime?.remote_service;
  const managedKeys = managedApiKeySummary(config);
  const hasBootstrapAuth = Boolean(config.APIKEY);
  const hasManagedAuthRecords = managedKeys.total > 0;
  const authRequired = hasBootstrapAuth || hasManagedAuthRecords;
  const publicHost = ['0.0.0.0', '::', '[::]'].includes(String(config.HOST ?? '').trim());

  deps.io.info(`服务上下文：${runtimeMode}（${serviceRole}）`);
  deps.io.info(`鉴权状态：${authRequired ? 'enabled' : 'disabled'}（bootstrap=${hasBootstrapAuth}, managed_active=${managedKeys.active}）`);
  deps.io.info('Scope 指引：admin 用于 /ui、配置保存、重启、auth 管理和治理写操作；client 只用于模型调用；read-only 只用于 health/status/compiled/governance 观测。');
  deps.io.info('Key 操作指引：使用 admin key 调用 GET /api/auth/keys 查看列表、POST /api/auth/keys 生成 key、POST /api/auth/keys/:id/revoke 吊销 key；生成的 secret 只返回一次。');
  if (!authRequired && (runtimeMode !== 'local' || publicHost)) {
    deps.io.error('安全风险：当前 server/cloud 或公网监听未配置 API key；暴露服务前请设置 APIKEY 或创建 managed client/admin key。');
  } else if (!hasBootstrapAuth && hasManagedAuthRecords && managedKeys.active === 0) {
    deps.io.error('安全风险：当前仅保留 managed key 记录但没有 active key；服务会拒绝请求，请设置 APIKEY 或创建 active managed key。');
  } else if (authRequired && hasBootstrapAuth && managedKeys.total === 0 && runtimeMode !== 'local') {
    deps.io.info('安全提示：当前仅配置 bootstrap APIKEY；建议为远程使用者生成 managed client key，并保留 APIKEY 只做管理用途。');
  }

  if (!remoteService?.enabled) {
    deps.io.info('远程服务检查：未启用，本机使用本地配置和本地服务健康检查。');
    return;
  }

  const baseUrl = remoteService.base_url?.trim().replace(/\/+$/, '') || '<missing>';
  deps.io.info(`远程服务检查：${baseUrl}`);
  deps.io.info('远程 token 指引：Runtime.remote_service.auth_token 如果同时要探测 ready/status 并调用模型，请通过 POST /api/auth/keys 生成 client + read-only key；避免复用 admin key。');

  const remoteStatus = await probeRemoteServiceStatus(remoteService);
  const statusLabel = remoteStatus.ready
    ? 'ready'
    : remoteStatus.reachable
      ? 'reachable'
      : 'unreachable';
  deps.io.info(`远程服务状态：${statusLabel}（reachable=${remoteStatus.reachable}, ready=${remoteStatus.ready}）`);
  const remoteSecurity = remoteStatus.security && typeof remoteStatus.security === 'object'
    ? remoteStatus.security as { status?: unknown; issues?: Array<{ message?: string; action?: string }> }
    : undefined;
  if (remoteSecurity?.status) {
    deps.io.info(`远程服务安全状态：${String(remoteSecurity.status)}`);
    const firstIssue = Array.isArray(remoteSecurity.issues) ? remoteSecurity.issues[0] : undefined;
    if (firstIssue?.message) {
      deps.io.info(`远程服务安全提示：${firstIssue.message}${firstIssue.action ? `；${firstIssue.action}` : ''}`);
    }
  }
  if (remoteStatus.error) {
    deps.io.info(`远程服务提示：${remoteStatus.error}`);
  }
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
      deps.io.error(`doctor 仍发现无法自动修复的配置错误：${formatValidationIssueReport(buildValidationIssueReport({ errors: normalized.errors })).join('; ')}`);
      throw new Error('doctor could not fully repair config');
    }
    if (normalized.warnings.length > 0) {
      deps.io.info(`配置提示：${formatValidationIssueReport(buildValidationIssueReport({ warnings: normalized.warnings })).join('; ')}`);
    }

    await reportRuntimeServiceContext(normalized.config, deps);

    const registry = buildModelRegistry(normalized.config);
    for (const model of normalized.config.Models ?? []) {
      const compiledModel = registry.modelMap[model.id];
      if (!compiledModel) {
        continue;
      }
      const compatibility = describeCompatibilityProfile(compiledModel.compatibilityProfile);
      const dispatch = describeDispatchFormat(compiledModel.dispatchFormat);
      deps.io.info(
        `模型兼容策略：${model.id} -> ${compatibility.label}`
      );
      deps.io.info(`兼容说明：${compatibility.summary}`);
      deps.io.info(`请求编译：${dispatch.label}。${dispatch.summary}`);
      const previewDiagnostics = collectCompatibilityPreviewDiagnostics(model);
      for (const diagnostic of previewDiagnostics) {
        deps.io.info(`运行时兼容提示：${diagnostic.label}`);
        deps.io.info(`运行时说明：${diagnostic.summary}`);
        deps.io.info(`运行时建议：${diagnostic.action}`);
      }
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

    const modelCount = normalized.config.Models?.length ?? 0;
    if (modelCount === 0) {
      deps.io.info('已跳过模型探测：当前配置没有本地模型。配置和服务诊断已完成。');
      return;
    }

    const shouldProbeModels = hasArg('--check-models')
      ? await deps.io.confirm(`即将向 ${modelCount} 个模型发送最小探测请求，可能消耗少量额度，是否继续？`, true)
      : await deps.io.confirm(`是否继续探测 ${modelCount} 个模型的可用性？这会消耗少量额度。`, false);

    if (!shouldProbeModels) {
      deps.io.info('已跳过模型探测。配置和服务诊断已完成。');
      return;
    }

    let probeSuccess = 0;
    let probeFailure = 0;
    for (const model of normalized.config.Models ?? []) {
      const result = await probeModelAvailability(model);
      if (result.kind === 'success') {
        deps.io.info(`模型探测成功：${model.id}`);
        probeSuccess += 1;
        continue;
      }

      const explanation = explainProbeFailure(result.category);
      probeFailure += 1;
      deps.io.error(`模型探测失败：${model.id} -> ${explanation.label}`);
      deps.io.info(`失败说明：${explanation.summary}`);
      deps.io.info(`处理建议：${explanation.action}`);
      deps.io.info(`远端原始信息：${result.message}`);
      deps.io.info('这类远端失败需要你确认并手动处理；doctor 不会自动修改模型语义或远端账号配置。');
    }

    deps.io.info(`模型探测完成：成功 ${probeSuccess}，失败 ${probeFailure}。`);
    deps.io.info('doctor 诊断完成。');
  } finally {
    deps.io.close?.();
  }
}
