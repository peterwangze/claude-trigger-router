# Governance 输入侧优化设计

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“Governance 治理主链首轮落地”与“治理观测增强 / 运营化”两行的下一轮设计输入。
>
> 当前职责：承接 Prompt / Intent Optimization 作为治理增强子特性的设计边界、接入位置与验收口径；统一进展入口只维护状态与闭环结论。

## 1. 背景

当前治理链已经具备 sticky、alignment、cascade、semantic、shadow 五类能力，但它们主要发生在“请求已经形成之后”或“模型已经返回之后”。

这会留下一个明显空档：

- 用户输入本身可能不够明确
- 规则与语义引擎能判断意图，却不一定能帮用户把意图表达得更准确
- 复杂任务在进入 SmartRouter 或治理链前，可能已经因为提示粒度不足而损失路由与执行质量

因此需要补一层输入侧治理能力。

## 2. 设计定位

本能力不作为新的独立产品总线，而是归入 Governance 下一轮增强，原因是：

- 它的目标仍是提升路由与执行质量，而不是替代配置产品化或 UI 主线
- 它必须与现有 Context Extractor、Semantic Intent、trace 和 shadow 共享同一条治理证据链
- 它天然需要遵守 Governance 的保守默认、可关闭、可解释原则

统一定位：

> Prompt / Intent Optimization 是 Governance 的输入侧增强层，用于在不破坏原始请求主路径的前提下，提高用户提示表达的准确性与可路由性。

## 3. 设计目标

### 3.1 核心目标

- 提升用户提交到模型的提示准确度与结构清晰度
- 在进入 TriggerRouter / Semantic / SmartRouter 之前补足输入侧信号
- 保持用户原始意图可追踪、可解释、可关闭
- 让输入优化结果进入 governance trace，便于后续调优

### 3.2 非目标

本轮不追求：

- 默认强制改写所有用户输入
- 把输入优化做成独立的通用提示词编辑器
- 通过大模型重写取代用户原始请求
- 在首轮引入复杂多轮交互式提示澄清 UI

## 4. 接入原则

### 4.1 默认关闭

- 该能力必须默认关闭
- 必须有显式配置开关
- 必须支持只打标签、不改写正文的保守模式

### 4.2 不破坏原始请求

- 原始用户输入必须保留，不能只保留优化结果
- 若发生改写，trace 中必须保留原文、优化摘要和优化原因
- 下游模块可选择消费“原文”“增强标签”或“优化后版本”

### 4.3 可解释优先于强干预

首轮能力优先级应是：

1. 提取补充标签
2. 结构化补充信号
3. 轻量改写建议
4. 可选正文增强

## 5. 建议接入位置

建议把输入侧治理放在治理主链的前置阶段，顺序如下：

```text
request intake
  -> context extractor
  -> input optimization
  -> sticky / trigger / semantic / smart router
  -> final model resolve
  -> upstream execution
```

原因：

- Context Extractor 先提供 taskFingerprint、文本规模、工具与 thinking 信号
- Input Optimization 基于这些信号决定是否需要增强输入
- Sticky / Semantic / SmartRouter 可以直接消费优化后的结构化信号，提升命中率

## 6. 与现有治理组件关系

### 6.1 Context Extractor

- 继续负责提取原始文本、fullText、tokenEstimate、toolTypes 等输入信号
- 为输入优化提供任务规模和上下文边界

### 6.2 Semantic Intent Engine

- 输入优化可在 Semantic 之前先补标签或结构化摘要
- Semantic 可以把优化后的标签、术语归一结果作为额外证据

### 6.3 Context Alignment

- 输入优化只处理当前请求进入治理链之前的表达
- Context Alignment 仍负责跨模型切换后的技术交接
- 二者不能混为同一摘要能力

### 6.4 Shadow Supervisor

- Shadow 可用于评估输入优化是否导致答非所问或意图偏移
- 后续可对“开启优化 vs 关闭优化”的结果做差异审查

## 7. 优化模式分层

### 模式 A：标签增强

只补充结构化标签，不改写正文。

例如：

- intent: `bug_fix`
- complexity: `high`
- desired_output: `patch_with_tests`

适用：

- 默认保守模式
- 对误改用户意图容忍度低的场景

### 模式 B：轻量结构补全

在不改动主体内容的前提下，为下游补充结构化解释，例如：

- 当前任务目标
- 约束条件
- 期望输出类型
- 明显缺失的上下文提示

适用：

- 复杂任务
- 规则未命中但语义信号不足的任务

### 模式 C：建议式改写

生成优化后的建议版本，但默认不直接替换原文。

适用：

- CLI、UI 或未来辅助交互场景
- 需要让用户理解“为什么建议这样表达”

### 模式 D：受控正文增强

只在显式开启时，把优化后的文本作为下游主消费文本，同时保留原文。

适用：

- 用户明确接受自动增强
- 对提示精度要求高、且有 trace 回溯需求的内部场景

## 8. 配置建议

建议在 `Governance` 下新增输入侧配置：

```yaml
Governance:
  input_optimization:
    enabled: false
    mode: tags_only
    max_extra_tokens: 128
    rewrite_visible: true
    preserve_original_text: true
    triggers:
      low_signal_prompt: true
      ambiguous_intent: true
      high_complexity_task: true
```

说明：

- `enabled=false` 仍是默认值
- `mode` 首轮建议支持 `tags_only` / `structured_hint` / `suggest_only` / `rewrite`
- `rewrite_visible=true` 表示若发生改写，必须在 trace 或调试接口中可见

## 9. trace 与观测要求

建议新增以下 trace 字段：

```ts
interface IInputOptimizationTrace {
  enabled: boolean;
  mode?: string;
  applied: boolean;
  reason?: string[];
  originalTextLength: number;
  optimizedTextLength?: number;
  addedTags?: string[];
  rewriteStrategy?: string;
}
```

至少需要记录：

- 是否开启
- 是否实际应用
- 触发原因
- 是否改写正文
- 是否只补标签
- 长度与成本增量

## 10. 风险

| 风险 | 影响 | 缓解策略 |
|---|---|---|
| 误改用户意图 | 输出答非所问 | 默认 tags_only；改写必须显式开启 |
| token 成本上升 | 增加推理成本 | 设置最大附加 token；只对命中条件的请求启用 |
| 可解释性不足 | 用户不信任自动优化 | trace 暴露优化原因与结果摘要 |
| 与 Semantic/Alignment 职责混淆 | 设计边界失焦 | 明确输入优化只发生在前置阶段 |

## 11. 验收标准

### 行为验收

- 关闭时，主请求路径行为与当前实现一致
- 开启 `tags_only` 时，不改写正文但可输出补充标签
- 开启 `rewrite` 时，原文仍能回溯，且下游可识别优化后的文本来源

### 观测验收

- governance trace 可查看输入优化是否命中、原因和模式
- metrics 至少能统计启用率、命中率和平均额外长度

### 质量验收

- 规则未命中但语义信号不足的任务，输入优化后能提升意图归类稳定性
- 不允许因输入优化导致无法解释的主路径行为变化

## 12. 推进建议

建议按以下顺序推进：

1. 先做 trace 字段与保守模式设计
2. 再做 tags_only / structured_hint 首轮实现
3. 然后观察对 Semantic / SmartRouter 命中率的提升
4. 最后再决定是否开放建议式改写与受控正文增强

## 13. 结论

Prompt / Intent Optimization 的价值，不在于“替用户写提示词”，而在于把治理能力向输入侧延伸一层，让后续路由、治理和质量审查都建立在更清晰的任务信号之上。
