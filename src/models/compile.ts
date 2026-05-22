import { IAppConfig, ICompiledModelCapabilities, IModelEndpointConfig, IModelThinkingConfig, IProvider } from '../trigger/types';
import { getModelApi, getModelInterface, getModelKey, normalizeModelEndpointConfig } from './schema';
import { IModelPoolEndpointHealthSnapshot, modelPoolHealthStore } from './pool-health';

export type TCompatibilityProfile =
  | 'anthropic-native'
  | 'openai-compatible-anthropic-dispatch';

export type TDispatchFormat = 'anthropic_messages' | 'openai_chat';

export interface ICompatibilityProfileDescription {
  label: string;
  summary: string;
}

export interface ICompiledModelRef {
  id: string;
  providerName: string;
  modelName: string;
  interface?: 'openai' | 'anthropic';
  protocol: 'openai' | 'anthropic';
  compatibilityProfile: TCompatibilityProfile;
  dispatchFormat: TDispatchFormat;
  thinking?: IModelThinkingConfig;
  capabilities: ICompiledModelCapabilities;
  source: 'models' | 'providers' | 'registration';
  modelPool?: ICompiledModelPoolSelection;
}

export interface ICompiledModelRegistry {
  providers: IProvider[];
  modelMap: Record<string, ICompiledModelRef>;
  modelPools: Record<string, ICompiledModelPool>;
}

export type TModelPoolStrategy = 'priority' | 'least-latency';

export interface ICompiledModelPoolSelection {
  modelId: string;
  endpointId: string;
  strategy: TModelPoolStrategy;
}

export interface IModelPoolFallbackCandidate extends ICompiledModelPoolSelection {
  legacyRef: string;
  providerName: string;
  modelName: string;
}

export interface ICompiledModelPoolEndpoint {
  id: string;
  modelId: string;
  modelName: string;
  providerName: string;
  legacyRef: string;
  interface?: 'openai' | 'anthropic';
  protocol: 'openai' | 'anthropic';
  api?: string;
  keyConfigured: boolean;
  upstreamServiceId?: string;
  upstreamBaseUrl?: string;
  upstreamAuthConfigured: boolean;
  priority: number;
  enabled: boolean;
  health: IModelPoolEndpointHealthSnapshot;
  cost?: {
    inputPer1MTokens?: number;
    outputPer1MTokens?: number;
    currency: string;
  };
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  capabilities: ICompiledModelCapabilities;
  source: 'registration';
}

export interface ICompiledModelPool {
  modelId: string;
  strategy: TModelPoolStrategy;
  endpoints: ICompiledModelPoolEndpoint[];
  activeEndpointId?: string;
  warnings: string[];
}

interface IRegistrationPoolCompileResult {
  providers: IProvider[];
  modelMap: Record<string, ICompiledModelRef>;
  modelPools: Record<string, ICompiledModelPool>;
}

export interface ICompiledCapabilityWarningEntry {
  path: string;
  modelId: string;
  level: 'info' | 'warn';
  code: string;
  message: string;
}

export interface ICompiledCapabilityWarningReport {
  entries: ICompiledCapabilityWarningEntry[];
  summary: {
    total: number;
    warn: number;
    info: number;
  };
}

function inferTransformer(protocol: 'openai' | 'anthropic'): any {
  if (protocol === 'openai') {
    return {
      use: ['openrouter'],
    };
  }

  return undefined;
}

function inferCompatibilityProfile(
  item: Pick<IModelEndpointConfig, 'api' | 'api_base_url' | 'metadata'>,
  modelInterface: 'openai' | 'anthropic'
): TCompatibilityProfile {
  if (modelInterface === 'anthropic') {
    return 'anthropic-native';
  }

  return 'openai-compatible-anthropic-dispatch';
}

export function getDispatchFormatForProfile(
  modelInterface: 'openai' | 'anthropic',
  compatibilityProfile: TCompatibilityProfile
): TDispatchFormat {
  if (modelInterface === 'anthropic') {
    return 'anthropic_messages';
  }

  switch (compatibilityProfile) {
    case 'openai-compatible-anthropic-dispatch':
      return 'anthropic_messages';
    case 'anthropic-native':
      return 'anthropic_messages';
    default:
      return 'anthropic_messages';
  }
}

export function describeCompatibilityProfile(profile: TCompatibilityProfile): ICompatibilityProfileDescription {
  switch (profile) {
    case 'anthropic-native':
      return {
        label: 'Anthropic native',
        summary: '目标接口原生接受 Anthropic messages 形态，请求无需做 OpenAI-compatible 兼容转换。',
      };
    case 'openai-compatible-anthropic-dispatch':
      return {
        label: 'OpenAI-compatible / Anthropic dispatch',
        summary: '目标接口属于 OpenAI-compatible 兼容族，运行时会自动使用 Anthropic-style dispatch 处理 tools、messages 与控制字段差异。',
      };
    default:
      return {
        label: profile,
        summary: '未知兼容画像。',
      };
  }
}

export function describeDispatchFormat(format: TDispatchFormat): ICompatibilityProfileDescription {
  switch (format) {
    case 'anthropic_messages':
      return {
        label: 'Anthropic-style messages',
        summary: '运行时会把统一请求编译成 Anthropic messages 形态后再发往目标接口。',
      };
    case 'openai_chat':
      return {
        label: 'OpenAI chat completions',
        summary: '运行时会把统一请求编译成 OpenAI chat completions 形态后再发往目标接口。',
      };
    default:
      return {
        label: format,
        summary: '未知 dispatch 形态。',
      };
  }
}

function buildCompiledCapabilities(
  item: Pick<IModelEndpointConfig, 'thinking' | 'metadata'>,
  modelInterface: 'openai' | 'anthropic'
): ICompiledModelCapabilities {
  const reasoningSupported = item.metadata?.supports_reasoning !== false;
  const contextWindowTokens = readMetadataNumber(item.metadata, 'context_window_tokens');
  const safeInputTokens = readMetadataNumber(item.metadata, 'safe_input_tokens');

  return {
    thinking: {
      supported: reasoningSupported,
      ...(reasoningSupported ? (item.thinking ?? {}) : {}),
    },
    tools: item.metadata?.supports_tools !== false,
    images: item.metadata?.supports_images !== false,
    systemMessageStyle: modelInterface,
    ...(contextWindowTokens ? { contextWindowTokens } : {}),
    ...(safeInputTokens ? { safeInputTokens } : {}),
  };
}

function readMetadataString(metadata: IModelEndpointConfig['metadata'], key: string): string {
  const value = metadata?.[key as keyof NonNullable<IModelEndpointConfig['metadata']>];
  return typeof value === 'string' ? value.trim() : '';
}

function readMetadataNumber(metadata: IModelEndpointConfig['metadata'], key: string): number | undefined {
  const value = metadata?.[key as keyof NonNullable<IModelEndpointConfig['metadata']>];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readMetadataBoolean(metadata: IModelEndpointConfig['metadata'], key: string): boolean | undefined {
  const value = metadata?.[key as keyof NonNullable<IModelEndpointConfig['metadata']>];
  return typeof value === 'boolean' ? value : undefined;
}

function buildOperationalMetadata(metadata: IModelEndpointConfig['metadata']) {
  const inputPer1MTokens = readMetadataNumber(metadata, 'cost_per_1m_input_tokens');
  const outputPer1MTokens = readMetadataNumber(metadata, 'cost_per_1m_output_tokens');
  const requestsPerMinute = readMetadataNumber(metadata, 'rate_limit_rpm');
  const tokensPerMinute = readMetadataNumber(metadata, 'rate_limit_tpm');
  const currency = readMetadataString(metadata, 'cost_currency') || 'USD';

  return {
    cost: inputPer1MTokens !== undefined || outputPer1MTokens !== undefined
      ? {
          inputPer1MTokens,
          outputPer1MTokens,
          currency,
        }
      : undefined,
    rateLimit: requestsPerMinute !== undefined || tokensPerMinute !== undefined
      ? {
          requestsPerMinute,
          tokensPerMinute,
        }
      : undefined,
  };
}

function buildRegistrationUpstreamIndex(config: IAppConfig) {
  const services = Array.isArray(config.Registration?.upstream_services)
    ? config.Registration?.upstream_services
    : [];
  return new Map(
    services
      .filter((service) => typeof service?.id === 'string' && service.id.trim())
      .map((service) => [service.id.trim(), service])
  );
}

function createUniqueEndpointId(
  preferredId: string,
  usedEndpointIds: Set<string>
): string {
  let endpointId = preferredId;
  let suffix = 2;
  while (usedEndpointIds.has(endpointId)) {
    endpointId = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  usedEndpointIds.add(endpointId);
  return endpointId;
}

function createUniqueName(preferredName: string, usedNames: Set<string>): string {
  let name = preferredName;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${preferredName}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

function sanitizeProviderName(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'endpoint';
}

function buildCompiledModelRefFromPoolEndpoint(
  endpoint: ICompiledModelPoolEndpoint,
  thinking: IModelThinkingConfig | undefined,
  compatibilityProfile: TCompatibilityProfile,
  strategy: TModelPoolStrategy
): ICompiledModelRef {
  return {
    id: endpoint.modelId,
    providerName: endpoint.providerName,
    modelName: endpoint.modelName,
    interface: endpoint.interface,
    protocol: endpoint.protocol,
    compatibilityProfile,
    dispatchFormat: getDispatchFormatForProfile(endpoint.protocol, compatibilityProfile),
    thinking,
    capabilities: endpoint.capabilities,
    source: 'registration',
    modelPool: {
      modelId: endpoint.modelId,
      endpointId: endpoint.id,
      strategy,
    },
  };
}

function getRegistrationPoolStrategy(config: IAppConfig): TModelPoolStrategy {
  return config.Registration?.strategy === 'least-latency' ? 'least-latency' : 'priority';
}

function latencyScore(endpoint: ICompiledModelPoolEndpoint): number | undefined {
  const averageMs = endpoint.health.latency?.averageMs;
  return typeof averageMs === 'number' && Number.isFinite(averageMs) ? averageMs : undefined;
}

function sortEndpointsForStrategy(
  endpoints: ICompiledModelPoolEndpoint[],
  strategy: TModelPoolStrategy
): ICompiledModelPoolEndpoint[] {
  if (strategy !== 'least-latency') {
    return [...endpoints].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }

  return [...endpoints].sort((a, b) => {
    const leftLatency = latencyScore(a);
    const rightLatency = latencyScore(b);
    if (leftLatency !== undefined && rightLatency !== undefined && leftLatency !== rightLatency) {
      return leftLatency - rightLatency;
    }
    if (leftLatency !== undefined && rightLatency === undefined) {
      return -1;
    }
    if (leftLatency === undefined && rightLatency !== undefined) {
      return 1;
    }
    return a.priority - b.priority || a.id.localeCompare(b.id);
  });
}

function buildRegistrationModelPools(config: IAppConfig): IRegistrationPoolCompileResult {
  const registration = config.Registration;
  if (!registration?.enabled || !Array.isArray(registration.models) || registration.models.length === 0) {
    return {
      providers: [],
      modelMap: {},
      modelPools: {},
    };
  }

  const upstreamServices = buildRegistrationUpstreamIndex(config);
  const usedEndpointIds = new Set<string>();
  const usedProviderNames = new Set<string>();
  const providers: IProvider[] = [];
  const modelMap: Record<string, ICompiledModelRef> = {};
  const pools: Record<string, ICompiledModelPool> = {};
  const strategy = getRegistrationPoolStrategy(config);

  registration.models.forEach((rawItem, index) => {
    const item = normalizeModelEndpointConfig(rawItem);
    if (!item.id) {
      return;
    }

    const upstreamServiceId = readMetadataString(item.metadata, 'upstream_service_id');
    const upstreamService = upstreamServiceId ? upstreamServices.get(upstreamServiceId) : undefined;
    const warnings: string[] = [];
    if (upstreamServiceId && !upstreamService) {
      warnings.push(`Registration.models[${index}].metadata.upstream_service_id references missing upstream service "${upstreamServiceId}".`);
    }

    const modelInterface = getModelInterface(item) || 'openai';
    const endpointId = createUniqueEndpointId(
      readMetadataString(item.metadata, 'pool_endpoint_id') ||
        (upstreamServiceId ? `${item.id}@${upstreamServiceId}` : `${item.id}@registration-${index + 1}`),
      usedEndpointIds
    );
    const providerName = createUniqueName(
      `registration__${sanitizeProviderName(endpointId)}`,
      usedProviderNames
    );
    const poolPriority = readMetadataNumber(item.metadata, 'pool_priority') ?? index + 1;
    const enabled = readMetadataBoolean(item.metadata, 'pool_enabled') ?? true;
    const compatibilityProfile = inferCompatibilityProfile(item, modelInterface);
    const capabilities = buildCompiledCapabilities(item, modelInterface);
    const operationalMetadata = buildOperationalMetadata(item.metadata);
    const endpoint: ICompiledModelPoolEndpoint = {
      id: endpointId,
      modelId: item.id,
      modelName: item.model,
      providerName,
      legacyRef: `${providerName},${item.model}`,
      interface: modelInterface,
      protocol: modelInterface,
      api: getModelApi(item) || undefined,
      keyConfigured: Boolean(getModelKey(item)),
      upstreamServiceId: upstreamServiceId || undefined,
      upstreamBaseUrl: upstreamService?.base_url,
      upstreamAuthConfigured: Boolean(upstreamService?.auth_token),
      priority: poolPriority,
      enabled,
      health: modelPoolHealthStore.getSnapshot(item.id, endpointId),
      ...operationalMetadata,
      capabilities,
      source: 'registration',
    };
    providers.push({
      name: providerName,
      api_base_url: getModelApi(item),
      api_key: getModelKey(item),
      models: [item.model],
      transformer: inferTransformer(modelInterface),
    });
    modelMap[endpoint.legacyRef] = buildCompiledModelRefFromPoolEndpoint(
      endpoint,
      item.thinking as IModelThinkingConfig | undefined,
      compatibilityProfile,
      strategy
    );

    const pool = pools[item.id] ?? {
      modelId: item.id,
      strategy,
      endpoints: [],
      warnings: [],
    };
    pool.endpoints.push(endpoint);
    pool.warnings.push(...warnings);
    pools[item.id] = pool;
  });

  Object.values(pools).forEach((pool) => {
    pool.endpoints.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const selectionOrder = sortEndpointsForStrategy(pool.endpoints, pool.strategy);
    pool.activeEndpointId =
      selectionOrder.find((endpoint) =>
        endpoint.enabled && modelPoolHealthStore.isEndpointAvailable(pool.modelId, endpoint.id)
      )?.id
      ?? pool.endpoints.find((endpoint) => endpoint.enabled)?.id;
    const activeEndpoint = pool.endpoints.find((endpoint) => endpoint.id === pool.activeEndpointId);
    if (activeEndpoint) {
      modelMap[pool.modelId] = modelMap[activeEndpoint.legacyRef];
    }
  });

  return {
    providers,
    modelMap,
    modelPools: pools,
  };
}

export function compileModelsToProviders(models: IModelEndpointConfig[]): IProvider[] {
  return models.map((rawItem) => {
    const item = normalizeModelEndpointConfig(rawItem);
    const modelInterface = getModelInterface(item) || 'openai';
    return {
    name: `model__${item.id}`,
    api_base_url: getModelApi(item),
    api_key: getModelKey(item),
    models: [item.model],
    transformer: inferTransformer(modelInterface),
  };
  });
}

export function buildModelRegistry(config: IAppConfig): ICompiledModelRegistry {
  const registrationPools = buildRegistrationModelPools(config);

  if (Array.isArray(config.Models) && config.Models.length > 0) {
    const providers = [
      ...compileModelsToProviders(config.Models),
      ...registrationPools.providers,
    ];
    const modelMap = config.Models.reduce<Record<string, ICompiledModelRef>>((result, rawItem) => {
      const item = normalizeModelEndpointConfig(rawItem);
      const modelInterface = getModelInterface(item) || 'openai';
      const compatibilityProfile = inferCompatibilityProfile(item, modelInterface);
      result[item.id] = {
        id: item.id,
        providerName: `model__${item.id}`,
        modelName: item.model,
        interface: modelInterface,
        protocol: modelInterface,
        compatibilityProfile,
        dispatchFormat: getDispatchFormatForProfile(modelInterface, compatibilityProfile),
      thinking: item.thinking,
      capabilities: buildCompiledCapabilities(item, modelInterface),
      source: 'models',
      };
      return result;
    }, {
      ...registrationPools.modelMap,
    });

    return {
      providers,
      modelMap,
      modelPools: registrationPools.modelPools,
    };
  }

  const providers = [
    ...(config.Providers ?? []),
    ...registrationPools.providers,
  ];
  const modelMap = providers.reduce<Record<string, ICompiledModelRef>>((result, provider) => {
    for (const model of provider.models ?? []) {
      const legacyRef = `${provider.name},${model}`;
      if (registrationPools.modelMap[legacyRef]) {
        result[legacyRef] = registrationPools.modelMap[legacyRef];
        continue;
      }
      const compatibilityProfile = inferCompatibilityProfile(
        { api_base_url: provider.api_base_url },
        'openai'
      );
      result[legacyRef] = {
        id: legacyRef,
        providerName: provider.name,
        modelName: model,
        interface: 'openai',
        protocol: 'openai',
        compatibilityProfile,
        dispatchFormat: getDispatchFormatForProfile('openai', compatibilityProfile),
        capabilities: {
          thinking: {
            supported: true,
          },
          tools: true,
          images: true,
          systemMessageStyle: 'openai',
        },
        source: 'providers',
      };
    }
    return result;
  }, {
    ...registrationPools.modelMap,
  });

  return {
    providers,
    modelMap,
    modelPools: registrationPools.modelPools,
  };
}

export function resolveModelReference(config: IAppConfig, ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }

  if (ref.includes(',')) {
    return ref;
  }

  const registry = buildModelRegistry(config);
  const compiled = registry.modelMap[ref];
  if (!compiled) {
    return ref;
  }

  return `${compiled.providerName},${compiled.modelName}`;
}

export function getCompiledModelRef(config: IAppConfig, ref?: string): ICompiledModelRef | undefined {
  if (!ref) {
    return undefined;
  }

  const registry = buildModelRegistry(config);
  if (!ref.includes(',')) {
    return registry.modelMap[ref];
  }

  const resolvedRef = registry.modelMap[ref];
  if (resolvedRef) {
    return resolvedRef;
  }

  const [providerName, modelName] = ref.split(',');
  return Object.values(registry.modelMap).find(
    (item) => item.providerName === providerName && item.modelName === modelName
  );
}

export function getModelPoolFallbackCandidate(
  config: IAppConfig,
  selection?: ICompiledModelPoolSelection
): IModelPoolFallbackCandidate | undefined {
  if (!selection?.modelId || !selection.endpointId) {
    return undefined;
  }

  const registry = buildModelRegistry(config);
  const pool = registry.modelPools[selection.modelId];
  if (!pool) {
    return undefined;
  }

  const enabledEndpoints = pool.endpoints.filter((endpoint) => endpoint.enabled);
  const currentIndex = enabledEndpoints.findIndex((endpoint) => endpoint.id === selection.endpointId);
  const fallbackCandidates = pool.strategy === 'least-latency'
    ? enabledEndpoints.filter((endpoint) => endpoint.id !== selection.endpointId)
    : currentIndex >= 0
      ? enabledEndpoints.slice(currentIndex + 1)
      : enabledEndpoints.filter((endpoint) => endpoint.id !== selection.endpointId);
  const fallbackEndpoint = sortEndpointsForStrategy(fallbackCandidates, pool.strategy).find((endpoint) =>
    modelPoolHealthStore.isEndpointAvailable(pool.modelId, endpoint.id)
  );

  if (!fallbackEndpoint) {
    return undefined;
  }

  return {
    modelId: fallbackEndpoint.modelId,
    endpointId: fallbackEndpoint.id,
    strategy: pool.strategy,
    legacyRef: fallbackEndpoint.legacyRef,
    providerName: fallbackEndpoint.providerName,
    modelName: fallbackEndpoint.modelName,
  };
}

export function isKnownModelReference(config: IAppConfig, ref?: string): boolean {
  if (!ref) {
    return false;
  }

  if (ref.includes(',')) {
    const registry = buildModelRegistry(config);
    if (registry.modelMap[ref]) {
      return true;
    }
    const [provider, model] = ref.split(',');
    return Boolean(
      config.Providers?.find((item) =>
        item.name === provider && item.models?.includes(model)
      )
    );
  }

  const registry = buildModelRegistry(config);
  return Boolean(registry.modelMap[ref]);
}

export function collectCapabilityWarnings(
  config: Partial<IAppConfig>,
  registry?: ICompiledModelRegistry
): ICompiledCapabilityWarningReport {
  const entries: ICompiledCapabilityWarningEntry[] = [];
  const models = Array.isArray(config?.Models) ? config.Models : [];
  const resolvedRegistry = registry ?? buildModelRegistry(config as IAppConfig);

  models.forEach((model, index) => {
    const modelId = typeof model?.id === 'string' ? model.id.trim() : '';
    if (!modelId) {
      return;
    }

    const compiledModel = resolvedRegistry.modelMap?.[modelId];
    if (!compiledModel) {
      return;
    }

    if (model?.thinking && compiledModel.capabilities?.thinking?.supported === false) {
      entries.push({
        path: `Models[${index}].thinking`,
        modelId,
        level: 'warn',
        code: 'thinking_ignored',
        message: `Models[${index}].thinking is configured, but model "${modelId}" disables reasoning. Runtime requests will ignore thinking.`,
      });
    }

    if (model?.metadata?.supports_tools === false) {
      entries.push({
        path: `Models[${index}].metadata.supports_tools`,
        modelId,
        level: 'info',
        code: 'tools_text_fallback',
        message: `Models[${index}].metadata.supports_tools disables tools for model "${modelId}". Tool definitions and tool call/result blocks will fall back to plain text.`,
      });
    }

    if (model?.metadata?.supports_images === false) {
      entries.push({
        path: `Models[${index}].metadata.supports_images`,
        modelId,
        level: 'info',
        code: 'images_text_fallback',
        message: `Models[${index}].metadata.supports_images disables image input for model "${modelId}". Image blocks will fall back to plain text descriptions.`,
      });
    }
  });

  return {
    entries,
    summary: {
      total: entries.length,
      warn: entries.filter((entry) => entry.level === 'warn').length,
      info: entries.filter((entry) => entry.level === 'info').length,
    },
  };
}
