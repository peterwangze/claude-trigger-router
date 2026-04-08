export type ProviderPresetKey =
  | 'openrouter'
  | 'deepseek'
  | 'openai-compatible'
  | 'anthropic'
  | 'siliconflow'
  | 'custom';

export type ProviderPresetSurface = 'setup' | 'ui';

export interface IProviderPresetDefinition {
  label: string;
  api?: string;
  api_base_url?: string;
  interface?: 'openai' | 'anthropic';
  protocol?: 'openai' | 'anthropic';
  default_model?: string;
  model_examples?: string[];
  suggested_id?: string;
  key_placeholder?: string;
  vendor_hint?: string;
  default_thinking?: 'off' | 'auto' | 'on' | 'low' | 'medium' | 'high';
  surfaces: ProviderPresetSurface[];
}

const PROVIDER_PRESETS: Record<ProviderPresetKey, IProviderPresetDefinition> = {
  openrouter: {
    label: 'OpenRouter',
    api: 'https://openrouter.ai/api/v1/chat/completions',
    api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'anthropic/claude-sonnet-4',
    model_examples: ['anthropic/claude-sonnet-4', 'openai/gpt-5', 'google/gemini-2.5-pro'],
    suggested_id: 'sonnet',
    key_placeholder: 'sk-or-...',
    vendor_hint: 'openrouter',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  deepseek: {
    label: 'DeepSeek',
    api: 'https://api.deepseek.com/chat/completions',
    api_base_url: 'https://api.deepseek.com/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'deepseek-chat',
    model_examples: ['deepseek-chat', 'deepseek-reasoner'],
    suggested_id: 'deepseek_chat',
    key_placeholder: 'sk-...',
    vendor_hint: 'deepseek',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    api: 'https://api.openai.com/v1/chat/completions',
    api_base_url: 'https://api.openai.com/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'gpt-5',
    model_examples: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
    suggested_id: 'openai_main',
    key_placeholder: 'sk-...',
    vendor_hint: 'openai-compatible',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  anthropic: {
    label: 'Anthropic',
    api: 'https://api.anthropic.com/v1/messages',
    api_base_url: 'https://api.anthropic.com/v1/messages',
    interface: 'anthropic',
    protocol: 'anthropic',
    default_model: 'claude-sonnet-4-5',
    model_examples: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'],
    suggested_id: 'claude',
    key_placeholder: 'sk-ant-...',
    vendor_hint: 'anthropic',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  siliconflow: {
    label: 'SiliconFlow',
    api: 'https://api.siliconflow.cn/v1/chat/completions',
    api_base_url: 'https://api.siliconflow.cn/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'Qwen/Qwen3-32B',
    model_examples: ['Qwen/Qwen3-32B', 'deepseek-ai/DeepSeek-V3', 'THUDM/GLM-4-9B-Chat'],
    suggested_id: 'siliconflow_main',
    key_placeholder: 'sk-...',
    vendor_hint: 'siliconflow',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  custom: {
    label: 'Custom',
    surfaces: ['setup'],
  },
};

export function getProviderPreset(key: ProviderPresetKey): IProviderPresetDefinition | undefined {
  const preset = PROVIDER_PRESETS[key];
  if (!preset) {
    return undefined;
  }

  return {
    ...preset,
    model_examples: preset.model_examples ? [...preset.model_examples] : undefined,
    surfaces: [...preset.surfaces],
  };
}

export function listProviderPresetKeys(surface: ProviderPresetSurface): ProviderPresetKey[] {
  return (Object.keys(PROVIDER_PRESETS) as ProviderPresetKey[]).filter((key) =>
    PROVIDER_PRESETS[key].surfaces.includes(surface)
  );
}

export function getUiProviderTemplates() {
  return listProviderPresetKeys('ui').reduce<Record<string, Partial<IProviderPresetDefinition>>>((result, key) => {
    const preset = PROVIDER_PRESETS[key];
    result[key] = {
      label: preset.label,
      interface: preset.interface,
      api: preset.api,
      default_model: preset.default_model,
      model_examples: preset.model_examples ? [...preset.model_examples] : [],
      suggested_id: preset.suggested_id,
      key_placeholder: preset.key_placeholder,
      vendor_hint: preset.vendor_hint,
      default_thinking: preset.default_thinking,
    };
    return result;
  }, {});
}
