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
  api_key: string;
  api?: string;
  api_base_url?: string;
  interface?: 'openai' | 'anthropic';
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
}

/**
 * 最小 Provider 输入
 */
export interface IMinimalProviderInput {
  /** Provider 名称 */
  name: string;

  /** API Key */
  api_key: string;

  /** 接口类型（手动填写接口时可显式指定） */
  interface?: 'openai' | 'anthropic';

  /** 模型列表 */
  models: string[];

  /** 预设类型（可选） */
  preset?: ProviderPresetKey;

  /** 自定义 API URL（可选，覆盖 preset） */
  api_base_url?: string;
}

/**
 * 最小配置输入
 */
export interface IMinimalConfigInput {
  /** Provider 列表 */
  providers: IMinimalProviderInput[];

  /** 默认模型（可选，格式：provider,model） */
  defaultModel?: string;
}

export type IUsableMinimalTemplateConfig = Pick<
  IAppConfig,
  'HOST' | 'PORT' | 'LOG' | 'LOG_LEVEL' | 'Models' | 'Router'
>;
