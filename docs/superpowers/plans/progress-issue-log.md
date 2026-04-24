# 统一进展问题修改记录

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“问题修改记录”与“进展文档体系治理”两行的详细问题台账。
>
> 当前职责：承接统一进展入口及其关联文档在演进中的问题、错误修改、修正动作和闭环结论；顶层入口只保留问题记录入口与维护约束，不展开问题细节。

## 文档定位

本文档用于记录统一进展入口及其关联文档在演进过程中出现过的问题、错误修改、修正动作和闭环结论。

目标不是追责，而是防止后续重复犯相同错误，确保文档治理形成可追溯、可复盘、可约束的闭环。

## 维护规则

1. 本文档中的问题记录 **只能新增，不能删除**；若某条问题后续被证明判断有偏差，也必须保留原记录，并追加校正说明。
2. 每条问题记录都必须包含：
   - 问题编号
   - 问题标题
   - 首次暴露时间
   - 问题描述
   - 影响范围
   - 修正动作
   - 当前状态
   - 闭环结论
   - 关联文档
3. 问题若尚未完全解决，闭环结论必须写明“当前阶段结论”，不能只写“处理中”。
4. 涉及统一进展入口结构、事项 / 特性状态口径、历史文档收编关系、职责边界漂移的问题，都必须记录到本文档。
5. 若某问题已推动新增规则或新增事项，也必须在闭环结论中明确写出制度化结果。

## 问题记录表

| 问题编号 | 问题标题 | 首次暴露时间 | 当前状态 | 闭环结论 | 关联文档 |
|---|---|---|---|---|---|
| PI-001 | 统一进展入口使用带日期文件名，难以作为长期公共入口 | 2026-04-15 | closed | 已新增 `docs/superpowers/plans/unified-progress-baseline.md` 作为不带日期标签的公共入口，原日期版文件已降级为历史入口说明 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/2026-04-15-unified-progress-baseline.md` |
| PI-002 | 顶层进展口径与实际主线数量不一致 | 2026-04-15 | closed | 已将顶层进展从散文式主线描述重构为特性进展总表，避免继续出现“四条主线但实际列出五条”这类结构性偏差 | `docs/superpowers/plans/unified-progress-baseline.md` |
| PI-003 | 同一事项存在互相冲突的状态表述 | 2026-04-15 | closed | 已用表格化状态字段统一维护事项状态，并要求每条记录必须同时给出闭环结论，避免 `in_progress`、`not_started`、`尚未正式启动` 混写 | `docs/superpowers/plans/unified-progress-baseline.md` |
| PI-004 | 历史文档收编不完整，部分主线与专项文档未纳入统一入口 | 2026-04-15 | closed | 已补齐治理、SmartRouter、setup、配置产品化、统一 Router、CLI / setup UX、legacy migration、CLI E2E 等历史文档索引与角色说明 | `docs/superpowers/plans/unified-progress-baseline.md` |
| PI-005 | 入口文档承载过多正文，存在持续膨胀风险 | 2026-04-16 | closed | 已明确入口文档只保留阶段判断、特性进展总表、问题记录入口和维护规则；详细设计、实施计划、详细进展统一下沉到特性文档 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| PI-006 | 事项 / 特性缺少制度化增量规则，后续容易被删除或重写覆盖 | 2026-04-16 | closed | 已新增“事项 / 特性只能新增不能删除”的制度约束，并要求失效、取消、合并、替代场景也必须保留原记录并更新闭环结论 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| PI-007 | 问题修正过程未形成独立事项文档，容易重复踩坑 | 2026-04-16 | closed | 已建立独立问题修改记录文档，并在统一进展入口中将其作为治理事项和关联文档接入，后续所有文档治理偏差统一在此追踪 | `docs/superpowers/plans/progress-issue-log.md` ; `docs/superpowers/plans/unified-progress-baseline.md` |
| PI-008 | 已标记 closed 的兼容主线仍暴露真实用户主路径缺口 | 2026-04-24 | closed | 复审发现“OpenAI-compatible 兼容差异内化”等已闭环事务在真实用户流中仍存在兼容缺口；当前未回退原结论，而是通过新增 `OpenAI-compatible 主路径兼容补强` 事项完成了首轮止血与用户流回归补强，现已不再作为独立未闭环 P0 问题维护 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` |
| PI-009 | 已闭环事项的文档结论与当前实现链路发生漂移 | 2026-04-24 | in_progress | 复审发现部分 closed 事项的闭环描述仍停留在旧链路，如统一 Router 运行时文案仍写 `legacy intent fallback`；当前不回退原结论，而是已新增 `已闭环事项复审校准` 事项承接后续校准与持续复审 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md` ; `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md` |

## 问题详细记录

### PI-001：统一进展入口使用带日期文件名，难以作为长期公共入口

- 首次暴露时间：2026-04-15
- 问题描述：统一基线最初建立在带日期标签的文件中，适合阶段性产物命名，不适合作为长期公共入口。
- 影响范围：
  - 后续入口可能继续随日期迁移
  - 用户与维护者难以形成稳定引用心智
  - 历史文档回链路径不稳定
- 修正动作：
  - 新建 `docs/superpowers/plans/unified-progress-baseline.md`
  - 将旧文件改为历史入口说明
  - 把已有回链统一改到新入口
- 当前状态：`closed`
- 闭环结论：公共入口已稳定，不再依赖日期命名；后续若再出现新入口，不允许重复创建平行“统一基线”。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/2026-04-15-unified-progress-baseline.md`

### PI-002：顶层进展口径与实际主线数量不一致

- 首次暴露时间：2026-04-15
- 问题描述：文档中出现“当前并行推进的四条主线”但实际列出五条主线，导致总览口径不可信。
- 影响范围：
  - 顶层阶段判断失真
  - 后续新增主线时更容易继续漂移
- 修正动作：
  - 放弃继续扩写段落式主线说明
  - 重构为“特性进展总表”统一维护状态
- 当前状态：`closed`
- 闭环结论：顶层入口不再依赖自然语言段落枚举主线，改由结构化表格承载，降低口径漂移概率。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`

### PI-003：同一事项存在互相冲突的状态表述

- 首次暴露时间：2026-04-15
- 问题描述：同一事项同时出现 `in_progress`、`尚未正式启动`、要求标记为 `not_started` 等互相冲突的表达。
- 影响范围：
  - 无法判断真实阶段
  - 后续维护者容易继续在不同段落写出不同结论
- 修正动作：
  - 改为统一表格字段维护状态
  - 每条记录新增“当前闭环结论”列
- 当前状态：`closed`
- 闭环结论：后续不允许只写状态不写结论；状态判断必须与闭环结论共同更新。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`

### PI-004：历史文档收编不完整，部分主线与专项文档未纳入统一入口

- 首次暴露时间：2026-04-15
- 问题描述：统一入口初版未完整覆盖历史路线图、设计文档、专项计划和校准文档。
- 影响范围：
  - 维护者仍可能从遗漏文档进入并误判其权威性
  - 顶层入口无法承担完整索引职责
- 修正动作：
  - 全量补齐相关计划、设计、校准和专项文档索引
  - 为各类文档补角色说明
- 当前状态：`closed`
- 闭环结论：统一入口已具备完整的历史收编能力；后续新增特性文档时，必须同步补入入口文档对应索引或总表。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`

### PI-005：入口文档承载过多正文，存在持续膨胀风险

- 首次暴露时间：2026-04-16
- 问题描述：若继续在入口文档堆积大段主线说明、详细边界和详细进展，后续会再次变成巨型汇总文档。
- 影响范围：
  - 公共入口失去可维护性
  - 特性文档职责被侵蚀
  - 后续更新成本不断上升
- 修正动作：
  - 把入口文档重构为“阶段判断 + 特性进展总表 + 问题入口 + 规则”
  - 明确详细设计、实施计划、详细进展由特性文档承载
- 当前状态：`closed`
- 闭环结论：入口文档职责已重新收口，后续如果发现详细内容重新回流到入口，必须作为新问题继续记录。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/progress-issue-log.md`

### PI-006：事项 / 特性缺少制度化增量规则，后续容易被删除或重写覆盖

- 首次暴露时间：2026-04-16
- 问题描述：若没有明确规则，后续维护者可能会删掉旧事项、替换旧名称，导致历史连续性丢失。
- 影响范围：
  - 历史决策不可追踪
  - 失效事项和替代关系消失
- 修正动作：
  - 在统一进展入口与问题记录文档中增加“只能新增不能删除”规则
  - 要求取消、失效、合并、替代都通过状态与闭环结论表达，而不是删记录
- 当前状态：`closed`
- 闭环结论：后续所有事项 / 特性与问题记录都按增量方式维护，删除行为视为违规修改。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/progress-issue-log.md`

### PI-007：问题修正过程未形成独立事项文档，容易重复踩坑

- 首次暴露时间：2026-04-16
- 问题描述：此前问题只散落在对话和临时修文过程中，没有形成长期可追溯的问题台账。
- 影响范围：
  - 后续同类错误难以被主动规避
  - 文档治理无法形成复盘闭环
- 修正动作：
  - 创建独立问题修改记录文档
  - 在统一进展入口中将其列为治理事项与关联文档
- 当前状态：`closed`
- 闭环结论：问题治理已从“会话记忆”升级为“仓库内文档资产”，后续新增问题必须延续该机制。
- 关联文档：
  - `docs/superpowers/plans/progress-issue-log.md`
  - `docs/superpowers/plans/unified-progress-baseline.md`

### PI-008：已标记 closed 的兼容主线仍暴露真实用户主路径缺口

- 首次暴露时间：2026-04-24
- 问题描述：在对已闭环事项按顺序复审时，发现 `OpenAI-compatible 兼容差异内化` 虽然已标为 `closed`，但真实用户主路径仍出现明显缺口，例如：
  - 新环境 setup 后执行 `ctr code` 仍可能回落到 `/login`
  - 本地部署的 OpenAI-compatible 接口如果只配置 base url，运行时不会自动归一到 `/chat/completions`
- 影响范围：
  - 新用户 fresh setup -> start -> code 主路径体验
  - 本地部署兼容接口与自定义 OpenAI-compatible 场景
  - legacy migration 后直接使用的真实可用性判断
- 修正动作：
  - 不回退原 `closed` 结论
  - 在统一进展入口中新增 `OpenAI-compatible 主路径兼容补强` 事项
  - 将已暴露问题与该新增事项显式关联，后续继续按用户视角扩大排查与回归覆盖
- 当前状态：`closed`
- 闭环结论：历史闭环结论保持不回退；同时通过新增 `OpenAI-compatible 主路径兼容补强` 事项，已补齐 `ctr code` 新环境代理凭证注入、OpenAI-compatible / Anthropic bare endpoint 归一，以及 fresh setup / doctor / runtime / legacy migration 的首轮真实用户流回归。当前已不再作为独立未闭环 P0 问题维护，后续剩余工作转入 CLI 稳定性与发布工程、配置产品化和持续复审校准伴随推进。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/specs/2026-04-06-unified-model-config-design.md`

### PI-009：已闭环事项的文档结论与当前实现链路发生漂移

- 首次暴露时间：2026-04-24
- 问题描述：复审时发现部分已闭环事项的文档结论与当前实现不再完全一致。例如：
  - 统一基线仍把统一 Router 运行时描述为包含 `legacy intent fallback`
  - 实际代码与测试已经转到 `smart_rule / semantic_match / smart_router`，legacy intent 已折入 SmartRouter semantic classifier
- 影响范围：
  - closed 事项的可追溯性和可信度
  - 后续实施计划、进展校准与新事项关联判断
  - 维护者对“代码现状 vs 历史闭环结论”的理解
- 修正动作：
  - 不回退原 `closed` 结论
  - 在统一进展入口中新增 `已闭环事项复审校准` 治理事项
  - 后续所有“closed 事项复审发现的描述漂移”统一由该事项承接，并要求在 issue log 中持续沉淀
- 当前状态：`in_progress`
- 闭环结论：当前阶段结论是“已建立专门承接机制，但首轮复审校准尚未完成”；后续需要把复审结果、文档校准动作和原闭环事务之间的关联长期维护下来，避免再次出现“代码已演进、闭环描述停留在旧状态”。
- 关联文档：
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md`
  - `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md`
