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

function createEmptyDraft(): ISetupConfigDraft {
  return {
    Providers: [],
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

  if (input.trigger_router !== undefined) {
    skippedFields.push('trigger_router');
  }

  const hasDefaultModel = typeof input.default === 'string' && input.default.length > 0;
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
      Providers: providers,
      Router: hasDefaultModel ? { default: input.default } : {},
    },
    skippedFields,
    needsCompletion: missingFields.length > 0,
    missingFields,
  };
}
