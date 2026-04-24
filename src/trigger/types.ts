/**
 * Trigger Router Type Definitions
 *
 * 触发路由器的核心类型定义
 */

import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { IGovernanceConfig, IGovernanceTrace } from '../governance/types';

/**
 * 触发模式类型
 */
export type PatternType = 'exact' | 'regex';

/**
 * 触发模式配置
 */
export interface ITriggerPattern {
  /** 模式类型：精确匹配或正则表达式 */
  type: PatternType;

  /** 精确匹配的关键词列表（type=exact 时使用） */
  keywords?: string[];

  /** 正则表达式模式（type=regex 时使用） */
  pattern?: string;

  /** 是否区分大小写，默认 false */
  caseSensitive?: boolean;
}

/**
 * 触发规则
 */
export interface ITriggerRule {
  /** 规则名称，用于日志和调试 */
  name: string;

  /** 优先级，数值越大优先级越高，默认 0 */
  priority: number;

  /** 是否启用此规则，默认 true */
  enabled: boolean;

  /** 触发模式列表，任一模式匹配即触发 */
  patterns: ITriggerPattern[];

  /** 目标模型，格式：provider_name,model_name */
  model: string;

  /** 规则描述 */
  description?: string;

  /** 规则级语义画像，用于统一 Router 运行时语义匹配 */
  semantic_profile?: {
    enabled?: boolean;
    prototype?: string;
    threshold?: number;
  };
}

/**
 * 分析范围
 */
export type AnalysisScope = 'last_message' | 'full_conversation';

/**
 * 触发路由配置
 */
export interface ITriggerConfig {
  /** 是否启用触发路由，默认 true */
  enabled: boolean;

  /** 分析范围：最后一条消息或完整对话历史 */
  analysis_scope: AnalysisScope;

  /** 是否启用 LLM 意图识别，默认 false */
  llm_intent_recognition: boolean;

  /** 意图识别使用的模型，格式：provider_name,model_name */
  intent_model?: string;

  /** 触发规则列表 */
  rules: ITriggerRule[];
}

/**
 * 分析结果
 */
export interface IAnalysisResult {
  /** 是否匹配到规则 */
  matched: boolean;

  /** 匹配的规则（如果匹配成功） */
  rule?: ITriggerRule;

  /** 选中的模型（如果匹配成功） */
  model?: string;

  /** 匹配置信度 0-1 */
  confidence: number;

  /** 分析耗时（毫秒） */
  analysisTime: number;

  /** 分析的文本内容 */
  analyzedText?: string;

  /** 路由来源 */
  routeSource?: 'smart_rule' | 'semantic_match' | 'smart_router' | 'sticky_correction' | 'intent_fallback';
}

/**
 * 匹配结果
 */
export interface IMatchResult {
  /** 是否匹配 */
  matched: boolean;

  /** 匹配的模式 */
  pattern?: ITriggerPattern;

  /** 匹配的关键词（精确匹配时） */
  matchedKeyword?: string;

  /** 正则匹配结果（正则匹配时） */
  regexMatch?: RegExpMatchArray;
}

/**
 * 意图识别结果
 */
export interface IIntentResult {
  /** 识别到的意图 */
  intent: string;

  /** 置信度 0-1 */
  confidence: number;

  /** 相关的规则名称 */
  relatedRule?: string;
}

/**
 * 完整配置（包含原有配置和触发配置）
 */
export interface IAppConfig {
  // 原有配置
  APIKEY?: string;
  HOST?: string;
  PORT?: number;
  PROXY_URL?: string;
  LOG?: boolean;
  LOG_LEVEL?: string;
  API_TIMEOUT_MS?: number;
  NON_INTERACTIVE_MODE?: boolean;

  /** 模型提供商配置 */
  Providers: IProvider[];

  /** 简化模型接入配置 */
  Models?: IModelEndpointConfig[];

  /** 原有路由配置 */
  Router: IRouterConfig;

  /** 触发路由配置 */
  TriggerRouter?: ITriggerConfig;

  /** 智能路由配置 */
  SmartRouter?: ISmartRouterConfig;

  /** 治理层配置 */
  Governance?: IGovernanceConfig;

  /** 自定义路由器路径 */
  CUSTOM_ROUTER_PATH?: string;

  /** 强制所有图片请求走 Image Agent 模式（默认 false） */
  forceUseImageAgent?: boolean;
}

/**
 * 提供商配置
 */
export interface IProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: any;
}

export interface IModelThinkingConfig {
  mode?: 'off' | 'auto' | 'on';
  effort?: 'low' | 'medium' | 'high';
  budget_tokens?: number;
}

export type TModelThinkingAlias = 'off' | 'auto' | 'on' | 'low' | 'medium' | 'high';

export interface IModelEndpointMetadata {
  label?: string;
  vendor_hint?: string;
  supports_tools?: boolean;
  supports_reasoning?: boolean;
  supports_images?: boolean;
}

export interface ICompiledModelCapabilities {
  thinking: {
    supported: boolean;
    mode?: 'off' | 'auto' | 'on';
    effort?: 'low' | 'medium' | 'high';
    budget_tokens?: number;
  };
  tools: boolean;
  images: boolean;
  systemMessageStyle: 'openai' | 'anthropic';
}

export interface IModelEndpointConfig {
  id: string;
  api?: string;
  api_base_url?: string;
  key?: string;
  api_key?: string;
  interface?: 'openai' | 'anthropic';
  protocol?: 'openai' | 'anthropic';
  model: string;
  thinking?: IModelThinkingConfig | TModelThinkingAlias;
  metadata?: IModelEndpointMetadata;
}

/**
 * 原有路由配置
 */
export interface IRouterConfig {
  default: string;
  background?: string;
  think?: string;
  longContext?: string;
  longContextThreshold?: number;
  webSearch?: string;
  image?: string;
  routes?: Array<{
    name: string;
    model: string;
    description?: string;
    priority?: number;
    enabled?: boolean;
    match?: {
      keywords?: string[];
      regex?: string;
      semantic?: boolean;
      semantic_profile?: {
        prototype?: string;
        threshold?: number;
      };
    };
  }>;
  decision?: {
    smart_fallback?: boolean;
    router_model?: string;
    candidates?: ISmartRouterCandidate[];
    cache_ttl?: number;
    max_tokens?: number;
    fallback?: 'default' | 'skip';
    router_hint?: {
      include_task_summary?: boolean;
      include_top_route_candidates?: boolean;
    };
  };
  defaults?: {
    sticky?: IGovernanceConfig['sticky'];
    semantic?: IGovernanceConfig['semantic'];
    route_trace?: boolean;
  };
}

/**
 * SmartRouter 候选模型
 */
export interface ISmartRouterCandidate {
  /** 模型标识，格式：provider_name,model_name */
  model: string;

  /** 模型能力描述，用于告知 router_model 该模型擅长什么 */
  description: string;
}

/**
 * SmartRouter 配置
 */
export interface ISmartRouterConfig {
  /** 是否启用 SmartRouter，默认 false */
  enabled: boolean;

  /** 路由分析范围，未配置时回退到 legacy trigger 的 last_message 语义 */
  analysis_scope?: AnalysisScope;

  /**
   * 可选的路由 LLM。
   * - 未配置时：行为退化为“关键词/正则前置筛选 + 语义增强匹配 + 默认路由兜底”
   * - 配置后：在前置筛选与语义增强之后，再由 router_model 做最终选模判断
   */
  router_model?: string;

  /** 候选模型列表（配置 router_model 时至少 2 个） */
  candidates?: ISmartRouterCandidate[];

  /** SmartRouter 内部的前置规则能力，作为 Trigger 能力的统一内收入口 */
  rules?: ITriggerRule[];

  /** 语义增强匹配能力，默认可由治理能力内收进来 */
  semantic?: IGovernanceConfig['semantic'];

  /** 语义粘连 / 上下文对齐等默认路由增强能力 */
  sticky?: IGovernanceConfig['sticky'];

  /** 缓存 TTL（毫秒），默认 600000（10 分钟） */
  cache_ttl?: number;

  /** router_model 最大 token 数，默认 256 */
  max_tokens?: number;

  /**
   * SmartRouter 无结果时的回退策略
   * - "default"：继续执行后续路由链（默认）
   * - "skip"：跳过 SmartRouter，直接走后续路由链
   */
  fallback?: 'default' | 'skip';

  /** 结构化 router hint，帮助路由模型基于预筛选结果做兜底裁决 */
  router_hint?: {
    include_task_summary?: boolean;
    include_top_route_candidates?: boolean;
  };
}

/**
 * 请求上下文（扩展 FastifyRequest）
 */
export interface IRequestContext {
  /** 会话 ID */
  sessionId?: string;

  /** Token 数量 */
  tokenCount?: number;

  /** 使用的 agents */
  agents?: string[];

  /** 触发分析结果 */
  triggerResult?: IAnalysisResult;

  /** 请求 ID */
  id?: string;

  /** 治理追踪信息 */
  governanceTrace?: IGovernanceTrace;

  /** 请求 URL */
  url?: string;

  /** 运行时应用配置，用于解析 modelId 等高层抽象 */
  appConfig?: IAppConfig;

  /** 请求体 */
  body: {
    model: string;
    messages: MessageParam[];
    system?: any;
    tools?: any[];
    thinking?: any;
    metadata?: any;
  };
}
