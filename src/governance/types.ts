/**
 * Governance Type Definitions
 *
 * 治理层相关类型定义
 */

export type TSemanticRouterMode = 'embedding' | 'classifier';
export type TShadowSupervisorMode = 'async_audit' | 'sync_guard';

export interface IContextAlignmentConfig {
  /** 是否启用模型切换时的上下文对齐 */
  enabled: boolean;

  /** 用于生成技术摘要的模型 */
  summarizer_model?: string;

  /** 摘要最大 token 数 */
  max_summary_tokens?: number;
}

export interface IStickyRoutingConfig {
  /** 是否启用会话粘性路由 */
  enabled: boolean;

  /** 会话状态 TTL */
  session_ttl_ms?: number;

  /** 任务指纹相似度阈值 */
  fingerprint_similarity_threshold?: number;

  /** 命中强显式路由时是否允许打破粘性 */
  break_on_explicit_route?: boolean;

  /** 模型切换时的上下文对齐配置 */
  alignment?: IContextAlignmentConfig;
}

export interface ICascadeTriggerConfig {
  compile_failure?: boolean;
  test_failure?: boolean;
  placeholder_patterns?: string[];
}

export interface ICascadeLevelConfig {
  from: string;
  to: string;
  reasoning?: string;
}

export interface ICascadeGateConfig {
  /** 是否启用级联升级 */
  enabled: boolean;

  /** 最大升级尝试次数 */
  max_attempts?: number;

  /** 是否对流式响应启用 buffer-and-retry 守卫 */
  stream_guard?: boolean;

  /** 升级触发器 */
  triggers?: ICascadeTriggerConfig;

  /** 升级层级 */
  levels?: ICascadeLevelConfig[];
}

export interface ISemanticRouterConfig {
  /** 是否启用语义路由 */
  enabled: boolean;

  /** 语义路由模式 */
  mode?: TSemanticRouterMode;

  /** classifier 模式下使用的模型 */
  classifier_model?: string;

  /** 语义命中阈值 */
  threshold?: number;

  /** 原型意图集合 */
  prototypes?: Record<string, string>;
}

export interface IShadowChecksConfig {
  placeholder_patterns?: boolean;
  length_anomaly?: boolean;
  missing_code_block?: boolean;
}

export interface IShadowSupervisorConfig {
  /** 是否启用影子监督 */
  enabled: boolean;

  /** 工作模式 */
  mode?: TShadowSupervisorMode;

  /** 采样率 */
  sample_rate?: number;

  /** 审查模型 */
  verifier_model?: string;

  /** 规则检查项 */
  checks?: IShadowChecksConfig;
}

export interface IAnomalyThresholdsConfig {
  min_sample_size?: number;
  cascade_warn_rate?: number;
  cascade_critical_rate?: number;
  shadow_warn_rate?: number;
  shadow_critical_rate?: number;
  latency_warn_ms?: number;
  latency_critical_ms?: number;
  spike_warn_rate?: number;
  spike_delta_rate?: number;
}

export interface IObservabilityConfig {
  anomaly_thresholds?: IAnomalyThresholdsConfig;
}

export interface IGovernanceConfig {
  /** 是否启用治理层 */
  enabled: boolean;

  sticky?: IStickyRoutingConfig;
  cascade?: ICascadeGateConfig;
  semantic?: ISemanticRouterConfig;
  shadow?: IShadowSupervisorConfig;
  observability?: IObservabilityConfig;
}

export interface IGovernanceTrace {
  requestId: string;
  sessionKey?: string;
  initialModel?: string;
  finalModel?: string;
  routeReason: string[];
  stickyHit: boolean;
  alignmentUsed: boolean;
  semanticIntent?: string;
  cascadeTriggered: boolean;
  cascadeEvidence?: string[];
  cascadeNextModel?: string;
  shadowChecked: boolean;
  verificationResult?: string;
  latencyMs?: number;
  estimatedCost?: number;
  startedAt: number;
  completedAt?: number;
}

export interface ISessionState {
  sessionKey: string;
  preferredModel?: string;
  lastSuccessfulModel?: string;
  lastTaskFingerprint?: string;
  updatedAt: number;
}
