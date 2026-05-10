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

## 版本路线

| 版本 | 用户目标 | 主要闭环事项 | 验收标准 |
|---|---|---|---|
| v1.2.x | 修复与稳态维护 | 只承接影响当前 v1.2.0 发布质量、CLI/packaged 行为、`ctr code` 主路径、基础配置兼容的缺陷 | 不引入大功能；`release:verify` 通过；README 与帮助不漂移 |
| v1.3.0 | 基础路由常用体验闭环 | `Router.default/think/longContext/background/webSearch` 用户流、doctor/UI 路由解释、context window 配置提示、核心路由 smoke/e2e | 新用户能在 README/setup/UI 中完成基础分流配置，并能看懂当前请求为什么选中某模型 |
| v1.4.0 | SmartRouter 常用体验闭环 | 规则模板、候选模型配置向导、路由决策解释、sticky/alignment 切换体感、慢路由/错路由调优建议 | 用户能用规则和候选模型稳定覆盖高频任务，且能通过 UI/metrics 发现切换割裂或错路由 |
| v1.5.0 | 多模型组合收益运营化 | `ctr eval` 历史看板、人工校准表单、核心路由任务集默认样本、收益趋势 | 维护者能用固定样本和真实 trace 判断路由配置是否真的提升质量/速度 |
| v1.6.0 | 远程服务与模型池安全体验 | 服务端部署安全默认值、密钥轮换手册、主动 pool health、成本/速率元数据、更多调度策略 | 服务提供者能安全暴露服务，远程使用者能稳定接入，模型池能提升可用性而不放大风险 |
| v1.7.0 | 低侵入 agent/tool 增强 | handoff summary、tool capability guardrail、trace span 化、输入/输出 guardrail | 增强能力进入现有路由与治理体系，不扩张成平行 agent 平台 |

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
2. `[closed 2026-05-10]` SmartRouter 配置解释：`/api/models/compiled` 与草稿 preview 已返回归一化后的 SmartRouter explanation，`/ui` 已展示规则命中顺序、候选模型、router_model、semantic/sticky 开关和 fallback，并用 server/UI 回归测试看护。
3. 路由决策可解释性：把最近请求的 route source、rule、semantic intent、confidence、fallback reason 做成使用者可读摘要。
4. 切换体感治理：继续优化 sticky/alignment/cascade 的用户可见状态，聚焦“为什么切换、切换后是否补上下文、是否触发重试”。
5. 慢路由与错路由调优建议：把当前 health tuning 进一步落到 SmartRouter 配置建议，而不仅是维护者指标。

### v1.5.0 多模型收益运营化

优先级：中高。

1. benchmark 历史看板。
2. 人工校准 UI 表单。
3. 固定任务集按核心路由场景重排：日常默认、思考、长上下文、后台、规则命中、候选选择。
4. `ctr eval` 与真实 trace 的对齐：将离线评测结果与 route outcome / task comparison 建立同一解释口径。

### v1.6.0 服务化与模型池

优先级：中。

1. 服务端部署默认安全策略。
2. 密钥轮换和托管维护手册。
3. 模型池主动健康探测。
4. 成本/速率元数据。
5. round-robin / health-aware / cost-aware 策略。

### v1.7.0 Agent / 工具增强

优先级：中低。

1. route handoff summary。
2. tool capability guardrail。
3. 输入/输出 guardrail。
4. trace span 化。

## 执行规则

1. 后续“按照计划优先级继续推进”默认先看本文档版本路线，再回到统一进展基线确认状态。
2. v1.3.0 / v1.4.0 期间，除非出现阻塞发布或安全风险的问题，不应优先扩展 benchmark、部署、模型池或 agent 平台化能力。
3. `ctr eval` 后续服务于验证核心路由，而不是替代核心路由体验本身。
4. 每个版本进入执行前，都要补一个对应版本的验收 checklist；每轮实现后必须更新本文档状态或在统一基线中记录闭环结论。
