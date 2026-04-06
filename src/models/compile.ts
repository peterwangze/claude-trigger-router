import { IAppConfig, ICompiledModelCapabilities, IModelEndpointConfig, IModelThinkingConfig, IProvider } from '../trigger/types';
import { getModelApi, getModelInterface, getModelKey, normalizeModelEndpointConfig } from './schema';

export interface ICompiledModelRef {
  id: string;
  providerName: string;
  modelName: string;
  interface?: 'openai' | 'anthropic';
  protocol: 'openai' | 'anthropic';
  thinking?: IModelThinkingConfig;
  capabilities: ICompiledModelCapabilities;
  source: 'models' | 'providers';
}

export interface ICompiledModelRegistry {
  providers: IProvider[];
  modelMap: Record<string, ICompiledModelRef>;
}

function inferTransformer(protocol: 'openai' | 'anthropic'): any {
  if (protocol === 'openai') {
    return {
      use: ['openrouter'],
    };
  }

  return undefined;
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
      result[item.id] = {
        id: item.id,
        providerName: `model__${item.id}`,
        modelName: item.model,
        interface: modelInterface,
        protocol: modelInterface,
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
      result[`${provider.name},${model}`] = {
        id: `${provider.name},${model}`,
        providerName: provider.name,
        modelName: model,
        interface: 'openai',
        protocol: 'openai',
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
