import { IAppConfig, ICompiledModelCapabilities, IModelEndpointConfig, IModelThinkingConfig, IProvider } from '../trigger/types';
import { getModelApi, getModelInterface, getModelKey, normalizeModelEndpointConfig } from './schema';

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
  source: 'models' | 'providers';
}

export interface ICompiledModelRegistry {
  providers: IProvider[];
  modelMap: Record<string, ICompiledModelRef>;
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

  return {
    thinking: {
      supported: reasoningSupported,
      ...(reasoningSupported ? (item.thinking ?? {}) : {}),
    },
    tools: item.metadata?.supports_tools !== false,
    images: item.metadata?.supports_images !== false,
    systemMessageStyle: modelInterface,
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
  if (Array.isArray(config.Models) && config.Models.length > 0) {
    const providers = compileModelsToProviders(config.Models);
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
    }, {});

    return {
      providers,
      modelMap,
    };
  }

  const providers = config.Providers ?? [];
  const modelMap = providers.reduce<Record<string, ICompiledModelRef>>((result, provider) => {
    for (const model of provider.models ?? []) {
      const compatibilityProfile = inferCompatibilityProfile(
        { api_base_url: provider.api_base_url },
        'openai'
      );
      result[`${provider.name},${model}`] = {
        id: `${provider.name},${model}`,
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
  }, {});

  return {
    providers,
    modelMap,
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

export function isKnownModelReference(config: IAppConfig, ref?: string): boolean {
  if (!ref) {
    return false;
  }

  if (ref.includes(',')) {
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
