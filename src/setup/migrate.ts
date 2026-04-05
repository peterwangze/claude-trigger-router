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
}

interface ILegacyConfigInput {
  providers?: ILegacyProviderInput[] | unknown;
  default?: string | unknown;
  trigger_router?: unknown;
}

function inferProtocolFromApiBaseUrl(apiBaseUrl?: string): 'openai' | 'anthropic' {
  if (apiBaseUrl?.includes('/v1/messages')) {
    return 'anthropic';
  }

  return 'openai';
}

function toModelId(name: string, model: string, index: number): string {
  const normalizedName = name.trim() || `provider_${index + 1}`;
  const normalizedModel = model
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

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

export function migrateLegacyConfig(input: ILegacyConfigInput): IMigrateLegacyConfigResult {
  if (!Array.isArray(input.providers)) {
    return createNonMigratableResult();
  }

  if (!input.providers.every(isLegacyProviderInput)) {
    return createNonMigratableResult();
  }

  const skippedFields: string[] = [];
  const providers = input.providers.map((provider, index) => {
    if (provider.transformer !== undefined) {
      skippedFields.push(`providers[${index}].transformer`);
    }

    return {
      name: provider.name ?? '',
      api_base_url: provider.api_base_url,
      api_key: provider.api_key ?? '',
      models: Array.isArray(provider.models) ? provider.models : [],
    };
  });
  const models = providers.flatMap((provider, providerIndex) =>
    (provider.models.length ? provider.models : ['']).map((model) => ({
      id: toModelId(provider.name, model, providerIndex),
      api_base_url: provider.api_base_url,
      api_key: provider.api_key,
      protocol: inferProtocolFromApiBaseUrl(provider.api_base_url),
      model,
    }))
  ).filter((item) => item.model);

  if (input.trigger_router !== undefined) {
    skippedFields.push('trigger_router');
  }

  const hasDefaultModel = typeof input.default === 'string' && input.default.length > 0;
  const defaultModelId = hasDefaultModel
    ? (() => {
        const [providerName, modelName] = String(input.default).split(',');
        return models.find((item) => item.id === toModelId(providerName, modelName, 0) || (item.id.startsWith(`${providerName}_`) && item.model === modelName))?.id;
      })()
    : undefined;
  const hasMissingApiKey = providers.some((provider) => provider.api_key.length === 0);
  const missingFields: string[] = [];

  if (!hasDefaultModel) {
    missingFields.push('defaultModel');
  }
  if (hasMissingApiKey) {
    missingFields.push('apiKey');
  }

  return {
    draft: {
      Providers: [],
      Models: models,
      Router: hasDefaultModel && defaultModelId ? { default: defaultModelId } : {},
    },
    skippedFields,
    needsCompletion: missingFields.length > 0,
    missingFields,
  };
}
