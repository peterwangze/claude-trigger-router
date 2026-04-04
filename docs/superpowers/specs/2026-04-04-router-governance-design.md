# Claude Trigger Router 治理化演进设计

## 1. 设计目标

在现有 `TriggerRouter + SmartRouter + Router.default` 的基础上，新增一层可选的治理能力，使系统从“单次请求路由”升级为“面向会话、失败证据和输出质量的多阶段决策系统”。

本设计重点解决四件事：

1. 跨模型切换时的上下文连续性
2. 模型失败后的自动升级
3. 关键词不足时的语义识别
4. 对低质量输出的监督与拦截

## 2. 非目标

本轮设计不追求：

- 直接做完整 Web 控制台
- 直接引入复杂分布式存储
- 默认强依赖远程云端治理服务
- 让所有请求都进入多模型并行投票

原则上，本轮设计仍然以“本地可运行、默认可关闭、失败可降级”为边界。

## 3. 现有架构与问题

当前主链大致如下：

```text
Claude Code
  -> ctr server
  -> TriggerRouter（关键词/正则）
  -> SmartRouter（候选模型选择）
  -> Router 通用分流
  -> 上游 provider/model
```

这条链能解决“当前请求应该发给谁”，但不能很好解决：

- 同一任务跨轮是否应维持同一模型
- 模型输出失败时是否应自动升级
- 用户表达未命中关键词时如何识别真实意图
- 对低质量输出如何审查与纠偏

因此需要引入治理层。

## 4. 目标逻辑架构

建议新增 `src/governance/` 作为跨模块治理域，形成以下结构：

```text
Request Intake
  -> Context Extractor
  -> Session State Store
  -> Sticky Routing Policy
  -> TriggerRouter / Semantic Intent / SmartRouter
  -> Cascade Reasoning Gate
  -> Final Model Resolver
  -> Upstream Execution
  -> Shadow Supervisor
  -> Metrics + Session Update
```

## 5. 核心组件设计

### 5.1 Context Extractor

职责：

- 从请求中提取最后一轮文本、完整对话摘要、token 规模、工具信息、是否含 thinking、是否含 web search
- 生成 `requestId`、`sessionKey`、`taskFingerprint`

说明：

- `requestId` 用于一次请求全链路追踪
- `sessionKey` 用于跨轮保持粘性
- `taskFingerprint` 用于判断“是否还是同一类任务”

建议输入：

- request body
- system prompt
- conversation messages
- CLI 注入的环境信息

建议输出：

```ts
interface IRequestEnvelope {
  requestId: string;
  sessionKey?: string;
  taskFingerprint: string;
  text: string;
  fullText?: string;
  tokenEstimate?: number;
  hasThinking: boolean;
  hasWebSearch: boolean;
  toolTypes: string[];
}
```

### 5.2 Session State Store

职责：

- 保存每个 `sessionKey` 最近一次稳定模型
- 保存最近若干轮的技术摘要
- 保存最近升级历史、失败证据和审查结果

存储建议：

- 第一版使用本地内存 + 可选文件持久化
- TTL 驱动过期，避免无限增长

建议结构：

```ts
interface ISessionState {
  sessionKey: string;
  preferredModel?: string;
  lastSuccessfulModel?: string;
  lastIntent?: string;
  lastSummary?: string;
  recentFailures: IFailureEvidence[];
  recentVerifications: IVerificationRecord[];
  updatedAt: number;
}
```

### 5.3 Sticky Routing Policy

职责：

- 判断当前请求是否应优先复用会话中的稳定模型
- 判断何时允许“打破粘性”

推荐策略：

- 同一 `sessionKey` 且 `taskFingerprint` 相近时优先复用最近成功模型
- 当命中强规则、长上下文阈值、显式子代理模型、人工强制路由时，允许打破粘性
- 打破粘性后，如果模型发生变化，必须进入 `Context Alignment`

### 5.4 Context Alignment Service

职责：

- 在跨模型切换前，使用廉价模型或本地 summarizer 生成技术交接摘要
- 将摘要作为 system/context 注入新模型请求

摘要内容建议包含：

- 当前任务目标
- 已做出的关键设计或实现决策
- 未完成事项
- 已知失败与约束
- 文件/模块上下文

约束：

- 必须严格限制长度，避免摘要反向放大 token 成本
- 摘要应带时间戳和来源模型，便于追踪

### 5.5 Semantic Intent Engine

职责：

- 在规则未命中或规则置信度不足时，提供语义层意图判断

推荐实现：

- 第一版支持两条路径：
  1. 本地 embedding + 预置 intent prototypes
  2. 廉价分类模型返回意图标签和置信度

核心意图建议：

- `architectural_change`
- `bug_fix`
- `complex_reasoning`
- `code_review`
- `documentation`
- `configuration`
- `research_or_search`

输出建议：

```ts
interface ISemanticIntentResult {
  intent: string;
  confidence: number;
  matchedPrototype?: string;
  evidence?: string[];
}
```

### 5.6 Cascade Reasoning Gate

职责：

- 在主模型返回失败证据时，决定是否升级模型或提升 reasoning 等级

输入证据建议包括：

- 编译失败
- 测试失败
- lint/static check 失败
- 输出命中 `TODO` / `...rest of code` / `placeholder`
- 输出为空、过短、结构化字段缺失

升级链建议：

```text
standard -> high_reasoning -> rescue_model
```

升级时需携带：

- 原始请求
- 首轮输出
- 失败日志
- 当前会话摘要

这样升级模型不是“重做一遍”，而是“带着失败证据修复”。

### 5.7 Shadow Supervisor

职责：

- 对指定策略命中的请求进行影子验证
- 比较主输出与监督输出/规则结果

推荐两种模式：

- `async_audit`：不阻断主链，只记录风险并生成告警
- `sync_guard`：高风险场景下可阻断并触发自动升级/重试

审查方式建议组合：

1. 规则审查：长度、占位符、缺字段、危险模式
2. 轻量模型审查：判断是否遗漏、是否答非所问
3. 差异审查：主输出与影子输出差异是否异常大

### 5.8 Metrics and Governance Log

职责：

- 为每次请求记录治理证据
- 为策略调优提供数据

建议日志字段：

```ts
interface IGovernanceTrace {
  requestId: string;
  sessionKey?: string;
  initialModel?: string;
  finalModel: string;
  routeReason: string[];
  stickyHit: boolean;
  alignmentUsed: boolean;
  semanticIntent?: string;
  cascadeTriggered: boolean;
  shadowChecked: boolean;
  verificationResult?: string;
  latencyMs: number;
  estimatedCost?: number;
}
```

## 6. 推荐决策顺序

推荐把主链收敛为以下顺序：

```text
1. 提取 envelope / sessionKey / trace
2. 读取 session state
3. 判断 sticky 是否命中
4. 执行强规则 TriggerRouter
5. 执行 Semantic Intent Engine
6. 执行 SmartRouter
7. 执行 Router 基础分流
8. 若模型变更，执行 Context Alignment
9. 调用上游模型
10. 若命中失败证据，进入 Cascade Reasoning Gate
11. 执行 Shadow Supervisor
12. 更新 session state 和 metrics
```

设计要点：

- TriggerRouter 仍保留最高优先级中的“强显式规则”角色
- Semantic Intent 作为规则和 SmartRouter 之间的补充层
- Sticky 是“偏好机制”，不是绝对强制
- Cascade 和 Shadow 都是后验治理，而非前置路由替代

## 7. 配置设计

建议在现有配置上新增 `Governance` 顶层配置：

```yaml
Governance:
  enabled: true

  sticky:
    enabled: true
    session_ttl_ms: 3600000
    fingerprint_similarity_threshold: 0.82
    break_on_explicit_route: true
    alignment:
      enabled: true
      summarizer_model: "glm,glm-5-mini"
      max_summary_tokens: 256

  cascade:
    enabled: true
    max_attempts: 2
    triggers:
      compile_failure: true
      test_failure: true
      placeholder_patterns:
        - "TODO"
        - "...rest of code"
        - "placeholder"
    levels:
      - from: "openrouter,anthropic/claude-sonnet-4"
        to: "openrouter,anthropic/claude-sonnet-4"
        reasoning: "high"
      - from: "openrouter,anthropic/claude-sonnet-4"
        to: "openrouter,anthropic/claude-opus-4"
        reasoning: "high"

  semantic:
    enabled: true
    mode: "embedding"
    threshold: 0.85
    prototypes:
      architectural_change: "系统架构调整、模块拆分、核心设计重构"
      bug_fix: "定位并修复明确问题"
      documentation: "文档撰写、说明整理、解释"

  shadow:
    enabled: false
    mode: "async_audit"
    sample_rate: 0.2
    verifier_model: "glm,glm-5-air"
    checks:
      placeholder_patterns: true
      length_anomaly: true
      missing_code_block: true
```

## 8. 配置与旧逻辑兼容原则

- `Governance.enabled = false` 时，系统行为应尽量退化为当前实现
- 即使开启 `Governance`，每个子能力也应支持独立关闭
- 对已有 `TriggerRouter`、`SmartRouter` 配置不做破坏性字段变更
- 新配置默认值必须保守，优先“不生效”而不是“强干预”

## 9. 模块落地建议

建议新增文件：

- `src/governance/types.ts`
- `src/governance/session-store.ts`
- `src/governance/context-alignment.ts`
- `src/governance/semantic-router.ts`
- `src/governance/cascade-gate.ts`
- `src/governance/shadow-supervisor.ts`
- `src/governance/trace.ts`
- `src/governance/index.ts`

建议改造文件：

- `src/utils/config.ts`
  - 增加 `Governance` 默认值和校验
- `src/trigger/index.ts`
  - 接入 sticky / semantic / alignment 前置逻辑
- `src/trigger/selector.ts`
  - 承接语义结果与 SmartRouter 组合决策
- `src/router/index.ts`
  - 接入最终模型解析和升级结果
- `src/server.ts`
  - 暴露治理日志、必要的调试接口或指标出口

## 10. 故障与降级策略

### Sticky 失败

- 无法读取 session state 时直接退化为当前路由链

### Alignment 失败

- 不阻断请求，但记录 `alignment_failed`

### Semantic 失败

- 退化为规则 + SmartRouter

### Cascade 失败

- 保留原始输出并记录升级失败；不要陷入无限重试

### Shadow 失败

- 异步模式下只记录错误
- 同步模式下按策略决定是放行还是走保守升级

## 11. 成本与性能约束

必须明确控制这几类成本：

- Sticky 摘要生成的 token 消耗
- Semantic embedding 或分类调用成本
- Cascade 重试带来的二次请求成本
- Shadow 验证带来的并发与 token 成本

控制手段：

- 缓存摘要
- 只对命中条件的请求启用语义和影子能力
- 采样启用 Shadow Supervisor
- 给每条请求设置最大升级次数

## 12. 测试策略

### 单元测试

- session state 命中、过期、清理
- sticky 命中与 break 条件
- semantic intent 阈值判断
- cascade trigger 识别和升级链决策
- shadow 规则审查结果

### 集成测试

- 规则未命中 -> semantic 命中 -> 模型落地
- 会话中跨模型切换 -> alignment 注入
- 首轮失败 -> cascade 升级 -> 成功
- 主模型输出低质量 -> shadow 命中 -> 告警或重试

### 回归测试

- `Governance` 全关时，应与当前主链行为一致
- CLI、setup、配置保存与加载不受破坏

## 13. 上线策略

建议分三步：

1. 先上线 trace 和日志，不开自动治理
2. 再上线 Sticky 和 Semantic，但默认只记录或低强度启用
3. 最后上线 Cascade 和 Shadow 的自动执行能力

理由：

- 先拿到真实请求分布和错误证据
- 再根据数据决定阈值和采样率
- 避免一开始就引入不可解释的自动行为

## 14. 结论

这套设计的核心，不是简单增加几个新模块，而是建立一条更完整的决策闭环：

```text
路由 -> 执行 -> 失败证据 -> 升级 -> 验证 -> 回写状态
```

只要这个闭环成立，Claude Trigger Router 才真正具备“模型治理层”的雏形。
