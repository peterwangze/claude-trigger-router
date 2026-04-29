import { IModelEndpointConfig, IModelThinkingConfig, TModelThinkingAlias } from '../trigger/types';

export type ModelInterface = 'openai' | 'anthropic';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function restoreTrailingSlash(value: string, shouldRestore: boolean): string {
  return shouldRestore && value ? `${value}/` : value;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function inferInterfaceFromApiEndpoint(api?: string, modelName?: string): ModelInterface | undefined {
  const trimmed = api?.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.includes('/chat/completions')) {
    return 'openai';
  }

  if (trimmed.includes('api.anthropic.com')) {
    return 'anthropic';
  }

  if (trimmed.includes('/messages')) {
    return 'anthropic';
  }

  const normalizedModelName = modelName?.trim().toLowerCase() || '';
  if (
    normalizedModelName.startsWith('claude') &&
    !trimmed.includes('/v1/chat/completions') &&
    (trimmed.endsWith('/v1') || /^https?:\/\/[^/]+\/?$/.test(trimmed))
  ) {
    return 'anthropic';
  }

  return trimmed.includes('/v1/messages') ? 'anthropic' : 'openai';
}

function normalizeEndpointPath(pathname: string, modelInterface: ModelInterface): string {
  const hadExplicitTrailingSlash = pathname.length > 1 && /\/+$/.test(pathname);
  const trimmedPath = trimTrailingSlash(pathname || '');
  const normalizedPath = trimmedPath || '';
  const lowerPath = normalizedPath.toLowerCase();

  if (modelInterface === 'anthropic') {
    if (lowerPath.endsWith('/v1/messages') || lowerPath.endsWith('/messages')) {
      return restoreTrailingSlash(normalizedPath || '/v1/messages', hadExplicitTrailingSlash);
    }
    if (lowerPath.endsWith('/v1')) {
      return `${normalizedPath}/messages`;
    }
    if (!normalizedPath) {
      return '/v1/messages';
    }
    return restoreTrailingSlash(normalizedPath, hadExplicitTrailingSlash);
  }

  if (lowerPath.endsWith('/chat/completions')) {
    return restoreTrailingSlash(normalizedPath || '/chat/completions', hadExplicitTrailingSlash);
  }
  if (lowerPath.endsWith('/v1')) {
    return `${normalizedPath}/chat/completions`;
  }
  if (!normalizedPath) {
    return '/v1/chat/completions';
  }
  return restoreTrailingSlash(normalizedPath, hadExplicitTrailingSlash);
}

export function normalizeApiEndpoint(api?: string, explicitInterface?: ModelInterface): string {
  const trimmed = api?.trim() || '';
  if (!trimmed) {
    return '';
  }

  const modelInterface = explicitInterface ?? inferInterfaceFromApiEndpoint(trimmed) ?? 'openai';

  try {
    const url = new URL(trimmed);
    url.pathname = normalizeEndpointPath(url.pathname, modelInterface);
    return url.toString();
  } catch {
    const [base, suffix = ''] = trimmed.split(/([?#].*)/, 2);
    const normalizedPath = normalizeEndpointPath(base, modelInterface);
    return `${normalizedPath}${suffix}`;
  }
}

export function getModelApi(item: Partial<IModelEndpointConfig>): string {
  const rawApi = trimString(item.api) || trimString(item.api_base_url) || '';
  const explicitInterface =
    item.interface === 'openai' || item.interface === 'anthropic'
      ? item.interface
      : item.protocol === 'openai' || item.protocol === 'anthropic'
        ? item.protocol
        : undefined;
  return normalizeApiEndpoint(rawApi, explicitInterface);
}

export function getModelKey(item: Partial<IModelEndpointConfig>): string {
  return trimString(item.key) || trimString(item.api_key) || '';
}

export function getModelInterface(item: Partial<IModelEndpointConfig>): ModelInterface | undefined {
  const modelInterface = item.interface || item.protocol;
  return typeof modelInterface === 'string' ? modelInterface as ModelInterface : undefined;
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
  const source = (
    item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  ) as Partial<IModelEndpointConfig>;
  const api = getModelApi(source);
  const key = getModelKey(source);
  const modelInterface = getModelInterface(source);

  return {
    ...source,
    id: trimString(source.id),
    api,
    api_base_url: api,
    key,
    api_key: key,
    interface: modelInterface,
    protocol: modelInterface,
    model: trimString(source.model),
    thinking: normalizeThinkingConfig(source.thinking),
    metadata: source.metadata
      ? {
          ...source.metadata,
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
