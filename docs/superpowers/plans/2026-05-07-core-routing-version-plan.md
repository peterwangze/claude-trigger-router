# 核心路由体验版本计划

## 定位

本文档承接 2026-05-07 从用户视角发起的主线校准：Claude Trigger Router 的最高频用户价值不是离线评测本身，而是每天使用 Claude Code 时，基础路由和智能路由能稳定、低心智成本地把请求送到合适模型。

后续演进以本文档作为版本排期入口；统一进展总表仍以 `docs/superpowers/plans/unified-progress-baseline.md` 为总入口。

## 本轮审视结论

### 用户高频路径

1. 安装 / setup 后能顺利进入 `ctr start -> ctr code`。
2. `Router.default` 能稳定承接日常任务。
3. `Router.think` / `Router.longContext` / `Router.background` / `Router.webSearch` 能用清晰配置覆盖常见分流。
4. SmartRouter 规则能让高确定性任务稳定走指定模型。
5. SmartRouter 候选选择能在规则未命中时给出可解释、低延迟、可回退的选择。
6. 多模型切换后用户不应感到上下文割裂；sticky / alignment / cascade / context guard 应优先服务这个体感。
7. UI / doctor / status 应让用户知道当前路由是否生效、为什么选了这个模型、下一步怎么修。

### 当前实现已具备的基础

- 基础路由已覆盖 `default` / `think` / `longContext` / `background` / `webSearch`。
- SmartRouter 已具备规则路由、语义匹配、候选模型 LLM 选择、sticky correction。
- Governance 已具备 context alignment、cascade retry、shadow supervisor、context window guard 和 route outcome 指标。
- UI 已展示服务 ready、模型数、`Router.default`、compiled models、治理 trace、metrics、health、benchmark summary。
- `ctr eval` 已能为多模型组合提供离线验证，但它是证明和调优工具，不应压过日常路由体验。

### 本轮发现的问题

| 发现 | 影响 | 调整 |
|---|---|---|
| 近期计划把 `ctr eval`、LLM 裁判、benchmark 历史看板排在智能路由收益主线最前 | 对维护者有价值，但不是普通用户最高频路径；继续优先推进会让核心路由体验收口滞后 | 将“基础路由与 SmartRouter 常用体验收口”提升为下一版本主线 |
| 基础路由能力虽已存在，但版本计划中缺少面向用户的验收切片 | 容易出现代码能力已在、用户仍不知道怎么配置和判断是否生效 | 按 `default/think/longContext/background/webSearch` 拆成用户流验收 |
| SmartRouter 的强能力已经分散在规则、语义、候选、sticky、alignment、cascade、health 中 | 用户需要的是“何时启用、怎么配、怎么观察、怎么回退”的闭环，而不是能力清单 | 把 SmartRouter 版本计划改为配置向导、解释面板、稳定切换和调优建议 |
| 多模型上下文窗口差异已经有 guard，但仍需要更贴近用户的配置/观测入口 | 配少浪费大窗口，配多影响小窗口质量，用户难以知道当前请求是否发生了降级或 fallback | 把 context window preset、doctor warning、UI 路由解释提升到核心路由版本内 |
| 远程部署、模型池、鉴权、agent/tool 增强仍重要 | 但它们不是本地日常使用最高频路径；过早抢占会稀释核心路由体验 | 排到核心路由体验版本之后，按安全和服务化依赖推进 |

### 2026-05-11 发布计划重排

v1.3.0 和 v1.4.0 的基础路由 / SmartRouter 常用体验已经阶段闭环后，下一版本不直接进入 benchmark 或服务化扩展。先把用户每天会碰到的入口基础功能做稳，再往前推进收益运营、服务化、模型池和 agent/tool 增强。

1. v1.5.0 先做入口基础功能稳定与易用性巩固：`setup / start / status / code / doctor / ui`、配置保存/修复/迁移、基础路由和 SmartRouter 模板、打包后真实用户流、UI 基础交互 smoke 与 coverage 口径。
2. v1.6.0 再把已有 `ctr eval`、`--judge-model`、真实 trace outcome、quality evidence、task comparison 和 `/ui` benchmark summary 做成长期收益运营闭环。
3. v1.7.0 在已有 managed key、operator、quota、remote forward、server deploy init、model pool fallback、least-latency 和 pool health persistence 基础上，补服务端默认安全策略、密钥轮换、主动 pool health 和成本/速率元数据。
4. UI 与看护从 v1.5.0 开始伴随推进：`src/ui/workbench.ts` 需要工程化拆分和最小 DOM/browser smoke，coverage 需要从早期 `src/trigger/**/*.ts` 扩到 setup/config/models/protocols/governance/server 主链。

### 2026-05-23 架构与目标复审

本轮从“项目目标、架构清晰度、实现是否按架构预期落地”三个角度复审当前代码与文档。结论是：项目目标仍然成立，当前实现主线也基本一致，但 v1.8.0 之前需要先把若干架构压力点纳入计划，否则低侵入 agent/tool 增强会把已有路由代理边界推向平行 agent 平台。

| 复审点 | 当前判断 | 后续调整 |
|---|---|---|
| 项目目标一致性 | README、发布说明和实现都继续围绕 Claude Code 本地/远程路由代理：`Models + Router`、SmartRouter、治理观测、server 安全和模型池均服务于“请求送到合适模型并可解释/可看护”。agent/tool 目前仍是辅助能力，而不是主平台。 | v1.8.0 继续保留“低侵入”边界：只做 handoff、guardrail 和 trace span，不新增独立 agent 编排、任务队列或完整工具平台。 |
| 架构清晰度 | 领域模块已形成基本边界：`setup`、`models`、`router`、`trigger`、`governance`、`auth`、`protocols`、`doctor` 都有独立测试。但运行编排集中在 `src/index.ts`，管理 API 集中在 `src/server.ts`，UI 集中在 `src/ui/workbench.ts`，CLI 集中在 `src/cli.ts`，继续叠功能会让依赖方向和回归范围变重。 | v1.8.0 先补 runtime pipeline / API route / UI fragment 的边界收口任务，再在这些边界上加 guardrail 和 span。 |
| 实现是否符合架构预期 | 核心能力大多按目标落地：配置归一、模型编译、路由选择、协议分发、治理记录、鉴权和发布看护都有回归测试。主要偏差是部分实现仍用“单文件承载多职责”的方式交付，闭环速度快但长期演进成本上升。 | 把单文件压力作为 v1.8.0 的闭环前置条件：新增能力必须进入现有 trace / health / validation contract，不允许绕开为临时私有状态。 |
| 看护是否支撑演进 | `release:verify`、packaged E2E、UI jsdom smoke 和 targeted tests 已能拦截主路径回归；但 UI 脚本、API 路由权限矩阵、runtime hook 顺序和 agent/tool 自回调链路仍缺少结构化 contract。 | v1.8.0 每个事项必须补最小 contract：权限矩阵、trace span、UI DOM smoke 或 runtime pipeline 单测，避免只靠发布门禁末端发现问题。 |

本轮发现的具体问题按后续版本归档：

1. `src/index.ts` 同时承载服务启动、远程转发、SmartRouter、agent/tool 注入、协议分发、stream 工具续写和响应治理。短期可运行，但 v1.8.0 做 handoff / guardrail / span 化前，应先定义 runtime pipeline 阶段和 hook 顺序 contract。
2. `src/server.ts` 已承载配置、compiled models、pool health、service-info、auth、remote status、governance、benchmark、archives、config save、restart 和 UI route。后续新增管理 API 时，应拆出 route registration 或 service facade，避免权限、脱敏、错误格式和测试继续分散在一个文件。
3. `src/ui/workbench.ts` 仍是大型 HTML/CSS/内联 JS 字符串，虽然已有 `workbench-document.ts` 和 jsdom smoke，但继续承载 guardrail、span、工具能力视图会明显放大维护成本。后续应按使用者/维护者 surface 拆出渲染片段和脚本模块级 contract。
4. agent/tool 能力目前通过 `agents` 和 image agent 自回调进入 `/v1/messages`，可用但边界偏隐式；v1.8.0 的 tool capability guardrail 必须明确工具能力声明、允许/拒绝原因、内部调用鉴权和 trace 记录。
5. 配置产品化和 setup/CLI 仍是目标一致性的关键基础。v1.8.0 新增 guardrail 配置时必须沿用现有 validation issue contract、doctor 提示、README/configuration guide 和 UI 草稿预览，不另开一套配置心智。

### 2026-05-23 用户入口与文档一致性复审

本轮从用户高频功能、入口易用性和用户文档一致性继续审查。结论是：v1.8.0 已把架构减压和 agent/tool 低侵入能力闭环，但远程客户端与新用户入口的叙事存在新的 P1 级漂移，必须作为 v1.9.0 独立版本收口，先于更宽泛的配置产品化和 CLI/setup UX 继续扩展。

| 发现 | 影响 | 后续版本归档 |
|---|---|---|
| 远程客户端文档与实现不一致：运行时已能在 `Runtime.remote_service.enabled` 时把 `/v1/messages` 和 `/v1/chat/completions` 转发到远端 CTR，但 README 与 configuration roles 仍保留“不会转发请求”的旧口径。 | 用户会误判远程客户端只能看状态，无法知道本地 `ctr code` 已可作为远端 thin proxy 使用。 | v1.9.0 P1：统一 README、configuration roles、configuration guide 与 remote client guide 的远程代理心智。 |
| `ctr setup` remote-client next steps 仍偏旧，只提示 status / direct remote use，没有把 `ctr doctor/status -> ctr code` 的本地代理主路径讲清。 | fresh setup 后用户不知道下一步应该在本机继续用 `ctr code`，也不知道 direct remote endpoint 只是可选路径。 | v1.9.0 P1：更新 setup 输出、CLI E2E 与 setup 单测。 |
| 远程鉴权环境变量口径冲突：本地 `ctr code` 注入 `ANTHROPIC_AUTH_TOKEN`，部分文档仍指导 `ANTHROPIC_API_KEY`。 | 远程客户端、直接调用远端 CTR 和 Claude Code 本地代理三种路径容易混淆，导致鉴权失败或用户重复试错。 | v1.9.0 P1：验证兼容边界，明确推荐变量与兼容变量，并补文档/测试看护。 |
| `/ui` 需要 admin scope，但 `ctr ui` 只能打开裸 URL，无法携带 Authorization header。 | 维护者知道有 UI，却没有顺滑方式进入受保护 UI，公网/服务端部署场景尤其容易卡住。 | v1.9.0 P1/P2：最小闭环先给出可执行 admin 访问指导，进一步评估一次性本地 token 或 loopback 授权入口。 |
| README 的“5 分钟跑起来”位于版本和部署信息之后。 | 新用户首先看到发布和维护者信息，主路径 `setup -> status -> code` 不够靠前。 | v1.9.0 P1：调整 README 信息架构，把新用户路径前置，发布定位和维护者说明后移或链接化。 |

### 2026-05-23 智能路由深度复审：自适应与协同能力

本轮从后续 LLM 演进和用户对“多模型配合产生 1+1 远大于 2”的预期复审 SmartRouter。结论是：当前实现已经能稳定支撑“把请求送到更合适的单个模型”，并具备治理观测、收益证据和切换体感看护；但还不足以支撑“多模型协同产生明显体验增益”的产品承诺。下一轮需要把 SmartRouter 从静态/半静态路由推进到 outcome-driven、自适应、可组合的协同路由。

| 发现 | 影响 | 后续版本归档 |
|---|---|---|
| SmartRouter 决策链仍以 `smart_rule -> semantic_match -> smart_router -> sticky_correction` 选定单个模型为主，cascade / shadow 更像兜底治理而非协作编排。 | 用户能感知“路由换了模型”，但很难感知“多个模型共同让结果明显更好”。 | v1.10.0 P1：新增多模型协作模式，至少覆盖 `route_only`、`verify_only`、`compare_then_arbiter`、`cascade_on_evidence`。 |
| 候选模型画像主要依赖人工 description、规则 prototype 和静态 metadata，无法跟随 LLM 能力快速变化自动更新。 | 模型升级、供应商能力变化或本地模型替换后，路由质量会滞后，维护者需要手动调规则。 | v1.10.0 P1：建立模型能力画像，把真实 trace、benchmark history、人工校准和模型 metadata 归一成可用于路由的 profile。 |
| 默认语义理解是轻量 token/字符 prototype 匹配，可解释但不擅长复杂意图、混合任务、隐含约束和任务拆解。 | 对架构+实现+验证这类混合请求容易只选一个“看起来最像”的模型，错过先拆解再协作的机会。 | v1.10.0 P1：补任务意图结构化分析，区分 fast / deep / review / long-context / tool-heavy 等子需求，并把低置信度显式暴露给后续策略。 |
| `qualityEvidence`、`taskComparison`、benchmark history 和人工校准目前主要用于事后观测，没有自动反哺下一次路由。 | 维护者能看到“哪个模型更好”，但 SmartRouter 不会因此自动调整候选顺序、置信度或升级策略。 | v1.10.0 P1：实现 outcome-driven routing feedback，将质量、失败、延迟、人工校准等证据写入路由 hint 或本地 scoring。 |
| 速度体验缺少请求级 latency budget、fast/deep 双路径和首包/总耗时策略。 | 简单任务可能被慢模型拖住，复杂任务又可能为了快而牺牲质量，用户体感不稳定。 | v1.10.0 P1：新增 confidence + latency budget 策略，支持快路径、深路径、低置信度升级和超预算降级。 |
| UI/CLI 已能解释“为什么选中该模型”，但还不能证明“这次组合比默认更好/更快/更稳”。 | 多模型收益仍偏维护者视角，普通用户难以建立“智能路由值得开启”的信任。 | v1.10.0 P2：在 trace、health 和 UI 中展示协作收益证据、负收益证据和建议动作。 |

## 版本路线

| 版本 | 用户目标 | 主要闭环事项 | 验收标准 |
|---|---|---|---|
| v1.2.x | 修复与稳态维护 | 只承接影响当前 v1.2.0 发布质量、CLI/packaged 行为、`ctr code` 主路径、基础配置兼容的缺陷 | 不引入大功能；`release:verify` 通过；README 与帮助不漂移 |
| v1.3.0 | 基础路由常用体验闭环 | `Router.default/think/longContext/background/webSearch` 用户流、doctor/UI 路由解释、context window 配置提示、核心路由 smoke/e2e | 新用户能在 README/setup/UI 中完成基础分流配置，并能看懂当前请求为什么选中某模型 |
| v1.4.0 | SmartRouter 常用体验闭环 | 规则模板、候选模型配置向导、路由决策解释、sticky/alignment 切换体感、慢路由/错路由调优建议 | 用户能用规则和候选模型稳定覆盖高频任务，且能通过 UI/metrics 发现切换割裂或错路由 |
| v1.5.0 | 入口基础功能稳定与易用性巩固 | setup/start/status/code/doctor/ui 主路径、配置保存/修复/迁移安全、UI 基础交互 smoke、coverage 口径、release verify 入口门禁 | 新用户和日常用户能稳定完成安装后首次使用、服务启停、进入 Claude Code、诊断修复和打开 UI；失败时有清晰下一步 |
| v1.6.0 | 多模型组合收益运营化 | `ctr eval` 历史看板、人工校准表单、核心路由任务集默认样本、收益趋势、评测与真实 trace 对齐 | 维护者能用固定样本和真实 trace 判断路由配置是否真的提升质量/速度 |
| v1.7.0 | 远程服务与模型池安全体验 | 服务端部署安全默认值、密钥轮换手册、主动 pool health、成本/速率元数据、更多调度策略 | 服务提供者能安全暴露服务，远程使用者能稳定接入，模型池能提升可用性而不放大风险 |
| v1.8.0 | 低侵入 agent/tool 增强与架构减压 | runtime pipeline 边界、API route/service facade 收口、UI 片段拆分、handoff summary、tool capability guardrail、trace span 化、输入/输出 guardrail | 增强能力进入现有路由与治理体系，不扩张成平行 agent 平台；新增能力有清晰 hook 顺序、权限边界、trace span 和最小看护 |
| v1.9.0 | 用户入口与远程客户端一致性收口 | 远程客户端代理文档、setup remote-client next steps、鉴权环境变量口径、`/ui` admin 入口、README 5 分钟路径前置 | 新用户、日常本地用户和远程客户端能从 README / setup / status / doctor / ui 获得一致且可执行的下一步；旧文档口径不再误导真实运行链路 |
| v1.10.0 | 智能路由自适应与多模型协同增强 | outcome-driven routing feedback、模型能力画像、confidence/latency budget、多模型协作模式、协作收益证据 | SmartRouter 不再只停留在“选一个模型”，而是能基于真实质量/速度证据选择 fast/deep/verify/compare 等协作路径，并向用户解释收益与代价 |
| v1.13.0 | 核心路由用户体感与看护补强 | 路由预演、基础路由触发解释、SmartRouter 起步模板收口、协作口径校准、首包/错误/选模用户流看护 | 用户能在运行前预判请求会走哪个模型、为什么、是否可能变慢；发布门禁能拦截基础路由和 SmartRouter 的慢、卡、错路由、不可读错误回归 |
| v1.14.0 | 配置产品化最终收口 | `Models` 字段心智、路由槽位、capability warning、README/configuration guide/UI/setup 一致性 | 用户能用同一套 `id/api/key/interface/model/thinking/metadata` 心智完成配置、诊断、保存和修复；CLI/UI/文档不再各说一套 |
| v1.15.0 | CLI/setup UX 重设计收口 | migration-first、model-id-first、fresh setup 主路径、SmartRouter 起步引导、完成页 next steps | 新用户能按 setup 问答稳定生成本地可用配置，并知道下一步如何 doctor/start/code/ui；旧 provider-centric 叙事不再回流 |
| v1.16.0 | 用户视角复审与入口一致性校准 | 项目目标复审、入口可用性巡检、已发布版本用户体验回归、问题归档机制 | 每次复审发现的问题都能落入明确版本；fresh setup、远程转发、配置保存、鉴权、route preview 和发布门禁回归能被及时前置 |
| v1.17.0 | UI 双层工作台收敛 | 角色化 UI 体验设计、Codex/Figma 辅助 skill 接入、使用者/维护者渲染片段拆分、CSS/JS helper、trace span 视图、真实浏览器 smoke | `/ui` 不再只是功能集合页；不同角色能按任务路径进入，视觉系统与实现 contract 成体系，新增视图不再堆回大型内联脚本 |
| v1.18.0 | 治理观测运营化增强 | routing outcome、pool health、key audit、输入侧优化、Web UI 功能审视与视觉设计优化、导出/归档/异常趋势 | 维护者能用稳定入口判断路由质量、异常趋势和建议动作；治理观测与 UI、trace、metrics 形成可运营闭环，Web UI 不只功能可达，也能按角色任务流保持清晰、低噪声和可持续扩展 |
| v1.19.0 | 部署形态与远程接入收敛 | 服务发现、节点/集群编排边界、远程服务模式、remote status/registration 可观测性 | 远程接入在安全鉴权和清晰角色边界下继续演进，不把托管/cloud 能力误宣称为已完成 |
| v1.20.0 | 发布与进展治理可持续化 | packaged CLI 用户流、release verify slice、closed 事项复审、统一基线和 issue log 维护 | 发布门禁能持续覆盖真实用户流；进展台账和问题记录不再依赖临时会话记忆 |
| v1.20.1 | resume 恢复性能与长历史前置路径优化 | resume/长历史请求 preflight 耗时观测、SmartRouter/semantic/alignment 预算、token count 快速路径、长历史回归门禁 | 同一 session 中断退出后用 `resume` 恢复不再明显慢于正常任务；即使历史很长，也能看到前置耗时来源并受预算保护，不会在首包前无解释地卡住 |

## 待处理事项按用户优先级归档

### v1.3.0 基础路由常用体验

优先级：最高。

1. `[closed 2026-05-08]` 基础路由配置向导与文档收口：README 已围绕 `default/think/longContext/background/webSearch` 补齐触发条件、推荐模型、常见误区，并新增 `config/trigger.routing.yaml` 作为五槽位可复制模板。
2. `[closed 2026-05-08]` `ctr doctor` 增加路由槽位体检摘要：已检查默认模型是否存在、thinking/background/longContext/webSearch 槽位是否能解析、thinking 能力是否匹配，以及上下文窗口元数据是否缺失。
3. `[closed 2026-05-08]` `/ui` 使用者工作台增加“当前路由配置解释”：已展示 `default/think/longContext/background/webSearch` 每个槽位引用的 `Models[].id`、上游 provider/model、能力提示和潜在 warning，并复用 compiled modelMap 做解析。
4. `[closed 2026-05-08]` context window 用户体验增强：doctor 侧已提示 `context_window_tokens` / `safe_input_tokens` / `Router.longContext` 的缺失和容量倒挂风险；`/ui` 已新增 `Context window guide`，基于当前草稿/compiled models 展示 default 与 longContext 容量、最大上下文候选、缺失元数据计数，并支持一键把推荐模型设为 `Router.longContext`。
5. `[closed 2026-05-09]` 增加基础路由打包后 smoke：已在 packaged acceptance 中覆盖 fresh setup 配置、`ctr status`、`ctr code` 环境，并通过多槽位配置验证 `default/think/longContext/background/webSearch` 解析与真实 `/v1/messages` longContext fallback。

### v1.4.0 SmartRouter 常用体验

优先级：高。

1. `[closed 2026-05-09]` SmartRouter 规则模板：已新增 `config/trigger.smart-router.yaml`，为 coding、review、architecture、long context、fast reply 提供可复制配置，并用模板解析、模型引用和规则命中测试看护。
2. `[closed 2026-05-10]` SmartRouter 配置解释与候选模型向导：`/api/models/compiled` 与草稿 preview 已返回归一化后的 SmartRouter explanation，`/ui` 已展示规则命中顺序、候选模型、router_model、semantic/sticky 开关和 fallback；本轮补充 Candidate guide，按 fast / balanced / deep / long-context 检查候选覆盖并支持把建议模型加入 SmartRouter candidates，并用 server/UI 回归测试看护。
3. `[closed 2026-05-10]` 路由决策可解释性：已在 governance trace 中记录 SmartRouter route source、rule、confidence 和选中模型；`/api/governance/traces` / detail 会返回 route decision summary，`/ui` 维护者 trace 区域展示最近请求的可读摘要，并能从旧 trace 的 routeReason 推断 rule、semantic intent、context window fallback、model pool fallback 与 cascade 原因。
4. `[closed 2026-05-10]` 切换体感治理：已新增 switch continuity summary，把 initial/final model、sticky、alignment、cascade、route source 和 fallback reason 合成为 stable/aligned/watch/critical 等可读状态；`/api/governance/traces` / detail 会返回最近请求的切换摘要，`/ui` 维护者 trace 区域展示“是否切换、是否补上下文、切换后是否触发 cascade”和下一步动作，并用 trace/server/UI 回归测试看护。
5. `[closed 2026-05-10]` 慢路由与错路由调优建议：health routing tuning 已从“查看指标”推进到配置路径级建议；context window、switch without alignment、switch cascade risk、slow route group 会返回 `configSuggestions`，直接指向 `Models[].metadata.context_window_tokens`、`Router.longContext`、`SmartRouter.sticky.alignment`、`SmartRouter.rules` 与 `SmartRouter.candidates` 等可调整位置；`/ui` Routing tuning 会展示这些配置路径和建议原因，并用 metrics/server/UI 回归测试看护。
6. `[closed 2026-05-10]` v1.4.0 发布前复核：已新增 `docs/release-notes-v1.4.0.md` 固化 SmartRouter 常用体验版的发布主线、发布边界和发布前验证清单；`docs/releasing.md` 已切换当前 minor release 口径到 v1.4.0；deploy assets 测试看护 release notes、包文件包含规则和 SmartRouter v1.4.0 发布承诺。

### v1.5.0 入口基础功能稳定与易用性巩固

优先级：最高。

1. `[closed 2026-05-19]` 入口看护基线：coverage 口径已从早期 `src/trigger/**/*.ts` 扩到 setup / config / models / protocols / governance / server / auth / doctor / cli 主链；`docs/cli-test-matrix.md` 和 `docs/releasing.md` 已把 v1.5.0 入口稳定专项作为 `release:verify` 前置检查口径。2026-05-18 已完成 Chunk 1：确认完整 e2e 在 Windows 本地约 3-4 分钟可通过，新增 `npm run test:e2e:cli:entry` 作为较短入口 smoke，并让 e2e harness 在单命令超时时清理子进程树和输出 stdout/stderr 摘要。2026-05-19 已完成 Chunk 2：新增 `npm run test:ui` 与 `src/ui/workbench.dom.test.ts`，覆盖 UI 载入配置、compiled models 预览、保存失败 validation issue 展示和 Health action trace 过滤；本轮 smoke 暴露并修复 `workbench.ts` 内联脚本拼接语法错误，以及 route decision / switch continuity DOM 绑定缺失。2026-05-19 已完成 Chunk 3：`npm run test:e2e:cli:entry` 增加 remote client / server deployment setup 代表性 packaged slice，防止远程客户端与服务端部署角色路径掉出短入口门禁。2026-05-19 已完成 Chunk 4：抽出 `src/ui/workbench-document.ts` 承接 HTML 文档骨架与内联脚本抽取，并在 `test:ui` 中新增脚本语法 smoke。最终 `npm run release:verify` 已通过。
2. `[closed 2026-05-19]` Fresh install / setup 主路径稳定：packaged E2E 已覆盖无配置、复用已有配置、legacy migration、repair、rebuild、远程客户端、服务端部署三类角色，确保不误启动、不误覆盖、不误导 next steps。
3. `[closed 2026-05-19]` 服务生命周期稳定：packaged E2E 已覆盖 `ctr start` / `start --daemon` / `status` / `stop` / `restart` 在端口占用、stale PID、alternate port、配置错误、服务已运行时的清晰结果。
4. `[closed 2026-05-19]` Claude Code 入口稳定：packaged E2E 和单元测试已覆盖 `ctr code` 只在服务 ready 时进入 Claude Code，正确注入本地/远程代理环境，服务未运行或 Claude CLI 不存在时明确失败。
5. `[closed 2026-05-19]` 配置保存 / 修复 / 迁移安全：setup、doctor、UI save 复用同一 validation issue contract；`/api/config`、managed key 写入和治理阈值保存沿用“已有配置必须先备份，备份失败不写入”的安全线，并补 UI save 不丢弃 `Auth.managed_keys` 的回归测试。本轮已补 packaged CLI 对 remote client / server deploy 的代表性 slice：remote client setup 保存 `Runtime.remote_service` 且不进入 provider/model 填写；server deployment setup 生成 `Runtime.mode: server` / bootstrap `APIKEY` 且不自动启动服务。
6. `[closed 2026-05-19]` UI 基础交互可看护与首轮工程化拆分：已从 HTML 字符串 smoke 推进到 jsdom DOM smoke，覆盖载入配置、compiled models 预览、保存失败提示、服务状态和维护者 Health action；已抽出 `workbench-document.ts` 承接 HTML 文档骨架与脚本抽取，并用脚本语法 smoke 防止字符串拼接错误再次绕过。更深入的 CSS/JS/渲染片段拆分继续转入 P2 `UI 双层工作台收敛` 伴随推进，不阻塞 v1.5.0 入口稳定闭环。
7. `[closed 2026-05-19]` 看护口径校准：`release:verify` 已明确入口主路径，不让新扩展绕过主路径稳定性；后续新增入口功能时，先补对应单元/打包后 E2E/acceptance 看护，再推进低频扩展能力。

v1.5.0 闭环验证：`npm run release:verify` 已通过，包含 build、常规测试、packaged CLI entry smoke、完整 packaged CLI E2E、acceptance、pack dry-run、tarball 安装和 installed CLI smoke；`package.json` / `package-lock.json` 已更新到 `1.5.0`，发布边界见 `docs/release-notes-v1.5.0.md`。

### v1.6.0 多模型收益运营化

优先级：中高。

1. `[closed 2026-05-22]` benchmark 历史看板：`ctr eval --input/--run` 可通过 `--save-history` 把评测摘要写入 `~/.claude-trigger-router/benchmark-history.json`，`ctr eval --history` 可查看最近一次分数、与上一次的 pass / quality / speed / latency 趋势、Top models；`/api/benchmark/history` 与 `/ui` Benchmark history 已接入同一 history，历史文件只保存摘要、模型均分、best run 和趋势所需字段，不保存原始模型输出。
2. `[closed 2026-05-22]` 人工校准 UI 表单：`/api/benchmark/calibration` 与 `/ui` Human calibration 表单已支持维护者录入 taskId、model、output、latency、humanScore 和 notes，服务端即时用固定任务 rubric 评分并只把摘要追加进 benchmark history。
3. `[closed 2026-05-22]` 固定任务集按核心路由场景重排：固定任务新增 `routeScenario`，覆盖日常默认、思考、长上下文、后台、规则命中、候选选择，并保留 server_ops / pool_health 作为 v1.7 服务化和模型池证据。
4. `[closed 2026-05-22]` `ctr eval` 与真实 trace 的对齐：离线评测报告新增 `byRouteScenario`，`/api/benchmark/history` 返回真实 trace 的 task comparison / quality evidence 摘要，`/ui` Benchmark history 同屏展示离线 history、真实 trace 对比任务和质量证据。

v1.6.0 闭环验证：`npm run release:verify` 作为最终发布门禁；当前已通过 targeted `task-evaluation` / `server` / `workbench.dom` / `cli-run` 测试与 `npm run build`。发布边界见 `docs/release-notes-v1.6.0.md`。

### v1.7.0 服务化与模型池

优先级：中。

1. `[closed 2026-05-23]` 服务端部署默认安全策略：`ctr deploy init --target server` 生成 `Runtime.security` 默认策略，明确公网监听必须鉴权、bootstrap key 仅限 admin、远程客户端使用 managed `client + read-only` key、公网部署前置 HTTPS 反向代理或内网；`/api/service-info` 返回同一 policy 和 deployment checklist，README 与 server maintainer guide 已同步。
2. `[closed 2026-05-23]` 密钥轮换和托管维护手册：新增 `POST /api/auth/keys/:id/rotate`，admin 可为 managed key 生成替代 secret、保留或覆盖 scopes/quota/expiresAt，并立即吊销旧 key；README、`/ui` auth guide 与 server maintainer guide 已补定期轮换、交接和泄漏处置路径。
3. `[closed 2026-05-23]` 模型池主动健康探测：新增 operator/admin 可触发的 `POST /api/models/pool-health/probe`，对 enabled pool endpoint 做轻量 `HEAD` 探测，2xx/3xx/4xx 记录成功和 latency，5xx/网络错误记录失败并复用 cooldown / circuit breaker；`/ui` Model pool health 已提供主动探测按钮，README、configuration guide 和维护手册已同步。
4. `[closed 2026-05-23]` 成本/速率元数据：`Registration.models[].metadata` 新增 `cost_per_1m_input_tokens`、`cost_per_1m_output_tokens`、`cost_currency`、`rate_limit_rpm`、`rate_limit_tpm`，compiled model pool、`/api/models/pool-health` 与 `/ui` 均可展示 endpoint 成本和速率限制，为 cost-aware / health-aware 调度提供数据基础。
5. `[closed 2026-05-23]` round-robin / health-aware / cost-aware 策略：`Registration.strategy` 已支持 `priority`、`least-latency`、`round-robin`、`health-aware`、`cost-aware`；active endpoint 与 fallback candidate 复用同一排序逻辑，round-robin 基于 success count，health-aware 基于健康状态/失败数/延迟，cost-aware 基于成本 metadata，并补模型编译与配置校验回归。

v1.7.0 闭环验证：`npm run release:verify` 作为最终发布门禁；当前已通过 targeted `server` / `middleware/auth` / `models/compile` / `router` / `governance` / `workbench.dom` / `utils/config` 测试与 `git diff --check`。发布边界见 `docs/release-notes-v1.7.0.md`。

### v1.8.0 Agent / 工具增强

优先级：中低。

1. `[closed 2026-05-23]` runtime pipeline 边界收口：新增 `src/runtime/pipeline.ts` 定义 `auth -> remote_forward -> smart_router -> agent_tools -> router -> context_guard -> protocol_dispatch -> agent_stream -> response_governance` 阶段顺序、请求级记录和顺序断言；`src/index.ts` 已在现有 hooks 中记录 remote forward bypass、失败转发、SmartRouter、agent/tool、router、context guard、protocol dispatch 与 response governance 状态，并用 `src/runtime/pipeline.test.ts` / `src/index-startup.test.ts` 看护 hook 顺序、bypass 和 error path contract。
2. `[closed 2026-05-23]` 管理 API route/service facade 收口：新增 `src/server/management-routes.ts` 作为管理 API contract，显式记录 auth、service-info、models/pool-health、governance、benchmark、config save、restart 和 `/ui` 的 method / path / domain / requiredScope / sensitiveResponse；`apiKeyAuth` 改为消费同一 contract 推导权限，动态 traces / archives / auth key rotate/revoke 路径有 matcher 看护，并用 `src/server/management-routes.test.ts` 与 `src/middleware/auth.test.ts` 固化权限矩阵。
3. `[closed 2026-05-23]` UI 片段与脚本 contract 拆分：新增 `src/ui/workbench-fragments.ts`，抽出 `escapeHtml`、`toInlineScriptJson`、surface tabs 渲染和 `WORKBENCH_FRAGMENT_CONTRACTS`；contract 已覆盖使用者配置草稿、compiled models、维护者 auth、model pool health、governance observability 和 benchmark 片段的 DOM 锚点，`workbench.ts` 改为复用 surface tabs / inline JSON helper，`workbench.dom.test.ts` 固定 fragment anchors 与脚本转义行为。
4. `[closed 2026-05-23]` route handoff summary：新增 `summarizeRouteHandoffTrace`，把 runtime pipeline 阶段、initial/final model、切换状态和 failed/cascade/context guard 风险合成为 `governanceTrace.handoffSummary`；非流式、流式和 context guard 本地 413 路径都会在记录 trace 前写入 handoff summary，`/api/governance/traces` 返回 `routeHandoffs`，trace detail 返回 `handoffSummary`，`/ui` 维护者区新增 Route handoff 摘要列表。
5. `[closed 2026-05-23]` tool capability guardrail：`ITool` 新增 `capabilities.requiredModelCapabilities` / `internalCall` 声明，image agent 的 `analyzeImage` 声明需要 tool-call 能力；新增 `src/agents/guardrail.ts` 统一评估 selected compiled model 是否满足工具能力，运行时只注入通过 guardrail 的 tools，拒绝时不会执行 agent reqHandler，并把 `tool_guardrail_allowed/denied:<agent>:<tool>:<reason>` 写入 governance trace。
6. `[closed 2026-05-23]` 输入/输出 guardrail：新增 `src/governance/io-guardrail.ts`，非阻断识别 prompt injection / secret exfiltration 输入，以及 placeholder / tool error / refusal 输出；输入检查在 governance trace 创建后写入 `inputGuardrail` 和 `input_guardrail:<code>` reason，非流式与流式响应治理在记录 trace 前写入 `outputGuardrail` 和 `output_guardrail:<code>` reason，复用现有 response governance / trace contract。
7. `[closed 2026-05-23]` trace span 化：`IGovernanceTrace` 新增 `spans`，`buildTraceSpansFromPipeline` 将 runtime pipeline 记录归一为 span，并补充 model_pool_fallback / input_guardrail / output_guardrail 派生 span；非流式、流式和 context guard 本地错误路径都会在 finalize/record 前写入 spans，覆盖 route、protocol dispatch、agent/tool、response governance、model pool fallback 与 guardrail 证据，不另建平行观测系统。

v1.8.0 闭环验证：`npm run release:verify` 已通过，包含 build、常规测试、packaged CLI entry smoke、完整 packaged CLI E2E、acceptance、pack dry-run、tarball 安装和 installed CLI smoke；`npm run release:stage` 已通过并已执行 `npm run release:clean` 清理 staging 产物；`package.json` / `package-lock.json` 已更新到 `1.8.0`。发布边界见 `docs/release-notes-v1.8.0.md`。

### v1.9.0 用户入口与远程客户端一致性收口

优先级：最高。

用户目标：新用户、日常本地用户和远程客户端使用者能从 README、`ctr setup`、`ctr status`、`ctr doctor`、`ctr code` 和 `/ui` 获得一致且可执行的下一步，不再被远程转发、鉴权 token、UI admin 入口或发布定位信息打断。

1. `[closed 2026-05-23]` 远程客户端 proxy 心智统一：README、configuration roles、configuration guide 与 remote client guide 已一致说明：当 `Runtime.mode: local` 且 `Runtime.remote_service.enabled` 时，本地 CTR 可作为远端 CTR 的 thin proxy 转发模型调用；direct remote endpoint 是可选高级路径，不是唯一用法。
   - 闭环标准：文档中不再出现与当前 runtime 相反的“不会转发模型请求”口径；远程客户端指南能明确区分本地代理、直接远端调用、read-only registration 摘要和远端 managed key。
2. `[closed 2026-05-23]` `ctr setup` remote-client next steps 收口：`printRemoteClientNextSteps` 已把下一步改为先用 `ctr doctor` / `ctr status` 验证远端，再通过本地 `ctr code` 进入 Claude Code；direct remote URL 和 token 只作为可选说明。
   - 闭环标准：setup 单测和 packaged CLI E2E 更新到新文案；fresh remote client setup 后不会让用户误以为本地 `ctr code` 无法走远端。
3. `[closed 2026-05-23]` Claude Code 远程鉴权环境变量口径统一：已验证并统一推荐 `ANTHROPIC_AUTH_TOKEN`：本地 `ctr code` 注入该变量并清理 `ANTHROPIC_API_KEY`，直接远端 Claude Code 也使用 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`；原始 HTTP 客户端仍可用 `Authorization: Bearer` 或 `x-api-key` 传 managed key。
   - 闭环标准：本地 `ctr code` 注入变量、远端 managed key、`Authorization: Bearer` / `x-api-key` 兼容说明一致；测试或文档检查能防止推荐变量再次漂移。
4. `[closed 2026-05-23]` `/ui` admin 鉴权入口可用性：已完成最小闭环，`ctr ui` 输出、README、configuration guide、server maintainer guide 和 `/ui` Auth scope guide 均说明受保护 UI 需要 admin key，浏览器不会自动携带 Authorization header，应通过内网/本地隧道或反向代理注入 `Authorization: Bearer <admin-key>`，且不要把 admin key 放进 URL。
   - 闭环标准：服务端开启鉴权后，维护者能按 README / server maintainer guide / UI auth guide 的步骤进入 `/ui`；若新增入口能力，必须补 auth/server/UI smoke。
5. `[closed 2026-05-23]` README 新用户路径前置：已把“5 分钟跑起来”提升到 README 前部，按 `ctr setup -> ctr status/doctor -> ctr code -> ctr ui` 组织；版本发布定位、部署和维护者说明保留但不阻断新用户主路径。
   - 闭环标准：README 首屏能直接给出本地日常使用路径；远程客户端、服务端部署和发布说明以清晰导航承接，避免新用户先进入低频维护者内容。

v1.9.0 闭环验证：五个事项已分别独立提交并逐项补 targeted 看护；`docs/release-notes-v1.9.0.md` 已固化发布边界，`package.json` / `package-lock.json` 已更新到 `1.9.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.10.0 智能路由自适应与多模型协同增强

优先级：最高（P1 主路径体验，不属于 P0 可用性故障）。

用户目标：用户开启 SmartRouter 后，不只是“被路由到某个模型”，而是能在常见复杂任务中感知到多模型分工带来的质量、速度和稳定性收益；维护者能看到收益证据，并让这些证据反哺下一轮路由策略。

1. `[closed 2026-05-23]` outcome-driven routing feedback：已新增 routing advisor，把真实 trace 的 `taskComparison`、`qualityEvidence`、latency、cascade 和 shadow 信号汇总为候选模型画像，并注入 SmartRouter prompt、候选排序和缓存 key。
   - 闭环标准：SmartRouter 选择时能读取近期 outcome signal；同一任务类型下，低失败率、低延迟或人工校准更高的模型会被提高优先级；信号不足时明确回退到现有规则/semantic/LLM 选择。当前已通过 `src/governance/routing-advisor.test.ts`、`src/trigger/smart-router.test.ts` 和 `src/trigger/trigger-router.test.ts` 看护。
2. `[closed 2026-05-23]` 模型能力画像自动刷新：已新增 `/api/governance/routing-advisor`，对当前 SmartRouter candidates 返回由真实 trace 生成的结构化 candidate profile，包含 profile source、样本量、失败率、平均延迟、best/fastest 任务计数、任务 key、score 和证据。
   - 闭环标准：`/api/models/compiled` 或治理 API 能返回用于路由的 profile 摘要；profile 来源、样本量和更新时间可解释；人工 description 仍可作为冷启动输入但不再是唯一依据。当前已通过 `src/server.test.ts`、`src/server/management-routes.test.ts` 与 routing advisor 单测看护。
3. `[closed 2026-05-23]` confidence + latency budget 策略：SmartRouter 已支持 `SmartRouter.routing_budget.latency_budget_ms` / `confidence_threshold`，并允许请求 metadata 的 `ctr_latency_budget_ms` / `ctr_confidence_threshold` 覆盖配置；selector 会把预算传入 SmartRouter hint，SmartRouter 会基于历史 profile 执行 latency guard 或 confidence guard。
   - 闭环标准：SmartRouter trace 记录预算、置信度、路径类型和升级/降级原因；简单任务不会默认被慢模型拖住，复杂或低置信度任务能有明确升级策略。当前已通过 `src/trigger/smart-router.test.ts` 与 `src/trigger/selector.test.ts` 看护。
4. `[closed 2026-05-23]` 多模型协作模式：SmartRouter 已新增最小协作 contract：`route_only`、`verify_only`、`compare_then_arbiter`、`cascade_on_evidence`。默认仍是 `route_only`，配置可通过 `SmartRouter.collaboration.mode` / `allowed_modes` / `confidence_threshold` 显式开启或限制模式；低置信且允许 `verify_only` 时会自动升级到验证模式。
   - 闭环标准：每种模式都有配置开关、trace span、失败回退和 targeted tests；默认仍保持单模型 route-only，不让成本/延迟突然放大；compare/arbiter 只在显式策略或高置信收益场景触发。当前已通过 `src/trigger/smart-router.test.ts`、`src/trigger/trigger-router.test.ts` 和 trace summary 看护；本轮只建立协作 contract，不默认并发执行额外模型调用。
5. `[closed 2026-05-23]` 协作收益可解释入口：route decision summary 已返回 `routingMode`、`collaborationMode` 和 `routingEvidence`；`/ui` Recent route decisions 已展示 mode、collab 和前两条证据，维护者能看到本次是否因 latency budget、confidence guard 或历史画像发生策略调整。
   - 闭环标准：用户能看懂本次是 fast/deep/verify/compare 中哪种路径、为什么这么走、是否超预算、是否带来质量或速度收益；维护者能据此调整规则、候选、预算或关闭某类协作。当前已通过 `src/ui/workbench.dom.test.ts` 和 trace summary 相关测试看护。
6. `[closed 2026-05-23]` 看护与版本闭环：已补 routing advisor、SmartRouter budget/collaboration、selector、trigger runtime、server API contract、UI DOM smoke、部署资产文档测试和 `docs/release-notes-v1.10.0.md`；`package.json` / `package-lock.json` 已更新到 `1.10.0`。
   - 闭环标准：`npm run release:verify` 作为最终发布门禁；每个事项独立提交，且每轮修改后检查是否满足“证据进入路由、路由进入 trace、trace 进入 UI/health、失败可回退”的闭环标准。当前六项已分别独立提交并逐项补 targeted 看护；最终发布门禁以 `npm run release:verify` 为准。

### v1.11.0 基础路由流式稳定性与 socket 错误修复

优先级：最高（P0/P1 可用性修复）。

用户目标：恢复基础路由和 Claude Code 日常会话的可靠流式输出，避免普通 API error 被转换成 socket 断连，并补齐 `v1.8.0` 之后 runtime pipeline / stream governance / SSE parser 的回归看护。

1. `[closed 2026-05-25]` 基础路由流式输出中断修复：复审 `v1.8.0` runtime pipeline 与 response governance 后确认，`governStreamingResponse` 对所有流式响应执行全量 `collectSSE`，即使未开启 `stream_guard` 也会等上游结束后才输出，导致长回复期间 Claude Code 客户端收不到增量 token。已改为默认边转发原始 chunk、边旁路收集文本/usage 用于 trace 和 output guardrail；只有显式开启 `Governance.cascade.stream_guard` 时才保留 buffer-and-retry。
2. `[closed 2026-05-25]` socket-level API error 修复：复审 `onSend` 错误处理后确认，上游 `{ error: ... }` payload 会被 `done(error, null)` 当成 Fastify hook error，客户端可能看到 `The socket connection was closed unexpectedly`。已改为返回结构化错误 payload；model pool fallback 失败后也不再把普通 API error 升级为传输层异常。
3. `[closed 2026-05-25]` SSE parser 跨 chunk 修复：复审流式工具和 stream guard 链路时发现 `SSEParserTransform` 的 current event 状态无法跨 chunk 保存，`event:` / `data:` / 空行被网络拆分时可能丢事件。已改为跨 chunk 保留事件状态，并支持 flush 无尾随空行的最终事件。
4. `[closed 2026-05-25]` v1.11.0 看护归档：新增 `docs/release-notes-v1.11.0.md`，补 `stream-response-governance` 即时透传测试、`SSEParserTransform` 跨 chunk 测试和 upstream API error payload 不触发 hook error 的启动链路测试。

复核校准：2026-06-05 用户确认在 `v1.11.0` 上仍复现 socket 异常和中转卡顿。当前结论调整为：`v1.11.0` 是首轮止血，解决默认全量缓冲和结构化 error hook 两个问题，但没有完全覆盖上游 body 中途断流、远程中转客户端断开取消上游和多字节跨 chunk 解码，因此追加 `v1.12.0` 作为二次修复版。

### v1.12.0 流式传输韧性与远程中转稳定性修复

优先级：最高（P0 用户复现故障）。

用户目标：在 `v1.11.0` 仍复现 socket 断连和中转卡顿时，继续补齐流式传输链路的韧性：上游中途断流要返回可读 SSE error，远程中转在客户端断开时要取消上游，SSE parser 要稳定处理多字节跨 chunk。

1. `[closed 2026-06-05]` 上游流式中途断开不再硬断 socket：默认透传路径捕获上游 stream read error，保留已输出 chunk，并追加 `event: error` / `type: upstream_stream_error` 的可读 SSE 事件后关闭流；新增 `stream-response-governance` 回归测试。
2. `[closed 2026-06-05]` 远程中转取消上游：`Runtime.remote_service` thin proxy 使用 `AbortController`，将 `reply.raw close` 绑定到上游 abort，远端 SSE 响应进入同一套流式治理包装，非 SSE 响应保持原始 body 透传；新增 `index-startup` 回归测试。
3. `[closed 2026-06-05]` SSE 多字节跨 chunk 解码：`SSEParserTransform` 持续复用同一个 `TextDecoder` 并在 flush 时收尾，避免中文等多字节字符被拆包后 JSON 解析失败；新增 parser 回归测试。
4. `[closed 2026-06-05]` v1.12.0 看护归档：新增 `docs/release-notes-v1.12.0.md`，同步 README、release guide、deploy assets test、统一基线和问题台账。

### v1.13.0 核心路由用户体感与看护补强

优先级：最高（P1 主路径体验；若再次复现默认请求不可用或 socket 硬断，按 P0 前置处理）。

用户目标：普通用户不需要读源码也能判断一条请求会走哪个模型、为什么、是否会引入 SmartRouter 额外等待；维护者能在发布前用贴近真实使用的 E2E 看护拦截“慢、卡、错路由、错误不可读”的回归。

1. `[closed 2026-06-05]` 路由预演入口：新增 `ctr doctor --route-preview`，读取当前配置后用用户输入或内置样例预演基础路由与 SmartRouter 决策，输出最终模型、route source、命中规则/槽位、SmartRouter 额外耗时风险、fallback 和修正建议。
   - 闭环标准：无需真实调用上游模型即可解释 `Router.default/think/longContext/background/webSearch` 与 SmartRouter 规则/语义/候选的预计路径；`src/router/route-preview.test.ts`、`src/doctor/index.test.ts` 和 `npm run test:route-ux` 已覆盖。
2. `[closed 2026-06-05]` 基础路由触发解释收口：已把 `longContext` 优先级、`thinking/webSearch/background` 触发条件、显式模型绕过槽位和 context guard fallback 写入 README/configuration guide/setup next steps，并让 route preview 明确展示。
   - 闭环标准：用户能知道为什么配置了 think/webSearch/background 但本次没有命中；文档、doctor 输出和测试用例口径一致，已由 deploy assets、setup 和 route preview 测试看护。
3. `[closed 2026-06-05]` SmartRouter 起步模板收口：`config/trigger.smart-router.yaml` 已从“一次复制高级组合”改成两模型起步模板，并新增 `config/trigger.smart-router.advanced.yaml` 承接 semantic/sticky/governance、本地 fast model 和多候选调优。
   - 闭环标准：新用户复制默认 SmartRouter 模板只需要默认模型和复杂任务模型即可起步；高级能力仍有可复制入口；模板解析、引用和文档资产测试覆盖。
4. `[closed 2026-06-05]` SmartRouter 协作口径校准：README、configuration guide、release guide 和 SmartRouter prompt 已对齐当前真实能力，明确默认是 `route_only` 单模型选择，`verify_only/compare_then_arbiter/cascade_on_evidence` 当前是策略 contract 或治理信号，不默认并发执行额外模型。
   - 闭环标准：用户不会把 v1.10.0 contract 误解为默认多模型并发执行；trace/UI 仍展示 collaborationMode，但说明收益证据与代价。
5. `[closed 2026-06-05]` 用户体感 E2E 看护：新增 `npm run test:route-ux`，把 route preview、doctor 可读输出、基础路由触发解释、SmartRouter 规则/候选选模、首包即时输出、上游中途断流可读 error、远程中转取消和结构化错误串成发布前专项门禁。
   - 闭环标准：`npm run release:verify` 前能单独运行核心路由体感专项；每个 slice 断言用户可感知结果，而不只断言内部函数返回。当前专项会执行 route preview/doctor/stream governance/index startup/packaged SmartRouter slices，并已进入 `docs/releasing.md`。
6. `[closed 2026-06-05]` v1.13.0 发布质量检视与归档：新增 `docs/release-notes-v1.13.0.md`，更新版本号、README 发布定位、releasing 检查清单、统一基线和问题台账；发布前完成 targeted tests、核心路由体感专项和 `npm run release:verify`。
   - 闭环标准：每个事项一个独立 commit；发布质量检视通过后才打 `v1.13.0` tag 并推送。

v1.13.0 闭环验证：六个事项已分别独立提交并逐项补 targeted 看护；`npm run test:route-ux` 已作为核心路由用户体感专项门禁；`docs/release-notes-v1.13.0.md` 已固化发布边界，`package.json` / `package-lock.json` 已更新到 `1.13.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.14.0 配置产品化最终收口

优先级：最高（P1 主路径易用性）。

用户目标：用户只需要理解一套配置字段，就能完成模型接入、路由槽位、能力提示、诊断修复和 UI 保存；不再在 README、configuration guide、setup、doctor 和 `/ui` 之间切换不同心智。

1. `[closed 2026-06-05]` `Models` 字段心智统一：继续把 `id/api/key/interface/model/thinking/metadata` 作为唯一推荐入口，清理或降级旧的 provider-centric 叙事。README 与 configuration guide 已明确新配置字段；setup 问答与部署完成提示改为 `Models[].id/api/key/interface/model` 口径；doctor 仍兼容读取 `api_base_url/api_key/protocol`，但修复写回只输出推荐字段；文档资产测试与 doctor/setup targeted tests 已锁定该行为。
   - 闭环标准：README、configuration guide、setup 问答、doctor 提示和 `/ui` 字段说明都使用同一套字段口径；文档资产测试防止旧字段心智回流。
2. `[closed 2026-06-05]` 路由槽位配置产品化：把 `Router.default/think/longContext/background/webSearch` 与 SmartRouter 起步模板继续收敛到可复制、可解释、可诊断的配置路径。setup 完成提示已给出基础路由模板、SmartRouter 起步/高级模板和逐槽位 route preview 参数；doctor 槽位体检会输出基础路由顺序与验证命令；route preview 输出固定展示判断顺序；配置指南补齐逐槽位验证方法。
   - 闭环标准：用户能从配置文件、setup next steps、doctor 和 route preview 看懂每个槽位是否生效。
3. `[closed 2026-06-05]` capability warning 修正闭环：继续让 CLI、doctor、setup 和 `/ui` 对 thinking/tools/images/context window 等 warning 给出一致修复建议。`collectCapabilityWarnings` 已把 `context_window_tokens` / `safe_input_tokens` 缺失纳入统一 capability warning report，级别为 info；validation issue contract 为 thinking/tools/images/context window/safe input 五类提示提供同一 action；configuration guide 明确 warning/info 语义，server preview/save、doctor/setup 和 `/ui` 继续复用同一 issueReport。
   - 闭环标准：同一 warning 不会出现 UI 可修、CLI 只能提示、文档没有解释的分叉。
4. `[closed 2026-06-05]` 配置保存与预览一致性看护：补齐配置写回、setup 保存、UI 草稿读取、compiled preview 和 validation issue contract 的回归切片。保存 API 成功/失败现在都返回 `capabilityWarnings` 与统一 `issueReport`，成功保存返回 canonical `normalizedConfig` 供 `/ui` 刷新草稿；保存写回继续通过 `buildPersistedConfig` / `writeConfigFile` 输出推荐字段；新增回归测试覆盖 preview/save warning report 一致和旧别名写回 canonical。
   - 闭环标准：`npm run release:verify` 前有 targeted tests 覆盖配置产品化主路径；保存失败和修复建议可读。

v1.14.0 闭环验证：四个事项已分别独立提交并逐项补 targeted 看护；配置产品化专项覆盖 doctor 修复写回、setup 字段提示、server 保存/预览、UI 草稿保存、route preview、文档资产和 validation issue contract；`docs/release-notes-v1.14.0.md` 已固化发布边界，`package.json` / `package-lock.json` 已更新到 `1.14.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.15.0 CLI/setup UX 重设计收口

优先级：高（P1 主路径易用性）。

用户目标：fresh setup、legacy migration、remote client、server profile 和 SmartRouter 起步引导都能按用户下一步自然推进，不需要用户猜“现在该运行哪个命令”。

1. `[closed 2026-06-05]` migration-first 与 model-id-first 主路径收口：继续巩固先迁移/复用、再生成最小可用配置的顺序，fresh setup 继续以模型 ID 和默认模型为中心。
   - 闭环标准：setup 问答、help、README quick start 和配置模板不再回到 provider-centric 旧叙事。
   - 闭环结果：setup 持久化边界写出 canonical `Models[].id/api/key/interface/model`，help 和 README quick start 已同步“复用/迁移优先；首次按 Models[].id 创建默认路由”。
2. `[closed 2026-06-05]` 多模型与 SmartRouter 起步引导：setup 在最小配置后自然引导复杂任务模型、长上下文模型和 SmartRouter 起步模板。
   - 闭环标准：新用户可以从 setup 直接得到可运行且可解释的多模型/SmartRouter 起步配置。
   - 闭环结果：添加复杂任务模型后可直接接到 `Router.think` 或 `Router.think + Router.longContext`，并可继续生成 SmartRouter rules / candidates 起步配置。
3. `[closed 2026-06-05]` 完成页 next steps 一致性：本地、远程客户端、服务端部署三类完成页都明确 `doctor/status -> start/code/ui` 或对应维护者路径。
   - 闭环标准：packaged CLI E2E 覆盖主要 setup profile 的完成提示和副作用边界。
   - 闭环结果：本地完成页明确 `doctor/status -> code/ui`，远程客户端和服务端部署完成页继续由 packaged CLI E2E 看护。
4. `[closed 2026-06-05]` CLI 帮助与入口 smoke 补强：让 `ctr help/setup/doctor/code/ui` 的文案、示例和 README 保持一致。
   - 闭环标准：短入口 smoke 能拦截帮助文案、next steps 和配置主路径漂移。
   - 闭环结果：packaged help e2e 断言 setup/doctor/code/ui 与 route preview 示例，`npm run test:e2e:cli:entry` 已纳入 help smoke。

v1.15.0 闭环验证：四个事项已分别独立提交并逐项补 targeted 看护；专项覆盖 setup canonical 写回、复杂任务模型基础槽位引导、SmartRouter 起步配置、本地/远程/服务端 setup 完成页、packaged help 和短入口 smoke；`docs/release-notes-v1.15.0.md` 已固化发布边界，`package.json` / `package-lock.json` 已更新到 `1.15.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.16.0 用户视角复审与入口一致性校准

优先级：高（P1 主路径易用性，伴随型复审版本）。

用户目标：在 v1.14/v1.15 收口后，从真实用户视角重新检查项目目标、入口路径、核心路由、远程接入、配置保存和发布门禁，确保新增能力没有再次压过日常体验。

1. `[closed 2026-06-05]` 项目目标与实现一致性复审：已复查 README、配置指南、setup、doctor、UI 和 runtime，当前实现仍围绕 Claude Code 本地/远程路由代理目标；Models/Router、SmartRouter、remote thin proxy、doctor route preview、UI 配置/观测入口和 release gate 仍服务于“把 Claude Code 请求送到合适模型并可解释/可看护”。
   - 闭环标准：发现的偏差必须落入后续版本或 issue log，不能停留在审查结论。
   - 闭环结果：发现 `/ui` 虽已有使用者/维护者 surface，但第一屏仍偏功能堆叠，缺少按本地使用者、远程客户端、服务维护者和路由设计辅助组织的入口。已通过 `882f379` 新增角色化第一屏、任务路径和 UX 诊断面板，并把角色入口纳入 fragment contract 与 DOM 跳转看护；已新增 PI-026 记录该问题。
   - 验证：`npm run test:ui` 已覆盖 role-aware entry anchors 和角色卡跳转。
2. `[closed 2026-06-05]` 高频入口体验复审：已复查 fresh setup、legacy migration、remote client、server profile、route preview、结构化 API error、流式上游断流、远程中转取消和 `/ui` 打开入口；当前未发现新的 P0/P1 主路径缺口。
   - 闭环标准：每条 P0/P1 风险都有现有看护证据或新增版本计划承接。
   - 闭环结果：`test:e2e:cli:entry` 覆盖 help、init、doctor、start/status/stop、setup fresh、setup remote client、setup server profile、code 和 ui；`test:route-ux` 覆盖 route preview、doctor 可读输出、基础路由槽位摘要、即时流式 chunk、上游断流可读 SSE error、远程中转、结构化 502、upstream error payload 和 SmartRouter 选择切片。
   - 验证：`npm run test:e2e:cli:entry` 通过 9 个入口用例；`npm run test:route-ux` 通过 14 个用户体感用例。测试过程中 Node shell args deprecation warning 属于发布工程观察项，不影响当前入口闭环，后续纳入 v1.20.0 发布与进展治理可持续化继续评估。
3. `[closed 2026-06-05]` 已闭环事项抽样校准：已抽查 v1.9-v1.15 之间的 closed 事项是否与当前代码、文档和测试仍一致；当前未发现需要回退历史 closed 结论的新漂移。
   - 闭环标准：不回退历史 closed 结论；发现漂移时新增事项并更新 progress issue log。
   - 抽样结果：v1.9 远程客户端 thin proxy、`ANTHROPIC_AUTH_TOKEN` 和受保护 UI admin 指导仍由 README / configuration guide / remote client guide / deploy assets test 看护；v1.10 SmartRouter collaboration 仍明确为 contract 与 trace/UI 信号，不默认多模型并发；v1.11/v1.12 流式即时透传、上游断流可读 SSE error、远程中转取消和结构化 error 由 `test:route-ux` 看护；v1.13 route preview、基础路由触发解释和 SmartRouter 起步模板仍由 README、configuration guide、模板和 route UX 门禁看护；v1.14 `id/api/key/interface/model` 字段心智仍由 README、configuration guide、setup/UI/server/doctor 测试看护；v1.15 migration-first、model-id-first、SmartRouter 起步引导和三类 setup completion next steps 仍由 `test:e2e:cli:entry` 看护。
   - 验证：已复核 release notes v1.9.0-v1.15.0、README、configuration guide、remote client guide、相关配置模板和 targeted test anchors；未新增 issue log。

v1.16.0 闭环验证：三个事项已分别独立提交并逐项补复审证据；本轮新增 UI 角色入口已通过 `npm run test:ui`，高频入口复审已通过 `npm run test:e2e:cli:entry` 与 `npm run test:route-ux`；`docs/release-notes-v1.16.0.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.16.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.17.0 UI 双层工作台收敛

优先级：中（P2 能力扩展与体验增强）。

用户目标：`/ui` 不再只是功能可达的调试/配置集合页，而是形成面向本地使用者、远程客户端、服务维护者和路由设计者的角色化工作台；视觉系统、信息架构、任务流和实现 contract 要一起收口，继续降低大型 HTML/CSS/内联 JS 的维护压力，让配置产品化、trace span 和治理观测能稳妥进入 UI。

0. `[closed 2026-06-05 via v1.16.0]` 角色化 UI 入口与设计辅助面板：作为 v1.16.0 用户视角复审发现的入口易用性缺口，已先补第一屏角色入口、任务路径和 UX 诊断面板。v1.17.0 后续不重复承接该问题，只在此基础上继续工程化拆分和浏览器 smoke。
1. `[closed 2026-06-06]` 使用者/维护者渲染片段继续拆分：已在现有 fragment contract 上拆出 `workbench-styles.ts` CSS helper 与 `workbench-view-model.ts` 首屏状态派生 helper，让角色入口、服务状态、远程摘要、鉴权摘要和响应式样式不再直接堆在 `renderWorkbenchHtml()` 开头。
   - 闭环标准：新增 helper 已有 DOM smoke 和 contract 看护：`renderWorkbenchStyles()` 固定 role-grid、surface-tabs 与小屏横向表格约束；`deriveWorkbenchViewModel()` 固定 local/server、public listener、remote/client 摘要和 readiness tone；内联脚本语法 smoke 继续通过。
   - 验证：`npm run test:ui`；`npm run build`。
2. `[closed 2026-06-06]` trace span 与路由证据视图收敛：已在维护者 Trace Detail 区新增 `traceEvidenceDetail` 可读证据面板，点击任意 trace 后先展示 route decision、switch continuity、handoff stages、routing evidence 和 trace spans，再保留原始 JSON 作为深挖入口。
   - 闭环标准：维护者能从 UI 看懂一次请求的路由、切换、错误和建议动作；新面板复用 detail payload 中已有 `decisionSummary`、`switchSummary`、`handoffSummary` 和 `spans`，不新增平行观测结构。
   - 验证：`npm run test:ui`；`npm run build`。
3. `[closed 2026-06-06]` 角色化 UI 体验设计与辅助 skill 接入：已把“当前 Web UI 缺少设计、不同角色易用性不足”的反馈正式纳入 v1.17.0；本地已安装 `figma-create-design-system-rules`、`figma-generate-design`、`figma-implement-design` 三个 Codex/Figma 辅助 skill，Codex 重启后可用于设计系统规则生成、界面方案生成和设计到实现的辅助落地。当前会话未热加载这些新增 skill，因此本轮先以 `docs/superpowers/plans/2026-04-17-dual-surface-ui-ux-implementation.md` 固化角色/任务流、信息架构、设计 token、组件状态、响应式规则和不新增平行 UI 状态的实现 contract。
   - 闭环标准：角色化设计 contract 已明确本地使用者、远程客户端、服务维护者、路由设计者四类任务路径；视觉规则保持运维工具密度，不走营销页；颜色、间距、状态 badge、tab、role card、表格、trace detail、warning、保存动作和 empty/loading/error/success 状态均有约束；后续实现必须复用现有 `src/ui/*` helper 与 fragment contract。
   - 验证：`npm run test:ui` 已作为 contract 看护入口；真实浏览器 smoke 由事项 4 单独闭环。
4. `[closed 2026-06-06]` 真实浏览器 smoke 评估：已新增 `npm run test:ui:browser`，先 build，再用隔离 HOME 启动 staged `dist/cli.js start`，通过本机 Edge/Chrome CDP 打开 `/ui`，在桌面和移动 viewport 检查角色入口、UX 设计辅助面板、trace evidence detail、维护者入口跳转和整页无横向溢出；同时补 `workbench-styles.ts` 的 shell/grid 最大宽度约束和 DOM style contract。
   - 闭环标准：发布前已有可重复的 UI browser smoke；浏览器级失败会报告 URL、页面正文摘要和最宽元素，便于回填 CSS/fragment contract。
   - 验证：`npm run test:ui`；`npm run test:ui:browser`。

v1.17.0 闭环验证：四个 v1.17 事项已分别独立提交并逐项补 targeted 看护；本轮新增 UI browser smoke 已通过 `npm run test:ui:browser`，源码侧 DOM smoke 已通过 `npm run test:ui`；`docs/release-notes-v1.17.0.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.17.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.18.0 治理观测运营化增强

优先级：中（P2 能力扩展与体验增强）。

用户目标：维护者能稳定运营路由质量、异常趋势、pool health、key audit 和输入侧优化，而不是只在调试时临时查看 trace。

1. `[closed 2026-06-06]` routing outcome 与建议动作运营化：已新增 `outcomeScorecard`，把 route reason、final model 和 semantic intent 三类 outcome 按 priority score 排序，并结合 model switch、alignment、cascade、latency、quality evidence 与 task comparison 生成 status、evidence、action 和 configPath；`/api/governance/metrics`、CSV export 与 `/ui` 维护者工作台均展示同一 scorecard。
   - 验证：`npx vitest --run src/governance/metrics.test.ts`；`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run build`。
2. `[closed 2026-06-06]` pool health 与 key audit 汇入治理视图：`/api/service-info` 已新增 `operations` 汇总，把 model pool endpoint 的 healthy/cooldown/open、平均延迟与 managed key quota 的 tracked/watch/exhausted/inactive 合并为统一 status 和 actions；`/ui` 维护者工作台新增 Operations risk 面板，直接展示 pool health 与 key audit 的联合风险和建议动作。
   - 验证：`npx vitest --run src/server.test.ts`；`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run build`。
3. `[closed 2026-06-06]` 输入侧优化进入统一 trace/metrics：已新增 `guardrails` metrics 汇总，把 `inputGuardrail` / `outputGuardrail` 的 finding code、severity、count、rate 和 action 统一进入 `/api/governance/metrics` 与 CSV export；`/ui` 维护者工作台新增 Guardrail summary 面板，输入侧 prompt injection / secret exfiltration 与输出侧 placeholder/tool error 不再只停留在单条 trace detail。
   - 验证：`npx vitest --run src/governance/metrics.test.ts`；`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run build`。
4. `[closed 2026-06-06]` Web UI 功能审视与视觉设计优化：已在维护者工作台顶部新增 `maintainerDecisionRail`，把 Operations、Guardrails 和 Outcome 三类运营信号压缩成先状态、再动作、再明细的扫描路径；样式新增 `decision-rail` / `decision-signal`，在桌面保持三列、移动端回落单列，并继续复用 v1.17 的角色入口、设计 contract 和 browser smoke。
   - 验证：`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run test:ui:browser`；`npm run build`。

v1.18.0 闭环验证：四个 v1.18 事项已分别独立提交并逐项补 targeted 看护；本轮新增 outcome scorecard、Operations risk、Guardrail summary 和 decision rail 已通过对应 metrics/server/UI/browser smoke。`docs/release-notes-v1.18.0.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.18.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.19.0 部署形态与远程接入收敛

优先级：中（P2 能力扩展与体验增强）。

用户目标：在现有本地/远程 thin proxy 和 server profile 基础上，继续补服务发现、节点/集群编排边界和更完整服务模式，同时保持安全鉴权和角色心智清晰。

验收 checklist：

- `/api/remote-status` 能给远程客户端明确的服务发现结果、节点/服务边界和失败原因，不把远端不可达误判成本地配置损坏。
- `/api/registration` / `/api/service-info` / `/ui` 能让维护者看见远端注册、upstream 服务和模型可用性摘要，并给出下一步处理提示。
- README、server maintainer guide、remote client guide、setup 和 doctor 的角色口径一致，明确 `local`、`server`、`cloud`、remote client、router service 的边界。
- 本版本不宣称完整 cloud/托管控制面、自动集群编排、多活调度或远端配置写回。

1. `[closed 2026-06-06]` 远程服务发现与节点边界：已在 `/api/remote-status` 新增 `discovery` 摘要，把远端 service-info、registration、当前 runtime role 和失败状态收敛为 `disabled / misconfigured / unreachable / not_ctr_service / not_ready / ready`；同时明确 boundary 仍是 `service` 级，`nodeOrchestration`、`clusterOrchestration` 和 `configWriteback` 均为 `unsupported`。`probeRemoteServiceStatus()` 透传远端 `serviceRole`，`/ui` Role & connection guide 新增 remote discovery 状态和动作提示。
   - 闭环标准：不宣称完整 cloud/托管控制面；新增远程能力必须有安全边界和可观测入口。
   - 验证：`npx vitest --run src/service-health.test.ts src/server.test.ts`；`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run build`。
2. `[closed 2026-06-06]` remote status/registration 运营化：已在 `/api/remote-status` 新增 `availability` 摘要，把远端 ready、registration 可用性、远端模型数、upstream 服务数、模型 ID、upstream service ID、客户端下一步和维护者动作合并为可直接判断的运营状态；`/ui` Role & connection guide 同步展示 remote availability，并把 client next steps 合并到 remote discovery 动作列表。
   - 闭环标准：远程客户端能判断远端是否 ready、可用模型是否符合预期、失败后该找谁处理。
   - 验证：`npx vitest --run src/server.test.ts src/service-health.test.ts`；`npx vitest --run src/ui/workbench.dom.test.ts`；`npm run build`。
3. `[closed 2026-06-06]` server/client 文档和 setup profile 一致性：已同步 README、configuration guide、server maintainer guide 和 remote client guide 的 server/client 角色口径，明确 remote discovery / availability、service-scope 边界、远端模型数、upstream 服务数、managed `client + read-only` key、不可远端写回配置，以及不支持 node/cluster orchestration / hosted cloud control plane。`ctr doctor` 远程客户端路径新增 service-scope discovery 和远端注册摘要输出；`ctr setup` 远程路径下一步新增 `/api/remote-status` discovery/availability 观测提示；`src/deploy-assets.test.ts` 已守护关键文档锚点。
   - 闭环标准：远程接入不再因为角色叙事漂移导致误配置。
   - 验证：`npx vitest --run src/doctor/index.test.ts src/setup/index.test.ts src/deploy-assets.test.ts`；`npm run build`。

v1.19.0 闭环验证：三个 v1.19 事项已分别独立提交并逐项补 targeted 看护；本轮新增 remote discovery、remote availability、UI remote connection summary、doctor/setup 远程口径和 server/client guidance alignment 已通过对应 service-health/server/UI/doctor/setup/deploy-assets 测试。`docs/release-notes-v1.19.0.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.19.0`。最终发布门禁以 `npm run release:verify` 为准。

### v1.19.2 新版 Claude 长任务超时与流式中断修复

优先级：最高（P0 用户复现故障）。

用户目标：新版 Claude 通过 CTR 执行长任务时，不再在约 10 分钟被本地 remote thin proxy 主动 abort，也不再因为 agent/tool follow-up stream 的瞬时背压静默停止。

1. `[closed 2026-06-11]` 远程 stream 建立后取消 600 秒总时长上限：复审 `Runtime.remote_service` thin proxy 后确认，`forwardModelCallToRemote()` 使用 `API_TIMEOUT_MS` 包裹整个远程 fetch，远端 stream 已建立后仍会在默认 600000ms abort，表现为新版 Claude 长任务约 10 分钟返回 `API Error: The operation times out.`。已改为只在等待远端响应开始阶段使用该定时器，收到响应头后立即清理；客户端连接关闭仍会取消上游。
   - 闭环标准：远端 SSE 响应建立后，超过默认 600 秒不会被 CTR 主动 abort；远端不可达和客户端断开路径仍有保护。
   - 验证：`npx vitest --run src/index-startup.test.ts`；`npm run build`。
2. `[closed 2026-06-11]` agent/tool 续写不因背压静默截断：复审 agent stream rewrite 后确认，工具结果触发二次 `/v1/messages` follow-up 时，如果 `controller.desiredSize` 临时为 0，会记录 backpressure 后直接 `break`，导致后续 token 不再输出。已移除该提前退出，让 Web Streams 自身处理背压排队。
   - 闭环标准：agent 工具续写链路遇到瞬时背压仍继续转发后续事件，不把正常排队当成任务停止。
   - 验证：`npx vitest --run src/index-startup.test.ts`；`npm run test:route-ux`。
3. `[closed 2026-06-11]` v1.19.2 看护归档：新增 `docs/release-notes-v1.19.2.md`，同步 README 发布定位、发布指南、deploy assets 断言、版本计划和问题台账；发布前以 `npm run release:verify` 作为最终门禁。

v1.19.2 闭环验证：本轮新增远程 SSE 响应建立后超过 600 秒不 abort、agent/tool follow-up stream 不因背压静默截断两个启动链路回归测试，并通过 targeted `index-startup`、构建和 release readiness 文档断言。`docs/release-notes-v1.19.2.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.19.2`。最终发布门禁以 `npm run release:verify` 为准。

### v1.19.3 Claude 流式断流系统修复

优先级：最高（P0 用户复现故障）。

用户目标：在 `v1.19.2` 后仍出现随机断流、第二轮卡顿、API error 后继续很快又停，以及手动停止后新对话出现 `The socket connection was closed unexpectedly` 时，系统性收敛 CTR 自身的 stream 生命周期、错误关闭、取消传播和二轮请求隔离。

1. `[closed 2026-06-12]` stream lifecycle 诊断：默认流式透传路径记录 `start / chunk / upstream_error / client_cancel / finalize`，携带 request id、session id、chunk/bytes、终态和错误信息，用于区分上游断流、客户端手动取消和正常结束。
   - 闭环标准：正常流、上游 read error 和客户端 cancel 都有可断言的生命周期事件。
   - 验证：`npm test -- --run src/governance/stream-response-governance.test.ts`。
2. `[closed 2026-06-12]` 默认流式安全关闭：默认透传捕获上游 read error 后保留已输出 chunk，并追加可读 SSE error 后关闭；下游已经 cancel/close 时不让 `enqueue / close` 异常冒泡成 socket-level 断连；`stream_guard` 缓冲路径也不再直接 `controller.error()`。
   - 闭环标准：上游异常、下游取消和 stream_guard 上游失败都不会把 CTR 内部 stream 错误升级成不可读 socket close。
   - 验证：`npm test -- --run src/governance/stream-response-governance.test.ts`。
3. `[closed 2026-06-12]` 远程与 agent follow-up 取消传播：远程 thin proxy 把客户端 close / aborted 和返回流 cancel 传播到上游 fetch；agent/tool follow-up 内部 `/v1/messages` fetch 绑定外层请求 abort signal，手动停止时不留下半开的内部续写请求。
   - 闭环标准：远程返回流 cancel 会 abort 上游；agent follow-up fetch 能收到外层客户端取消 signal；远端 stream 建立后仍不受 600 秒总时长定时器影响。
   - 验证：`npm test -- --run src/index-startup.test.ts`；`npm run build`。
4. `[closed 2026-06-12]` 第二轮与错误后继续回归：新增同一 session 手动停止后第二轮请求必须获得全新 abort signal，以及远程 socket error 后继续请求不继承旧 signal、仍能独立完成流式输出的回归测试。
   - 闭环标准：第二轮对话、手动终结后新对话和 API error 后继续请求不复用旧 aborted signal。
   - 验证：`npm test -- --run src/index-startup.test.ts`。
5. `[closed 2026-06-12]` v1.19.3 发布质量检视与归档：新增 `docs/release-notes-v1.19.3.md`，同步 README 发布定位、发布指南、deploy assets 断言、版本计划和问题台账；发布前以 `npm run release:verify` 作为最终门禁。

v1.19.3 闭环验证：四个修复事项已分别独立提交并逐项补 targeted 看护；本轮新增 stream lifecycle、默认流式安全关闭、stream_guard 可读错误、远程/agent 取消传播、第二轮和错误后继续 signal 隔离回归。`docs/release-notes-v1.19.3.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.19.3`。最终发布门禁以 `npm run release:verify` 为准。

### v1.19.4 常见场景稳定性与可用性全量复审

优先级：最高（P0 高频可用性）。

用户目标：断流问题已经影响多种常见场景时，不再只按单点报错补丁处理，而是系统性审视本地直连、远程 thin proxy、agent/tool follow-up、手动停止、错误后继续、第二轮会话、CLI 启动和发布门禁，继续把“不会随机停、停了能解释、继续不继承旧状态”作为基础能力。

1. `[closed 2026-06-12]` agent stream rewrite 稳定性补强：全量复审后确认 `rewriteStream()` 仍会在 handler 抛错或下游关闭竞态中直接 `controller.error()`，且没有 cancel 传播；agent/tool follow-up 还缺少内部 reader 释放和空 body 保护。已改为支持下游 cancel 传播、safe enqueue/close、reader finally 释放，并在 follow-up response 无 body 时安全结束。
   - 闭环标准：工具续写路径下游取消会取消上游 reader；handler 真实错误仍可见；follow-up 空 body 不会导致 socket 级异常。
   - 验证：`npm test -- --run src/utils/rewriteStream.test.ts src/index-startup.test.ts src/governance/stream-response-governance.test.ts`。
2. `[closed 2026-06-12]` 全链路断流专项门禁：新增 `npm run test:stream-stability`，先运行 `rewriteStream`、SSE parser、stream response governance 和 startup wiring 的完整 targeted tests，再串接 `test:route-ux`，把 remote SSE 长流、agent/tool follow-up、stream_guard、错误后继续、手动停止后新请求、第二轮同 session、结构化错误和 route UX 合并为一个更明确的稳定性专项脚本。
   - 闭环标准：发布前可一条命令覆盖用户最常见断流/卡住路径，不只散落在多个 targeted test。
   - 验证：`npm run test:stream-stability`。
3. `[closed 2026-06-12]` 诊断可见性补强：把 `streamLifecycle` 和关键 abort reason 暴露到治理 trace/detail 与 Web UI trace 详情中，并追加 `stream_lifecycle` span，维护者可以按 request id/session id 看到 start/chunk/error/cancel/finalize、chunk/byte 计数、上游错误和客户端取消原因，避免用户只看到 socket close 而无法判断是上游断流、客户端取消还是 CTR 内部防护。
   - 闭环标准：维护者能按 request id/session id 查到 stream start/chunk/error/cancel/finalize 和 abort reason。
   - 验证：`npm test -- --run src/governance/trace.test.ts src/governance/stream-response-governance.test.ts src/server.test.ts src/ui/workbench.dom.test.ts`。
4. `[closed 2026-06-12]` 配置/运行态稳定性审视：复查 `API_TIMEOUT_MS`、doctor probe timeout、remote status probe、SmartRouter 内部请求、shadow/semantic verifier 和 release check 中可能误伤长任务或阻塞用户入口的超时/错误路径。确认模型长流主路径仍只把 `API_TIMEOUT_MS` 用作远端响应开始 timeout；补强管理类短 probe：远程 service/registration timeout 统一输出可读诊断，模型池 HEAD 探测新增 800ms 短 timeout，避免 Web UI/doctor 管理入口被单个慢端点卡住。
   - 闭环标准：长任务流式路径不被短请求 timeout 误伤；短请求仍有明确超时和结构化错误。
   - 验证：`npm test -- --run src/service-health.test.ts src/server.test.ts src/index-startup.test.ts`。
5. `[closed 2026-06-12]` v1.19.4 发布质量归档：补 `docs/release-notes-v1.19.4.md`、README/releasing/deploy assets 断言和问题台账；发布前完成稳定性专项、build 和 release verify。
   - 闭环标准：release notes、README 发布定位、发布指南、部署资产断言、统一基线和问题台账均指向 v1.19.4；最终发布门禁以 `npm run release:verify` 为准。

v1.19.4 闭环验证：五个事项已分别独立提交并逐项补 targeted 看护；本轮新增 agent stream rewrite 稳定性、全链路 `test:stream-stability` 门禁、trace/detail stream lifecycle 可见性、管理 probe timeout 诊断和发布归档。`docs/release-notes-v1.19.4.md`、README 发布定位、发布指南和 `package.json` / `package-lock.json` 已同步到 `1.19.4`。最终发布门禁以 `npm run release:verify` 为准。

### v1.20.0 发布与进展治理可持续化

优先级：中低（P3 治理支撑与持续维护）。

用户目标：发布质量门槛、进展基线、closed 事项复审和问题记录形成可持续机制，减少“已经闭环但真实用户又踩中”的情况。

1. `[closed 2026-06-12]` packaged CLI 用户流门禁继续补强：`release:verify`、`Release Check` 和 `Publish Package` 固定执行 `npm run test:stream-stability`，让 rewriteStream、SSE parser、stream governance、startup wiring、route UX 和 packaged CLI 门禁共同成为发布前硬门槛，而不是依赖人工记忆额外执行。
   - 闭环标准：help、init、setup、start/stop/status、doctor、code、ui、route preview 和 remote profile 的副作用边界可被发布前拦截。
   - 验证：`npm test -- --run src/deploy-assets.test.ts`。
2. `[closed 2026-06-12]` closed 事项复审校准机制化：新增 `npm run test:closed-review`，自动检查统一基线近期执行顺序中的 closed 事项是否保留回归触发口径，并确认 PI-009 这类“closed 事项文档结论与实现漂移”的问题记录仍作为制度化反例存在；发现漂移时仍按“新增事项承接，不回退历史结论”的规则处理。
   - 闭环标准：不靠临时记忆判断闭环；每个漂移都有 issue log 记录。
   - 验证：`npm run test:closed-review`；`npm test -- --run src/deploy-assets.test.ts`。
3. `[closed 2026-06-12]` 进展文档体系治理：扩展 `npm run test:closed-review` 为进展治理门禁，除 closed 事项复审外，还检查统一基线、版本路线和问题记录之间的关键互链、默认推进版本口径和文档治理偏差记录规则，避免新增事项绕过统一入口或多入口互相打架。
   - 闭环标准：后续新增事项必须先进入统一入口，再下沉到具体计划；避免多入口互相打架。
   - 验证：`npm run test:closed-review`；`npm test -- --run src/deploy-assets.test.ts`。

v1.20.0 闭环验证：三个治理事项已分别独立提交并逐项补可执行门禁；本轮将 `test:stream-stability` 固化进本地与 GitHub 发布链路，新增 `test:closed-review` 检查 closed 事项回归触发口径、PI-009 漂移反例、统一基线 / 版本路线 / 问题记录互链和默认版本指针。最终发布门禁以 `npm run release:verify` 为准。

4. `[closed 2026-06-12]` v1.20.0 发布质量归档：补 `docs/release-notes-v1.20.0.md`、README/releasing/deploy assets 断言和版本台账；发布前完成 stream stability、closed review、build 和 release verify。
   - 闭环标准：release notes、README 发布定位、发布指南、部署资产断言和统一基线均指向 v1.20.0；最终发布门禁以 `npm run release:verify` 为准。

### v1.20.1 resume 恢复性能与长历史前置路径优化

优先级：最高（P0/P1 用户复现故障）。

用户目标：同一个 session 的任务中断退出后重启，并用 `resume` 恢复时，不再因为完整历史上下文触发无预算的首包前路由/治理工作而明显变慢或卡住；维护者能按 request id/session id 看出慢在 token 估算、SmartRouter、semantic classifier、alignment summary 还是上游响应。

1. `[closed 2026-06-15]` resume/长历史 preflight 诊断：为 `/v1/messages` 首包前路径记录消息数、用户文本字符数、估算 token 数、analysis scope、SmartRouter/semantic/router fallback 是否执行、alignment 是否执行，以及各阶段耗时。
   - 闭环标准：同一 session resume 卡住时，trace/detail 至少能区分 CPU token count、路由 LLM 调用、alignment loopback 和上游模型等待。
2. `[closed 2026-06-15]` SmartRouter 长历史预算与快速路径：对 `resume` 或长历史请求默认只分析 last user message 或 bounded recent window；`analysis_scope=full_conversation` 必须有最大字符/token 预算、截断 reason 和可配置覆盖；同 session 且任务 fingerprint 未明显变化时优先复用 sticky route，避免不必要的 SmartRouter fallback。
   - 闭环标准：长历史不会把完整会话无界塞进规则匹配、semantic classifier、SmartRouter prompt 或 sticky fingerprint。
3. `[closed 2026-06-15]` token count 与 context guard 性能优化：评估对消息历史做增量/分段 token count 缓存，至少避免 resume 场景在同一 request 前置链路中重复编码同一长文本；工具结果和大 schema 要有可观测的 token 估算成本。
   - 闭环标准：长历史 context guard 仍准确，但不把每次 resume 都变成无法解释的同步 CPU 长阻塞。
4. `[closed 2026-06-15]` alignment summary 防卡预算：模型切换时的 `contextAlignmentService.summarizeTransition()` 只能接收 bounded task context，并具备独立 timeout、skip reason 和 trace evidence；长历史 resume 不应默认把完整 analyzedText 发给 summarizer。
   - 闭环标准：sticky/alignment 继续保护切换体感，但不会在 resume 首包前额外制造长时间 loopback 等待。
5. `[closed 2026-06-15]` resume 稳定性专项门禁：新增长历史 resume targeted tests，覆盖 long messages、tool results、`analysis_scope=full_conversation`、semantic classifier、SmartRouter fallback、alignment enabled、context window guard 和同 session 第二轮恢复。
   - 闭环标准：发布前能用一条 targeted 命令复现并拦截 resume 长历史前置路径再次退化。

v1.20.1 闭环验证：五个 resume 性能事项已分别独立提交并逐项补 targeted 看护；本轮新增 preflight diagnostics、SmartRouter analysis budget、sticky 快速路径、token count 缓存诊断、alignment summary bounded context 和 `npm run test:resume-stability` 专项门禁。`docs/release-notes-v1.20.1.md`、README 发布定位、发布指南、部署资产断言和 `package.json` / `package-lock.json` 已同步到 `1.20.1`。最终发布门禁以 `npm run release:verify` 为准。

### v1.20.2 API 报错后继续 / resume 继续慢卡补丁

优先级：最高（P0 用户复现故障）。

用户目标：API 报错之后继续对话、或 `resume` 之后继续对话时，CTR 不再因为诊断/缓存签名/内部 loopback 自身的前置成本而明显慢卡。

1. `[closed 2026-06-17]` 长历史分析诊断去全量重扫：`analysis_scope=full_conversation` 使用 recent window 后，`originalChars` 只做估算，不再为了精确诊断重新拼完整会话。
   - 闭环标准：分析预算本身不会再触发完整历史文本重建。
2. `[closed 2026-06-17]` token count cache 紧凑签名：cache key 不再 `JSON.stringify` 完整 messages/system/tools，而是用 role、长度、工具名和少量采样组成紧凑签名。
   - 闭环标准：cache 命中前不再先进行一次完整历史序列化。
3. `[closed 2026-06-17]` 内部 loopback 短超时预算：SmartRouter fallback 和 semantic classifier 默认使用 preflight 短超时，避免继承长流主路径 `API_TIMEOUT_MS`。
   - 闭环标准：API 报错后继续时，首包前内部路由 LLM 不会等待 600 秒级别超时。

v1.20.2 闭环验证：三个慢卡补丁事项已完成并补 targeted 看护；本轮修掉分析诊断重扫完整历史、token count cache 完整 JSON 签名和 SmartRouter/semantic 内部 loopback 继承长超时三个缺口。`docs/release-notes-v1.20.2.md`、README 发布定位、发布指南、部署资产断言和 `package.json` / `package-lock.json` 已同步到 `1.20.2`。最终发布门禁以 `npm run release:verify` 为准。

### v1.20.3 Web UI 本地优先重构

优先级：高（P1 高频入口体验）。

用户目标：`/ui` 默认先回答本地路由用户最常问的“当前是否运行、默认模型是谁、我怎么快速配置”，远程接入和维护观测继续可达但不再抢第一层。

1. `[closed 2026-06-20]` 本地工作台首屏收敛：首屏集中展示本地状态、端口、模式、角色、模型数和 `Router.default`。
   - 闭环标准：普通本地用户不需要先理解远程/维护概念，也能判断服务状态和下一步配置动作。
2. `[closed 2026-06-20]` 快速配置主路径强化：厂商模板、Model ID、API Key、上游模型和 API 地址成为默认主任务。
   - 闭环标准：一键生成、预览、保存仍可用，advanced JSON 草稿和 SmartRouter 不干扰首次配置。
3. `[closed 2026-06-20]` 高级特性分层：远程接入、维护观测和高级路由移动到第二层入口。
   - 闭环标准：维护者工作台能力不丢失，但默认视觉权重低于本地配置。
4. `[closed 2026-06-20]` Apple-inspired visual refresh：样式切到白/浅灰、细边线、低阴影、8px 圆角和克制蓝色强调。
   - 闭环标准：桌面和移动真实浏览器 smoke 不横向溢出，关键配置控件和 tab 切换仍可用。

v1.20.3 闭环验证：Web UI 本地优先重构已完成并补 DOM/browser 看护；本轮通过 `build-web-apps` 与 `imagegen` 辅助设计概念，落地本地状态优先、快速配置主路径、高级特性分层和 Apple 系克制视觉。`docs/release-notes-v1.20.3.md`、README 发布定位、发布指南、部署资产断言和 `package.json` / `package-lock.json` 已同步到 `1.20.3`。最终发布门禁以 `npm run release:verify` 为准。

### v1.20.4 Web UI 概念图一致性与国内厂商模板更新

优先级：高（P1 高频入口体验）。

用户目标：`/ui` 进一步贴近已确认概念图，同时让国内常用模型厂商和聚合平台模板可按当前使用习惯直接选择。

1. `[closed 2026-06-21]` 概念图一致性增强：顶部导航、本地状态横条、快速配置主区和右侧高级特性栏对齐概念图。
   - 闭环标准：桌面首屏能同时看到本地状态、快速配置和常用模板入口，移动端不横向溢出。
2. `[closed 2026-06-21]` 国内厂商模板重分组：模板分为模型厂商和聚合平台。
   - 闭环标准：模型厂商按 GLM / DeepSeek / Kimi / MiniMax / GPT / Claude 排序，聚合平台按阿里百炼 / 火山引擎 / 百度千帆 / 讯飞星辰 / OpenRouter 排序。
3. `[closed 2026-06-21]` 发布版本承载切换：本轮 UI 与模板变更不复用已安装过的 `v1.20.3`。
   - 闭环标准：`package.json`、`package-lock.json`、README、发布指南、release notes 和部署资产断言同步到 `v1.20.4`。

v1.20.4 闭环验证：Web UI 概念图一致性与国内厂商模板更新已完成并补 DOM/browser 看护；本轮落地模型厂商/聚合平台分组、模板默认值更新、README/配置指南/示例配置同步和新 release notes。`docs/release-notes-v1.20.4.md`、README 发布定位、发布指南、部署资产断言和 `package.json` / `package-lock.json` 已同步到 `1.20.4`。最终发布门禁以 `npm run release:verify` 为准。

## 执行规则

1. 后续“按照计划优先级继续推进”默认先看本文档版本路线，再回到统一进展基线确认状态。
2. v1.13.0 已承接并闭环本轮用户体验复审发现的核心路由体感和看护缺口；v1.14.0 已闭环配置产品化最终收口；v1.15.0 已闭环 CLI/setup UX 重设计收口；v1.16.0 已闭环用户视角复审与入口一致性校准；v1.17.0 已闭环 UI 双层工作台收敛；v1.18.0 已闭环治理观测运营化增强；v1.19.0 已闭环部署形态与远程接入收敛；v1.19.2 已闭环新版 Claude 长任务超时与流式中断修复；v1.19.3 已闭环 Claude 流式断流系统修复；v1.19.4 已闭环常见场景稳定性与可用性全量复审；v1.20.0 已闭环发布与进展治理可持续化；v1.20.3 已闭环 Web UI 本地优先重构；v1.20.4 已闭环 Web UI 概念图一致性与国内厂商模板更新；当前默认回到 v1.20.4 Web UI 概念图一致性与国内厂商模板更新发布闭环维护。
3. `ctr eval` 后续服务于验证核心路由，排在入口基础稳定之后，不替代 setup/start/code/doctor/ui 的日常体验。
4. 每个版本进入执行前，都要补一个对应版本的验收 checklist；每轮实现后必须更新本文档状态或在统一基线中记录闭环结论。
