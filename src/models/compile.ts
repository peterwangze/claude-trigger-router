import { IAppConfig, IModelEndpointConfig, IModelThinkingConfig, IProvider } from '../trigger/types';

export interface ICompiledModelRef {
  id: string;
  providerName: string;
  modelName: string;
  protocol: 'openai' | 'anthropic';
  thinking?: IModelThinkingConfig;
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

export function compileModelsToProviders(models: IModelEndpointConfig[]): IProvider[] {
  return models.map((item) => ({
    name: `model__${item.id}`,
    api_base_url: item.api_base_url,
    api_key: item.api_key,
    models: [item.model],
    transformer: inferTransformer(item.protocol),
  }));
}

export function buildModelRegistry(config: IAppConfig): ICompiledModelRegistry {
  if (Array.isArray(config.Models) && config.Models.length > 0) {
    const providers = compileModelsToProviders(config.Models);
    const modelMap = config.Models.reduce<Record<string, ICompiledModelRef>>((result, item) => {
      result[item.id] = {
        id: item.id,
        providerName: `model__${item.id}`,
        modelName: item.model,
        protocol: item.protocol,
        thinking: item.thinking,
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
        protocol: 'openai',
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
