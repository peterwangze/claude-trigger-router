export type ProviderPresetKey =
  | 'glm'
  | 'kimi'
  | 'minimax'
  | 'openai'
  | 'alibaba-bailian'
  | 'volcengine-ark'
  | 'baidu-qianfan'
  | 'xunfei-astron'
  | 'openrouter'
  | 'deepseek'
  | 'openai-compatible'
  | 'anthropic'
  | 'siliconflow'
  | 'custom';

export type ProviderPresetSurface = 'setup' | 'ui';
export type ProviderPresetCategory = 'model_vendor' | 'aggregator' | 'custom';

export interface IProviderPresetDefinition {
  label: string;
  category: ProviderPresetCategory;
  summary?: string;
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
  glm: {
    label: 'GLM / Z.ai',
    category: 'model_vendor',
    summary: 'GLM 官方 API，适合国内直连和通用编码任务。',
    api: 'https://api.z.ai/api/paas/v4/chat/completions',
    api_base_url: 'https://api.z.ai/api/paas/v4/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'glm-5.2',
    model_examples: ['glm-5.2', 'glm-5', 'glm-4.6'],
    suggested_id: 'glm',
    key_placeholder: 'zai-...',
    vendor_hint: 'glm',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  deepseek: {
    label: 'DeepSeek',
    category: 'model_vendor',
    summary: 'DeepSeek 官方 API，默认使用 V4 Flash。',
    api: 'https://api.deepseek.com/chat/completions',
    api_base_url: 'https://api.deepseek.com/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'deepseek-v4-flash',
    model_examples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    suggested_id: 'deepseek',
    key_placeholder: 'sk-...',
    vendor_hint: 'deepseek',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  kimi: {
    label: 'Kimi / Moonshot',
    category: 'model_vendor',
    summary: 'Moonshot 官方 API，默认使用 Kimi K2.7 Code。',
    api: 'https://api.moonshot.cn/v1/chat/completions',
    api_base_url: 'https://api.moonshot.cn/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'kimi-k2.7-code',
    model_examples: ['kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'],
    suggested_id: 'kimi',
    key_placeholder: 'sk-...',
    vendor_hint: 'kimi',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  minimax: {
    label: 'MiniMax',
    category: 'model_vendor',
    summary: 'MiniMax 官方 API，默认使用 M3。',
    api: 'https://api.minimaxi.com/v1/chat/completions',
    api_base_url: 'https://api.minimaxi.com/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'MiniMax-M3',
    model_examples: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    suggested_id: 'minimax',
    key_placeholder: 'sk-...',
    vendor_hint: 'minimax',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  openai: {
    label: 'GPT / OpenAI',
    category: 'model_vendor',
    summary: 'OpenAI 官方 Chat Completions API。',
    api: 'https://api.openai.com/v1/chat/completions',
    api_base_url: 'https://api.openai.com/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'gpt-5.5',
    model_examples: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
    suggested_id: 'gpt',
    key_placeholder: 'sk-...',
    vendor_hint: 'openai',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  anthropic: {
    label: 'Claude / Anthropic',
    category: 'model_vendor',
    summary: 'Anthropic Messages API，使用 Claude 原生协议。',
    api: 'https://api.anthropic.com/v1/messages',
    api_base_url: 'https://api.anthropic.com/v1/messages',
    interface: 'anthropic',
    protocol: 'anthropic',
    default_model: 'claude-sonnet-4-6',
    model_examples: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
    suggested_id: 'claude',
    key_placeholder: 'sk-ant-...',
    vendor_hint: 'anthropic',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'alibaba-bailian': {
    label: '阿里百炼',
    category: 'aggregator',
    summary: 'DashScope OpenAI 兼容模式，适合 Qwen 与百炼模型。',
    api: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    api_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'qwen-plus',
    model_examples: ['qwen-plus', 'qwen3-coder-plus', 'qwen-max'],
    suggested_id: 'qwen',
    key_placeholder: 'sk-...',
    vendor_hint: 'alibaba-bailian',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'volcengine-ark': {
    label: '火山引擎方舟',
    category: 'aggregator',
    summary: '火山方舟 OpenAI 兼容 API，默认 Doubao Seed 2.0 Lite。',
    api: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    api_base_url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'doubao-seed-2-0-lite-260428',
    model_examples: ['doubao-seed-2-0-lite-260428', 'doubao-seed-2-0-mini-260428', 'doubao-seed-1-8-251228'],
    suggested_id: 'doubao',
    key_placeholder: 'sk-...',
    vendor_hint: 'volcengine-ark',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'baidu-qianfan': {
    label: '百度千帆',
    category: 'aggregator',
    summary: '千帆 OpenAI 兼容接口，默认 ERNIE 4.5 Turbo。',
    api: 'https://qianfan.baidubce.com/v2/chat/completions',
    api_base_url: 'https://qianfan.baidubce.com/v2/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'ernie-4.5-turbo-128k',
    model_examples: ['ernie-4.5-turbo-128k', 'ernie-x1-turbo-32k', 'deepseek-v3'],
    suggested_id: 'ernie',
    key_placeholder: 'bce-v3/...',
    vendor_hint: 'baidu-qianfan',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'xunfei-astron': {
    label: '讯飞星辰',
    category: 'aggregator',
    summary: '讯飞星辰 Coding Plan OpenAI 兼容接口。',
    api: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2/chat/completions',
    api_base_url: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'astron-code-latest',
    model_examples: ['astron-code-latest'],
    suggested_id: 'astron',
    key_placeholder: 'sk-...',
    vendor_hint: 'xunfei-astron',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  openrouter: {
    label: 'OpenRouter',
    category: 'aggregator',
    summary: 'OpenRouter OpenAI 兼容网关，默认自动路由。',
    api: 'https://openrouter.ai/api/v1/chat/completions',
    api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'openrouter/auto',
    model_examples: ['openrouter/auto', 'anthropic/claude-sonnet-4.6', 'deepseek/deepseek-v4-flash'],
    suggested_id: 'openrouter',
    key_placeholder: 'sk-or-...',
    vendor_hint: 'openrouter',
    default_thinking: 'auto',
    surfaces: ['setup', 'ui'],
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    category: 'custom',
    summary: '兼容旧 preset key；新 UI 请使用 GPT / OpenAI 或手动填写。',
    api: 'https://api.openai.com/v1/chat/completions',
    api_base_url: 'https://api.openai.com/v1/chat/completions',
    interface: 'openai',
    protocol: 'openai',
    default_model: 'gpt-5.5',
    model_examples: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
    suggested_id: 'gpt',
    key_placeholder: 'sk-...',
    vendor_hint: 'openai-compatible',
    default_thinking: 'auto',
    surfaces: [],
  },
  siliconflow: {
    label: 'SiliconFlow',
    category: 'custom',
    summary: '兼容旧 preset key；新 UI 聚合平台优先使用百炼、方舟、千帆或 OpenRouter。',
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
    surfaces: [],
  },
  custom: {
    label: 'Custom',
    category: 'custom',
    summary: '手动填写兼容 OpenAI 或 Anthropic 的接口。',
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
      category: preset.category,
      summary: preset.summary,
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
