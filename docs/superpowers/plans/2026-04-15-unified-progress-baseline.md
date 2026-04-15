# Claude Trigger Router 统一进展基线

## 文档定位

本文档是当前仓库的统一进展文档，用于收编历史演进文档、阶段性进展记录和当前基线判断。

从本文档建立起，后续涉及以下内容的持续更新，应优先以本文档为主入口维护：

- 项目整体演进状态
- 已完成里程碑与当前阶段判断
- 各主线的当前基线、边界和下一步
- 历史演进文档之间的关系与权威性说明

这意味着：

- 历史 roadmap / implementation / tracker / milestone / release notes 文档继续保留
- 但这些文档不再共同承担“统一进展台账”的职责
- 后续整体演进状态，应以本文档作为单一基线入口

## 基线声明

**自 2026-04-15 起，仓库后续的整体演进进度、阶段判断和跨主线汇总，以本文档作为统一基线维护。**

如果历史文档与本文档对当前状态的表述不一致，优先以代码现状和本文档的最新校准为准，并在需要时回补历史文档入口说明，而不是继续新增平行进展文档。

## 一、历史演进文档收编

### 1. 治理化演进主线文档

- `docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
  - 定位：治理化演进路线图
  - 作用：说明为什么要从“路由器”演进到“治理层”，以及阶段拆分与优先级
  - 当前角色：历史路线设计输入，保留参考价值，不再单独承担当前总进展台账职责

- `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`
  - 定位：治理化演进实施计划
  - 作用：承载按 chunk 拆分的执行任务结构
  - 当前角色：历史实施计划文档，适合追溯原始落地方式，不作为当前阶段总览入口

- `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md`
  - 定位：治理化演进跟踪文档
  - 作用：记录治理主线推进过程中的主线看板、里程碑、决策和最近更新
  - 当前角色：历史进展来源之一，但因存在“文档视图可能滞后于实现”的问题，不再作为唯一进展入口

- `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md`
  - 定位：治理化演进阶段收口说明
  - 作用：总结治理主链已完成能力、验证结果和当前边界
  - 当前角色：阶段总结文档，适合回顾治理里程碑，不承担统一台账职责

- `docs/superpowers/plans/2026-04-04-governance-release-notes.md`
  - 定位：治理化演进 release notes
  - 作用：记录一次阶段性发布的能力变化、验证结果和升级建议
  - 当前角色：阶段发布记录，适合作为版本说明，不承担统一台账职责

### 2. 文档校准与配置产品化主线文档

- `docs/superpowers/plans/2026-04-06-router-progress-calibration.md`
  - 定位：进度校准报告
  - 作用：校准“原始治理计划”和“当前实现状态”之间的差异，并明确配置产品化已成为并行主线
  - 当前角色：从历史进展文档过渡到统一基线文档的重要校准节点

- `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md`
  - 定位：配置产品化第二阶段计划
  - 作用：记录 `Models` 抽象、message IR、interface/thinking 收敛等第二阶段计划与推进记录
  - 当前角色：配置产品化主线的阶段计划文档，由统一基线文档汇总其阶段状态

- `docs/superpowers/specs/2026-04-06-unified-model-config-design.md`
  - 定位：统一模型配置与消息协议转换设计
  - 作用：为配置产品化主线提供设计依据
  - 当前角色：设计输入，不承担进展跟踪职责

### 3. 统一 Router 与 setup UX 主线文档

- `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md`
  - 定位：统一 Router 架构演进设计
  - 作用：将 TriggerRouter、SmartRouter、Governance 收敛为统一 Router 心智
  - 当前角色：统一 Router 主线设计依据

- `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md`
  - 定位：统一 Router 落地实施计划
  - 作用：记录运行时链路重排、默认治理边界、schema/persistence、setup/UI/docs 统一化的执行计划
  - 当前角色：统一 Router 主线实施文档，由统一基线文档汇总其当前阶段

- `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md`
  - 定位：CLI / setup UX 重设计方案
  - 作用：明确 `ctr setup` 从 provider-first 转向 migration-first、model-id-first
  - 当前角色：setup UX 主线设计依据

- `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md`
  - 定位：CLI / setup UX 重设计实施计划
  - 作用：记录 setup 分支顺序、fresh setup 问答流、CLI 帮助文本和 README 对齐的实现路径
  - 当前角色：setup UX 主线实施文档，由统一基线文档汇总其当前阶段

## 二、当前统一阶段判断

截至 2026-04-15，项目当前状态可统一定义为：

> 项目已经完成治理主链的首轮能力落地，当前进入“治理观测增强、配置产品化、统一 Router 收敛、setup / UX 重设计”并行推进阶段。

这一定义用于替代历史文档中分散的阶段描述。

### 已完成的基线能力

- TriggerRouter 已落地，具备规则驱动路由能力
- SmartRouter 已落地，具备候选模型智能选择能力
- Router 基础分流已落地，覆盖 default / think / longContext / webSearch / background
- Governance 主链首轮已落地，覆盖 sticky / alignment / cascade / semantic / shadow
- governance trace、metrics、基础 `/ui` 调试与观测能力已建立
- `Models` 抽象、统一 capability hint 与首轮 message IR/协议分发已落地
- `ctr setup`、配置保存和 `/ui` 草稿路径已进入产品化持续收敛阶段

### 当前并行推进的四条主线

#### 主线 A：治理观测增强

当前判断：`in_progress`

关注点：

- 继续增强 metrics、快照、归档、异常检测、时间窗趋势等运营化能力
- 把治理链路从“可调试”推进到“可运营”

#### 主线 B：配置产品化

当前判断：`in_progress`

关注点：

- 继续收敛 `Models` 入口字段
- 继续强化 `interface` / `thinking` / capability warning 的统一表达
- 继续把 setup、配置文件和 `/ui` 拉通到同一套 schema、编译器和校验器

#### 主线 C：统一 Router 收敛

当前判断：`in_progress`

关注点：

- 将 TriggerRouter、SmartRouter、Governance 的组合能力统一为一套 Router 决策心智
- 重排运行时决策链，减少产品心智与运行时行为之间的偏差
- 逐步统一 schema、trace、持久化路径和文档对外叙事

#### 主线 D：CLI / setup UX 重设计

当前判断：`in_progress`

关注点：

- 让 `ctr setup` 变成 migration-first、model-id-first 的主入口
- 让 CLI、README、模板输出和 `/ui` 叙事保持一致
- 降低首次使用与配置修改时的理解和录入成本

## 三、当前边界与判断原则

### 1. 当前边界

当前阶段仍存在以下已知边界：

- 多条主线的阶段文档已经形成，但总进展入口曾经分散
- 部分历史 tracker / plan 文档可能滞后于当前代码实现
- 统一 Router 和 setup UX 主线已有明确设计与实施计划，但未在历史治理 tracker 中完整汇总
- 当前项目已经不是单一“治理化演进”阶段，而是多主线并行推进阶段

### 2. 判断原则

后续维护统一进展时，采用以下判断原则：

1. 当前状态优先看代码与最新实现，而不是只看旧计划勾选状态
2. 历史文档继续保留，但它们的职责是“设计输入、实施记录、阶段总结、发布说明”，不是新的统一台账
3. 若出现新主线，应先在本文档登记其定位、状态和关联文档，再在对应计划/设计文档中展开
4. 若阶段状态变化，应先更新本文档的统一判断，再按需要回补对应专项文档

## 四、后续维护规则

### 1. 本文档负责什么

本文档负责维护：

- 项目整体阶段定义
- 主要并行主线的状态判断
- 历史文档的角色说明与入口归并
- 需要团队统一对齐的当前基线与边界

### 2. 专项文档负责什么

专项 roadmap / plan / spec / release notes 文档继续负责：

- 方案设计细节
- 实施拆解与任务结构
- 某一阶段的 release/milestone 收口
- 某一专项主线的更细粒度推进记录

### 3. 维护顺序

后续若有新增演进，推荐按以下顺序维护：

1. 先更新本文档中的阶段判断、主线状态或新增主线入口
2. 再更新对应专项文档中的设计、实施或阶段记录
3. 如需对外发布或阶段收口，再补充 milestone summary / release notes

## 五、建议的后续更新抓手

接下来如果继续推进，优先建议围绕以下抓手维护本文档：

1. 四条并行主线的状态变化是否需要调整
2. 是否出现新的跨主线能力收敛点，需要加入统一阶段判断
3. 哪些历史文档已明显失去当前性，需要增加顶部归档或跳转说明
4. 是否已经形成新的阶段性收口，需要补充新的 milestone / release notes

## 六、关联文档索引

### 治理化演进

- `docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
- `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`
- `docs/superpowers/plans/2026-04-04-router-evolution-tracker.md`
- `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md`
- `docs/superpowers/plans/2026-04-04-governance-release-notes.md`

### 文档校准与配置产品化

- `docs/superpowers/plans/2026-04-06-router-progress-calibration.md`
- `docs/superpowers/plans/2026-04-06-config-productization-phase-2.md`
- `docs/superpowers/specs/2026-04-06-unified-model-config-design.md`

### 统一 Router 与 setup / UX

- `docs/superpowers/specs/2026-04-09-unified-router-evolution-design.md`
- `docs/superpowers/plans/2026-04-09-unified-router-evolution-implementation.md`
- `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md`
- `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md`
