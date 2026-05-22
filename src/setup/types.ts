import type { ProviderPresetKey } from '../provider-presets';
import type { IAppConfig } from '../trigger/types';

/**
 * Setup Types
 *
 * setup 命令所需的类型定义
 */
export type { ProviderPresetKey } from '../provider-presets';

/**
 * Provider 预设配置
 */
export interface IProviderPreset {
  /** API 基础 URL（custom 可能为空） */
  api?: string;
  api_base_url?: string;

  /** 协议类型 */
  interface?: 'openai' | 'anthropic';
  protocol?: 'openai' | 'anthropic';
  default_thinking?: 'off' | 'auto' | 'on' | 'low' | 'medium' | 'high';
}

/** setup 期间生成的 Provider 草稿 */
export interface ISetupProviderDraft {
  name: string;
  api_key: string;
  models: string[];
  api_base_url?: string;
  transformer?: {
    use: string[];
  };
}

export interface ISetupModelDraft {
  id: string;
  key?: string;
  api?: string;
  interface?: 'openai' | 'anthropic';
  api_key?: string;
  api_base_url?: string;
  protocol?: 'openai' | 'anthropic';
  model: string;
  thinking?: 'off' | 'auto' | 'on' | 'low' | 'medium' | 'high' | {
    mode?: 'off' | 'auto' | 'on';
    effort?: 'low' | 'medium' | 'high';
    budget_tokens?: number;
  };
  metadata?: {
    vendor_hint?: string;
    supports_reasoning?: boolean;
    supports_tools?: boolean;
    supports_images?: boolean;
    context_window_tokens?: number;
    safe_input_tokens?: number;
    cost_per_1m_input_tokens?: number;
    cost_per_1m_output_tokens?: number;
    cost_currency?: string;
    rate_limit_rpm?: number;
    rate_limit_tpm?: number;
    [key: string]: unknown;
  };
}

/** setup 期间生成的配置草稿 */
export interface ISetupConfigDraft {
  APIKEY?: string;
  HOST?: string;
  PORT?: number;
  PROXY_URL?: string;
  LOG?: boolean;
  LOG_LEVEL?: string;
  API_TIMEOUT_MS?: number;
  CUSTOM_ROUTER_PATH?: string;
  Providers?: ISetupProviderDraft[];
  Models?: ISetupModelDraft[];
  Router: {
    default?: string;
    background?: string;
    think?: string;
    longContext?: string;
    longContextThreshold?: number;
    webSearch?: string;
  };
  SmartRouter?: IAppConfig['SmartRouter'];
  Governance?: IAppConfig['Governance'];
  Runtime?: IAppConfig['Runtime'];
  Registration?: IAppConfig['Registration'];
}

export interface IRemoteServiceConfigInput {
  baseUrl: string;
  authToken?: string;
}

export interface IServerDeploymentConfigInput {
  apiKey: string;
}

/**
 * setup 收集到的接入输入，最终会投影为 Models[] 草稿。
 */
export interface IMinimalProviderInput {
  /** 接入名称：用于预设识别和旧 Providers 兼容，不作为 model id 暴露 */
  name: string;

  /** 上游 API Key，写入 Models[].key */
  api_key: string;

  /** 接口类型，写入 Models[].interface */
  interface?: 'openai' | 'anthropic';

  /** 上游模型名列表，首个值写入 Models[].model */
  models: string[];

  /** 预设类型（可选） */
  preset?: ProviderPresetKey;

  /** 上游 API URL，写入 Models[].api */
  api_base_url?: string;
}

/**
 * 最小配置输入
 */
export interface IMinimalConfigInput {
  /** 接入列表，会被转换为 Models[] */
  providers: IMinimalProviderInput[];

  /** 默认 model id；兼容读取 legacy provider,model 引用 */
  defaultModel?: string;
}

export type IUsableMinimalTemplateConfig = Pick<
  IAppConfig,
  'HOST' | 'PORT' | 'LOG' | 'LOG_LEVEL' | 'Models' | 'Router'
>;
