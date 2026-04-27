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

## 五、首轮近期执行顺序

以下是 2026-04-25 首轮复审后的推进顺序。2026-04-27 智能路由与服务化复审已经在本文第七节追加新的依赖判断和优先级重排；后续执行以第七节和 `unified-progress-baseline.md` 的最新顺序为准。

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
- P2-3 Chunk 1 复审补强：已修正 `health.message` 只按 critical 或 warning 单类数量描述告警的问题，改为总告警数加 critical / warning 明细，避免维护者低估当前治理风险；同时将 `/api/governance/health` 补入 `/ui` 管理 API 列表和统一基线治理观测口径。
- P2-3 `治理观测运营化`（Chunk 2）：已将 Health 摘要接入日常维护路径，`/ui` 维护者工作台展示健康状态、说明和 action；README 与 configuration guide 说明 `idle / healthy / watch / critical` 语义和 `/api/governance/health`；`docs/cli-test-matrix.md` 将 Health 摘要纳入 UI / 服务状态看护口径。
- P2-3 Chunk 2 复审补强：已修正 `/ui` 只从 `/api/governance/metrics` 读取 `health`、但文档和测试矩阵宣称 Health 来源为 `/api/governance/health` 的契约偏差；现在维护者工作台会实际请求 `/api/governance/health`，并以 metrics 内嵌 `health` 作为兜底。
- P2-3 `治理观测运营化`（Chunk 3）：已让 Health action 联动 trace 过滤，cascade action 会筛选 `cascadeTriggered=true`，shadow action 会筛选 `shadowChecked=true`，其他 action 回到近期 trace；README、configuration guide 和 CLI test matrix 已同步该维护者排查路径，UI HTML 渲染测试守住 action 按钮和过滤联动。
- P2-3 `治理观测运营化`（Chunk 4a）：已把维护者工作台纳入 release-stage wrapper 验收链路，打包安装后的 staged 服务会直接 smoke `/ui` HTML 与 `GET /api/governance/health`，覆盖健康摘要占位、Health action 交互脚本入口和 idle 健康 API 结构，避免该路径只停留在源码级 HTML 测试。
- P1-5 `智能路由收益与切换体感闭环`（Chunk 1）：已在 governance metrics 中新增 routing outcome scorecard，按现有 trace 汇总 routed rate、model switch rate、stable model rate、alignment-on-switch、cascade-after-switch、route reason 平均延迟和 Top model switches；`/api/governance/metrics` 返回 `outcome`，`/api/governance/health` 的 signals 带出切换与切换后 alignment 指标，`/ui` 维护者 metrics 区展示 Model switch rate 与 Alignment on switch。
- P1-5 `智能路由收益与切换体感闭环`（Chunk 2）：已把 outcome 从全局汇总扩展为 route reason、final model、semantic intent 三类收益分组，每组包含样本数、切换率、切换后 alignment、切换后 cascade 和平均延迟；CSV 导出与 `/ui` 维护者工作台同步展示分组 outcome，维护者可以开始按任务意图和最终模型判断组合路由是否更稳、更快。
- P1-5 `智能路由收益与切换体感闭环`（Chunk 3）：已新增 synthetic tasks regression，固定覆盖规则命中、semantic、SmartRouter、sticky correction 与真实非流式响应治理中的 cascade gate / retry；测试同时断言 route reason、最终模型、切换率、稳定模型、cascade-after-switch、route reason 平均延迟，以及 route reason / final model / semantic intent 三类 outcome 分组，确保智能路由收益不是只靠随机切换或单点 trace 观察。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 1）：已新增 `Auth.managed_keys` 最小数据结构，managed key 以哈希形式写入配置；`APIKEY` 保留为 bootstrap/admin key；新增 `GET /api/auth/keys`、`POST /api/auth/keys`、`POST /api/auth/keys/:id/revoke`，支持 label、admin/client/read-only scope、过期时间、撤销和脱敏列表；运行时 `apiKeyAuth` 已能接受 active managed client/admin key，同时拒绝 revoked、expired 或 scope 不足的 key；README 已同步远程客户端应优先使用 managed client key 的口径。
- P1-6 Chunk 1 复审补强：已修正运行时鉴权只读取启动时内存配置的问题，`apiKeyAuth` 现在支持异步配置解析器，启动入口会在鉴权时刷新当前配置中的 `APIKEY/Auth`；因此新生成的 managed key 可即时用于运行时请求，已吊销 key 也会即时失效，不再依赖服务重启。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 2）：已新增轻量 auth audit store，记录鉴权 allowed / denied / skipped、source、keyId、scope、reason、path 与 requestId；新增 admin-only `GET /api/auth/audit` 查看脱敏事件和摘要；`/api/service-info` 返回 `auth` / `security` 摘要，能识别 server/cloud 或公网监听无鉴权、bootstrap-only server 等风险；`ctr doctor` 和 `/ui` 均展示鉴权/安全状态，README 同步 managed client key 与 audit 入口说明。
- P1-6 Chunk 2 复审补强：已统一启动入口、`/api/service-info`、`ctr doctor` 和 `/ui` 对 managed key 的安全口径；active managed key 可作为公网监听的启动保护，只有 revoked/expired managed key 时不再误报为“无鉴权”，而是提示没有 active key、服务会拒绝请求。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3a）：已把 managed key `quota.request_limit` / `quota.token_limit` 接入运行时执行，进程内累计请求数和估算输入 token，超过配额返回 429 并写入 auth audit；`/api/service-info` 同步返回脱敏 quota usage 摘要。运行时鉴权也开始区分 `read-only` 状态接口权限，read-only key 可访问健康/状态 GET 接口，但不能调用模型或管理配置；README 已同步配额和 read-only 使用口径。
- P1-6 Chunk 3a 复审补强：已将 quota 计量范围收紧为模型调用请求（`POST /v1/messages` / `/v1/chat/completions`），状态查询和管理请求不再消耗模型调用配额，避免维护者查看状态或管理 key 时误触发 429。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3b）：已新增 managed key `quota.window_seconds` 窗口语义，运行时会在窗口过期后重置进程内请求/token 用量，并在 quota snapshot 中返回 `windowStartedAt` / `windowResetAt`；`/ui` Auth 状态摘要已露出当前模型调用 quota request 用量，README 同步窗口配额口径。
- P1-6 Chunk 3b 复审补强：已修正窗口配额超限时客户端只能看到 429 reason、看不到恢复时间的问题；现在 429 返回体包含 quota snapshot，窗口配额会同时设置 `Retry-After`，README 同步该重试口径。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3c-a）：已将 `/api/service-info` 的 quota 摘要扩展为按 managed key 脱敏的配额明细，包含 key id、label、scope、active、配置限额、当前用量和 ok/watch/exhausted/inactive/unlimited 状态；`/ui` 维护者工作台新增 Auth quota 表，维护者能定位是哪把 key 接近或耗尽模型调用配额。
- P1-6 Chunk 3c-a 复审补强：已移除 `/api/service-info` quota 明细中的 `keyPrefix/keySuffix`，避免 read-only 状态接口扩大 managed key 片段暴露面；完整 key 前后缀仍只保留在 admin-only `GET /api/auth/keys`。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3c-b）：已新增 managed key quota usage 持久化切片，启动时会从配置兼容字段与本地状态文件 hydrate 用量，模型调用成功后导出并写回 `.claude-trigger-router/auth-quota-usage.json`；配额用量不再只存在于进程内存，服务重启后仍能延续 request/token/window 计数。
- P1-6 Chunk 3c-b 复审补强：已将 quota usage 持久化从模型调用关键路径中移出，磁盘写入失败不再导致已通过鉴权的模型请求失败；状态文件写入改为串行队列 + 临时文件 rename，避免并发请求下旧快照覆盖新快照或写出半文件。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3c-c）：已收紧运行时全局权限矩阵，`client` key 只覆盖模型调用，`read-only` key 覆盖健康、服务状态、compiled models、transformers 和 governance 观测 GET 接口，配置读取/保存、`/ui`、重启、auth 管理和治理写操作需要 `admin`；README 与中间件回归测试同步 scope 语义。
- P1-6 Chunk 3c-c 复审补强：已修正底层 `scopeAllows()` 仍允许 `client` 访问 `read-only` 接口的语义漂移；现在纯 `client` key 不能读取 service-info/status，远程 token 如需同时模型调用与 ready/status 探测，需要显式授予 `client + read-only` scope。
- P1-6 `服务端 API key 与鉴权控制面`（Chunk 3c-d）：已在 `/ui` 维护者工作台新增 Auth scope guide，明确 admin、client、read-only 与 `client + read-only` 的适用场景；`ctr doctor` 同步输出 scope 指引与远程 token 发放建议，降低服务使用者误用 admin key 或用纯 client key 做状态探测的概率。
- P1-6 Chunk 3c-d 复审补强：已将 UI/doctor 的 scope 说明补成可操作指引，直接列出 admin key 可调用的 `GET /api/auth/keys`、`POST /api/auth/keys`、`POST /api/auth/keys/:id/revoke`，并提示 generated secret 只返回一次，避免维护者知道 scope 但不知道如何正确发放/吊销 key。
- P1-7 `server/cloud 一键部署与角色化运维入口`（Chunk 1）：已新增 `ctr deploy init --target server`，生成带随机 bootstrap `APIKEY`、`HOST: 0.0.0.0`、`Runtime.mode: server`、日志、可编辑 `Models` 与 `Router.default` 的自托管 server 起步配置；命令默认不覆盖已有配置、不自动启动服务，并提示维护者先跑 `ctr doctor`、再 `ctr start --daemon`，之后通过 managed `client + read-only` key 给远程客户端使用。
- P1-7 Chunk 1 复审补强：已修正 CLI 帮助中 `--force` 只标注给 `init` 的文案偏差，并补充 deploy init 在已有配置且未显式 `--force` 时不会写文件的回归测试，守住“部署模板不误覆盖现有配置”的安全承诺。
- P1-7 `server/cloud 一键部署与角色化运维入口`（Chunk 2）：已在 npm 包随附 `config/deploy/docker-compose.server.yaml`、`config/deploy/systemd/claude-trigger-router.service` 与部署模板 README；`release:stage` 现在会准备独立 `.release-server-home` 并用 staged wrapper 执行 `deploy init --target server --force`，让维护者在发布前能验收 server profile，而不会覆盖普通 staged 用户配置。
- P1-7 `server/cloud 一键部署与角色化运维入口`（Chunk 3）：已拆出 `docs/server-maintainer-guide.md` 与 `docs/remote-client-guide.md` 两条角色手册；`/api/service-info` 新增 listener 与 clientConnection contract；`ctr status`、`ctr doctor` 与 `/ui` 均显示当前 role、监听地址、鉴权状态、维护入口和远程客户端 `ANTHROPIC_BASE_URL` / managed `client + read-only` key 指引。

下一项按优先级继续推进：

- 配置产品化最终收口：继续收拢 README / configuration guide / setup / UI，避免 server/cloud、managed key、remote service 等术语在不同入口分叉。

## 七、2026-04-27 智能路由与服务化复审

### 复审范围

本轮复审围绕 6 个问题展开：

1. 智能路由是否足以帮助用户组合不同 LLM，形成 `1+1>2` 的效果。
2. 多模型反复切换是否有机制保障连续体验，并让用户感到质量和速度提升。
3. cloud / server / local 部署边界、一键部署、维护命令、UI 和手册是否清晰。
4. cloud / server 是否支持同类型 N 个 LLM 服务源池化注册与管理。
5. cloud / server 是否支持生成 API key、鉴权、配额或撤销，降低模型资源泄漏风险。
6. 后续工具能力是否可以借鉴主流 agent / gateway 的 handoff、guardrail、tracing、routing、virtual key 与 provider routing 设计。

外部参照只作为方向校准，不直接等同于本项目必须实现的功能。参考项包括 LiteLLM Proxy 的 virtual key / budget / routing 思路、OpenRouter 的 provider routing / fallback 思路、OpenAI Agents SDK 的 handoff / guardrail / tracing 思路，以及 LangChain / LangGraph 多 agent supervisor / handoff 心智。

### 复审结论

- 当前 SmartRouter 已有规则路由、语义匹配、LLM 选模、sticky correction、context alignment、cascade retry、shadow supervisor 和治理 health，因此“组合多模型”的基础链路成立。
- 但当前还缺一个面向用户价值的收益闭环：路由为什么更好、是否更快、是否更便宜、是否减少失败、是否在模型切换时保持上下文连续，目前主要靠 trace 事后观察，尚未形成可对比的 scorecard 或策略调优入口。
- 模型切换体验已经有 sticky 与 context alignment 的实现基础，但它们还没有被产品化为“切换策略”。例如什么时候允许切换、什么时候强制保持同模型、切换后摘要是否成功注入、切换是否带来质量提升，都缺少显式状态和验收指标。
- 部署边界已有 `Runtime.mode = local | server | cloud`、`Runtime.remote_service`、`Registration`、`/api/service-info`、`/api/remote-status`、`/api/registration`，但当前仍是“配置语义 + 状态查询”的最小闭环；还不能宣称支持一键 server/cloud 部署、自动远端请求转发、完整服务端控制面或集群编排。
- 服务端安全当前只有单一 `APIKEY` 与 HOST 安全回退，足以保护简单自托管入口，但不足以支撑云端/多用户服务。缺少 generated API key、作用域、过期时间、撤销、限额、审计与 admin/user 分权。
- `Registration.models` 与 `Registration.upstream_services` 已能表达注册摘要，但未参与运行时 model registry、健康探测、负载均衡、熔断或 fallback，因此同类型 N 个 LLM 服务源池化仍未落地。
- 因此，本轮新增事项不应先从 coverage 开始，而应先补 P1 的“智能路由收益与切换体感”以及“服务端安全前置”，再推进一键部署和池化调度。coverage / release 继续伴随式跟进。

### 新增事项

P1-5：智能路由收益与切换体感闭环

- 为每次路由建立 outcome scorecard：route source、初始模型、最终模型、是否切换、是否 sticky、是否 context alignment、是否 cascade、是否 shadow、延迟、错误、用户可感知失败证据。
- 在 `/api/governance/metrics` 与 `/api/governance/health` 中增加“路由收益”视角：按任务类型 / route source / final model 展示成功率、cascade 率、平均延迟、慢请求、切换率。
- 在 UI 维护者工作台增加“路由收益”摘要，避免用户只能看到 trace 明细。
- 建立最小 regression：给同一批 synthetic tasks 跑规则命中、semantic、SmartRouter、sticky、cascade 的契约测试，证明智能路由不是随机切换。
- 验收：维护者能回答“哪些任务被切到哪个模型，切换是否稳定，速度是否改善，失败是否减少”；用户侧不会因为频繁切换而丢上下文。

P1-6：服务端 API key 与鉴权控制面

- 保留现有单一 `APIKEY` 作为 bootstrap/admin key，但新增服务端 managed keys：生成、列表、吊销、过期时间、用途标签、作用域、可选配额。
- 区分 admin / client / read-only scopes：管理 UI、配置保存、模型调用、只读 status/health 不再都依赖同一个全能 key。
- 将 key 使用写入 trace / audit 摘要，便于定位泄漏风险。
- 在 setup / doctor / UI 中给出 server/cloud 模式的安全检查：公网监听必须有认证，推荐 HTTPS 反向代理，不允许把 cloud 模式误当无鉴权本地模式。
- 验收：服务端可以生成客户端 token；泄漏某个客户端 token 时能撤销且不影响 admin key；关键管理 API 需要 admin scope。

P1-7：server/cloud 一键部署与角色化运维入口

- 增加安全默认的一键部署命令或脚本，例如 `ctr deploy init --target server` / Docker Compose / systemd unit / release-stage server profile，生成带 `APIKEY`、HOST、PORT、日志和健康检查的最小服务端配置。
- README 与 configuration guide 分成三类读者路径：本地使用者、服务提供者/维护者、远程服务使用者。
- `ctr status / doctor / ui` 在 server/cloud 模式下明确展示当前角色、监听地址、认证状态、远程客户端连接说明和维护入口。
- 验收：维护者能在新机器上按文档一轮启动 server；远程使用者能按一段配置连接并看到远程 ready 状态；本地默认路径不变复杂。

P2-4：同模型多源池化与注册调度

- 将 `Registration.models` / `Registration.upstream_services` 从“摘要展示”推进到可参与编译的 model pool：同一个 logical model 可以挂多个 endpoint。
- 增加池化策略：priority / round-robin / least-latency / health-aware / fallback-on-error；先从保守策略开始。
- 增加健康探测、熔断、冷却、失败计数、延迟窗口、成本/速率元数据。
- UI 维护者工作台展示 pool health、endpoint 状态、当前禁用/降级原因。
- 验收：同一模型的多个服务源可以自动 fallback；单个 endpoint 异常不直接影响 logical model 可用性；调度原因进入 trace。

P2-5：Agent / 工具能力演进探索

- 借鉴主流 agent 框架的 handoff / supervisor / guardrail / tracing 心智，但保持本项目定位为 Claude Code 路由代理，不扩张为完整 agent 平台。
- 优先探索“低侵入增强”：route handoff summary、tool capability guardrail、输入/输出 guardrail、任务类型 scorecard、trace span 化，而不是先做多 agent 编排平台。
- 将现有 governance trace 与未来 agent trace 对齐，避免另起一套观测结构。
- 验收：新增 agent/tool 能力必须能解释其对 Claude Code 使用路径的直接收益，并能在 trace / health 中被观测。

### 依赖与调整后的近期顺序

| 顺序 | 事项 | 优先级 | 依赖 | 调整原因 |
|---|---|---|---|---|
| 1 | P1-5 智能路由收益与切换体感闭环 | P1 | 现有 SmartRouter / Governance trace | 这是项目核心价值主张，先证明多模型组合确实提升质量、速度和连续体验 |
| 2 | P1-6 服务端 API key 与鉴权控制面 | P1 | 现有 `APIKEY` / auth middleware / service-info | 没有分权 key、撤销和审计，就不应把 server/cloud 一键部署做成推荐路径 |
| 3 | P1-7 server/cloud 一键部署与角色化运维入口 | P1 | P1-6 安全前置、Runtime.mode | 一键部署必须带安全默认值和维护者/使用者分层说明 |
| 4 | 配置产品化最终收口 | P1 | 前述安全与角色边界 | 继续收拢 README / configuration guide / setup / UI，避免新 server/cloud 术语分叉 |
| 5 | CLI / setup UX 重设计 | P1 | 配置产品化、远程角色路径 | setup 需要承接本地使用、连接远程服务、部署服务端三类入口 |
| 6 | P2-4 同模型多源池化与注册调度 | P2 | P1-6、P1-7、Registration schema | 池化会放大资源风险，必须在鉴权和服务边界清晰后推进 |
| 7 | 部署形态与远程接入收敛 | P2 | P1-7、P2-4 | 从“状态查询”继续推进到注册同步、远端请求转发和更完整服务模式 |
| 8 | UI 双层工作台收敛 | P2 | P1-5、P1-7、P2-4 | UI 需要承载收益、鉴权、部署、池化四类新状态，不能只做视觉分层 |
| 9 | 治理观测增强 / 运营化 | P2 | P1-5 | 将收益 scorecard、pool health、key audit 纳入 health/metrics |
| 10 | P2-5 Agent / 工具能力演进探索 | P2 | 路由收益与治理 trace | 先做 guardrail / handoff / tracing 这类低侵入增强，再考虑更复杂 agent 编排 |
| 11 | coverage 口径扩展与 release 门禁同步 | P3 | 伴随所有新增路径 | 不再作为下一主线抢跑，但每个新增路径都必须补测试层级和发布门禁归属 |

## 八、关联文件

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

外部参照：

- LiteLLM Proxy docs：`https://docs.litellm.ai/docs/proxy/virtual_keys`、`https://docs.litellm.ai/docs/proxy/reliability`
- OpenRouter provider routing docs：`https://openrouter.ai/docs/guides/routing/provider-selection`
- OpenAI Agents SDK docs：`https://openai.github.io/openai-agents-js/guides/handoffs/`、`https://openai.github.io/openai-agents-js/guides/tracing/`
- LangChain multi-agent docs：`https://docs.langchain.com/oss/javascript/langchain/multi-agent`
