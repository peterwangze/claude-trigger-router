import { IModelEndpointConfig } from '../trigger/types';

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
    thinking: item.thinking
      ? {
          ...item.thinking,
        }
      : undefined,
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
    thinking: normalized.thinking,
    metadata: normalized.metadata,
  };
}
