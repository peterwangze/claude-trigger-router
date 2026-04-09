# Claude Trigger Router 统一路由架构演进方案

## 1. 背景与目标

当前项目在实现层面已经具备 `TriggerRouter`、`SmartRouter`、`Governance` 三类能力，并且运行时已经出现了实际串联：显式规则匹配、语义分析、智能候选选择、会话粘性、上下文摘要等能力并非完全割裂。

但在产品层和配置层，这三类能力仍以并列模块的方式暴露给用户，导致两个问题：

1. 用户需要先理解多套概念，才能完成路由配置，配置复杂度偏高。
2. 同一条路由决策链在实现上已逐步融合，但在文档、UI、setup、配置 schema 中仍然表现为多套系统，容易造成认知分裂。

本轮演进的核心目标不是继续增加新模块，而是将现有组合能力收敛为一套统一的 `Router` 决策系统：

- 优先使用显式规则进行低成本、高确定性命中。
- 在规则层默认叠加语义辅助匹配，减少模型介入。
- 在规则与语义均无法稳定判定时，再使用 router model 做智能决策。
- 将会话粘性、上下文摘要提取等治理能力作为默认体验能力，而不是专家配置项。
- 通过平滑兼容策略，逐步把旧配置和旧心智迁移到统一 Router 入口。

## 2. 设计原则

### 2.1 一套产品心智，对外不再并列宣传三套系统

对外统一描述为：

```text
用户请求
  -> Router 决策层
     -> 显式规则匹配
     -> 语义辅助匹配（默认开启）
     -> 智能路由模型判定（必要时介入）
     -> 会话粘性 / 上下文摘要 / 路由治理（默认开启）
  -> 最终模型执行
```

用户未来只需要理解：

- 有哪些模型可选。
- 每个模型分别擅长什么。
- 哪些任务需要显式高优先级路由。
- 其余由 Router 自动完成。

### 2.2 智能判定后置，优先走低成本决策

router model 不是首要决策者，而是兜底裁决器。统一 Router 必须优先使用：

1. 显式规则匹配
2. 语义辅助匹配
3. 智能决策兜底

这样可以降低 token 消耗、减少对模型判断能力的依赖，并使低智模型也能在预筛选上下文中完成较高质量的选择。

### 2.3 默认治理前置到用户体验层

以下能力作为默认开启项：

- 会话粘性（sticky routing）
- 上下文摘要对齐（context alignment）
- 语义辅助匹配（semantic match）
- 路由轨迹记录（route trace）

这些能力均应允许显式关闭，但默认值必须站在用户体验一侧，而不是站在实现最保守一侧。

### 2.4 平滑兼容，避免迁移期割裂

本轮演进应保留旧字段读取能力，但统一新的配置主入口。目标不是长期维持双轨，而是在兼容期内实现：

- 老用户配置不失效
- 新用户只接触统一心智
- setup、UI、文档、运行时逐步对齐

## 3. 当前架构分析

从当前实现看，统一 Router 的基础已经存在：

- `src/trigger/selector.ts` 已具备规则匹配、sticky、semantic、SmartRouter、intent 检测的串联能力。
- `src/governance/semantic-router.ts` 已支持 prototype 语义匹配与 classifier 两种模式。
- `src/trigger/smart-router.ts` 已具备候选模型描述驱动的 LLM 选择能力。
- `src/governance/session-store.ts`、`src/governance/context-alignment.ts` 等能力表明治理机制已不再只是设想。

现阶段问题不在于“能力是否存在”，而在于：

- 配置入口分裂
- 模块语义分裂
- 默认值仍偏专家模式
- 用户需要理解内部实现边界，才能正确配置
- 当前真实决策顺序仍然是 `rule -> sticky -> semantic -> SmartRouter -> intent`，与目标中的“规则优先、语义增强、智能兜底、sticky 修正”并不一致

其中最后一点尤其关键：如果后续只统一 schema 和文档，而不明确重排运行时决策顺序，就会出现“产品心智已经统一，但行为优先级仍停留在旧架构”的偏差。

因此，最合理的演进方式是“产品层统一 + 决策链重排 + 兼容映射”，而非推倒重建。

## 4. 目标架构

### 4.1 目标逻辑链

建议将统一 Router 的决策顺序收敛为：

```text
1. 提取请求上下文
2. 读取会话状态
3. 执行显式高优先级规则匹配
4. 对规则执行语义辅助匹配
5. 若仍无稳定结果，则进入 smart decision
6. 应用会话粘性修正
7. 若发生跨模型切换，执行 context alignment
8. 输出最终模型
9. 回写路由轨迹与会话状态
```

### 4.2 各阶段职责

- 显式规则匹配：解决高确定性、低成本命中。
- 语义辅助匹配：作为规则层默认增强器，解决关键词过硬的问题。
- smart decision：作为最终兜底裁决器，在候选集上做选择。
- sticky 修正：作为多轮稳定性修正器，而不是覆盖显式意图的高优先级机制。
- context alignment：在跨模型切换时自动注入摘要，解决模型切换造成的上下文断裂。

## 5. 统一配置设计

### 5.1 新的配置心智

建议对外将配置主入口统一为 `Router`：

```yaml
Router:
  default: "sonnet"

  routes:
    - name: "architecture"
      model: "opus"
      description: "架构设计、系统方案、模块拆分"
      priority: 90
      match:
        keywords: ["架构设计", "system design"]
        semantic: true
        semantic_profile:
          threshold: 0.2
          prototype: "重构 系统 结构 模块 拆分 架构 设计"

    - name: "reasoning"
      model: "deepseek_reasoner"
      description: "复杂推理、严谨分析、长链路思考"
      priority: 70
      match:
        semantic: true
        semantic_profile:
          threshold: 0.2
          prototype: "复杂 推理 分析 严谨 逻辑 reasoning"

  decision:
    smart_fallback: true
    router_model: "sonnet"
    candidates:
      - model: "sonnet"
        description: "通用编程与调试"
      - model: "deepseek_reasoner"
        description: "复杂推理与分析"
      - model: "opus"
        description: "架构与复杂评审"
    router_hint:
      include_task_summary: true
      include_top_route_candidates: true

  defaults:
    sticky:
      enabled: true
      break_on_explicit_route: true
      fingerprint_similarity_threshold: 0.82
      session_ttl_ms: 3600000
      alignment:
        enabled: true
        summarizer_model: "sonnet"
        max_summary_tokens: 256
    semantic:
      enabled: true
      mode: "embedding"
    route_trace: true
```

### 5.2 设计意图

- `routes[]` 既承载显式规则，也承载语义预期。
- `description` 不再只属于 SmartRouter 候选，而成为路由规则本身的语义来源。
- `match.semantic_profile` 用于承接当前 `semantic.prototypes` 的能力，避免统一配置后丢失阈值和 prototype 语义。
- `decision` 清晰表达“前层无法稳定判定时再启用智能决策”。
- `defaults` 不只是布尔开关，而是统一表达默认治理能力及其关键参数，确保兼容迁移时不丢参。
- `router_hint` 用于定义传给 router model 的结构化提示，保证 smart decision 真正建立在预筛选结果之上。

### 5.3 参数保真原则

统一配置不是把旧配置压缩成少量布尔值，而是把旧能力重新组织到统一心智下，同时保留关键参数语义。

必须完整承接的典型参数包括：

- sticky：`session_ttl_ms`、`fingerprint_similarity_threshold`、`break_on_explicit_route`
- alignment：`summarizer_model`、`max_summary_tokens`
- semantic：`mode`、`threshold`、`prototype` / `classifier_model`
- smart decision：`router_model`、`candidates`、`cache_ttl`、`max_tokens`、`fallback`

统一后的 schema 可以重命名、重分组，但不能在迁移时丢失这些能力表达。

### 5.4 语义原型来源原则

`routes[].description` 可以作为默认语义来源，但不能假设 description 本身就足够替代当前全部 prototype 配置。

建议遵循以下优先级：

1. 若用户显式提供 `match.semantic_profile.prototype`，优先使用该 prototype。
2. 若未提供 prototype，则以 `description` 生成默认 prototype。
3. 若处于 classifier 模式，则保留 `classifier_model` 与 route name 的映射关系。
4. 若旧配置中已存在 `Governance.semantic.prototypes`，迁移时必须优先保留原始 prototype，而不是直接覆盖为 description。

这样可以保证统一配置既降低新用户的学习成本，也不破坏老配置已经调好的语义效果。

### 5.5 当前到目标的顺序修复要求

为了确保“统一 Router”不止停留在文档层，阶段 1 必须明确完成下面的运行时修复：

- 从当前的 `rule -> sticky -> semantic -> SmartRouter -> intent`
- 调整为目标的 `rule -> semantic -> smart decision -> sticky correction -> context alignment`

这是一条硬性实现要求，而不是可选优化项。

只有这一步完成后，后续的 setup、UI、schema 统一才真正有意义。


## 6. 具体设计

### 6.1 路由规则与语义描述融合

未来 `routes[].description` 应成为统一的语义描述入口。对用户来说，它只是“这个 route 适合处理什么任务”；对系统来说，这一描述同时可以服务于：

- 规则命中补充理解
- prototype semantic 匹配
- smart decision 的候选上下文预筛选

这样，语义能力不再是一个需要独立理解和配置的“Semantic Router 产品”，而是统一 Router 规则的一部分。

### 6.2 语义辅助匹配默认开启

语义辅助匹配建议默认启用，并且优先依附于规则层，而不是作为独立中间层对外曝光。

推荐实现：

- 第一版延续当前 prototype 相似度能力。
- 保留 classifier 模式作为增强路径，但不把它做成用户必须显式理解的单独能力。
- route description 与 semantic prototype 之间保持可推导映射，减少重复配置。

目标效果：

- 用户表达与关键词不完全一致时仍能命中正确 route。
- 在相当多场景下避免 router model 介入。
- 当必须调用 router model 时，前置语义阶段已经提供压缩后的任务意图和候选结果。

### 6.3 smart decision 改造成预筛选后的兜底裁决器

当前 SmartRouter 直接将原始请求与候选模型描述交给 router model。演进后建议改造为“结构化候选决策”：

```json
{
  "task_summary": "用户在讨论路由架构统一与治理能力默认开启",
  "top_route_candidates": [
    { "name": "architecture", "model": "opus", "confidence": 0.78 },
    { "name": "reasoning", "model": "deepseek_reasoner", "confidence": 0.63 }
  ],
  "request_text": "..."
}
```

这样的好处：

- router model 不再直接承担从零理解任务的全部负担。
- 低智模型也能在被压缩的结构化上下文中做出更稳定选择。
- 智能路由从“另一个平行系统”收敛为统一 Router 的兜底阶段。

### 6.4 sticky 作为稳定性修正器

sticky 不应放在显式规则之前，否则会覆盖用户明确意图；也不应完全作为结果后处理，因为它本质上会影响最终决策。

建议定位为：

- 显式规则之后生效
- smart decision 之后参与稳定性修正
- 在“同一任务、同一会话、高相似度任务指纹”条件下优先复用最近稳定模型
- 若用户显式触发高优先级路由，允许打破粘性

### 6.5 context alignment 作为默认跨模型交接能力

当最终模型与会话稳定模型不同，或发生阶段性升级切换时，默认进行上下文摘要注入。

摘要建议包含：

- 当前任务目标
- 已作出的关键决策
- 当前进展
- 未完成事项
- 关键上下文或约束

要求：

- 摘要长度受控
- 摘要可追踪来源
- 摘要失败不阻断主流程，但必须留下 trace

## 7. 兼容迁移设计

### 7.1 兼容策略

采用“双层兼容，一层主入口”策略：

- 新版本对外主推统一 `Router` 结构。
- 运行时保留旧字段读取与映射。
- setup、UI、文档优先生成和展示新结构。

### 7.2 旧字段映射建议

- `TriggerRouter.rules` -> `Router.routes`
- `SmartRouter.router_model` + `SmartRouter.candidates` -> `Router.decision`
- `Governance.sticky` -> `Router.defaults.sticky`
- `Governance.sticky.alignment` -> `Router.defaults.sticky.alignment`
- `Governance.semantic` -> `Router.defaults.semantic` 与各 route 的 `match.semantic_profile`
- `Governance.observability` -> `Router.defaults.observability`（若保留统一出口）

### 7.3 迁移保真要求

迁移不是“能读出来就算兼容”，而是必须保证关键参数不丢失、不静默降级。

最低要求：

- 旧配置读入后，运行时行为与旧结构等价。
- 旧配置转换为新结构后，再次加载时行为保持一致。
- 若新结构暂时无法完整承载旧参数，必须保留回退字段或保留原始子结构，而不是直接丢弃。
- 保存新结构时需要给出迁移说明，标注哪些字段被重命名、哪些字段被下沉到子树。

建议在实施阶段引入 migration matrix，至少覆盖 `config/trigger.example.yaml` 中已有字段，检查：

- 是否可读
- 是否可写回
- 是否写回后仍保留语义
- 是否影响默认行为

### 7.4 迁移要求

- 新用户不再需要理解三套并列概念。
- 老用户配置可以继续运行。
- 读取旧配置时提供明确迁移提示。
- 保存配置时默认输出新结构。
- setup 与 UI 都需要显式说明旧结构已兼容，但推荐迁移。
- 兼容迁移要覆盖运行时、setup、UI、文档，而不是只做配置解析兼容。
- 统一 schema 正式成为默认输出之前，必须先完成阶段 1 的运行时链路重排与默认能力边界确认。
- 默认治理能力正式写入 setup / UI 之前，必须明确延迟预算、失败回退和关闭粒度。

### 7.5 migration matrix 最低覆盖项

实施时至少要检查以下字段在双读与写回过程中是否保真：

- Smart decision：`router_model`、`candidates`、`cache_ttl`、`max_tokens`、`fallback`
- sticky：`session_ttl_ms`、`fingerprint_similarity_threshold`、`break_on_explicit_route`
- alignment：`enabled`、`summarizer_model`、`max_summary_tokens`
- semantic：`enabled`、`mode`、`threshold`、`classifier_model`、`prototypes`
- observability：现有异常阈值字段是否保留或明确声明暂不迁移

只有这组字段通过保真检查，才能认为“平滑兼容”成立。

### 7.6 阶段顺序约束

分阶段实施中必须遵循以下顺序约束：

1. 先完成 trace 补齐与运行时链路重排。
2. 再稳定默认治理能力的边界、成本与关闭方式。
3. 最后让 setup、UI、配置保存默认输出统一 Router 结构。

也就是说，配置统一和产品化输出不能先于行为统一，否则会出现“配置承诺已经升级，但运行时语义仍停留在旧架构”的问题。

这样可以避免统一入口先落地、默认行为后补齐导致的认知与实现错位。

### 7.7 迁移要求

- 新用户不再需要理解三套并列概念。
- 老用户配置可以继续运行。
- 读取旧配置时提供明确迁移提示。
- 保存配置时默认输出新结构。
- setup 与 UI 都需要显式说明旧结构已兼容，但推荐迁移。
- 统一 Router 的产品承诺必须后于运行时真实能力，而不能先于实现对外输出。

## 8. 分阶段实施方案

### 阶段 0：统一认知与兼容基线

目标：先统一语言和观测，不先改主行为。

预期产出：

- 明确统一 Router 的产品口径
- 建立新旧配置映射关系
- trace 补齐命中阶段、修正来源、治理动作字段
- README、文档开始弱化三套并列表达

验收标准：

- 团队对统一 Router 的层次关系达成一致
- 旧配置仍可加载
- trace 可区分显式规则、语义增强、smart decision、sticky、alignment

### 阶段 1：统一决策链落地

目标：把运行时真正收敛成统一链路。

预期产出：

- `selector` 成为统一 Router 决策编排入口
- 明确完成当前顺序 `rule -> sticky -> semantic -> SmartRouter -> intent` 到目标顺序 `rule -> semantic -> smart decision -> sticky correction -> context alignment` 的重排
- 语义匹配成为规则增强层
- smart decision 成为兜底裁决器
- sticky 与 alignment 进入统一默认流程

验收标准：

- 任意请求都能在 trace 中落到单一清晰决策路径
- 显式规则不会被 smart decision 覆盖
- sticky 不会压过显式高优先级意图
- 规则未命中但语义高置信时可直接命中 route
- 仅在前层无法稳定决策时才调用 router model
- 跨模型切换时默认触发 alignment
- 阶段结束时仍以运行时等价兼容为准，不要求 setup/UI 先行切换默认输出

### 阶段 2：默认治理能力边界稳定

目标：先把默认能力的成本、关闭方式、失败回退稳定下来，再进入配置产品化输出。

预期产出：

- sticky、alignment、semantic 的默认开启边界明确
- 默认能力的关闭粒度、失败回退、trace 表达统一
- 延迟预算、摘要长度、语义阈值等关键参数形成可验证门槛
- migration matrix 覆盖默认能力相关字段并通过保真检查

验收标准：

- 默认能力具备清晰的开启条件、关闭方式和失败回退策略
- 默认开启不会引入不可接受的成本与延迟
- 关闭任一默认能力后，行为变化可解释且 trace 可观测
- 旧配置迁移到新结构时，默认能力相关参数不丢失、不静默降级

### 阶段 3：统一配置入口产品化

目标：把统一心智真正落到配置、setup、UI、文档。

预期产出：

- 新版统一 `Router` schema
- `ctr setup` 优先生成统一配置
- `/ui` 改为围绕统一路由策略组织
- 配置校验器支持双读
- 配置保存默认写入新结构

验收标准：

- 新用户不需要理解旧三分结构
- 老用户配置加载无报错，并收到迁移建议
- 文档示例以统一 Router 为主
- setup / UI / 配置文件表达一致

### 阶段 4：默认治理能力收口

目标：把默认体验能力真正变成产品级默认值。

默认开启项：

- `sticky.enabled: true`
- `sticky.alignment.enabled: true`
- `semantic.enabled: true`
- `route_trace: true`

验收标准：

- 多轮同任务下模型切换率下降
- 跨模型切换后的上下文连续性提升
- 非关键词表达能通过语义增强稳定命中
- 默认开启不会引入不可接受的成本与延迟
- 每项默认能力都可解释、可关闭
- setup / UI / 配置文件输出的默认值与运行时真实默认行为一致

### 阶段 5：增强治理与长期演进

目标：在统一 Router 稳定后，再逐步接入更强治理能力。

建议纳入但不作为第一轮默认能力：

- cascade auto-upgrade
- shadow audit
- anomaly feedback tuning
- route effectiveness metrics

验收标准：

- 增强能力可以插件式接入统一 Router
- 关闭增强治理后，统一 Router 主价值仍然成立

## 9. 阶段性验收总表

| 阶段 | 核心目标 | 关键验收标准 |
| --- | --- | --- |
| 阶段 0 | 统一认知与兼容基线 | 统一口径明确；旧配置可运行；trace 可区分路由阶段 |
| 阶段 1 | 统一决策链落地 | 规则/语义/smart/sticky/alignment 顺序清晰，行为可追踪 |
| 阶段 2 | 默认治理能力边界稳定 | 默认能力的成本、关闭方式、失败回退、参数保真全部明确 |
| 阶段 3 | 统一配置入口产品化 | setup、UI、文档、配置文件全部按统一 Router 心智表达 |
| 阶段 4 | 默认治理能力收口 | sticky、alignment、semantic 默认生效且可关闭，体验稳定 |
| 阶段 5 | 增强治理扩展 | cascade/shadow 等增强能力可插拔接入，不破坏主链 |

## 10. 进展跟踪表

| 模块 | 当前状态 | 目标状态 | 前置依赖 | 完成标志 |
| --- | --- | --- | --- | --- |
| 路由产品心智 | Trigger/Smart/Governance 分立 | 统一 Router 叙事 | 无 | README、文档、setup 术语统一 |
| 决策链编排 | 已部分串联但语义不统一 | 单一决策链 | trace 基线 | `selector` 成为统一编排入口 |
| 语义辅助匹配 | 独立 semantic 模块 | 规则增强默认层 | 决策链重排 | route description/semantic profile 驱动语义匹配 |
| smart decision | 独立候选模型选择 | 兜底智能决策层 | 语义候选输出 | 支持接收候选摘要与置信度 |
| sticky routing | 治理能力之一 | 默认稳定性修正器 | session store | 多轮同任务复用稳定模型 |
| context alignment | 治理侧基础能力 | 默认跨模型交接机制 | 模型切换检测 | 跨模型切换时自动注入摘要 |
| 配置 schema | 多入口分散 | 统一 Router schema | 运行时语义稳定 | 新旧配置双读可用且关键参数不丢失 |
| migration matrix | 尚未成型 | 兼容保真基线 | schema 草案 | 关键字段双读/写回/行为等价通过 |
| `ctr setup` | 偏技术模块化生成 | 统一路由配置向导 | schema 稳定 | 新用户只需理解一套路由配置 |
| `/ui` | 能力分块展示 | 统一策略视图 | schema 稳定 | UI 不再暴露割裂概念 |
| 文档迁移 | 示例仍带旧心智 | 新心智主导，旧结构兼容 | schema 稳定 | README 与配置示例统一 |
| 默认治理边界 | 默认项仍偏实现导向 | 默认行为、关闭粒度、预算清晰 | 决策链重排 | 默认能力的 trace、回退、参数门槛明确 |

## 11. 实施要求

为避免实施过程偏离预期，必须满足以下要求：

1. 后续新增能力必须明确属于“规则、语义、smart decision、默认治理”中的某一层，不再增加新的并列路由概念。
2. 对外心智优先于内部模块命名。内部文件可保留旧名，但对外配置、文档、setup、UI 必须优先统一 Router 表达。
3. 默认开启能力必须同时满足“可解释、可观测、可关闭”。
4. router model 必须后置，只在前层无法稳定决策时介入。
5. 语义能力必须服务规则，不演化为另一套独立产品概念。
6. 第一优先级是降低配置复杂度、统一用户心智、提升默认体验，不让治理增强能力抢占主线资源。
7. 兼容迁移必须覆盖运行时、setup、UI、文档四个维度，而不是只做配置读取兼容。

## 12. 防偏离检查清单

每个阶段评审时应检查：

- 这次改动是否让用户更接近“只理解一套路由系统”？
- 这次改动是否减少了模型介入，而不是扩大模型介入？
- 语义能力是否在服务规则匹配，而不是变成另一套独立配置？
- smart decision 是否仍然是兜底，而不是重新前移为主入口？
- 默认开启项是否既生效又可解释、可关闭？
- 旧用户迁移成本是否真实下降，而不是只是理论兼容？

如果其中两项无法明确回答，说明实施已经开始偏离主线。

## 13. 结论

本轮演进的正确方向，不是继续把 `TriggerRouter`、`SmartRouter`、`Governance` 做成更强的并列系统，而是把它们收敛为一套“默认带治理能力的统一 Router 决策系统”。

这套统一 Router 应当遵循以下产品逻辑：

- 系统优先使用显式规则和语义增强完成低成本决策。
- 只有在必要时才让 router model 介入。
- sticky、context alignment 等能力默认存在，用于保证多轮稳定性和跨模型连续性。
- 对老用户保持平滑兼容，对新用户只暴露统一的配置心智。

当这条主线成立后，项目的价值将不再只是“多模型切换代理”，而是“面向 Claude Code 使用体验的统一路由与治理平台”。
