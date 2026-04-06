import { IModelEndpointConfig, IModelThinkingConfig, TModelThinkingAlias } from '../trigger/types';

export type ModelInterface = 'openai' | 'anthropic';

export function getModelApi(item: Partial<IModelEndpointConfig>): string {
  return item.api?.trim() || item.api_base_url?.trim() || '';
}

export function getModelKey(item: Partial<IModelEndpointConfig>): string {
  return item.key?.trim() || item.api_key?.trim() || '';
}

export function getModelInterface(item: Partial<IModelEndpointConfig>): ModelInterface | undefined {
  return item.interface || item.protocol;
}

export function normalizeThinkingConfig(
  thinking?: IModelEndpointConfig['thinking']
): IModelThinkingConfig | undefined {
  if (!thinking) {
    return undefined;
  }

  if (typeof thinking === 'string') {
    if (thinking === 'low' || thinking === 'medium' || thinking === 'high') {
      return {
        mode: 'on',
        effort: thinking,
      };
    }

    return {
      mode: thinking,
    };
  }

  return {
    ...thinking,
  };
}

export function toThinkingAlias(
  thinking?: IModelThinkingConfig
): TModelThinkingAlias | IModelThinkingConfig | undefined {
  if (!thinking) {
    return undefined;
  }

  if (thinking.budget_tokens !== undefined) {
    return {
      ...thinking,
    };
  }

  if (thinking.mode === 'on' && thinking.effort && !thinking.budget_tokens) {
    return thinking.effort;
  }

  if (thinking.mode && !thinking.effort) {
    return thinking.mode;
  }

  return {
    ...thinking,
  };
}

export function normalizeModelEndpointConfig(item: Partial<IModelEndpointConfig>): IModelEndpointConfig {
  const api = getModelApi(item);
  const key = getModelKey(item);
  const modelInterface = getModelInterface(item);

  return {
    ...item,
    id: item.id?.trim() ?? '',
    api,
    api_base_url: api,
    key,
    api_key: key,
    interface: modelInterface,
    protocol: modelInterface,
    model: item.model?.trim() ?? '',
    thinking: normalizeThinkingConfig(item.thinking),
    metadata: item.metadata
      ? {
          ...item.metadata,
        }
      : undefined,
  };
}

export function toExternalModelConfig(item: Partial<IModelEndpointConfig>) {
  const normalized = normalizeModelEndpointConfig(item);
  return {
    id: normalized.id,
    api: normalized.api_base_url,
    key: normalized.api_key,
    interface: normalized.protocol,
    model: normalized.model,
    thinking: toThinkingAlias(normalized.thinking as IModelThinkingConfig | undefined),
    metadata: normalized.metadata,
  };
}
