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

截至 2026-04-16，项目当前状态统一定义为：

> 项目已经完成治理主链首轮能力落地，当前进入“治理观测增强、配置产品化、OpenAI-compatible 兼容差异内化、统一 Router 收敛、CLI / setup UX 与发布工程持续收口、部署形态收敛与 UI 双层工作台设计并行推进”阶段。

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
- 内部 compatibility profile 已开始落地，运行时不再只依赖 `interface` 做 openai-compatible 兼容分发

## 二、特性进展跟踪

### 维护约束

1. 本章节中的事项 / 特性 **只能新增，不能删除**；若某项失效、取消、合并或被替代，也必须保留原记录，并把状态与闭环结论更新完整。
2. 本章节中的每一条记录都必须持续维护**闭环结论**；即使仍在推进中，也要明确当前阶段结论，而不能只写“进行中”不落结论。
3. 本章节只保留顶层总表，不承载大段详细过程；具体演进设计、实施计划、详细进展、阶段复盘与问题跟踪，统一下沉到对应特性文档。
4. 若新增事项 / 特性，必须先在本表新增一行，再创建或补齐对应特性文档。
5. 若某条记录没有可承接的特性文档，不得直接长期堆在入口文档中。

### 特性进展总表

| 事项 / 特性 | 类型 | 当前状态 | 当前闭环结论 | 详细进展 / 设计 / 实施文档 |
|---|---|---|---|---|
| Governance 治理主链首轮落地 | 核心能力 | closed | sticky / alignment / cascade / semantic / shadow 首轮能力已闭环，当前已转入观测增强与运营化阶段；输入侧 Prompt / Intent Optimization 被定义为治理下一轮增强子特性，而不是独立新总线 | `docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md` ; `docs/superpowers/specs/2026-04-04-router-governance-design.md` ; `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md` ; `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md` ; `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md` ; `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md` ; `docs/superpowers/plans/2026-04-04-governance-release-notes.md` |
| 治理观测增强 / 运营化 | 持续演进特性 | in_progress | metrics、快照、归档、异常检测和时间窗趋势已具备第一轮基础，当前闭环结论是“已从可调试进入可运营增强阶段，但尚未完成长期运营闭环”；输入侧优化将作为治理增强链路的下一轮设计输入推进 | `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md` ; `docs/superpowers/plans/2026-04-06-router-progress-calibration.md` ; `docs/superpowers/specs/2026-04-17-governance-input-optimization-design.md` |
| 部署形态与远程接入收敛 | 持续演进特性 | in_progress | 本地单机部署已形成基础，但服务端 / 客户端、远程注册、集中式路由服务与多端复用仍未成体系；当前闭环结论是“已从单机代理心智进入部署形态收敛设计阶段，且首轮实施顺序已经拆出，但最小双端边界尚未落地” | `docs/superpowers/specs/2026-04-17-deployment-and-remote-access-design.md` ; `docs/superpowers/plans/2026-04-17-deployment-and-remote-access-implementation.md` ; `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` ; `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` |
| UI 双层工作台收敛 | 持续演进特性 | in_progress | 当前 `/ui` 已同时承载配置编辑与治理观测，但使用者与维护者路径尚未显式分层；当前闭环结论是“UI 双层产品边界已立项，且首轮页面分层实施顺序已经明确，但信息架构、入口导航与角色分区仍待收口” | `docs/superpowers/specs/2026-04-17-dual-surface-ui-ux-design.md` ; `docs/superpowers/plans/2026-04-17-dual-surface-ui-ux-implementation.md` ; `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` |
| SmartRouter 早期专项计划 | 历史专项 | archived | SmartRouter 已不再是独立新增主线，当前闭环结论是“历史计划价值保留，但后续演进应纳入统一 Router 心智与配置产品化体系” | `docs/superpowers/plans/2026-03-22-smart-router.md` |
| `ctr setup` 早期实施计划 | 历史专项 | archived | setup 已完成从早期 checklist 到产品入口的阶段跃迁，当前闭环结论是“原始计划归档，后续演进转由 setup UX 与配置产品化文档承接” | `docs/superpowers/plans/2026-04-02-ctr-setup.md` ; `docs/superpowers/specs/2026-04-02-setup-usability-design.md` |
| 配置产品化最终收口 | 持续演进特性 | in_progress | `Models` 抽象、message IR、setup、`/ui` 与 warning 通道已建立基础闭环，当前闭环结论是“统一入口已形成，但最终产品心智与全入口一致性仍未完全收口” | `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` ; `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` ; `docs/superpowers/plans/2026-04-06-router-progress-calibration.md` |
| OpenAI-compatible 兼容差异内化 | 持续演进特性 | in_progress | compatibility profile 已进入模型编译与 dispatch 骨架，当前闭环结论是“兼容语义已内化起步，但真实 provider 差异矩阵与回归样本仍未闭环” | `docs/superpowers/specs/2026-04-06-unified-model-config-design.md` ; `docs/superpowers/specs/2026-04-11-legacy-config-migration-design.md` ; `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md` |
| legacy config migration 收敛 | 持续演进特性 | in_progress | legacy migration 已能补齐最少必要字段并内化部分旧语义，当前闭环结论是“迁移主路径可用，但与 compatibility / doctor 的进一步收口仍在推进” | `docs/superpowers/specs/2026-04-11-legacy-config-migration-design.md` |
| 统一 Router 运行时收敛 | 持续演进特性 | in_progress | 运行时链路、schema、dispatch 与统一配置入口已开始收敛，当前闭环结论是“运行时统一方向成立，但剩余链路与对外叙事尚未同时闭环” | `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md` ; `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md` |
| TriggerRouter / SmartRouter 对外心智收编 | 持续演进特性 | in_progress | 已完成独立立项与实施拆解，当前闭环结论是“对外产品心智已被正式单列，但 README / setup / example config / `/ui` 仍未全部切换到统一 Router 叙事” | `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md` |
| CLI / setup UX 重设计 | 持续演进特性 | in_progress | migration-first、model-id-first 方向已明确，当前闭环结论是“主入口 redesign 已立项并部分落地，但 CLI / README / 模板 / `/ui` 叙事尚未完全统一” | `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` ; `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md` |
| CLI 稳定性与发布工程 | 持续演进特性 | in_progress | packaged CLI E2E、acceptance、release-stage wrapper 已形成首轮门禁，当前闭环结论是“发布前质量门槛已成型，但仍需持续覆盖新路径与压低回归概率” | `docs/superpowers/specs/2026-04-12-cli-e2e-test-design.md` |
| 进展文档体系治理 | 治理事项 | in_progress | 公共入口已切换为不带日期标签的统一基线，当前闭环结论是“单一入口已经建立，但后续仍需按规则维护特性表与问题记录，防止再次膨胀或口径漂移” | `docs/superpowers/plans/unified-progress-baseline.md` ; `docs/superpowers/plans/progress-issue-log.md` |
| 问题修改记录 | 治理事项 | in_progress | 问题记录文档已建立，当前闭环结论是“历史问题已开始沉淀为可追踪事项，后续所有文档治理偏差必须在此追加记录并闭环” | `docs/superpowers/plans/progress-issue-log.md` |

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

### 4. 统一 Router 与对外心智收编主线文档

- `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md`
  - 定位：统一 Router 架构演进设计
  - 角色：保留为 TriggerRouter / SmartRouter / Governance 收敛的设计依据
- `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md`
  - 定位：统一 Router 实施计划
  - 角色：保留为运行时链路、schema、trace、持久化收敛的专项实施文档
- `docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md`
  - 定位：TriggerRouter / SmartRouter 对外心智收编实施计划
  - 角色：保留为统一 Router 对外产品表达收编的专项执行文档

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

### 4. 当前优先闭环顺序

当前建议的闭环顺序：

1. OpenAI-compatible 兼容差异内化
2. TriggerRouter / SmartRouter 对外心智收编
3. 配置产品化最终收口
4. 部署形态与远程接入收敛
5. 统一 Router 运行时收敛的剩余口径统一
6. CLI / setup UX 与发布工程持续收口
7. UI 双层工作台收敛
8. 治理观测增强 / 运营化
9. 进展文档体系治理与问题记录闭环持续维护
