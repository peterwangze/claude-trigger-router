/**
 * Setup Types
 *
 * setup 命令所需的类型定义
 */

/**
 * Provider preset 类型
 */
export type ProviderPresetKey = 'openrouter' | 'deepseek' | 'openai-compatible' | 'custom';

/**
 * Provider 预设配置
 */
export interface IProviderPreset {
  /** API 基础 URL（custom 可能为空） */
  api_base_url?: string;

  /** 默认 transformer 配置 */
  transformer?: {
    use: string[];
  };
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

/** setup 期间生成的配置草稿 */
export interface ISetupConfigDraft {
  Providers: ISetupProviderDraft[];
  Router: {
    default?: string;
  };
}

/**
 * 最小 Provider 输入
 */
export interface IMinimalProviderInput {
  /** Provider 名称 */
  name: string;

  /** API Key */
  api_key: string;

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
