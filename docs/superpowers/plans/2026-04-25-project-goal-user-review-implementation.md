# 项目目标与用户使用视角复审实施计划

## 文档定位

本文档记录 2026-04-25 对 Claude Trigger Router 的一次横向复审，复审角度不是单点 bug，而是：

- 项目目标是否仍然清晰
- 用户主路径是否足够顺
- 当前架构是否支撑后续产品化
- 实现与看护体系是否能稳定承接发布和长期维护

本计划承接到统一进展基线：

- `docs/superpowers/plans/unified-progress-baseline.md`

## 一、复审结论

当前项目已经从“触发路由原型”进入“本地 Claude Code 路由代理产品化”阶段。核心目标清晰：用本地服务接管 Claude Code 上游请求，并用统一 `Models + Router + SmartRouter + Governance` 心智完成配置、路由、协议兼容与治理观测。

首轮结论：

- 运行时底座基本扎实：CLI、setup、doctor、模型编译、协议分发、SmartRouter、治理 trace / metrics 都已有实现和测试。
- 用户主路径已经能讲清楚：`ctr setup -> ctr start -> ctr code` 是合理入口，`ctr doctor` 和 `ctr ui` 承担诊断与调试。
- 主要风险不在“有没有能力”，而在“能力入口是否统一、能否被用户自然理解、后续是否容易改”。
- 架构上最大的维护压力集中在 `src/server.ts` 和 `src/index.ts`：服务 API、配置草稿、内联 UI、治理观测和运行时编排过度集中。
- 看护体系已有明显基础，但 coverage 配置仍偏向 trigger 早期阶段，UI / API / setup / packaged CLI 的长期契约需要继续显式化。

## 二、用户主路径复审

### 当前推荐路径

用户从零开始的理想路径应当是：

1. `npm install -g @peterwangze/claude-trigger-router`
2. `ctr setup`
3. `ctr start` 或 `ctr start --daemon`
4. `ctr status`
5. `ctr code`
6. 遇到问题时运行 `ctr doctor`
7. 需要查看配置和治理状态时打开 `ctr ui`

### 当前优势

- README 已经把 `ctr setup` 放在最推荐入口，符合新用户心智。
- `setup` 已覆盖复用、迁移、fresh setup、repair、rebuild 等关键路径。
- `doctor` 已从“配置校验”扩展到可解释兼容策略、低风险修复和模型探测。
- packaged CLI E2E / acceptance 已覆盖很多真实用户路径，这是项目很值得保留的护城河。

### 当前摩擦

- 复审时 `ctr ui` 文案仍以“简易 Governance Trace 调试页”为第一印象，但页面已经承载配置草稿、compiled models、capability warning、治理指标等多种职责；这会让普通使用者误以为 UI 只是维护者调试页。
- README、configuration guide、setup 输出、UI 页面之间虽然都在讲 `Models`，但“使用者入口”和“维护者入口”尚未分层。
- 顶层 `PLAN.md` 仍指向已不存在的状态报告路径，容易让维护者误判当前权威文档。
- 远程部署、双层 UI、治理运营化都已立项，但还没有成为用户可直觉进入的产品路径。

## 三、架构与实现复审

### 1. CLI / setup / doctor

判断：方向正确，仍应作为主入口继续收口。

证据：

- `src/cli.ts` 已覆盖 `setup / doctor / init / start / stop / restart / status / version / upgrade / code / ui`。
- `src/setup` 和 `src/doctor` 有独立模块与较完整测试。
- `docs/cli-test-matrix.md` 已把真实命令行为纳入发布门禁。

主要风险：

- CLI 文案、README、UI 仍可能各自演进，导致同一能力出现不同术语。
- `ctr ui` 当前在服务未运行时只提示启动服务，尚未成为 setup / doctor 的自然延伸入口。

### 2. 统一模型配置与协议分发

判断：已具备产品化底座，应继续围绕用户理解而不是内部 provider 细节收口。

证据：

- `src/models/compile.ts` 已提供 `Models[]` 到内部 provider/model map 的编译层。
- `src/protocols` 已有 message IR 与 OpenAI / Anthropic 分发转换。
- `src/utils/config.ts` 已承担 normalize、validate、warning 与兼容旧格式。

主要风险：

- 兼容画像、dispatch format、capability fallback 对维护者有价值，但对普通用户应以“会发生什么、怎么修”表达。
- 配置验证逻辑和 UI 草稿保存逻辑分散在 `utils/config.ts`、`server.ts`、setup 模块之间，后续容易出现同一字段在不同入口表现不一致。

### 3. SmartRouter 与治理链路

判断：运行时主链已形成，但文档与命名仍残留历史层级。

证据：

- `src/trigger/index.ts` 明确说明 `TriggerRouter` 类名保留为兼容导出，运行时 contract 已以 SmartRouter 为统一入口。
- `src/trigger/selector.ts` 已形成 `smart_rule -> semantic_match -> smart_router -> sticky_correction` 的实际决策链。
- `src/governance` 已提供 trace、metrics、cascade、shadow、alignment 等看护模块。

主要风险：

- 文档中仍容易出现 TriggerRouter / SmartRouter / Governance 三套心智并列，让用户不清楚“该配哪一个”。
- 语义路由、sticky、alignment 等增强能力对用户价值很高，但需要在 UI 中变成可解释状态，而不是只存在 trace 细节里。

### 4. Server 与 UI

判断：这是当前最需要治理的架构瓶颈。

证据：

- `src/server.ts` 约 1988 行，同时包含 API 路由、配置草稿转换、治理指标接口、内联 HTML、CSS 和大量前端 JavaScript。
- `/ui` 页面已经很有功能含量，但仍作为字符串拼接写在服务端文件中。
- `src/index.ts` 同时承担服务启动、认证、SmartRouter、Agent、旧路由、协议分发、响应治理和 SSE 工具循环。

主要风险：

- UI 每次增强都要触碰后端服务大文件，回归面大。
- 页面交互难以做稳定的 DOM / browser-level 测试。
- 服务 API 与 UI 表现层耦合，会拖慢“双层工作台”和远程部署形态的推进。

### 5. 看护与发布

判断：基础很好，但需要从“已有测试很多”升级为“关键契约显式可守”。

证据：

- 当前有 40 个 `.test.ts`，并且存在 `cli-e2e`、`cli-acceptance`、release verify、release stage。
- `docs/releasing.md` 已形成发布前验证路径。
- `vitest.config.ts` 的 coverage 当前只 include `src/trigger/**/*.ts`，与当前项目重心已经不完全匹配。

主要风险：

- coverage 口径停留在早期 trigger 阶段，无法反映 CLI/setup/server/protocol/governance 的真实看护水平。
- UI 目前更多靠 server test 的 HTML 字符串断言支撑，缺少真实浏览器或 DOM 交互契约。
- 新增能力若没有同步更新 `docs/cli-test-matrix.md` 和 release verify slice，发布门禁会逐步失真。

## 四、优先级实施计划

### P0：基础功能闭环

当前复审未发现新的独立 P0 主线。

触发重新升 P0 的条件：

- `ctr setup -> ctr start -> ctr code` 任一步在 fresh 环境中不可用。
- OpenAI-compatible / Anthropic 主链路出现新的请求分发阻塞。
- legacy migration 迁移后不能生成可启动配置。
- 配置保存或 repair 会破坏用户已有可用配置。

### P1：主路径易用性

P1-1：修正权威入口与文档漂移

- 修正顶层 `PLAN.md` 中失效的状态报告路径。
- README、configuration guide、setup 输出继续围绕 `Models + Router.default + SmartRouter` 统一心智。
- 把“当前项目状态看哪里”固定到 `unified-progress-baseline.md` 和本计划。

验收：

- 顶层文档不再指向不存在的 project review。
- 新维护者能从 README / PLAN / unified baseline 进入同一个当前事实源。

P1-2：把 `ctr ui` 从调试页收口为使用者入口

- 将 `/ui` 第一屏从“Governance Trace 调试页”调整为“配置与状态工作台”心智。
- 保留治理 trace，但把配置状态、当前服务、当前模型、下一步操作放到更靠前位置。
- 把维护者观测能力放到独立区域或标签，避免普通用户一进来被 trace 细节淹没。

验收：

- 新用户打开 `ctr ui` 时能先看到当前配置是否可用、默认模型是谁、服务是否 ready。
- 维护者仍能进入治理 trace / metrics / archives。

P1-3：统一 setup / UI / config save 的验证与提示 contract

- 将 capability warning、model reference impact、repair 建议统一为可复用解释结构。
- UI 保存配置、setup 生成配置、doctor repair 尽量复用同一 normalize / validate / warning 输出。
- 把“错误必须修、warning 可接受、info 仅提示”作为各入口一致规则。

验收：

- 同一份配置在 setup、doctor、UI preview、server save 中不会出现互相矛盾的提示。
- 关键 warning 都有用户可执行的修复建议。

P1-4：拆出 UI 静态资源与 server API 边界

- 先把 `/ui` 的 HTML/CSS/JS 字符串移出 `src/server.ts`，不急于引入复杂前端框架。
- API 路由保留在服务层，UI 渲染资源独立成可测试文件。
- 建立最小 browser smoke 或 DOM 测试，覆盖加载配置、预览 compiled models、保存配置失败提示。

验收：

- `src/server.ts` 不再承担大段内联 UI 字符串。
- UI 修改不需要同时理解治理 metrics API 的服务端实现。

### P2：能力扩展与体验增强

P2-1：UI 双层工作台继续落地

- 使用者工作台：配置、模型、路由、服务状态、下一步。
- 维护者工作台：trace、metrics、archives、anomaly tuning、export。
- 两者共享同一 service context，不再混成单页调试台。

验收：

- 用户能明确知道自己在“使用配置”还是“维护观测”。
- 现有 `/api/governance/*` 能力仍可达。

P2-2：部署形态与远程接入最小闭环

- 先定义本地代理、远程服务、客户端连接三种状态的服务信息 contract。
- `ctr status / doctor / ui` 都能展示本地或远程连接状态。
- 保证默认本地路径不被远程能力复杂化。

验收：

- 新用户仍可只用本地模式。
- 远程模式至少具备状态查询、配置说明和失败诊断入口。

P2-3：治理观测运营化

- 将 trace / metrics / anomaly 从“能看”升级为“能判断是否健康”。
- 增加面向维护者的健康摘要，例如近期路由命中、异常率、慢请求、模型切换原因。
- 与输入侧优化继续对齐，让 Prompt / Intent Optimization 能沉淀到同一 trace 和 metrics 口径。

验收：

- 维护者能通过 UI 或 API 判断路由是否稳定。
- 异常阈值、快照、归档不只是功能存在，而是有日常操作路径。

### P3：治理支撑与持续维护

P3-1：扩大 coverage 口径

- 将 coverage 从仅 `src/trigger/**/*.ts` 扩展到至少覆盖 `setup / utils/config / models / protocols / governance` 的核心模块。
- 不强求一次性高覆盖率，先建立合理 include/exclude 和基线数字。

验收：

- coverage 报告能反映当前项目主链，而不是早期 trigger 子系统。

P3-2：保持 CLI / release 看护矩阵同步

- 新增用户可见命令、setup 分支、UI 主路径或远程部署入口时，同步更新 `docs/cli-test-matrix.md`。
- release verify 的真实用户流继续优先保护 `setup -> start/status -> code/ui -> doctor`。

验收：

- 每个新增用户路径都有测试层级归属。

P3-3：持续 closed 事项复审

- 延续 `已闭环事项复审校准` 机制。
- 发现文档与实现漂移时，不回退历史 closed 结论，而是新增校准事项或补充计划关联。

验收：

- closed 事项的当前结论能追到现有代码和测试证据。

## 五、近期执行顺序

建议近期按以下顺序推进：

| 顺序 | 优先级 | 事项 | 先做什么 | 原因 |
|---|---|---|---|---|
| 1 | P1 | 修正权威入口与文档漂移 | 更新顶层 `PLAN.md`，确保统一基线和本计划可被发现 | 这是低成本高收益，能立刻改善维护者入口 |
| 2 | P1 | `ctr ui` 使用者入口收口 | 调整第一屏信息架构，突出配置、服务、模型和下一步 | UI 已经是用户会打开的命令，不能长期只像调试页 |
| 3 | P1 | setup / UI / doctor 提示 contract | 抽出共享 warning / validation 解释结构 | 减少同一配置在不同入口表现不一致 |
| 4 | P1 | UI 静态资源拆出 | 先做无框架拆分和最小 smoke 测试 | 降低 `server.ts` 继续膨胀带来的改动风险 |
| 5 | P2 | UI 双层工作台 | 基于拆分后的 UI 做使用者 / 维护者分层 | 避免只做视觉改版而没有产品边界 |
| 6 | P2 | 部署形态与远程接入 | 定义 service info / remote status contract | 远程能力需要稳定状态表达，不能直接压到用户主入口 |
| 7 | P2 | 治理观测运营化 | 增加健康摘要和日常维护路径 | 已有 trace/metrics 基础，下一步是可运营 |
| 8 | P3 | coverage 口径扩展 | 先建立新 coverage include/exclude 与基线 | 让看护报告跟上项目重心 |
| 9 | P3 | release / CLI 看护同步 | 新增路径随功能一起补矩阵 | 防止发布门禁逐步失真 |

## 六、本轮闭环记录

### 2026-04-25 P1 闭环

- P1-1 `修正权威入口与文档漂移`：已在首个审查归档提交中修正顶层 `PLAN.md` 的失效状态报告入口，并将统一进展基线和本计划作为当前事实源；同时已在 `progress-issue-log.md` 追加 PI-010。
- P1-2 `把 ctr ui 从调试页收口为使用者入口`：已将 `/ui` 第一屏改为“配置与状态工作台”，展示服务状态、端口、模型数量、`Router.default`，并保留维护者观测区域进入 Governance Trace / metrics。
- 运行时闭环描述校准：已将统一基线中的统一 Router 运行时链路从旧的 `legacy intent fallback` 口径校准为当前 `smart_rule -> semantic_match -> smart_router -> sticky_correction` 口径。
- 看护补充：已更新 `/ui` HTML 渲染测试，覆盖新的状态工作台入口、状态字段和首屏操作按钮。
- 复审补强：已闭环 P1-2 复审发现的真实启动路径偏差，`src/index.ts` 现在会把完整运行配置传给 `createServer.initialConfig`，避免生产 `/ui` 首屏缺失 `Models` 和 `Router.default`；同时已对 `/ui` 服务端状态插值做 HTML escape，并补充生产形状 initialConfig 与恶意配置值回归测试。
- P1-3 `统一 setup / UI / config save 的验证与提示 contract`：已新增共享 validation issue contract，将 schema error、capability warning、path、severity 与 action 归一为同一结构；server preview/save API 返回 `issueReport`，`/ui` 预览与保存失败/告警展示同一 action，setup 与 doctor 输出也改用同一格式化结果。
- P1-3 复审补强：已闭环纯 warning 字符串路径丢失 `info` severity 的问题，`supports_tools` / `supports_images` fallback 在 setup、doctor、server save 与 UI save 中仍按 info 呈现，并已追加 PI-012 与回归测试。
- P1-4 `UI 静态资源拆出`：已将 `/ui` 大段 HTML/CSS/JS 渲染从 `src/server.ts` 移入 `src/ui/workbench.ts`，`server.ts` 只保留 `/ui` 路由注册、Content-Type 与初始状态注入；这一步先完成职责边界拆分，后续更细的 CSS/JS 文件化可并入 UI 双层工作台收敛继续推进。
- P2-1 `UI 双层工作台继续落地`：已在 `/ui` 增加“使用者工作台 / 维护者工作台”顶层 surface 切换；默认停留在使用者工作台，承载配置草稿、模型、路由、compiled preview 与保存动作，维护者工作台独立承接 Governance Trace、metrics、异常阈值、快照和归档，现有 `/api/governance/*` 能力仍可达。
- P2-2 `部署形态与远程接入最小闭环`（Chunk 1）：已新增 `Runtime.mode`、`Runtime.remote_service` 与 `Registration` 的保守归一化/校验，默认仍为 `local`；同时新增 `/api/service-info` 暴露 runtime mode、service role、remote enabled 与 registration 摘要，为后续 remote status / setup / doctor / UI 对齐提供稳定 contract。
- P2-2 复审补强：已修正 `/api/config` 保存路径遗漏 `Runtime` / `Registration` 的问题，确保用户显式配置的运行形态与远程注册摘要不会在保存时被静默丢弃；未配置时仍不写入默认远程块，避免污染本地默认配置。
- P2-2 `部署形态与远程接入`（Chunk 2）：已新增远程服务配置草稿 `buildRemoteServiceConfig()`，支持 base URL、auth token placeholder 与 `Runtime.mode = local` 的远程连接心智；校验层允许启用 remote service 的 client 草稿不带本地 `Providers` / `Router.default`。同时新增 `/api/remote-status`，以一个 contract 返回 remote health、compiled model count/capability summary 与 governance alert summary。
- P2-2 Chunk 2 复审补强：已收紧 remote status contract，返回的 remote `baseUrl` 统一去除尾部斜杠，并补齐 `/api/remote-status` 在 remote service 已启用时的服务端集成断言，覆盖 `/api/service-info` 探测路径和 bearer token 透传。
- P2-3 `治理观测运营化`（Chunk 1）：已在治理 metrics 报告中新增 `health` 摘要，将 trace 样本数、异常数量、critical/warn 计数、关键命中率、平均延迟、Top route / model 和可执行 action 收口为 `idle / healthy / watch / critical` 状态；同时新增 `/api/governance/health` 维护者健康查询，并在 `/ui` 维护者 metrics 区优先展示 Health 状态。

下一项按优先级继续推进：

- P2-3 `治理观测运营化` Chunk 2：将健康摘要进一步接入日常维护路径，包括 UI 告警说明、README/配置文档口径和 release/CLI 看护矩阵同步。

## 七、关联文件

本次复审重点参考：

- `README.md`
- `PLAN.md`
- `docs/configuration-guide.md`
- `docs/cli-test-matrix.md`
- `docs/releasing.md`
- `docs/superpowers/plans/unified-progress-baseline.md`
- `docs/superpowers/plans/progress-issue-log.md`
- `src/cli.ts`
- `src/index.ts`
- `src/server.ts`
- `src/setup/`
- `src/doctor/`
- `src/trigger/`
- `src/models/`
- `src/protocols/`
- `src/governance/`
