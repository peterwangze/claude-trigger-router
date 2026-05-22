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

## 版本路线

| 版本 | 用户目标 | 主要闭环事项 | 验收标准 |
|---|---|---|---|
| v1.2.x | 修复与稳态维护 | 只承接影响当前 v1.2.0 发布质量、CLI/packaged 行为、`ctr code` 主路径、基础配置兼容的缺陷 | 不引入大功能；`release:verify` 通过；README 与帮助不漂移 |
| v1.3.0 | 基础路由常用体验闭环 | `Router.default/think/longContext/background/webSearch` 用户流、doctor/UI 路由解释、context window 配置提示、核心路由 smoke/e2e | 新用户能在 README/setup/UI 中完成基础分流配置，并能看懂当前请求为什么选中某模型 |
| v1.4.0 | SmartRouter 常用体验闭环 | 规则模板、候选模型配置向导、路由决策解释、sticky/alignment 切换体感、慢路由/错路由调优建议 | 用户能用规则和候选模型稳定覆盖高频任务，且能通过 UI/metrics 发现切换割裂或错路由 |
| v1.5.0 | 入口基础功能稳定与易用性巩固 | setup/start/status/code/doctor/ui 主路径、配置保存/修复/迁移安全、UI 基础交互 smoke、coverage 口径、release verify 入口门禁 | 新用户和日常用户能稳定完成安装后首次使用、服务启停、进入 Claude Code、诊断修复和打开 UI；失败时有清晰下一步 |
| v1.6.0 | 多模型组合收益运营化 | `ctr eval` 历史看板、人工校准表单、核心路由任务集默认样本、收益趋势、评测与真实 trace 对齐 | 维护者能用固定样本和真实 trace 判断路由配置是否真的提升质量/速度 |
| v1.7.0 | 远程服务与模型池安全体验 | 服务端部署安全默认值、密钥轮换手册、主动 pool health、成本/速率元数据、更多调度策略 | 服务提供者能安全暴露服务，远程使用者能稳定接入，模型池能提升可用性而不放大风险 |
| v1.8.0 | 低侵入 agent/tool 增强 | handoff summary、tool capability guardrail、trace span 化、输入/输出 guardrail | 增强能力进入现有路由与治理体系，不扩张成平行 agent 平台 |

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
2. 密钥轮换和托管维护手册。
3. 模型池主动健康探测。
4. 成本/速率元数据。
5. round-robin / health-aware / cost-aware 策略。

### v1.8.0 Agent / 工具增强

优先级：中低。

1. route handoff summary。
2. tool capability guardrail。
3. 输入/输出 guardrail。
4. trace span 化。

## 执行规则

1. 后续“按照计划优先级继续推进”默认先看本文档版本路线，再回到统一进展基线确认状态。
2. v1.6.0 已阶段闭环；后续默认切到 v1.7.0 服务化与模型池安全体验，除非出现安全风险、P0 主路径故障、入口回归或收益证据链回归，不再回头扩展 v1.6.0 范围。
3. `ctr eval` 后续服务于验证核心路由，排在入口基础稳定之后，不替代 setup/start/code/doctor/ui 的日常体验。
4. 每个版本进入执行前，都要补一个对应版本的验收 checklist；每轮实现后必须更新本文档状态或在统一基线中记录闭环结论。
