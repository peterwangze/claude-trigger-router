/**
 * Setup Templates
 *
 * 提供配置模板和预设
 */

import { IAppConfig, IProvider } from '../trigger/types';
import { IProviderPreset, IMinimalConfigInput, ProviderPresetKey } from './types';

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
  return PROVIDER_PRESETS[key];
}

/**
 * 构建最小配置
 * @param input 最小配置输入
 * @returns 完整的应用配置
 */
export function buildMinimalConfig(input: IMinimalConfigInput): IAppConfig {
  const providers: IProvider[] = input.providers.map((p) => {
    // 获取预设配置（如果指定）
    const preset = p.preset ? getProviderPreset(p.preset) : undefined;

    // 构建完整 provider 配置
    const provider: IProvider = {
      name: p.name,
      api_key: p.api_key,
      models: p.models,
      // api_base_url 优先级：显式指定 > preset > undefined
      api_base_url: p.api_base_url ?? preset?.api_base_url ?? '',
      // transformer 从 preset 继承
      transformer: preset?.transformer,
    };

    return provider;
  });

  // 构建 Router.default
  let defaultModel = input.defaultModel;
  if (!defaultModel && providers.length > 0) {
    // 默认使用第一个 provider 的第一个模型
    const firstProvider = providers[0];
    defaultModel = `${firstProvider.name},${firstProvider.models[0]}`;
  }

  return {
    Providers: providers,
    Router: {
      default: defaultModel ?? '',
    },
  };
}
