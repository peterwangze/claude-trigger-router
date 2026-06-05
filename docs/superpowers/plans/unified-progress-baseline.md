# Claude Trigger Router 统一进展基线

## 文档定位

本文档是当前仓库后续演进的公共进展入口，用于统一维护：

- 项目整体阶段判断
- 特性 / 事项级进展跟踪总表
- 历史文档的角色与入口归并
- 后续进展维护规则

后续涉及整体进展、阶段变化、跨主线汇总时，优先更新本文档；而详细设计、详细实施拆解、详细进展和问题闭环过程，继续由对应特性文档承载。

## 基线声明

**自 2026-04-16 起，仓库后续的整体演进进度、阶段判断和跨主线汇总，统一以本文档作为公共基线维护。**

如果历史文档与本文档对当前状态的表述不一致，优先以代码现状和本文档的最新校准为准；历史文档保留其设计输入、实施记录、阶段总结和发布说明价值，但不再承担统一进展台账职责。

## 一、当前统一阶段判断

截至 2026-06-05，项目当前状态统一定义为：

> 项目已经完成治理主链首轮能力落地，v1.3.0 基础路由常用体验、v1.4.0 SmartRouter 常用体验、v1.5.0 入口基础功能稳定、v1.6.0 多模型收益运营化、v1.7.0 远程服务 / 模型池安全体验、v1.8.0 低侵入 agent/tool 增强与架构减压、v1.9.0 用户入口与远程客户端一致性收口、v1.10.0 智能路由自适应与多模型协同增强、v1.11.0 基础路由流式稳定性首轮止血、v1.12.0 流式传输韧性与远程中转稳定性修复、v1.13.0 核心路由用户体感与看护补强、v1.14.0 配置产品化最终收口、v1.15.0 CLI/setup UX 重设计收口，以及 v1.16.0 用户视角复审与入口一致性校准已阶段闭环。2026-06-05 已将当前所有未完成主线规划到后续版本：v1.17.0 UI 双层工作台收敛、v1.18.0 治理观测运营化增强、v1.19.0 部署形态与远程接入收敛、v1.20.0 发布与进展治理可持续化。入口稳定、基础路由即时流式输出、上游中途断流可读错误、远程中转取消上游、结构化 API error、发布看护、UI 基础交互、收益证据链、远程服务安全、受保护 UI admin 入口、route preview、角色化 UI 入口和 agent/tool trace contract 继续作为回归底线。

这一定义用于替代历史文档中分散、彼此可能滞后的阶段描述。

### 已完成的基线能力

- TriggerRouter 已落地，具备规则驱动路由能力
- SmartRouter 已落地，具备候选模型智能选择能力
- Router 基础分流已落地，覆盖 `default` / `think` / `longContext` / `webSearch` / `background`
- Governance 主链首轮已落地，覆盖 sticky / alignment / cascade / semantic / shadow
- governance trace、metrics、基础 `/ui` 调试与观测能力已建立
- `Models` 抽象、统一 capability hint 与首轮 message IR / 协议分发已落地
- `ctr setup`、配置保存和 `/ui` 草稿路径已进入产品化持续收敛阶段
- packaged CLI E2E / acceptance 看护、release-stage wrapper 验收链路与发布前门禁已建立
- `ctr init` / `ctr setup` / legacy migration 已开始按“最小可用配置”统一收敛
- `ctr doctor` 已落地，具备配置诊断、低风险自动修复、服务可启动性检查与用户确认后的模型探测能力
- OpenAI-compatible 兼容层已完成首轮行为型 contract 闭环，运行时、doctor 与回归测试不再只依赖 `interface` 做骨架级兼容分发
- legacy config migration 已完成首轮真实样本闭环，setup/doctor/packaged CLI 已能稳定迁移 `.claude-code-router/config.json` 主路径
- 统一 Router 运行时已完成首轮收敛：统一 decision chain、structured smart fallback、route-source/trace 新标签、unified Router schema 双读与 runtime normalize 已形成闭环

## 二、特性进展跟踪

### 维护约束

1. 本章节中的事项 / 特性 **只能新增，不能删除**；若某项失效、取消、合并或被替代，也必须保留原记录，并把状态与闭环结论更新完整。
2. 本章节中的每一条记录都必须持续维护**闭环结论**；即使仍在推进中，也要明确当前阶段结论，而不能只写“进行中”不落结论。
3. 本章节只保留顶层总表，不承载大段详细过程；具体演进设计、实施计划、详细进展、阶段复盘与问题跟踪，统一下沉到对应特性文档。
4. 若新增事项 / 特性，必须先在本表新增一行，再创建或补齐对应特性文档。
5. 若某条记录没有可承接的特性文档，不得直接长期堆在入口文档中。

### 优先级判定规则

为保证后续闭环顺序稳定，未完成主线统一按以下优先级口径维护：

- `P0-基础功能闭环`：影响主路径可用性、最小运行时闭环、兼容主链与迁移主链，不完成会阻塞其他事项推进。
- `P1-主路径易用性`：建立用户可理解、可配置、可进入的统一入口与产品心智，不完成会显著拉高使用门槛。
- `P2-能力扩展与体验增强`：在主路径已可用且可理解后，再继续收拢远程部署、双层工作台、治理观测等增强能力。
- `P3-治理支撑与持续维护`：用于保证进展台账、问题记录、发布质量门禁和长期运营稳定，但不应抢占基础闭环事项之前。

### 特性进展总表

| 事项 / 特性 | 类型 | 当前状态 | 当前优先级 | 当前闭环结论 | 详细进展 / 设计 / 实施文档 |
|---|---|---|---|---|---|
| Governance 治理主链首轮落地 | 核心能力 | closed | closed | sticky / alignment / cascade / semantic / shadow 首轮能力已闭环，当前已转入观测增强与运营化阶段；输入侧 Prompt / Intent Optimization 被定义为治理下一轮增强子特性，而不是独立新总线 | `docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md` ; `docs/superpowers/specs/2026-04-04-router-governance-design.md` ; `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md` ; `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md` ; `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md` ; `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md` ; `docs/superpowers/plans/2026-04-04-governance-release-notes.md` |
| 基础路由与 SmartRouter 常用体验收口 | 用户高频核心主线 | closed | closed | 2026-05-07 从用户使用频率复审后新增为后续版本主线：基础路由 `Router.default/think/longContext/background/webSearch` 和 SmartRouter 规则/候选/切换体感是用户每天最常用的核心功能，优先级应高于离线评测、benchmark 看板、远程部署和 agent/tool 扩展。当前闭环结论是“v1.3.0 基础路由常用体验已阶段闭环；v1.4.0 SmartRouter 常用体验已阶段闭环：新增 `config/trigger.smart-router.yaml` 覆盖 coding/review/architecture/long_context/fast_reply，`/api/models/compiled` 和 preview 已返回 SmartRouter explanation，`/ui` 可展示规则顺序、候选、router_model、semantic/sticky 与 fallback，并通过 Candidate guide 检查 fast / balanced / deep / long-context 覆盖、支持把建议模型加入 candidates；governance trace 现在记录 route source、rule、confidence 和选中模型，`/api/governance/traces` 与 `/ui` 可把最近请求的 rule / semantic intent / fallback reason 翻译成可读摘要；switch continuity summary 已把 initial/final model、sticky、alignment、cascade 和 route source 合成为 stable/aligned/watch/critical 等可读状态；health routing tuning 已把 context window、switch without alignment、switch cascade risk 和 slow route group 转成 `Router.longContext`、`SmartRouter.sticky.alignment`、`SmartRouter.rules/candidates` 等配置建议；`docs/release-notes-v1.4.0.md` 与 `docs/releasing.md` 已固化发布边界和发布前验证口径，deploy assets 测试看护 release notes 包含和发布承诺”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` |
| 入口基础功能稳定与易用性巩固 | 用户高频核心主线 | closed | closed | 2026-05-11 发布计划重排后新增为 v1.5.0 主线：在继续扩展 benchmark、服务化、模型池或 agent/tool 前，先保护普通用户每天会碰到的入口基础功能。当前闭环结论是“v1.5.0 已阶段闭环：coverage 口径已扩到 setup/config/models/protocols/governance/server/auth/doctor/cli 主链；配置保存安全线已覆盖 UI/API/managed key/阈值写入；`test:e2e:cli:entry` 已覆盖 init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui；完整 packaged E2E、acceptance 与 `release:verify` 已通过；UI DOM smoke 已覆盖配置载入、compiled preview、保存失败提示、服务状态和 Health action，且 `workbench-document.ts` 已先拆出 HTML 文档骨架与脚本抽取”。多模型收益运营化进入 v1.6.0，服务化与模型池安全体验进入 v1.7.0。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/release-notes-v1.5.0.md` |
| 用户入口与远程客户端一致性收口 | 用户高频核心主线 | closed | closed | 2026-05-23 用户视角复审后新增为 v1.9.0 主线：当前 runtime 已支持本地 CTR 作为远端 CTR thin proxy 转发模型调用，但 README / configuration roles 仍存在旧口径；`ctr setup` remote-client next steps 仍未把 `doctor/status -> code` 主路径讲清；`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` 文档口径冲突；`/ui` admin 鉴权入口缺少顺滑进入方式；README 新用户“5 分钟跑起来”位置偏后。当前闭环结论是“v1.9.0 已阶段闭环：README、configuration roles、configuration guide 与 remote client guide 已统一远程客户端 thin proxy 心智；setup remote-client next steps 已提示 `ctr doctor/status -> ctr code` 本地代理主路径并用单测 / packaged entry smoke 看护；Claude Code 远程鉴权推荐已统一到 `ANTHROPIC_AUTH_TOKEN` 并补文档资产测试；`ctr ui`、README、configuration guide、server maintainer guide 和 UI Auth scope guide 已给出受保护 `/ui` admin 访问指导；README 新用户 5 分钟路径已前置并用测试看护”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/superpowers/plans/progress-issue-log.md` ; `docs/release-notes-v1.9.0.md` |
| 智能路由收益与切换体感治理 | 复审新增持续演进特性 | closed | closed | 当前 SmartRouter 已具备规则路由、语义匹配、LLM 选模、sticky correction、context alignment、cascade retry、shadow supervisor 和治理 health；已新增 routing outcome scorecard，`/api/governance/metrics` 与 `/api/governance/health` 能返回 routed rate、model switch rate、stable model rate、alignment-on-switch、cascade-after-switch、route reason 平均延迟、Top model switches，以及 route reason / final model / semantic intent 三类分组 outcome；metrics 已新增 `qualityEvidence` 和 `taskComparison`；`ctr eval` 已支持固定任务、自动执行、严格质量维度评分、人工/外部 LLM 裁判校准字段和内置 `--judge-model` 裁判执行器。当前闭环结论是“v1.6.0 多模型收益运营化已阶段闭环：新增 `ctr eval --save-history` / `ctr eval --history`、`/api/benchmark/history`、`/api/benchmark/calibration`、`/ui` benchmark history、Human calibration 表单、固定任务 `routeScenario` 与报告 `byRouteScenario`，让离线评测、人工校准、历史趋势、真实 trace task comparison 和 quality evidence 进入同一维护者判断链路”。 | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.6.0.md` |
| 智能路由自适应与多模型协同增强 | 用户高频核心主线 | closed | closed | 2026-05-23 智能路由深度复审后新增为 v1.10.0 主线：当前 SmartRouter 已能完成规则/语义/LLM 候选选模和切换治理，但用户期待的“多模型配合 1+1 远大于 2”需要 outcome-driven routing feedback、模型能力画像、confidence/latency budget、多模型协作模式和用户可见收益证明。当前闭环结论是“v1.10.0 已阶段闭环：routing advisor 已把真实 trace 的质量、失败、延迟、cascade 和 shadow 信号反哺 SmartRouter；server API 已暴露 candidate profiles；SmartRouter 已支持 latency/confidence budget 和 route_only/verify_only/compare_then_arbiter/cascade_on_evidence 协作 contract；trace 与 UI 已展示 routingMode、collaborationMode 和 routingEvidence；发布边界已由 release notes 和 release verify 看护”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.10.0.md` |
| 基础路由流式稳定性与 socket 错误修复 | 用户高频核心主线 / P0 修复 | closed | closed | 2026-05-25 根据用户反馈新增为 v1.11.0 主线：v1.8.0 引入的 stream response governance 在默认路径会先完整 `collectSSE()` 再返回，导致 Claude Code 基础路由每轮对话失去即时流式输出，并可能放大客户端 socket 超时；同一轮复审还发现发送钩子会把 `{ error: ... }` payload 转成 Fastify hook error，使 API 结构化错误表现为 `The socket connection was closed unexpectedly`。当前闭环结论是“v1.11.0 是首轮止血：默认未开启 `Governance.cascade.stream_guard` 时改为边转发原始 stream chunk 边旁路观测 trace，发送钩子保留结构化 error payload，SSE parser 补齐跨 chunk event 状态和无尾随空行 flush；但 2026-06-05 用户确认 v1.11.0 仍复现 socket 异常和中转卡顿，第二层传输韧性已由 v1.12.0 承接”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.11.0.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 流式传输韧性与远程中转稳定性修复 | 用户高频核心主线 / P0 修复 | closed | closed | 2026-06-05 用户确认 `v1.11.0` 仍复现 `The socket connection was closed unexpectedly`、同模型经中转响应更慢和输出突然卡住。当前闭环结论是“v1.12.0 已阶段闭环：默认透传捕获上游 stream read error 并追加可读 SSE error event；远程中转将客户端 close 绑定到上游 fetch abort，远端 SSE 响应进入同一套流式治理包装；SSE parser 持续复用 TextDecoder 修复多字节跨 chunk 解码；发布边界已由 v1.12.0 release notes 和 targeted tests 看护”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.12.0.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 核心路由用户体感与看护补强 | 用户高频核心主线 | closed | closed | 2026-06-05 从用户易用性和使用体验继续深度复审后新增为 v1.13.0 主线：近期 P0/P1 问题说明此前看护偏工程内部，缺少真实用户视角的“慢、卡、错路由、错误不可读、入口模板过重”拦截。当前闭环结论是“v1.13.0 已阶段闭环：新增 `ctr doctor --route-preview` 让用户能预判基础路由和 SmartRouter 选择；README/configuration guide/setup next steps 已收口基础路由触发解释；SmartRouter 起步模板已降为两模型入门，高级模板独立承接复杂能力；协作模式口径已明确默认单模型 `route_only`，不默认并发执行额外模型；`npm run test:route-ux` 已覆盖 route preview、doctor 可读输出、SmartRouter packaged slices、首包即时输出、上游断流可读 error、远程中转取消和结构化错误”。 | `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/superpowers/plans/progress-issue-log.md` ; `docs/release-notes-v1.13.0.md` |
| 服务端 API key 与鉴权控制面 | 复审新增持续演进特性 | closed | closed | `APIKEY` 已收口为 bootstrap/admin key；已新增 `Auth.managed_keys` 哈希存储、managed key 生成/列表/撤销/轮换 API，以及 admin/operator/client/read-only scope 判定；运行时 `apiKeyAuth` 已能接受 active managed client/operator/admin key，并拒绝 revoked、expired 或 scope 不足的 key；启动入口鉴权会刷新当前配置中的 `APIKEY/Auth`，新生成 key、轮换 key 与已吊销 key 不再依赖重启生效；auth audit、quota、operator 最小权限、read-only 状态查询边界、`/api/service-info` 安全摘要和 `/ui` quota 表均已成立。当前闭环结论是“v1.7.0 已把服务端资源泄漏风险、撤销即时性、窗口配额、安全可见性、日常运维最小权限、默认安全策略和密钥轮换运营路径阶段闭环”。 | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md` ; `docs/release-notes-v1.7.0.md` |
| server/cloud 一键部署与角色化运维入口 | 复审新增持续演进特性 | closed | closed | `ctr deploy init --target server` 已能生成带随机 bootstrap `APIKEY`、`HOST: 0.0.0.0`、`Runtime.mode: server`、`Runtime.security`、日志、`Models` 和 `Router.default` 的自托管 server 起步配置；npm 包已随附 Docker Compose / systemd 模板，setup fresh 路径也可选择部署为远程服务端且不会自动启动；README、configuration roles、server maintainer guide、remote client guide、`ctr status`、`ctr doctor`、`/api/service-info` 和 `/ui` 已能表达服务维护者 / 远程使用者边界。当前闭环结论是“v1.7.0 已把 server 部署入口、角色化运维、默认安全策略、维护者 checklist 和密钥轮换路径阶段闭环；仍不宣称完整 cloud/托管控制面”。 | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md` ; `docs/release-notes-v1.7.0.md` |
| 治理观测增强 / 运营化 | 持续演进特性 | in_progress | P2-能力扩展 | metrics、快照、归档、异常检测、时间窗趋势和治理健康摘要已具备第一轮基础，当前闭环结论是“已从可调试进入可运营增强阶段，维护者能通过 `health` 摘要判断 idle / healthy / watch / critical，并能通过 Health action 联动 trace 过滤进入 cascade / shadow 排查视图；README / configuration guide / CLI test matrix 已同步健康摘要口径；release-stage wrapper 已覆盖打包后 `/ui` HTML 与 `/api/governance/health` smoke；routing outcome scorecard 已进入同一 metrics/health 口径；后续应继续承接智能路由分任务收益、pool health 和 key audit”；输入侧优化将作为治理增强链路的下一轮设计输入推进，真实浏览器 DOM 交互 smoke 后续作为 UI 看护增强项保留 | `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md` ; `docs/superpowers/plans/2026-04-06-router-progress-calibration.md` ; `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md` |
| 部署形态与远程接入收敛 | 持续演进特性 | in_progress | P2-能力扩展 | 本地单机部署已形成基础，且已落地 Runtime/Registration 配置归一化、`/api/service-info` runtime metadata contract、显式 Runtime/Registration 保存保留、远程服务配置草稿、`/api/remote-status` 摘要、registration semantics、setup/doctor/UI 远程心智和公开文档叙事；`Runtime.mode: local` 且 `Runtime.remote_service.enabled` 时，本地 CTR 已能在认证后把 `/v1/messages` 与 `/v1/chat/completions` 转发到远程 CTR，并用 `Runtime.remote_service.auth_token` 作为远端 managed client + read-only key，避免本地 SmartRouter/agent/governance 重复处理远端请求；`/api/remote-status` 已只读同步远端 `/api/registration` 脱敏摘要，UI 可展示远端注册模型数和 upstream 服务数。当前闭环结论是“远程接入已从状态查询推进到最小模型调用转发与只读注册摘要同步；后续服务发现、节点/集群编排和托管控制面仍不宣称已支持” | `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md` ; `docs/superpowers/plans/2026-04-17-deployment-and-remote-access-implementation.md` ; `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` ; `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` |
| 同模型多源池化与注册调度 | 复审新增持续演进特性 | closed | closed | 已新增 `Registration.models` model pool contract：同一 logical model 可编译为多个 registration endpoint，支持 priority、least-latency、round-robin、health-aware、cost-aware 策略、active endpoint、fallback candidate、endpoint 启停、upstream service 关联、warning、主动健康探测、成本/速率元数据、持久化 health、cooldown、熔断和延迟窗口，并通过 `/api/models/compiled` / `/api/models/compiled/preview` / `/api/models/pool-health` / `/ui` 暴露。当前闭环结论是“v1.7.0 已把模型池从可观测 fallback 推进到可主动探测、可解释成本/速率、可多策略调度的阶段闭环；后续服务发现、节点/集群编排和完整托管控制面仍不宣称已支持”。 | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md` ; `docs/release-notes-v1.7.0.md` |
| Agent / 工具能力演进探索 | 复审新增持续演进特性 | closed | closed | 当前已有 image agent、tools fallback、governance trace 和 context alignment 基础；2026-05-23 架构复审后，当前闭环结论调整为“后续可借鉴 handoff、supervisor、guardrail、tracing 等主流 agent 心智，但项目定位仍应保持 Claude Code 路由代理；v1.8.0 必须先收口 runtime pipeline 阶段、工具能力声明、内部调用鉴权和 trace span contract，再做低侵入 handoff summary / guardrail，不先扩张为完整 agent 平台”。v1.8.0 已阶段闭环：runtime pipeline 阶段顺序、请求级记录、remote forward bypass 和 context guard / protocol dispatch / response governance 状态看护已完成；管理 API 已新增 route contract，auth、service、models、governance、benchmark、config、runtime、UI 的 domain / scope / sensitive response 统一由 `apiKeyAuth` 消费；route handoff summary 已进入 governance trace、API 和 `/ui`；tool capability guardrail 已按 selected model capabilities 决定工具注入并写入 trace；输入/输出 guardrail 已把 prompt injection、secret exfiltration、placeholder output 和 tool error 纳入 trace；trace spans 已把 runtime pipeline、model_pool_fallback 与 guardrail 证据归一进 `governanceTrace.spans`。后续若继续扩展 agent/tool，必须先新增版本计划和最小 contract，不默认扩张为完整 agent 平台。 | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md` ; `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.8.0.md` |
| UI 双层工作台收敛 | 持续演进特性 | in_progress | P2-能力扩展 | 当前 `/ui` 已完成首轮使用者 / 维护者 surface 分层：使用者默认进入配置草稿、模型、路由、compiled preview 与保存动作，维护者独立承接 trace、metrics、异常阈值、快照和归档；2026-05-23 架构复审确认 `src/ui/workbench.ts` 仍是大型 HTML/CSS/内联 JS 字符串；2026-06-05 的 v1.16.0 用户视角复审已先补齐角色化 UI 入口与设计辅助面板，第一屏已区分本地使用者、远程客户端、服务维护者和路由设计辅助，并把角色入口纳入 fragment contract 与 DOM 跳转看护。当前闭环结论是“UI 双层产品边界已有可操作入口，v1.8.0 已先抽出 workbench fragment contract、surface tabs 和内联脚本 JSON helper，使用者配置、compiled models、维护者 auth、pool health、governance observability、benchmark 与 role-aware entry 锚点均有 jsdom smoke 看护；后续 v1.17.0 继续在该 contract 上拆分 CSS/JS helper、承载 guardrail、trace span 和真实浏览器 smoke”。 | `docs/superpowers/specs/2026-04-17-dual-surface-ui-ux-design.md` ; `docs/superpowers/plans/2026-04-17-dual-surface-ui-ux-implementation.md` ; `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` ; `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` |
| SmartRouter 早期专项计划 | 历史专项 | archived | archived | SmartRouter 已不再是独立新增主线，当前闭环结论是“历史计划价值保留，但后续演进应纳入统一 Router 心智与配置产品化体系” | `docs/superpowers/plans/2026-03-22-smart-router.md` |
| `ctr setup` 早期实施计划 | 历史专项 | archived | archived | setup 已完成从早期 checklist 到产品入口的阶段跃迁，当前闭环结论是“原始计划归档，后续演进转由 setup UX 与配置产品化文档承接” | `docs/superpowers/plans/2026-04-02-ctr-setup.md` ; `docs/superpowers/specs/2026-04-02-setup-usability-design.md` |
| OpenAI-compatible 主路径兼容补强 | 持续演进特性 | closed | closed | 已补上 `ctr code` 新环境默认代理凭证注入，以及 OpenAI-compatible / Anthropic endpoint 的 base url 自动归一；并补齐 fresh setup -> code、doctor bare endpoint probe、runtime bare endpoint dispatch、legacy migration bare endpoint runtime、手填接口显式 interface 选择、Anthropic bare endpoint 用户流，以及 bare anthropic host 的 doctor / migration / schema 推断一致性回归。当前闭环结论是“这轮复审后新增的 P0 兼容裂缝已完成首轮真实用户流补强，默认请求链路、兼容链路与迁移链路已不再因这些 endpoint / 环境变量问题阻塞；后续剩余工作转入 CLI 稳定性与发布工程、配置产品化和持续复审校准，不再作为独立未闭环 P0 事项维护”。 | `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` ; `docs/superpowers/specs/2026-04-12-cli-e2e-test-design.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 配置产品化最终收口 | 持续演进特性 | closed | closed | `Models` 抽象、message IR、setup、`/ui` 与 warning 通道已建立基础闭环。当前闭环结论是“v1.14.0 已阶段闭环：README、configuration guide、setup、doctor、`/ui`、保存 API 与 compiled preview 已统一到 `id/api/key/interface/model/thinking/metadata` 字段心智；旧别名继续兼容读取但不作为写回入口；路由槽位配置路径、capability warning action、保存/预览 warning contract 和 canonical 写回均已用 targeted tests 看护”。 | `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` ; `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` ; `docs/superpowers/plans/2026-04-06-router-progress-calibration.md` ; `docs/release-notes-v1.14.0.md` |
| OpenAI-compatible 兼容差异内化 | 持续演进特性 | closed | closed | 行为型 compatibility contract、复杂消息块转换、capability 降级、runtime diagnostics 与 doctor/CLI 回归已形成首轮闭环，当前闭环结论是“默认 OpenAI-compatible 主路径已可按统一 contract 运行，后续剩余工作转入 migration / unified router / 产品入口收口，不再作为独立未闭环 P0 主线维护” | `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` ; `docs/superpowers/specs/2026-04-11-legacy-config-migration-design.md` ; `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` |
| legacy config migration 收敛 | 持续演进特性 | closed | closed | 真实 `.claude-code-router/config.json` 样本、宽松 JSON 读取、module id 稳定映射、supported 顶层字段与 Router 槽位迁移、skippedFields 提示、setup/doctor/packaged CLI 回归已形成首轮闭环，当前闭环结论是“legacy 迁移主路径已不再作为独立未闭环 P0 主线维护，后续剩余事项并入统一 Router 与配置产品化收口” | `docs/superpowers/specs/2026-04-11-legacy-config-migration-design.md` |
| 统一 Router 运行时收敛 | 持续演进特性 | closed | closed | `smart_rule -> semantic_match -> smart_router -> sticky_correction` 决策链、统一 route-source/trace、structured smart hint、unified Router schema 双读与 runtime normalize 已完成首轮闭环；同时已补齐 unified `Router.defaults` 对治理层的真实启用与 mixed config + model id 引用兼容，当前闭环结论是“运行时底座已可作为后续 setup/UI/docs 收口前提，剩余工作转入对外心智与产品入口主线” | `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md` ; `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md` |
| Trigger 收编到 SmartRouter（统一路由引擎化） | 持续演进特性 | closed | closed | SmartRouter 已成为统一路由运行时入口；Trigger 规则已内收为 SmartRouter 前置规则能力；legacy intent 已折入 SmartRouter semantic classifier；semantic / sticky / alignment 已作为 SmartRouter 默认增强层启用并支持显式关闭；统一 Router routes/defaults 归一不再派生并列 TriggerRouter / Governance semantic-sticky 分支；routeSource / trace reason 已切到 `smart_rule` / `semantic_match` / `smart_router` 等统一标签。当前闭环结论是“运行时主线已阶段闭环，后续对外模板、README、setup、UI 的叙事收口并入配置产品化与 CLI/setup UX 主线继续推进” | `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md` |
| CLI / setup UX 重设计 | 持续演进特性 | closed | closed | 当前闭环结论是“v1.15.0 已阶段闭环：setup 继续优先复用/迁移当前配置，fresh setup 才按 `Models[].id` 创建默认模型和 `Router.default`；setup 写回 canonical `id/api/key/interface/model` 字段；添加复杂任务模型后可直接接到 `Router.think` 或 `Router.think + Router.longContext`，并可生成 SmartRouter rules / candidates 起步配置；本地、远程客户端和服务端部署完成页已明确 `doctor/status -> code/ui` 或维护者启动路径；packaged help 和 `test:e2e:cli:entry` 已看护 help/setup/doctor/code/ui 入口文案与主路径漂移；v1.16.0 已完成用户视角复审与入口一致性校准，后续作为入口回归底线维护”。 | `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` ; `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md` ; `docs/release-notes-v1.15.0.md` ; `docs/release-notes-v1.16.0.md` |
| 项目目标与用户使用视角复审 | 复审 / 实施计划 | in_progress | P1-主路径易用性 | 已完成 2026-04-25 首轮横向复审，并已闭环 P1-1 权威入口修正与 P1-2 `ctr ui` 使用者入口第一屏收口；2026-04-26 复审补强已修正生产启动路径缺失完整配置与 `/ui` 状态值未转义的问题，并已完成 P1-3 setup/UI/doctor/server save 共享 validation issue contract、P1-4 UI 渲染职责拆分、P2-1 UI 双层 surface 首轮落地、P2-2 远程接入最小双端边界，以及 P2-3 治理健康摘要首轮落地。2026-04-27 已追加智能路由收益、模型切换体感、server/cloud 鉴权、一键部署、同模型多源池化和 agent/tool 演进复审，并重排近期优先级；2026-04-28 已补 P1-5 synthetic tasks regression；2026-05-11 已按 v1.4.0 后代码现状再次复审项目目标、高频功能稳定性/易用性、架构压力和看护口径；随后发布计划按用户常用功能重新整理，明确 v1.5.0 优先做入口基础功能稳定与易用性巩固，v1.6.0 再做多模型收益运营化，v1.7.0 再做服务化与模型池安全体验；2026-05-18 复审确认项目目标仍应聚焦本地/远程路由代理，并把 packaged CLI e2e 门禁稳定化、UI 最小 DOM/browser smoke、`server.ts` / `workbench.ts` / `index.ts` 架构减压列为新的优先级证据；2026-05-23 架构复审确认 v1.7.0 后目标与实现总体一致，并已通过 v1.8.0 收口 runtime pipeline、管理 API route contract、UI fragment contract 和 agent/tool trace span；同日用户视角复审继续发现远程客户端文档、setup next steps、鉴权变量、`/ui` admin 入口和 README 新用户路径存在 P1 级一致性缺口，现已通过 v1.9.0 阶段闭环承接；随后智能路由深度复审确认当前 SmartRouter 仍偏“智能单模型路由 + 治理看护”，并已通过 v1.10.0 阶段闭环补上自适应反馈、模型画像、预算策略、协作模式和 UI 证据入口；2026-06-05 的 v1.16.0 复审已确认项目目标与 README/configuration guide/setup/doctor/UI/runtime 主路径仍一致，并把第一屏缺少角色化入口的问题通过 PI-026 和角色入口 DOM 看护闭环，高频入口已通过 `test:e2e:cli:entry` 与 `test:route-ux` 复核，v1.9.0-v1.15.0 closed 事项抽样未发现新漂移。当前闭环结论是“项目复审继续作为跨主线校准入口；v1.16.0 已作为用户视角回归基线闭环；后续默认进入 v1.17.0 UI 双层工作台工程化收敛；出现 fresh setup、兼容分发、远程转发、配置保存、鉴权失效、受保护 UI admin 入口失效、角色化 UI 入口退化或 release verify/e2e 在发布环境不可稳定执行时重新升 P0/P1” | `docs/superpowers/plans/2026-04-25-project-goal-user-review-implementation.md` ; `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` ; `docs/release-notes-v1.16.0.md` |
| CLI 稳定性与发布工程 | 持续演进特性 | in_progress | P3-治理支撑 | packaged CLI E2E、acceptance、release-stage wrapper 已形成首轮门禁，并已把 staged `/ui` HTML 与治理健康 API smoke 纳入 acceptance；2026-05-18 已确认完整 `test:e2e:cli` 在 Windows 本地约 3-4 分钟可通过，新增 `test:e2e:cli:entry` 较短入口 smoke，release verify、GitHub release check 和 publish workflow 已接入，harness timeout 也会清理子进程树并输出命令诊断。当前闭环结论是“发布前质量门槛已成型，packaged e2e 门禁可依赖性已完成第一层补强；后续继续压低耗时和测试日志噪声” | `docs/superpowers/specs/2026-04-12-cli-e2e-test-design.md` |
| 已闭环事项复审校准 | 治理事项 | in_progress | P3-治理支撑 | 已开始按统一基线顺序复审 closed 事项；当前阶段结论是“不回退既有 closed 结论，但对复审发现的问题通过新增事项持续跟踪，并要求文档、测试和用户主路径证据与原闭环事务建立显式关联”。当前已识别的首批问题包括 OpenAI-compatible 主路径兼容补强，以及统一 Router 运行时闭环描述与当前代码链路的校准需求。 | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 进展文档体系治理 | 治理事项 | in_progress | P3-治理支撑 | 公共入口已切换为不带日期标签的统一基线，当前闭环结论是“单一入口已经建立，但后续仍需按规则维护特性表与问题记录，防止再次膨胀或口径漂移” | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 问题修改记录 | 治理事项 | in_progress | P3-治理支撑 | 问题记录文档已建立，当前闭环结论是“历史问题已开始沉淀为可追踪事项，后续所有文档治理偏差必须在此追加记录并闭环” | `docs/superpowers/plans/progress-issue-log.md` |

## 三、问题修改记录关联

为避免后续重复犯相同错误，文档治理过程中的问题、错误修改、修正动作和闭环结论，统一记录到：

- `docs/superpowers/plans/progress-issue-log.md`

该文档属于统一进展入口的关联事项文档，职责是：

- 记录历史出现过的问题与错误口径
- 记录每次修正动作、影响范围与闭环结论
- 为后续新增事项 / 特性、调整入口结构、修改状态口径提供反例约束

本文档不展开问题细节，只保留入口与规则，避免公共入口继续膨胀。

## 四、历史文档收编与角色归位

### 1. 治理化演进主线文档

- `docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
  - 定位：治理化演进历史路线图
  - 角色：保留为路线设计输入，不再承担当前总进展入口职责
- `docs/superpowers/specs/2026-04-04-router-governance-design.md`
  - 定位：治理化演进设计文档
  - 角色：保留为治理设计依据，不承担当前进展跟踪职责
- `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`
  - 定位：治理化演进实施计划
  - 角色：保留为历史实施拆解，不作为当前总览入口
- `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md`
  - 定位：治理化演进历史跟踪文档
  - 角色：保留为历史进展来源与阶段依据，不再作为统一进展台账
- `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md`
  - 定位：治理化演进阶段收口说明
  - 角色：保留为里程碑总结，不承担统一进展职责
- `docs/superpowers/plans/2026-04-04-governance-release-notes.md`
  - 定位：治理化演进阶段发布说明
  - 角色：保留为 release notes，不承担统一进展职责

### 2. SmartRouter、setup 与校准过渡文档

- `docs/superpowers/plans/2026-03-22-smart-router.md`
  - 定位：SmartRouter 早期专项计划
  - 角色：保留为历史专项计划与产品心智来源，不承担当前主线总览职责
- `docs/superpowers/plans/2026-04-02-ctr-setup.md`
  - 定位：`ctr setup` 早期实施计划
  - 角色：保留为 setup 主线的历史起点与原始 checklist 来源
- `docs/superpowers/specs/2026-04-02-setup-usability-design.md`
  - 定位：setup 易用性设计文档
  - 角色：保留为 setup / onboarding 设计输入，不承担进展跟踪职责
- `docs/superpowers/plans/2026-04-06-router-progress-calibration.md`
  - 定位：历史计划与当前实现差异校准报告
  - 角色：保留为从治理主线转向多主线并行阶段的重要校准依据

### 3. 配置产品化与统一模型配置主线文档

- `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md`
  - 定位：配置产品化第二阶段实施计划
  - 角色：保留为配置产品化主线的专项计划文档
- `docs/superpowers/specs/2026-04-06-unified-model-config-design.md`
  - 定位：统一模型配置与消息协议转换设计
  - 角色：保留为 `Models`、message IR、capability 表达的设计依据
- `docs/superpowers/specs/2026-04-11-legacy-config-migration-design.md`
  - 定位：legacy config migration 设计文档
  - 角色：保留为迁移与兼容语义内化主线的设计依据

### 4. 统一 Router 与 SmartRouter 统一路由引擎主线文档

- `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md`
  - 定位：统一 Router 架构演进设计
  - 角色：保留为 TriggerRouter / SmartRouter / Governance 收敛的设计依据
- `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md`
  - 定位：统一 Router 实施计划
  - 角色：保留为运行时链路、schema、trace、持久化收敛的专项实施文档
- `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md`
  - 定位：Trigger 收编到 SmartRouter（统一路由引擎化）实施计划
  - 角色：保留为 SmartRouter 统一路由引擎、Trigger 前置能力内收与治理增强默认化的专项执行文档

### 5. CLI / setup UX、部署形态与双层 UI 文档

- `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md`
  - 定位：CLI / setup UX 重设计方案
  - 角色：保留为 migration-first、model-id-first 入口设计依据，并承接使用者界面入口与远程接入心智收口
- `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md`
  - 定位：CLI / setup UX 重设计实施计划
  - 角色：保留为 setup 流程、帮助文本和 README 对齐的专项实施文档
- `docs/superpowers/specs/2026-04-12-cli-e2e-test-design.md`
  - 定位：CLI E2E / acceptance / release-stage 验证设计
  - 角色：保留为 CLI 稳定性与发布工程主线的测试设计依据
- `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md`
  - 定位：部署形态与远程接入设计文档
  - 角色：保留为本地 / server / cloud 部署、服务端 / 客户端职责和远程注册边界的设计依据
- `docs/superpowers/plans/2026-04-17-deployment-and-remote-access-implementation.md`
  - 定位：部署形态与远程接入实施计划
  - 角色：保留为 service mode、remote status、registration、setup / doctor / UI 收口的实施拆解文档
- `docs/superpowers/specs/2026-04-17-dual-surface-ui-ux-design.md`
  - 定位：UI 双层工作台设计文档
  - 角色：保留为使用者界面 / 维护者界面分层、导航与演进顺序的设计依据
- `docs/superpowers/plans/2026-04-17-dual-surface-ui-ux-implementation.md`
  - 定位：UI 双层工作台实施计划
  - 角色：保留为 `/ui` 顶层导航、页面分层、使用者 / 维护者工作台收口的实施拆解文档
- `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md`
  - 定位：治理输入侧优化设计文档
  - 角色：保留为 Prompt / Intent Optimization 作为治理增强子特性的设计依据

## 五、后续维护规则

### 1. 本文档负责什么

本文档负责维护：

- 项目整体阶段定义
- 特性 / 事项级总表
- 优先级口径与闭环判定标准
- 历史文档的角色说明与入口归并
- 需要团队统一对齐的当前基线与边界
- 问题修改记录文档的入口与维护约束

### 2. 特性文档负责什么

各特性文档继续负责：

- 方案设计细节
- 实施拆解与任务结构
- 详细进展、阶段记录与复盘
- 某一阶段的 release / milestone 收口
- 某一类问题的持续问题跟踪与修正闭环

### 3. 维护顺序

后续若有新增演进，推荐按以下顺序维护：

1. 先在本文档“特性进展总表”新增事项 / 特性行，并填写初始状态与当前闭环结论
2. 再创建或更新对应特性文档，承接详细设计、实施计划、详细进展或问题记录
3. 若状态发生变化，先更新本文档表格中的状态与闭环结论，再回补特性文档细节
4. 若出现文档结构、状态口径或入口治理问题，必须同步追加到 `docs/superpowers/plans/progress-issue-log.md`

### 4. 优先级闭环判定标准

后续判断某条主线是否可以从“推进中”切换到“阶段闭环 / closed”，统一以该主线对应优先级的闭环判定标准为准，而不只看是否已经立项或拆出实施计划。

#### P0：基础功能闭环判定

满足以下条件，才能认为 P0 事项达到阶段闭环：

1. 主路径运行时能力已经落地，且不会阻塞默认请求链路、兼容链路或迁移链路。
2. 对应 schema / compile / dispatch / migration 等基础链路已有测试覆盖，且目标测试可以稳定通过。
3. 关键兼容语义不再停留在骨架或占位状态，而是形成可验证的真实行为闭环。
4. 后续剩余工作即使存在，也主要属于扩展能力、补样本或体验优化，而不是主路径不可用。

#### P1：主路径易用性闭环判定

满足以下条件，才能认为 P1 事项达到阶段闭环：

1. 用户主入口叙事已经统一，CLI / setup / README / `/ui` 不再明显分叉。
2. 默认使用路径已经可理解、可配置、可保存、可进入，不依赖用户先理解历史术语或内部实现。
3. 相关入口文案、模板、页面导航或保存路径已完成最小一致性收口。
4. 剩余事项主要是高级能力延展，而不是基础使用门槛过高。

#### P2：能力扩展与体验增强闭环判定

满足以下条件，才能认为 P2 事项达到阶段闭环：

1. 增强能力已建立明确产品边界，不再与主路径职责混杂。
2. 对应能力至少完成一轮最小实现，核心页面 / 接口 / 状态表达可达且可验证。
3. 扩展能力已具备独立验证方式，包括 targeted tests、状态查询或文档 checklist。
4. 剩余工作主要属于增强覆盖面、长期运营化或更复杂场景，而不是能力边界本身仍不成立。

#### P3：治理支撑与持续维护闭环判定

满足以下条件，才能认为 P3 事项达到阶段闭环：

1. 质量门禁、文档入口、问题记录或发布验证链路已形成稳定维护机制。
2. 新增事项、状态变化和问题修正已有统一维护位置，不再依赖临时口径。
3. 对应治理动作具备持续执行抓手，例如回归测试、issue log、release verify 或台账规则。
4. 剩余工作主要是持续维护频率和覆盖面优化，而不是机制缺失。

### 5. 当前优先闭环顺序

当前建议按“先基础功能、再主路径易用性、最后能力扩展与治理支撑”的逻辑闭环：

#### P0：基础功能闭环

当前无独立未闭环 P0 主线。

##### P0 主线离闭环还差什么

- 当前没有独立未闭环的 P0 主线；`OpenAI-compatible 主路径兼容补强` 已完成首轮闭环，v1.11.0 已完成基础路由流式中断和 socket-level API error 的首轮止血，v1.12.0 已补上游中途断流、远程中转取消上游和 SSE 多字节跨 chunk 解码。后续若再出现会阻塞默认请求链路、兼容主路径、迁移主路径、基础路由即时流式输出、远程中转稳定性或结构化 API error 返回的新 gap，再重新加入本节维护。

#### P1：主路径易用性

1. 基础路由与 SmartRouter 常用体验收口
2. 入口基础功能稳定与易用性巩固
3. 智能路由自适应与多模型协同增强
4. 配置产品化最终收口
5. CLI / setup UX 重设计（v1.15.0 已阶段闭环）
6. 智能路由收益与切换体感治理
7. 服务端 API key 与鉴权控制面
8. server/cloud 一键部署与角色化运维入口
9. 项目目标与用户使用视角复审

##### P1 主线离闭环还差什么

- `基础路由与 SmartRouter 常用体验收口`
  - 本轮从用户使用频率复审后新增为后续版本最高优先主线：普通用户每天最常用的是基础路由和 SmartRouter，而不是离线评测、benchmark 看板、远程部署或 agent/tool 扩展。
  - 已确认运行时基础能力具备：`Router.default/think/longContext/background/webSearch`、SmartRouter 规则/语义/候选、sticky/alignment/cascade/context guard 均已落地。
  - v1.3.0 基础路由体验已阶段闭环：基础路由五槽位配置向导与 `config/trigger.routing.yaml` 可复制模板已闭环，`ctr doctor` 槽位体检已闭环，`/ui` 使用者工作台也已展示 default/think/longContext/background/webSearch 槽位解析、上游目标、能力、warning 和 context window 可操作提示；packaged acceptance 已覆盖 fresh setup、`ctr status`、`ctr code`、槽位解析和 longContext fallback。
  - v1.4.0 已闭环 SmartRouter 规则模板、配置解释、候选模型向导、近期路由决策摘要、切换体感摘要、慢路由/错路由配置路径级调优建议和发布前复核。
  - v1.11.0 已补 v1.8.0 后基础路由默认流式治理回归：默认 stream response governance 不再完整缓冲 SSE 后才返回，而是立即转发原始 chunk 并旁路收集 trace；结构化 API error 不再被发送钩子提升为 socket-level hook error。
  - v1.12.0 已补用户在 v1.11.0 上再次复现的问题：上游 stream 中途断开时追加可读 SSE error event；远程中转客户端断开时取消上游 fetch；SSE parser 复用 TextDecoder 处理多字节跨 chunk。
- `入口基础功能稳定与易用性巩固`
  - v1.5.0 先保护用户每天会碰到的入口主路径：`ctr setup -> ctr start/status -> ctr code`，以及出错时的 `ctr doctor` 和 `/ui`。
  - 需要把 fresh setup、复用配置、legacy migration、repair/rebuild、远程客户端、服务端部署 profile、端口占用、stale PID、alternate port、Claude CLI 不存在等情况都纳入入口契约。
  - setup、doctor、UI save 和配置保存路径需要继续复用同一 validation issue contract，确保不会误覆盖、静默丢配置或给出互相矛盾的修复建议。
  - `/ui` 需要从 HTML 字符串 smoke 推进到最小 DOM/browser smoke，优先覆盖载入配置、预览 compiled models、保存失败提示、服务状态、基础路由解释和维护者 Health 展示。
  - coverage 与 release verify 需要围绕入口主路径校准，先扩到 setup / config / models / protocols / governance / server 主链，再继续扩展 benchmark 和服务化能力。
- `智能路由收益与切换体感治理`
  - 已有规则路由、语义匹配、LLM 选模、sticky correction、context alignment、cascade、shadow、health 和第一层 routing outcome scorecard。
  - 已把 initial/final model、切换、稳定模型、alignment-on-switch、cascade-after-switch、route reason 延迟、Top model switches、route reason / final model / semantic intent 分组收益沉淀为 `/api/governance/metrics` / `/api/governance/health` 可查询指标。
  - 已将上下文窗口保护纳入 outcome 口径：`contextWindowFallbackRate` 用于观察大上下文模型接管收益，`contextWindowExceededRate` 用于暴露配置缺口或模型池容量不足风险，并在 `/ui` 维护者工作台展示。
  - 已新增 routing tuning 建议入口：health 会基于高切换低 alignment、切换后 cascade、上下文窗口风险和慢 route 给出证据与 action，并在 `/ui` 和 CSV 导出中展示。
  - 已新增 `qualityEvidence` 样本摘要：真实 trace 中的 cascade failure、model pool fallback、shadow verification、context window guard、slow request 与 alignment continuity 会进入 `/api/governance/metrics`、CSV 和 `/ui`。
  - 已新增 `taskComparison` 任务集对比摘要：基于已有 governance trace 按任务意图对比不同最终模型的失败率、平均延迟、alignment 与 cascade 表现，并进入 `/api/governance/metrics`、CSV 和 `/ui`。
  - 已新增第一版离线固定任务集执行器：`ctr eval --input results.json` 可用内置固定任务和 deterministic rubric 对多模型输出做可重复评分，输出按模型和任务聚合的 pass rate、quality、speed 与 best run；复审已补输入校验、友好错误和失败 findings 输出。
  - 已新增 `ctr eval --tasks` 固定任务 fixture 导出：维护者可查看或用 `--json` 导出 prompt、expected output、rubric 和 result template，任务覆盖 quick/coding/architecture/long-context/server auth/model pool 场景。
  - 已新增 `ctr eval --run --models "sonnet;haiku"` 最小自动执行器：显式调用 CTR `/v1/messages`，支持 base-url、api-key、timeout、concurrency、max-tokens 和 JSON 输出，并将 HTTP/timeout 失败纳入 runner_error findings。
  - 已新增严格质量维度 rubric：固定任务会输出语义覆盖、完整性、交付格式和安全/卫生等 `dimensionScores` 与维度均分；自定义任务可显式定义 `qualityDimensions`，让同任务多模型 A/B 能解释质量差异来源。
  - 已新增人工/外部 LLM 裁判校准入口：`ctr eval` 输入可带 `humanScore`、`judgeScore`、`calibrationNotes` 和 `judgeFindings`，报告会输出 calibration summary 与高分歧样本。
  - 已新增内置 LLM 裁判执行器：`ctr eval --run --models "sonnet;haiku" --judge-model sonnet` 会自动执行固定任务后调用裁判模型回填 `judgeScore` / `judgeFindings` / `calibrationNotes`；`ctr eval --input results.json --judge-model sonnet` 可对已有结果补裁判分，裁判不可解析或超时会进入 `judge_error` findings 但不计入 calibration score。
  - 已新增 `/ui` 维护者 benchmark summary，把 task comparison、quality evidence、best quality/speed lift 和 `ctr eval --run` 下一步动作合并展示。
  - v1.6.0 已补 benchmark history、人工校准 UI 表单、核心路由场景任务集和评测/真实 trace 对齐；后续收益运营继续作为治理观测增强的输入，不再作为独立未闭环发布阻塞项。
- `智能路由自适应与多模型协同增强`
  - 当前 SmartRouter 仍以规则、语义、候选 LLM 选模和 sticky correction 为主，已经能稳定完成“单个模型选择”，但尚不足以自动形成多模型协同的 1+1 体验。
  - 2026-05-23 深度复审后新增 v1.10.0 作为下一轮默认推进主线，目标是把 outcome-driven routing feedback、模型能力画像、confidence/latency budget 和最小多模型协作模式纳入同一条路由链路。
  - 这一轮不再把“多模型更聪明”只停留在解释面，而是要求把质量、速度、失败、验证和协作收益都写回 trace / health / UI。
  - 若后续只做更多模型候选或更大 prompt，而没有协作模式、反馈闭环和预算策略，则不能算作本主线闭环。
- `服务端 API key 与鉴权控制面`
  - 已新增 generated keys、scope、过期和撤销的第一层控制面，并让运行时鉴权按当前配置即时识别新 key / 吊销 key。
  - 已补 key 使用审计、`/api/auth/audit`、`/api/service-info` 安全摘要，以及 doctor/UI 对 server/cloud 或公网监听无鉴权风险的提示。
  - 已补 request/token/window quota 的进程内模型调用计量、窗口重置、超额 429、审计告警，以及 read-only 对健康/状态 GET 接口的最小权限边界；状态查询和管理请求不会消耗模型调用配额，`/api/service-info` 和 `/ui` 已显示按 key 脱敏的 quota 配额表、当前用量与告警状态。
  - 已补 quota 本地持久化，重启后不会丢失窗口用量；已补 operator scope，用于重启、治理快照/定时快照、异常阈值和归档删除，并继续禁止配置读写和 auth 管理。
  - v1.7.0 已补服务端部署默认安全策略、密钥轮换和托管维护手册；后续若继续扩展 server/cloud，必须沿用 managed key、operator、quota、audit 和 service-info security policy，不把公网 server/cloud 一键部署作为无鉴权默认路径。
- `server/cloud 一键部署与角色化运维入口`
  - 已有 `ctr deploy init --target server`、setup 服务端部署路径、Docker/systemd 模板、server maintainer guide、remote client guide、角色化 README/配置指南，以及 `ctr status` / `ctr doctor` / `/ui` 的 role、listener、auth、client connection 展示。
  - v1.7.0 已补服务端默认安全策略、密钥轮换、泄漏处置、上线 checklist 和托管维护手册，把“一键生成配置”推进到“可安全上线与交付远程客户端 key”的阶段闭环。
  - 后续若推进服务发现、节点/集群编排或托管控制面，仍依赖服务端鉴权控制面和看护门禁，否则部署增强会放大 API key 泄漏风险。
- `配置产品化最终收口`
  - warning、capability hint、repair/save 路径与 setup 多模型引导已继续收拢，setup 侧已补齐首轮 warning 快捷修正模板，`/ui` 与 setup fresh/repair/migration 草稿模型字段也已投影为用户入口字段，`/ui` 字段说明、JSON 草稿提示和 setup 问答字段说明已开始对齐同一字段心智。
  - 后续继续按同一 validation/capability contract 增补更多 warning 类型，避免“UI 可修、CLI 只能提示”的分叉回流。
  - 继续让 README 和 configuration guide 与 `id / api / key / interface / model / thinking / metadata` 心智保持同步。
- `CLI / setup UX 重设计`
  - 按实施计划继续完成 branch ordering、model-id-first fresh flow、help 文案与 README 快速开始的一致性落地。
  - 把 migration-first、最小可用配置优先和 `Models + Router.default` 心智贯彻到 setup 输出与 next steps。
  - 避免 provider-centric 旧叙事从 help、模板、setup 问答或完成页中回流。
- `项目目标与用户使用视角复审`
  - 已按复审实施计划修正权威入口与文档漂移，完成 `ctr ui` 使用者入口收口，建立 setup/UI/doctor/server save 共享 validation issue contract，并将 `/ui` 渲染职责从 `src/server.ts` 拆到 `src/ui/workbench.ts`。
  - 将复审发现的 P2/P3 事项继续下沉到 UI 双层工作台、部署形态、治理观测运营化和 release/coverage 看护主线中，避免新增一条平行产品线。
  - 2026-05-23 复审新增 v1.8.0 架构减压约束：runtime pipeline、管理 API route/service facade、UI fragment 和 trace span contract 必须先进入计划，再叠 handoff / guardrail 能力。
  - 2026-05-25 复审确认 v1.8.0 引入的输出治理默认全量缓冲破坏了基础路由常用流式体验，并把该 P0 运行时回归归档为 v1.11.0 独立修复版；后续新增治理或 agent/tool 能力时，默认请求链路的即时流式输出必须作为前置回归底线。
  - 后续若复审发现会阻塞 fresh setup、兼容分发或 legacy migration 的问题，应重新升级为 P0 事项处理。

#### P2：能力扩展与体验增强

9. 同模型多源池化与注册调度
10. 部署形态与远程接入收敛
11. UI 双层工作台收敛
12. 治理观测增强 / 运营化
13. Agent / 工具能力演进探索

##### P2 主线离闭环还差什么

- `同模型多源池化与注册调度`
  - `Registration.models` 与 `Registration.upstream_services` 已形成最小 model pool，`Registration.models` 中相同 `id` 的多个 endpoint 会进入同一 logical model pool，并暴露 priority active endpoint、启停状态、upstream service 关联和 warning。
  - priority active endpoint 已能编译为内部 provider 并参与 logical model id 解析，治理 trace 会记录 `model_pool:<modelId>:<endpointId>`。
  - 已从 priority + fallback-on-error + health/cooldown/熔断/延迟窗口继续扩展到持久化 health、显式 least-latency 调度和维护者 pool health 运营视图。
  - v1.7.0 已补主动健康探测、成本/速率元数据、round-robin / health-aware / cost-aware 调度；后续若继续扩展 pool health 到统一 health/metrics 摘要，应作为治理观测增强承接，不再阻塞 v1.7.0。
  - 后续服务发现、节点/集群编排和托管控制面仍依赖 API key 控制面和 server/cloud 部署边界，否则池化会放大资源滥用和故障定位风险。
- `部署形态与远程接入收敛`
  - 先按实施计划补齐 service mode、remote status、registration 与 service info，形成最小可验证的服务端 / 客户端边界。
  - 已让本地 remote client profile 在认证后把模型调用转发到远程 CTR，并让 setup、doctor、`/ui` 与公开文档都能稳定表达“本地使用 vs 连接远程服务”，避免远程能力只停留在底层 schema 或 API。
  - 已补只读注册摘要同步：remote client 的 `/api/remote-status` 会拉取远端 `/api/registration` 脱敏摘要并在 `/ui` 展示远端注册模型数。
  - 仍需补远端服务发现、节点/集群编排和更完整服务模式。
  - 完成聚焦回归测试与 build 验证，确认 local 默认路径不被破坏、也没有引入平行运行时心智。
- `UI 双层工作台收敛`
  - 已完成首轮使用者 / 维护者 surface 标识与默认使用者入口，为后续导航拆分建立稳定锚点。
  - 继续细化首页双入口、远程服务状态表达和维护者观测主路径，确保现有 `/ui` 功能仍可达而不再混杂成单页调试台。
  - v1.8.0 前置补 `workbench.ts` 片段拆分和脚本 contract，看护 guardrail / trace span 视图不要继续堆进单个内联脚本。
  - 同步把 README、configuration guide 与 setup 入口说明切到“使用者工作台优先、维护者工作台独立承接”的统一叙事。
- `治理观测增强 / 运营化`
  - 在现有 metrics、异常检测、快照、归档和趋势能力基础上，补齐长期运营闭环所需的稳定入口、查询方式与独立验证抓手。
  - 继续把治理增强与输入侧优化拉通，确保 Prompt / Intent Optimization 等下一轮治理子特性能纳入统一 trace、metrics 与运营观察口径。
  - 让治理观测边界与维护者工作台、导出 / 调度 / archive 管理形成稳定配套，而不是能力已在但日常运营路径仍然分散。
- `Agent / 工具能力演进探索`
  - 当前项目不应先扩张成完整 agent 平台，而应优先借鉴 handoff、guardrail、tracing、supervisor 等机制中对 Claude Code 路由代理直接有收益的部分。
  - 低侵入优先级是 runtime pipeline 边界、工具能力声明、内部调用鉴权、route handoff summary、tool capability guardrail、输入/输出 guardrail、trace span 化和任务 scorecard。
  - 新增 agent/tool 能力必须进入同一 governance trace / health，而不是另起一套观测结构。

#### P3：治理支撑与持续维护

14. CLI 稳定性与发布工程
15. 已闭环事项复审校准
16. 进展文档体系治理
17. 问题修改记录

##### P3 主线离闭环还差什么

- `CLI 稳定性与发布工程`
  - 继续把 packaged CLI、acceptance、release-stage wrapper 的验证切到真实用户流 contract，确保帮助、init、setup、start/stop/status、code、ui 等命令的 side effect 与行为承诺都能被稳定拦截回归。
  - 补齐隔离环境、允许写路径白名单、legacy migration 主路径与 alternate-port 等高风险 E2E slice，避免发布门禁只覆盖源码级逻辑而漏掉打包后行为。
  - 让 release verify 从“已有首轮门禁”进一步收口为可持续执行的稳定机制，压低新入口和新交互路径的回归概率。
- `已闭环事项复审校准`
  - 继续按统一基线顺序复审所有已标记为 closed 的事务，不仅看代码是否存在，还要看是否满足当初对应优先级的闭环标准。
  - 若发现问题，不回退历史结论，而是新增后续事项承接，并在 issue log 中记录“问题点 -> 新增事项 -> 原闭环事务”的关联关系。
  - 对存在文档与实现漂移的 closed 事项，补齐校准说明，避免“代码已变、闭环描述仍停留在旧链路”的隐性失真。
- `进展文档体系治理`
  - 继续按统一基线规则维护总表、优先级、闭环判定和 remaining gap，避免后续新增事项时重新回到散文式入口或多入口并存。
  - 让新增特性、状态变化、历史文档收编和治理偏差都能先回到统一入口再下沉细节，确保入口职责边界不再漂移。
  - 把当前这套排产抓手持续维持为单一事实来源，而不是只在本轮整理后再次失养。
- `问题修改记录`
  - 后续所有文档治理偏差、错误修改和结构回退都必须增量追加到 issue log，而不是停留在会话修正或临时口头结论。
  - 继续保证每条问题记录都带首次暴露时间、影响范围、修正动作、当前状态和闭环结论，形成真正可复盘的治理资产。
  - 让问题记录与统一基线形成联动机制：发现问题时能追到入口规则，调整入口时也能反查历史反例，避免重复踩坑。

### 6. 近期执行顺序（排产抓手）

为避免后续再次出现“优先级已定义，但实际推进顺序仍靠临时体感判断”的问题，当前建议把未完成主线按以下顺序推进。

| 顺序 | 事项 / 特性 | 所属优先级 | 当前建议先做什么 | 排在当前位置的原因 |
|---|---|---|---|---|
| 1 | CLI / setup UX 重设计 | P1-主路径易用性 | 推进 v1.15.0：让 setup 的本地使用主路径优先引导默认模型、复杂任务模型、长上下文模型、SmartRouter 起步模板和已闭环的 server/remote next steps | setup 是入口主路径的第一站，需要继续跟随后续能力演进保持叙事一致 |
| 2 | 配置产品化最终收口 | closed | v1.14.0 已完成字段心智、路由槽位、capability warning 和保存/预览 contract 收口 | 作为回归底线维护；若 setup、doctor、UI save 或配置写回再次出现字段心智漂移，按 P1 重新前置 |
| 3 | 项目目标与用户使用视角复审 | closed | v1.16.0 已完成目标一致性复审、角色化 UI 入口补齐、高频入口验证和 closed 事项抽样校准，后续作为回归底线维护 | v1.11.0/v1.12.0/v1.13.0 说明 closed 事项仍可能暴露真实主路径回归，复审必须持续把低频扩展让位给用户高频基础能力 |
| 4 | 核心路由用户体感与看护补强 | closed | v1.13.0 已完成 route preview、基础路由触发解释、SmartRouter 起步模板、协作口径校准、用户体感 E2E 和发布质量归档 | 作为回归底线维护；若慢、卡、错路由、错误不可读或入口模板过重再次复现，按 P1/P0 重新前置 |
| 5 | UI 双层工作台收敛 | P2-能力扩展与体验增强 | 推进 v1.17.0：基于 v1.16.0 已补的角色化第一屏、UX 诊断面板和角色入口 DOM 跳转看护，继续拆分使用者/维护者渲染片段、CSS/JS helper、trace span 视图，并评估真实浏览器 smoke | UI 已是用户入口的一部分，v1.9.0 已处理 admin 鉴权入口；本轮反馈说明 UI 不能只“功能可达”，还必须让不同角色用户第一眼知道该从哪里开始 |
| 6 | Agent / 工具能力演进探索 | closed | v1.8.0 已完成 runtime pipeline、管理 API route contract、UI fragment contract、handoff summary、tool capability guardrail、输入/输出 guardrail 和 trace span 化；v1.11.0/v1.12.0 已补输出治理默认流式回归和第二层传输韧性 | 最新 agent/tool 版本事项已闭环；后续除非新增明确版本计划，否则只作为回归底线维护，且不得破坏默认流式输出 |
| 7 | 智能路由自适应与多模型协同增强 | closed | v1.10.0 已完成 outcome-driven routing feedback、模型能力画像、confidence/latency budget 和最小协作模式 | 智能路由协同增强已闭环；后续只作为配置产品化、治理观测和复审回归底线维护 |
| 8 | 治理观测增强 / 运营化 | P2-能力扩展与体验增强 | 推进 v1.18.0：在 routing outcome、benchmark history、pool health、key audit、上游断流 error event 的基础上继续压低维护者排障成本 | 治理观测需要服务入口稳定，而不是只服务高级维护者能力 |
| 9 | 部署形态与远程接入收敛 | P2-能力扩展与体验增强 | 推进 v1.19.0：在 v1.9.0 修正远程客户端入口叙事后，继续补服务发现、节点边界和更完整服务模式 | 远程状态查询、模型调用转发和远端注册摘要已阶段闭环，后续可建立在准确文档和 setup 心智上继续演进 |
| 10 | CLI 稳定性与发布工程 | P3-治理支撑 | 纳入 v1.20.0：持续补 packaged CLI 用户流 E2E 与 release verify slice，优先覆盖当前发布主路径 | 它需要持续跟随入口主路径一起扩 coverage；当门禁不稳定、基础路由流式或结构化 API error 退化时，按 P1/P0 触发条件前置处理 |
| 11 | 已闭环事项复审校准 | P3-治理支撑 | 纳入 v1.20.0：持续复审 closed 事项，并把新发现的问题承接为增量事项 | 避免历史 closed 结论与新入口稳定目标漂移 |
| 12 | 进展文档体系治理 | P3-治理支撑 | 纳入 v1.20.0：持续维护统一基线、优先级、闭环标准和执行顺序表 | 它是总台账机制，必须持续维护，但不抢占主功能闭环 |
| 13 | 问题修改记录 | P3-治理支撑 | 纳入 v1.20.0：发现治理偏差或真实主路径回归就即时追加 issue log 并更新闭环结论 | 它是防重复踩坑机制，属于全程伴随动作 |

### 7. 版本计划入口

2026-05-07 起，后续版本排期以 `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md` 为入口，并按用户使用频率重新排序：

| 版本 | 主题 | 用户目标 |
|---|---|---|
| v1.2.x | 修复与稳态维护 | 只承接影响当前 v1.2.0 发布质量、CLI/packaged 行为、`ctr code` 主路径和基础配置兼容的缺陷 |
| v1.3.0 | 基础路由常用体验闭环 | 新用户能完成基础分流配置，并能看懂当前请求为什么选中某模型 |
| v1.4.0 | SmartRouter 常用体验闭环 | 用户能用规则和候选模型稳定覆盖高频任务，并能发现切换割裂或错路由 |
| v1.5.0 | 入口基础功能稳定与易用性巩固 | 新用户和日常用户能稳定完成安装后首次使用、服务启停、进入 Claude Code、诊断修复和打开 UI |
| v1.6.0 | 多模型组合收益运营化 | 维护者能用固定样本和真实 trace 判断路由配置是否真的提升质量/速度 |
| v1.7.0 | 远程服务与模型池安全体验 | 服务提供者能安全暴露服务，远程使用者能稳定接入，模型池提升可用性而不放大风险 |
| v1.8.0 | 低侵入 agent/tool 增强与架构减压 | 增强能力进入现有路由与治理体系，不扩张成平行 agent 平台；新增能力有清晰 runtime pipeline、权限边界、UI 片段和 trace span 看护 |
| v1.9.0 | 用户入口与远程客户端一致性收口 | 新用户、日常本地用户和远程客户端能从 README / setup / status / doctor / ui 获得一致且可执行的下一步 |
| v1.10.0 | 智能路由自适应与多模型协同增强 | SmartRouter 能基于真实质量/速度证据选择 fast/deep/verify/compare 等协作路径，并向用户解释收益与代价 |
| v1.11.0 | 基础路由流式稳定性与 socket 错误修复 | 基础路由恢复即时流式输出，结构化 API error 不再退化为 socket 断连，SSE parser 能跨 chunk 稳定解析 |
| v1.12.0 | 流式传输韧性与远程中转稳定性修复 | v1.11.0 后仍复现的 socket 断连和中转卡顿得到二次修复：上游中途断流可读、远程中转可取消、SSE 多字节跨 chunk 稳定 |
| v1.13.0 | 核心路由用户体感与看护补强 | 用户能预演并理解基础路由和 SmartRouter 选择，发布门禁能拦截慢、卡、错路由和错误不可读回归 |
| v1.14.0 | 配置产品化最终收口 | 用户能用同一套 `Models` 字段心智完成配置、诊断、保存和修复 |
| v1.15.0 | CLI/setup UX 重设计收口 | fresh setup、legacy migration、remote client、server profile 和 SmartRouter 起步引导都有一致 next steps |
| v1.16.0 | 用户视角复审与入口一致性校准 | 复审项目目标、入口路径和已发布版本用户体验，把新问题落入明确版本 |
| v1.17.0 | UI 双层工作台收敛 | 使用者/维护者 UI 分层继续工程化，新增视图不再堆回大型内联脚本 |
| v1.18.0 | 治理观测运营化增强 | 维护者能稳定运营路由质量、异常趋势、pool health、key audit 和输入侧优化 |
| v1.19.0 | 部署形态与远程接入收敛 | 继续补服务发现、节点边界和远程服务模式，同时保持安全鉴权和角色心智 |
| v1.20.0 | 发布与进展治理可持续化 | 发布门禁、closed 事项复审、统一基线和 issue log 形成可持续机制 |

执行规则：后续用户只说“按照计划优先级继续推进”时，默认先按上述版本计划推进；v1.16.0 已闭环后，当前默认从 v1.17.0 UI 双层工作台收敛开始。若出现安全风险、P0 主路径故障，或基础路由即时流式输出 / 上游中途断流可读错误 / 远程中转取消上游 / 结构化 API error / route preview / fresh setup / 发布门禁 / 远程转发 / 配置保存 / 收益证据链 / 远程服务安全 / 模型池调度 / 受保护 UI admin 入口 / 角色化 UI 入口 / agent-tool trace contract 再次退化，则重新前置处理。

### 8. v1.2.0 发布闭环边界

`v1.2.0` 的发布定位收敛为“智能路由评测与治理增强版”，不把完整 cloud/server 平台化能力或完整自动裁判系统纳入本次发布承诺。

本次必须带上的闭环项：

- 版本号更新到 `1.2.0`，并同步 packaged CLI/acceptance 中依赖版本输出的用例。
- README 增加 `v1.2.0` 发布定位，明确 `ctr eval --tasks`、`ctr eval --input`、`ctr eval --run`、严格质量维度 rubric 和治理观测增强是本版本主线。
- 新增 `docs/release-notes-v1.2.0.md`，把本次发布主线、发布边界、延期事项和发布前验证命令固化为维护者入口。
- `docs/releasing.md` 明确 minor release 需要同步版本用例、README 发布定位和 release notes，避免版本号更新与用户入口脱节。
- 发布前执行 `npm run release:verify`，正式验收前执行 `npm run release:stage`。

本次明确延期、继续按原优先级推进的事项：

- 人工校准 UI 表单和 benchmark 历史看板继续留在 `智能路由收益与切换体感治理` 后续 P1，并按新版本计划后移到 v1.6.0。
- 服务端部署默认安全策略、密钥轮换运营指引和托管操作手册继续留在 `服务端 API key 与鉴权控制面` 后续 P1。
- 公网 server/cloud 一键部署默认推荐继续依赖鉴权和部署安全边界闭环，不作为 `v1.2.0` 对外承诺。
- 服务发现、节点/集群编排、模型池主动探测、成本/速率元数据和更多调度策略继续作为 P2 演进。

补充约束：

1. `12-15` 这些 P3 事项虽然排在顺序表后段，但不是“最后才做”，而是必须从当前开始伴随推进；这里只表示它们不应抢占 `1-11` 的主闭环顺序。
2. 若再次出现会阻塞默认请求链路、兼容主路径或统一 schema 双读的新 gap，应先重新加入 P0 段并优先处理，而不是直接跳做新的 P1 / P2 事项。
3. 若 `1-3` 中某条 P1 主线因上游 runtime / migration 变化而失去前提，应先回补对应 P0 主线，再恢复 P1 推进。
4. 后续若新增事项，必须同时补：优先级、remaining gap、以及本顺序表中的插入位置与原因。

### 9. v1.3.0 发布闭环边界

`v1.3.0` 的发布定位收敛为“基础路由常用体验版”，不把完整 SmartRouter 产品化、benchmark 历史看板、完整 cloud/server 平台化能力或更复杂模型池策略纳入本次发布承诺。

本次必须带上的闭环项：

- 版本号更新到 `1.3.0`，并同步 packaged CLI/acceptance 中依赖版本输出的用例。
- README 增加 `v1.3.0` 发布定位，明确 `Router.default` / `think` / `longContext` / `background` / `webSearch` 五槽位配置、诊断、UI 解释和 packaged smoke 是本版本主线。
- 新增 `docs/release-notes-v1.3.0.md`，把本次发布主线、发布边界、延期事项和发布前验证命令固化为维护者入口。
- `docs/releasing.md` 同步当前 minor release 的边界说明，避免发布流程仍指向旧版本。
- 发布前执行 `npm run release:verify`；如需人工验收 staged wrapper，再执行 `npm run release:stage`。

本次明确延期、继续按原优先级推进的事项：

- SmartRouter 规则模板、候选模型配置向导、路由决策解释、sticky/alignment 切换体感、慢路由/错路由调优建议和 v1.4.0 发布前复核均已阶段闭环。
- v1.5.0 先承接入口基础功能稳定与易用性巩固，保护 setup/start/status/code/doctor/ui、配置保存/修复/迁移、UI 基础交互、coverage 口径和 release verify 入口门禁。
- benchmark 历史看板、人工校准 UI 表单和评测/真实 trace 的统一解释进入 v1.6.0。
- 服务端安全默认值、密钥轮换手册、server/cloud 一键部署、主动 pool health、成本/速率元数据和更多调度策略继续按 v1.7.0 服务化与模型池安全体验推进。
