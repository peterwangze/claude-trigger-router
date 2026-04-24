import { ISetupConfigDraft } from './types';
import { inferInterfaceFromApiEndpoint, normalizeApiEndpoint } from '../models/schema';

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
  transformer?: {
    use?: string[];
    [key: string]: unknown;
  } | unknown;
  headers?: unknown;
}

interface ILegacyRouterInput {
  default?: string;
  background?: unknown;
  think?: unknown;
  longContext?: unknown;
  longContextThreshold?: unknown;
  webSearch?: unknown;
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
  routeSlots: {
    background?: string;
    think?: string;
    longContext?: string;
    longContextThreshold?: number;
    webSearch?: string;
  };
  supportedTopLevelConfig: Partial<ISetupConfigDraft>;
  skippedFields: string[];
}

const KNOWN_UNSUPPORTED_TOP_LEVEL_FIELDS = new Set([
  'CLAUDE_PATH',
  'transformers',
  'StatusLine',
  'trigger_router',
]);

function inferProtocolFromApiBaseUrl(apiBaseUrl?: string, modelName?: string): 'openai' | 'anthropic' {
  return inferInterfaceFromApiEndpoint(apiBaseUrl, modelName) ?? 'openai';
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
    missingFields: ['defaultModel', 'apiKey', 'apiBaseUrl'],
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value.trim()
    : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractSupportedTopLevelConfig(input: ILegacyConfigInput, consumedTopLevelFields: Set<string>): Partial<ISetupConfigDraft> {
  const nextConfig: Partial<ISetupConfigDraft> = {};
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  const host = readString(input.HOST);
  if (hasOwn('HOST')) {
    nextConfig.HOST = host;
    consumedTopLevelFields.add('HOST');
  }

  const port = readFiniteNumber(input.PORT);
  if (hasOwn('PORT') && port !== undefined) {
    nextConfig.PORT = port;
    consumedTopLevelFields.add('PORT');
  }

  const log = readBoolean(input.LOG);
  if (hasOwn('LOG') && log !== undefined) {
    nextConfig.LOG = log;
    consumedTopLevelFields.add('LOG');
  }

  const logLevel = readString(input.LOG_LEVEL);
  if (hasOwn('LOG_LEVEL')) {
    nextConfig.LOG_LEVEL = logLevel;
    consumedTopLevelFields.add('LOG_LEVEL');
  }

  const apiTimeoutMs = readFiniteNumber(input.API_TIMEOUT_MS);
  if (hasOwn('API_TIMEOUT_MS') && apiTimeoutMs !== undefined) {
    nextConfig.API_TIMEOUT_MS = apiTimeoutMs;
    consumedTopLevelFields.add('API_TIMEOUT_MS');
  }

  const proxyUrl = readString(input.PROXY_URL);
  if (hasOwn('PROXY_URL')) {
    nextConfig.PROXY_URL = proxyUrl;
    consumedTopLevelFields.add('PROXY_URL');
  }

  const apiKey = readString(input.APIKEY);
  if (hasOwn('APIKEY')) {
    nextConfig.APIKEY = apiKey;
    consumedTopLevelFields.add('APIKEY');
  }

  const customRouterPath = readString(input.CUSTOM_ROUTER_PATH);
  if (hasOwn('CUSTOM_ROUTER_PATH')) {
    nextConfig.CUSTOM_ROUTER_PATH = customRouterPath;
    consumedTopLevelFields.add('CUSTOM_ROUTER_PATH');
  }

  return nextConfig;
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
  const supportedTopLevelConfig = extractSupportedTopLevelConfig(input, consumedTopLevelFields);
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
  const routeSlots: INormalizedLegacyConfig['routeSlots'] = {};
  if (providerKey === 'providers') {
    consumedTopLevelFields.add('default');
    defaultRoute = typeof input.default === 'string' ? input.default : undefined;
  } else {
    consumedTopLevelFields.add('Router');
    if (isLegacyRouterInput(input.Router)) {
      defaultRoute = typeof input.Router.default === 'string' ? input.Router.default : undefined;
      routeSlots.background = readString(input.Router.background);
      routeSlots.think = readString(input.Router.think);
      routeSlots.longContext = readString(input.Router.longContext);
      routeSlots.webSearch = readString(input.Router.webSearch);
      routeSlots.longContextThreshold = readFiniteNumber(input.Router.longContextThreshold);
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
    routeSlots,
    supportedTopLevelConfig,
    skippedFields,
  };
}

export function migrateLegacyConfig(input: ILegacyConfigInput): IMigrateLegacyConfigResult {
  const normalized = normalizeLegacyConfig(input);
  if (!normalized) {
    return createNonMigratableResult();
  }

  const rawEntries = normalized.providers.flatMap((provider, providerIndex) =>
    (provider.models.length ? provider.models : [''])
      .map((model) => ({
        candidateId: toModelId(provider.name, model, providerIndex),
        api: provider.api_base_url
          ? normalizeApiEndpoint(provider.api_base_url, inferProtocolFromApiBaseUrl(provider.api_base_url, model))
          : undefined,
        api_base_url: provider.api_base_url
          ? normalizeApiEndpoint(provider.api_base_url, inferProtocolFromApiBaseUrl(provider.api_base_url, model))
          : undefined,
        key: provider.api_key,
        api_key: provider.api_key,
        interface: inferProtocolFromApiBaseUrl(provider.api_base_url, model),
        protocol: inferProtocolFromApiBaseUrl(provider.api_base_url, model),
        model,
        providerName: provider.name,
      }))
      .filter((item) => item.model)
  );

  const seenIds = new Map<string, number>();
  const routeLookup = new Map<string, string>();

  const models = rawEntries.map((entry) => {
    const count = seenIds.get(entry.candidateId) ?? 0;
    seenIds.set(entry.candidateId, count + 1);
    const finalId = count === 0 ? entry.candidateId : `${entry.candidateId}_${count + 1}`;
    routeLookup.set(`${entry.providerName.trim()},${entry.model}`, finalId);
    return {
      id: finalId,
      api: entry.api,
      api_base_url: entry.api_base_url,
      key: entry.key,
      api_key: entry.api_key,
      interface: entry.interface,
      protocol: entry.protocol,
      model: entry.model,
    };
  });

  const resolveLegacyRoute = (ref: string | undefined, fieldName: string): string | undefined => {
    if (!ref) {
      return undefined;
    }

    const [rawProviderName, rawModelName] = String(ref).split(',');
    const providerName = (rawProviderName ?? '').trim();
    const modelName = (rawModelName ?? '').trim();
    const fromLookup = routeLookup.get(`${providerName},${modelName}`);
    if (fromLookup) {
      return fromLookup;
    }

    pushUnique(normalized.skippedFields, fieldName);
    return undefined;
  };

  const hasLegacyDefaultRoute =
    typeof normalized.defaultRoute === 'string' && normalized.defaultRoute.length > 0;
  const defaultModelId = hasLegacyDefaultRoute
    ? resolveLegacyRoute(normalized.defaultRoute, 'Router.default')
    : undefined;
  const backgroundModelId = resolveLegacyRoute(normalized.routeSlots.background, 'Router.background');
  const thinkModelId = resolveLegacyRoute(normalized.routeSlots.think, 'Router.think');
  const longContextModelId = resolveLegacyRoute(normalized.routeSlots.longContext, 'Router.longContext');
  const webSearchModelId = resolveLegacyRoute(normalized.routeSlots.webSearch, 'Router.webSearch');
  const hasMissingApiKey = normalized.providers.some((provider) => provider.api_key.length === 0);
  const hasMissingApiBaseUrl = normalized.providers.some((provider) => (provider.api_base_url?.trim() ?? '').length === 0);
  const missingFields: string[] = [];

  if (!defaultModelId) {
    missingFields.push('defaultModel');
  }
  if (hasMissingApiKey) {
    missingFields.push('apiKey');
  }
  if (hasMissingApiBaseUrl) {
    missingFields.push('apiBaseUrl');
  }

  return {
    draft: {
      ...normalized.supportedTopLevelConfig,
      Providers: [],
      Models: models,
      Router: {
        ...(defaultModelId ? { default: defaultModelId } : {}),
        ...(backgroundModelId ? { background: backgroundModelId } : {}),
        ...(thinkModelId ? { think: thinkModelId } : {}),
        ...(longContextModelId ? { longContext: longContextModelId } : {}),
        ...(normalized.routeSlots.longContextThreshold !== undefined ? { longContextThreshold: normalized.routeSlots.longContextThreshold } : {}),
        ...(webSearchModelId ? { webSearch: webSearchModelId } : {}),
      },
    },
    skippedFields: normalized.skippedFields,
    needsCompletion: missingFields.length > 0,
    missingFields,
  };
}
