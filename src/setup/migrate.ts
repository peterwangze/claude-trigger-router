import { ISetupConfigDraft } from './types';

export interface IMigrateLegacyConfigResult {
  draft: ISetupConfigDraft;
  skippedFields: string[];
  needsCompletion: boolean;
  missingFields: string[];
}

interface ILegacyProviderInput {
  name?: string;
  api_base_url?: string;
  api_key?: string;
  models?: string[];
  transformer?: unknown;
  headers?: unknown;
}

interface ILegacyRouterInput {
  default?: string;
  background?: unknown;
  think?: unknown;
  longContext?: unknown;
  longContextThreshold?: unknown;
}

interface ILegacyConfigInput {
  providers?: ILegacyProviderInput[] | unknown;
  default?: string | unknown;
  trigger_router?: unknown;
  Providers?: ILegacyProviderInput[] | unknown;
  Router?: ILegacyRouterInput | unknown;
  [key: string]: unknown;
}

interface INormalizedLegacyConfig {
  providers: Array<{
    name: string;
    api_base_url?: string;
    api_key: string;
    models: string[];
  }>;
  defaultRoute?: string;
  skippedFields: string[];
}

const KNOWN_UNSUPPORTED_TOP_LEVEL_FIELDS = new Set([
  'LOG',
  'LOG_LEVEL',
  'CLAUDE_PATH',
  'HOST',
  'PORT',
  'APIKEY',
  'API_TIMEOUT_MS',
  'PROXY_URL',
  'transformers',
  'StatusLine',
  'CUSTOM_ROUTER_PATH',
  'trigger_router',
]);

function inferProtocolFromApiBaseUrl(apiBaseUrl?: string): 'openai' | 'anthropic' {
  if (apiBaseUrl?.includes('/v1/messages')) {
    return 'anthropic';
  }

  return 'openai';
}

function normalizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toModelId(name: string, model: string, index: number): string {
  const normalizedName = normalizeSegment(name) || `provider_${index + 1}`;
  const normalizedModel = normalizeSegment(model);

  return normalizedModel ? `${normalizedName}_${normalizedModel}` : normalizedName;
}

function createEmptyDraft(): ISetupConfigDraft {
  return {
    Providers: [],
    Models: [],
    Router: {},
  };
}

function createNonMigratableResult(): IMigrateLegacyConfigResult {
  return {
    draft: createEmptyDraft(),
    skippedFields: [],
    needsCompletion: true,
    missingFields: ['defaultModel', 'apiKey'],
  };
}

function isLegacyProviderInput(value: unknown): value is ILegacyProviderInput {
  return typeof value === 'object' && value !== null;
}

function isLegacyRouterInput(value: unknown): value is ILegacyRouterInput {
  return typeof value === 'object' && value !== null;
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function normalizeLegacyConfig(input: ILegacyConfigInput): INormalizedLegacyConfig | null {
  const lowerProviders = Array.isArray(input.providers) && input.providers.every(isLegacyProviderInput)
    ? input.providers
    : null;
  const upperProviders = Array.isArray(input.Providers) && input.Providers.every(isLegacyProviderInput)
    ? input.Providers
    : null;

  const providerKey = lowerProviders && lowerProviders.length > 0
    ? 'providers'
    : upperProviders && upperProviders.length > 0
      ? 'Providers'
      : lowerProviders
        ? 'providers'
        : upperProviders
          ? 'Providers'
          : null;

  if (!providerKey) {
    return null;
  }

  const rawProviders = providerKey === 'providers' ? lowerProviders : upperProviders;
  if (!rawProviders) {
    return null;
  }

  const skippedFields: string[] = [];
  const alternateProviderKey = providerKey === 'providers' ? 'Providers' : 'providers';
  const alternateDefaultKey = providerKey === 'providers' ? 'Router' : 'default';
  const alternateDefaultValue = providerKey === 'providers' ? input.Router : input.default;
  const alternateProviders = providerKey === 'providers' ? upperProviders : lowerProviders;
  if (alternateProviders !== null) {
    pushUnique(skippedFields, alternateProviderKey);
  }
  if (alternateDefaultValue !== undefined) {
    pushUnique(skippedFields, alternateDefaultKey);
  }

  const consumedTopLevelFields = new Set<string>([providerKey]);
  const providers = rawProviders.map((provider, index) => {
    if (provider.transformer !== undefined) {
      pushUnique(skippedFields, `${providerKey}[${index}].transformer`);
    }
    if (provider.headers !== undefined) {
      pushUnique(skippedFields, `${providerKey}[${index}].headers`);
    }

    return {
      name: provider.name ?? '',
      api_base_url: provider.api_base_url,
      api_key: provider.api_key ?? '',
      models: Array.isArray(provider.models) ? provider.models : [],
    };
  });

  let defaultRoute: string | undefined;
  if (providerKey === 'providers') {
    consumedTopLevelFields.add('default');
    defaultRoute = typeof input.default === 'string' ? input.default : undefined;
  } else {
    consumedTopLevelFields.add('Router');
    if (isLegacyRouterInput(input.Router)) {
      defaultRoute = typeof input.Router.default === 'string' ? input.Router.default : undefined;

      if (input.Router.background !== undefined) {
        pushUnique(skippedFields, 'Router.background');
      }
      if (input.Router.think !== undefined) {
        pushUnique(skippedFields, 'Router.think');
      }
      if (input.Router.longContext !== undefined) {
        pushUnique(skippedFields, 'Router.longContext');
      }
      if (input.Router.longContextThreshold !== undefined) {
        pushUnique(skippedFields, 'Router.longContextThreshold');
      }
    }
  }

  for (const key of Object.keys(input)) {
    if (consumedTopLevelFields.has(key)) {
      continue;
    }

    pushUnique(skippedFields, key);
  }

  return {
    providers,
    defaultRoute,
    skippedFields,
  };
}

export function migrateLegacyConfig(input: ILegacyConfigInput): IMigrateLegacyConfigResult {
  const normalized = normalizeLegacyConfig(input);
  if (!normalized) {
    return createNonMigratableResult();
  }

  const models = normalized.providers.flatMap((provider, providerIndex) =>
    (provider.models.length ? provider.models : [''])
      .map((model) => ({
        id: toModelId(provider.name, model, providerIndex),
        api: provider.api_base_url,
        api_base_url: provider.api_base_url,
        key: provider.api_key,
        api_key: provider.api_key,
        interface: inferProtocolFromApiBaseUrl(provider.api_base_url),
        protocol: inferProtocolFromApiBaseUrl(provider.api_base_url),
        model,
      }))
      .filter((item) => item.model)
  );

  const hasLegacyDefaultRoute =
    typeof normalized.defaultRoute === 'string' && normalized.defaultRoute.length > 0;
  const defaultModelId = hasLegacyDefaultRoute
    ? (() => {
        const [rawProviderName, rawModelName] = String(normalized.defaultRoute).split(',');
        const providerName = (rawProviderName ?? '').trim();
        const modelName = (rawModelName ?? '').trim();
        return models.find(
          (item) =>
            item.id === toModelId(providerName, modelName, 0) ||
            (item.id.startsWith(`${normalizeSegment(providerName)}_`) && item.model === modelName)
        )?.id;
      })()
    : undefined;
  const hasMissingApiKey = normalized.providers.some((provider) => provider.api_key.length === 0);
  const missingFields: string[] = [];

  if (!defaultModelId) {
    missingFields.push('defaultModel');
  }
  if (hasMissingApiKey) {
    missingFields.push('apiKey');
  }

  return {
    draft: {
      Providers: [],
      Models: models,
      Router: defaultModelId ? { default: defaultModelId } : {},
    },
    skippedFields: normalized.skippedFields,
    needsCompletion: missingFields.length > 0,
    missingFields,
  };
}
