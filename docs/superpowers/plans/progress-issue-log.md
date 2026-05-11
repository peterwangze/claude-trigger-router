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
| PI-010 | 顶层 PLAN 指向已不存在的状态报告 | 2026-04-25 | closed | 项目目标与用户使用视角复审发现 `PLAN.md` 归档说明仍指向已不存在的 `docs/project-review-2026-03-24.md`；已修正为统一进展基线和本次复审实施计划，当前结论是“顶层归档入口已重新指向当前事实源，但后续仍需避免历史入口继续漂移” | `PLAN.md` ; `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` |
| PI-011 | `ctr ui` 第一屏闭环证据与真实启动路径不一致 | 2026-04-26 | closed | P1-2 复审发现 `/ui` 首屏测试使用完整 `initialConfig`，但生产启动只传 providers/HOST/PORT/LOG_FILE，导致真实首屏可能显示 `Models=0` 与 `Router.default=-`；已改为把完整运行配置传入 `createServer.initialConfig`，并补齐生产形状 initialConfig 与 HTML escape 回归测试 | `src/index.ts` ; `src/server.ts` ; `src/server.test.ts` ; `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` |
| PI-012 | validation issue contract 在纯 warning 字符串路径丢失 info 级别 | 2026-04-26 | closed | P1-3 复审发现 setup/doctor/server save 只拿到 warning 字符串时，会把 `supports_tools` / `supports_images` 这类非阻断 capability info 误归为 warning；已按 warning 文案恢复 info 级别，并补充 contract 与 server save 回归测试 | `src/utils/validation-contract.ts` ; `src/utils/validation-contract.test.ts` ; `src/server.test.ts` |
| PI-013 | 并发 agent 场景下中转请求路径存在同步持久化与重复配置读取放大 | 2026-04-30 | closed | 多 agent 并行请求时，复审确认中转侧确实存在可放大的性能风险：治理 trace 每次请求结束同步写盘，鉴权每次请求重新读取配置；已将 trace 持久化改为异步串行队列并补 flush，看护 `add()` 不同步写盘，同时把鉴权配置刷新改为并发合并 + 1 秒短缓存 | `src/governance/trace.ts` ; `src/governance/trace.test.ts` ; `src/index.ts` ; `src/index-startup.test.ts` |

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

### PI-010：顶层 PLAN 指向已不存在的状态报告

- 首次暴露时间：2026-04-25
- 问题描述：顶层 `PLAN.md` 已被标记为历史归档，但其归档说明仍将 `docs/project-review-2026-03-24.md` 列为当前项目权威文档；该文件在当前仓库中不存在，容易让新维护者或复审者进入失效路径。
- 影响范围：
  - 顶层历史计划的可信度
  - 当前统一进展入口的可发现性
  - 新维护者对“代码现状、README、进展台账”的判断路径
- 修正动作：
  - 将 `PLAN.md` 中的失效状态报告链接替换为 `docs/superpowers/plans/unified-progress-baseline.md`
  - 同步补入本次 `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md`
  - 在统一进展基线新增 `项目目标与用户使用视角复审` 条目，并列入近期执行顺序
- 当前状态：`closed`
- 闭环结论：顶层归档入口已重新指向当前事实源；后续若历史入口、README 或实施计划出现失效链接，必须继续增量追加到 issue log，而不是只在会话中修正。
- 关联文档：
  - `PLAN.md`
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md`

### PI-011：`ctr ui` 第一屏闭环证据与真实启动路径不一致

- 首次暴露时间：2026-04-26
- 问题描述：P1-2 复审发现 `/ui` 第一屏闭环证据只覆盖了测试中手工注入完整 `initialConfig` 的路径；真实 `src/index.ts` 启动服务时只传入 compiled providers、HOST、PORT 和 LOG_FILE，未把 `Models` 与 `Router.default` 传给 `createServer`。同时，`Router.default` 等服务端状态值直接拼入 HTML，存在本地管理 UI 被配置值污染的风险。
- 影响范围：
  - `ctr ui` 新用户第一屏对“默认模型是谁、当前配置是否可用”的判断
  - P1-2 闭环证据与真实生产路径的一致性
  - 本地管理 UI 对用户可控配置值的安全呈现
- 修正动作：
  - 新增 `buildServerInitialConfig`，在生产启动时保留完整运行配置并叠加 compiled providers、实际 HOST/PORT 和 LOG_FILE
  - 对 `/ui` 服务端渲染的状态值增加 HTML escape
  - 补充生产形状 initialConfig 回归测试和恶意配置值转义测试
- 当前状态：`closed`
- 闭环结论：真实启动路径、首屏状态证据和安全呈现已经补齐到同一条 P1-2 用户路径；后续若继续调整 `/ui` 第一屏，必须同时覆盖生产形状数据源与用户可控配置值转义。
- 关联文档：
  - `src/index.ts`
  - `src/server.ts`
  - `src/server.test.ts`
  - `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md`

### PI-012：validation issue contract 在纯 warning 字符串路径丢失 info 级别

- 首次暴露时间：2026-04-26
- 问题描述：P1-3 复审发现共享 validation issue contract 在收到 structured capability warning report 时能保留 `warn` / `info`，但 setup、doctor 和 server save 等路径只传入 `normalizeAndValidateConfig(...).warnings` 字符串数组时，会把所有 capability 提示统一归为 `warning`。
- 影响范围：
  - `supports_tools=false` 与 `supports_images=false` 这类非阻断提示会被误呈现为 warning
  - setup / doctor / UI save 的提示 contract 与 compiled preview 的 severity 语义不一致
  - P1-3 “error 必须修、warning 可接受、info 仅提示”的闭环证据不完整
- 修正动作：
  - 在 `buildValidationIssueReport` 中按 capability warning 文案推断纯字符串路径的 severity
  - 将 tools/images fallback 文案恢复为 `info`，thinking ignored 继续保持 `warning`
  - 补充 validation contract 单元测试与 server save 回归测试
- 当前状态：`closed`
- 闭环结论：纯字符串 warning 与 structured capability warning 两条路径现在都能保持同一 severity 语义；后续新增 capability warning code 时，需要同步补充 contract 映射和回归测试。
- 关联文档：
  - `src/utils/validation-contract.ts`
  - `src/utils/validation-contract.test.ts`
  - `src/server.test.ts`

### PI-013：并发 agent 场景下中转请求路径存在同步持久化与重复配置读取放大

- 首次暴露时间：2026-04-30
- 问题描述：并行启动多个 agent 时，Claude 端感知 API 响应变慢。复审请求中转路径后确认，中转侧存在会在并发下放大的本地开销：
  - 非流式治理 trace 每次 `recordGovernanceTrace()` 都会同步 `writeFileSync` 最近 trace 到磁盘，阻塞 Node 事件循环
  - 鉴权 middleware 每个请求都会调用 `readConfigFile()` 刷新 `APIKEY/Auth`，并发请求会重复读取同一份配置
- 影响范围：
  - 多 agent 并行调用 `/v1/messages`
  - server/cloud 模式下 managed key 鉴权和治理 trace 均开启时的尾延迟
  - 本地代理在高并发非流式请求下的事件循环抖动
- 修正动作：
  - `GovernanceTraceStore.add()` 改为只更新内存 LRU，并通过 debounce + Promise queue 异步串行落盘
  - 新增 `flushPersistence()`，用于测试和进程退出时显式刷盘
  - `SIGINT` / `SIGTERM` 退出路径先 flush trace 持久化，再退出；保留 500ms 兜底退出
  - 启动入口的鉴权配置读取改为并发合并与 1 秒短缓存，减少高并发请求重复读配置
  - 补充 trace 异步落盘回归测试与 auth config 并发合并 startup wiring 测试
- 当前状态：`closed`
- 闭环结论：已确认“并发 agent 感知变慢”不能简单归因于上游 API；中转侧存在请求路径同步写盘和重复配置读取两个可放大点，并已完成首轮止血。后续若仍有慢感，应继续用 trace latency、上游耗时、stream 首包时间和并发压测拆分 CTR overhead 与上游 API latency。
- 关联文档：
  - `src/governance/trace.ts`
  - `src/governance/trace.test.ts`
  - `src/index.ts`
  - `src/index-startup.test.ts`

### PI-014：多模型上下文窗口差异缺少运行时容量契约

- 首次暴露时间：2026-04-30
- 问题描述：多模型配置下，不同上游模型支持的上下文窗口不同；`ctr code` 启动 Claude Code 时没有按最终路由模型声明上下文预算，服务端也只有全局 `Router.longContextThreshold`，缺少模型级容量判断。设置过小会浪费大上下文模型，设置过大会让小窗口模型在上下文阶段截断、报错或输出质量劣化。
- 影响范围：
  - 同一会话在 `Router.default`、`Router.longContext`、SmartRouter 规则和候选模型之间切换
  - 小窗口快速模型与大窗口高质量模型混用时的上下文完整性
  - Claude Code 多 agent / 长会话请求的稳定性和可解释失败
- 修正动作：
  - `Models[].metadata` 增加 `context_window_tokens` 与 `safe_input_tokens` 能力声明，并纳入配置校验
  - compiled model capabilities 暴露模型级上下文窗口能力，registration pool endpoint 也继承同一能力
  - router 在最终定模后按 `input + max_tokens + thinking budget` 评估容量；已选模型放不下时优先切到 `Router.longContext`
  - 若没有可承载模型，在转发上游前返回 413 `context_window_exceeded`，避免隐性截断或小模型质量劣化
  - `/ui` Models 表单、README、高级配置和 configuration guide 补充上下文窗口字段与使用说明
- 当前状态：`closed`
- 闭环结论：当前阶段已形成“模型级声明 -> 编译能力 -> 路由容量保护 -> 明确错误”的最小闭环。后续若要进一步减少 Claude Code 客户端侧预算浪费，需要继续研究 Claude Code 是否暴露可控上下文窗口启动参数；若暴露，应让 `ctr code` 根据配置选择保守默认或长上下文 profile。
- 关联文档：
  - `src/trigger/types.ts`
  - `src/models/compile.ts`
  - `src/router/index.ts`
  - `src/index.ts`
  - `README.md`
  - `docs/configuration-guide.md`

### PI-015：模型池健康状态重启丢失且缺少维护者运营视图

- 首次暴露时间：2026-05-01
- 问题描述：P2-4 同模型多源池化已具备 priority、fallback、cooldown、熔断、延迟窗口和 least-latency，但健康状态仍只在进程内存中，服务重启后会丢失 endpoint 的失败计数、冷却/熔断窗口和延迟样本；维护者也只能从 compiled models 的 endpoint 行间接查看状态，缺少独立的 pool health 运营入口。
- 影响范围：
  - server/cloud 模式下重启后短期故障 endpoint 可能重新参与调度
  - least-latency 策略会在重启后丢失已有延迟窗口，短时间内退回 priority
  - 维护者排查多源池慢请求、熔断和 fallback 时缺少聚合视图
- 修正动作：
  - `ModelPoolHealthStore` 新增 `hydrate()`、`exportForPersistence()` 和变更监听器，持久化 failure/success/cooldown/circuit/latency samples
  - 启动入口加载配置目录下的 `model-pool-health.json`，运行中 debounce 后异步串行落盘，退出时与治理 trace 一起 flush
  - 新增 `GET /api/models/pool-health` 只读 API，返回 pool summary、active endpoint、endpoint status、失败/成功计数、恢复时间和延迟窗口
  - `/ui` 维护者工作台新增 Model pool health 区块，展示 healthy/cooldown/open 摘要和 endpoint 明细
  - 补充 store hydrate/export、变更监听和 server API 回归测试
- 当前状态：`closed`
- 闭环结论：P2-4 已从“可运行但重启丢状态”的内存 health 推进到“可恢复、可观测、可维护”的最小运营闭环；后续继续补主动健康探测、成本/速率元数据和更丰富调度策略。
- 关联文档：
  - `src/models/pool-health.ts`
  - `src/models/pool-health-persistence.ts`
  - `src/index.ts`
  - `src/server.ts`
  - `src/ui/workbench.ts`
  - `src/models/pool-health.test.ts`
  - `src/server.test.ts`

### PI-016：远程客户端配置只有状态探测，模型调用仍无法通过本地 ctr 进入远端服务

- 首次暴露时间：2026-05-01
- 问题描述：`Runtime.remote_service` 已能表达远程服务地址、token、ready/status 和 registration 摘要，但本地 `ctr code` 启动后模型调用仍会进入本地路由链路；对于没有本地 `Models` 的远程客户端 profile，这会导致“状态显示远端 ready，但实际请求没有发往远端服务”的割裂体感。
- 影响范围：
  - 远程使用者选择 setup 的“连接远程服务”路径后继续使用 `ctr code`
  - 本地无模型配置、只依赖远端服务端模型池的客户端
  - 远程客户端的文档、status 和实际请求路径一致性
- 修正动作：
  - 启动入口新增 local remote-client 请求转发 hook：本地认证通过后，将 `/v1/messages` 与 `/v1/chat/completions` 转发到 `Runtime.remote_service.base_url`
  - 远端转发保留原请求 query string，避免代理层改写带参数的模型接口请求
  - 转发时使用 `Runtime.remote_service.auth_token` 作为远端 Authorization，并设置 `x-ctr-remote-forward: 1` 避免误循环
  - 远端转发请求标记为 `remoteForwarded`，不再进入本地 SmartRouter、agent、上下文容量治理和 onSend governance，避免“双路由”
  - 转发失败时返回结构化 `502 remote_service_unavailable`
  - 更新 remote client guide、configuration guide、角色提示和实施计划
- 当前状态：`closed`
- 闭环结论：远程客户端路径已从“只会配置和探测远端状态”推进到“本地 ctr 可作为远端 CTR 的薄代理转发模型调用”的最小闭环；后续继续补注册同步、服务发现、节点/集群编排和更完整服务模式。
- 关联文档：
  - `src/index.ts`
  - `src/index-startup.test.ts`
  - `src/runtime-role-guidance.ts`
  - `src/server.ts`
  - `docs/remote-client-guide.md`
  - `docs/configuration-guide.md`

### PI-017：远程客户端缺少远端注册摘要同步，无法确认远端模型池边界

- 首次暴露时间：2026-05-02
- 问题描述：远程客户端路径已经能探测远端 service info 并转发模型调用，但 `/api/remote-status` 没有同步远端 `/api/registration` 摘要；使用者打开本地 `/ui` 只能看到远端 ready，无法确认远端服务端当前注册了多少模型和 upstream 服务。
- 影响范围：
  - 远程使用者选择“连接远程服务”后查看本地 `/ui`
  - 服务维护者向远程客户端发放 managed client + read-only key 后的可见性验证
  - 后续服务发现和更完整服务模式的只读状态基础
- 修正动作：
  - 新增远端 `/api/registration` 只读探测 helper，复用 `Runtime.remote_service.auth_token`
  - `/api/remote-status` 同时返回 `remoteRegistration`，包含 reachable / available、远端注册模型数、upstream 服务数和脱敏列表
  - `/ui` 首屏新增 Remote registration 状态，展示远端注册摘要
  - 更新 configuration guide、remote client guide、统一基线和实施计划，明确当前是只读摘要同步，不写回本地配置
- 当前状态：`closed`
- 闭环结论：远程接入已从“ready/status + 模型调用转发”推进到“可确认远端注册边界”的最小只读同步；后续仍需服务发现、节点/集群编排和托管控制面，不在本轮宣称支持。
- 关联文档：
  - `src/service-health.ts`
  - `src/server.ts`
  - `src/ui/workbench.ts`
  - `src/service-health.test.ts`
  - `src/server.test.ts`
  - `docs/remote-client-guide.md`
  - `docs/configuration-guide.md`

### PI-018：远端注册摘要把接口可达和 Registration 启用状态混在一起

- 首次暴露时间：2026-05-02
- 问题描述：PI-017 首轮实现中，远端 `/api/registration` 可达时会把 `remoteRegistration.enabled` 当作远程服务启用状态使用，没有单独暴露远端 `Registration.enabled`；当远端注册接口可达但注册配置关闭时，本地 `/ui` 会显示 `0 remote models / 0 upstream`，容易让使用者误以为远端注册已启用但为空。
- 影响范围：
  - 远程客户端 `/api/remote-status` 的状态解释
  - `/ui` 首屏 Remote registration 状态
  - 维护者判断“远端注册关闭”与“远端注册为空”的差异
- 修正动作：
  - `probeRemoteRegistrationStatus()` 新增 `registrationEnabled` 字段，保留 remote service enabled、registration endpoint available 和 remote Registration.enabled 三层状态
  - `/ui` 在远端 registration endpoint 可达但 `registrationEnabled=false` 时显示 `remote registration disabled`
  - 补充远端注册关闭但接口可达的回归测试
- 当前状态：`closed`
- 闭环结论：远端注册摘要现在能区分“远程服务已配置”“注册接口可达”和“远端 Registration 已启用”，避免把关闭状态误呈现为空模型池。
- 关联文档：
  - `src/service-health.ts`
  - `src/service-health.test.ts`
  - `src/server.test.ts`
  - `src/ui/workbench.ts`

### PI-019：维护者 API 只有 admin 边界，日常运维需要过度暴露服务所有者 key

- 发现时间：2026-05-02
- 严重级别：P1
- 现象：服务端鉴权已具备 admin/client/read-only 和 quota，但重启、治理快照、异常阈值、归档删除等日常运维写操作仍与配置保存、auth key 管理共享 admin 边界。
- 影响范围：
  - 服务提供者把日常值守能力交给维护者时需要暴露 bootstrap/admin key
  - server/cloud 一键部署默认安全策略无法给出最小权限运维路径
  - `/ui` 和 README 的鉴权指导无法区分服务所有者与日常运维者
- 修正动作：
  - 新增 managed `operator` scope
  - `operator` 允许 read-only 状态接口以及重启、治理指标快照、定时快照、异常阈值和治理归档删除
  - `operator` 继续禁止 `/ui`、配置读取/保存和 auth key 管理
  - 更新 README、配置指南、服务维护者指南、UI scope guide 和统一基线
- 当前状态：`closed`
- 闭环结论：服务所有者 key 与日常运维 key 已完成最小权限拆分；后续继续补部署默认安全策略、密钥轮换和托管场景维护手册。
- 关联文档：
  - `src/auth/api-keys.ts`
  - `src/middleware/auth.ts`
  - `src/ui/workbench.ts`
  - `README.md`
  - `docs/server-maintainer-guide.md`
  - `docs/configuration-guide.md`

### PI-020：managed key scope 校验与运行时授权的 trim 口径不一致

- 发现时间：2026-05-03
- 严重级别：P1
- 现象：`validateManagedApiKeyScopes()` 会 trim scope 字符串，因此手写配置中的 `operator ` / `read-only ` 能通过校验；但运行时 `scopeAllows()` 直接对原始数组做 `includes()`，导致同一配置校验通过却无法授权。
- 影响范围：
  - 手工编辑 `Auth.managed_keys[].scopes` 的服务维护者
  - 新增 `operator` scope 的日常运维授权路径
  - `/api/service-info` 与 `/ui` 中 managed key scope 脱敏展示的一致性
- 修正动作：
  - 新增运行时 scope 归一化，授权前统一 trim 并只保留已知 scope
  - `verifyApiKey()` 返回归一化后的 scopes，审计和 quota 摘要不再带原始空白
  - `sanitizeManagedApiKey()` 输出归一化 scopes
  - 补充 `operator ` / `read-only ` 校验通过且运行时授权可用、未知 scope 不会默认提升为 client 的回归测试
- 当前状态：`closed`
- 闭环结论：managed key scope 的配置校验、运行时授权、审计输出和 UI/API 脱敏展示已统一到同一归一化口径，operator 最小权限路径不再因手写空白字符失效。
- 关联文档：
  - `src/auth/api-keys.ts`
  - `src/auth/api-keys.test.ts`
  - `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md`

### PI-021：项目复审计划与统一基线未同步 v1.4.0 后的当前事实

- 发现时间：2026-05-11
- 严重级别：P3
- 现象：2026-04-25 复审计划中的“下一项”仍停留在补 LLM 裁判 / benchmark summary 的口径，而代码和统一基线已经显示 `ctr eval --judge-model`、人工/外部裁判字段和 `/ui` benchmark summary 已落地；统一基线中 `server/cloud 一键部署与角色化运维入口` 也仍描述为 planned / 缺一键部署命令，但当前已经有 `ctr deploy init --target server`、setup 服务端路径、Docker/systemd 模板和角色手册。
- 影响范围：
  - 后续按“计划优先级继续推进”时可能重复做已闭环事项
  - 维护者可能低估当前 server deploy / role guide 的已实现边界，或误判 v1.5 / v1.6 的下一步
  - 项目目标复审入口与版本计划入口之间出现事实漂移
- 修正动作：
  - 在 `2026-04-25-project-goal-user-review-implementation.md` 追加 2026-05-11 再复审章节，重新归档项目目标、高频功能稳定性/易用性、架构压力和看护优先级
  - 修正该实施计划中“下一项”口径，明确 v1.5.0 先做入口基础功能稳定与易用性巩固，人工校准 UI 表单和 benchmark 历史看板顺延到 v1.6.0，而不是再补已完成的 LLM 裁判入口
  - 将统一基线的 `server/cloud 一键部署与角色化运维入口` 从 planned 校准为 in_progress，并补充当前已有 deploy init、Docker/systemd、角色手册和 status/doctor/UI 角色表达
  - 将统一基线的 `项目目标与用户使用视角复审` 更新为 2026-05-11 的最新校准结论
- 当前状态：`closed`
- 闭环结论：复审计划、统一基线和版本路线已重新对齐到 v1.4.0 后的当前事实；后续默认按 2026-05-11 入口基础功能稳定优先的发布计划推进，若再发现事实漂移，需要继续通过 issue log 记录并同步入口文档。
- 关联文档：
  - `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md`
  - `docs/superpowers/plans/unified-progress-baseline.md`
  - `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md`
