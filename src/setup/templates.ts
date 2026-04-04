/**
 * Setup Templates
 *
 * 提供配置模板和预设
 */

import { IProviderPreset, IMinimalConfigInput, ISetupConfigDraft, ISetupProviderDraft, ProviderPresetKey } from './types';

/**
 * Provider 预设配置表
 */
const PROVIDER_PRESETS: Record<ProviderPresetKey, IProviderPreset> = {
  openrouter: {
    api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
    transformer: {
      use: ['openrouter'],
    },
  },
  deepseek: {
    api_base_url: 'https://api.deepseek.com/chat/completions',
    transformer: {
      use: ['deepseek'],
    },
  },
  'openai-compatible': {
    api_base_url: 'https://api.openai.com/v1/chat/completions',
    transformer: {
      use: ['openrouter'],
    },
  },
  custom: {
    // custom 不设置默认 URL，必须由用户提供
  },
};

/**
 * 获取 Provider 预设配置
 * @param key 预设键名
 * @returns 预设配置，不存在则返回 undefined
 */
export function getProviderPreset(key: ProviderPresetKey): IProviderPreset | undefined {
  const preset = PROVIDER_PRESETS[key];
  if (!preset) {
    return undefined;
  }

  return {
    api_base_url: preset.api_base_url,
    transformer: preset.transformer
      ? {
          use: [...preset.transformer.use],
        }
      : undefined,
  };
}

/**
 * 构建最小配置
 * @param input 最小配置输入
 * @returns 完整的应用配置
 */
export function buildMinimalConfig(input: IMinimalConfigInput): ISetupConfigDraft {
  const providers: ISetupProviderDraft[] = input.providers.map((p) => {
    const preset = p.preset ? getProviderPreset(p.preset) : undefined;
    const provider: ISetupProviderDraft = {
      name: p.name,
      api_key: p.api_key,
      models: [...p.models],
    };

    const explicitApiBaseUrl = p.api_base_url?.trim();
    const presetApiBaseUrl = preset?.api_base_url?.trim();
    const apiBaseUrl = explicitApiBaseUrl || presetApiBaseUrl;
    if (apiBaseUrl) {
      provider.api_base_url = apiBaseUrl;
    }

    if (preset?.transformer) {
      provider.transformer = {
        use: [...preset.transformer.use],
      };
    }

    return provider;
  });

  let defaultModel = input.defaultModel?.trim();
  if (input.defaultModel === undefined && providers.length > 0) {
    const firstProvider = providers[0];
    const firstModel = firstProvider.models[0];
    if (firstModel) {
      defaultModel = `${firstProvider.name},${firstModel}`;
    }
  }

  return {
    Providers: providers,
    Router: defaultModel ? { default: defaultModel } : {},
  };
}
