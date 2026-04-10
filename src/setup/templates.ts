/**
 * Setup Templates
 *
 * 提供配置模板和预设
 */

import { getProviderPreset as getSharedProviderPreset } from '../provider-presets';
import { IProviderPreset, IMinimalConfigInput, ISetupConfigDraft, ISetupModelDraft, ProviderPresetKey } from './types';

type IModelIdAwareProviderInput = IMinimalConfigInput['providers'][number] & {
  model_id?: string;
};

/**
 * 获取 Provider 预设配置
 * @param key 预设键名
 * @returns 预设配置，不存在则返回 undefined
 */
export function getProviderPreset(key: ProviderPresetKey): IProviderPreset | undefined {
  const preset = getSharedProviderPreset(key);
  if (!preset) {
    return undefined;
  }

  return {
    api: preset.api,
    api_base_url: preset.api_base_url,
    interface: preset.interface,
    protocol: preset.protocol,
  };
}

/**
 * 构建最小配置
 * @param input 最小配置输入
 * @returns 完整的应用配置
 */
export function buildMinimalConfig(input: IMinimalConfigInput): ISetupConfigDraft {
  const providers = input.providers as IModelIdAwareProviderInput[];

  const models: ISetupModelDraft[] = providers.map((p) => {
    const preset = p.preset ? getProviderPreset(p.preset) : undefined;
    const modelDraft: ISetupModelDraft = {
      id: p.model_id?.trim() || p.name,
      key: p.api_key,
      api_key: p.api_key,
      model: p.models[0] ?? '',
      interface: preset?.interface ?? 'openai',
      protocol: preset?.protocol ?? 'openai',
    };

    const explicitApiBaseUrl = p.api_base_url?.trim();
    const presetApiBaseUrl = preset?.api_base_url?.trim();
    const apiBaseUrl = explicitApiBaseUrl || presetApiBaseUrl;
    if (apiBaseUrl) {
      modelDraft.api = apiBaseUrl;
      modelDraft.api_base_url = apiBaseUrl;
    }

    return modelDraft;
  });

  let defaultModel = input.defaultModel?.trim();
  if (input.defaultModel && input.defaultModel.includes(',')) {
    const [providerName, modelName] = input.defaultModel.split(',');
    const matched = models.find((item) => item.id === providerName && item.model === modelName);
    if (matched) {
      defaultModel = matched.id;
    }
  }

  if (input.defaultModel === undefined && models.length > 0) {
    const firstModelId = models[0].id;
    if (firstModelId && models[0].model) {
      defaultModel = firstModelId;
    }
  }

  if (defaultModel === '' || defaultModel === undefined) {
    defaultModel = undefined;
  }

  return {
    Models: models,
    Router: defaultModel ? { default: defaultModel } : {},
  };
}
