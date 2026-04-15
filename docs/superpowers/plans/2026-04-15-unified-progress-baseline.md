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
- packaged CLI E2E / acceptance 看护、release-stage wrapper 验收链路与发布前门禁已建立
- `ctr init` / `ctr setup` / legacy migration 已开始按“最小可用配置”统一收敛
- `ctr doctor` 已落地，具备配置诊断、低风险自动修复、服务可启动性检查与用户确认后的模型探测能力
- 内部 compatibility profile 已开始落地，运行时不再只依赖 `interface` 做 openai-compatible 兼容分发

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

补充拆分说明（2026-04-15）：

- C1：统一 Router 的运行时链路与 schema 收敛
  - 当前判断：`in_progress`
  - 已有进展：兼容画像、dispatch、message IR、统一配置入口已开始收敛
- C2：将用户侧 `TriggerRouter` / `SmartRouter` 分立心智正式收编为统一 Router 主入口
  - 当前判断：`in_progress`
  - 当前状态：已在统一基线中单列，并已启动独立实施拆解文档
  - 关联计划：`docs/superpowers/plans/2026-04-15-trigger-smart-router-consolidation.md`
  - 说明：这是你指出的“之前还有一条完全没有启动的主线”，此前我在统一基线里把它笼统并入了主线 C；现已正式启动，但尚未进入代码/入口统一阶段

#### 主线 D：CLI / setup UX 重设计

当前判断：`in_progress`

关注点：

- 让 `ctr setup` 变成 migration-first、model-id-first 的主入口
- 让 CLI、README、模板输出和 `/ui` 叙事保持一致
- 降低首次使用与配置修改时的理解和录入成本

#### 主线 E：CLI 稳定性与发布工程

当前判断：`in_progress`

关注点：

- 用 packaged CLI E2E / acceptance 把用户可见命令与选择路径转成发布前门禁
- 持续压低 setup / start / code / doctor / release-stage 的低级回归概率
- 将本地手工验收链路与 GitHub Actions 的 CI 职责分离，避免误把开发者本地验证步骤塞进 CI

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

## 六、2026-04-15 后新增收编进度

以下内容已不再只是散落在提交记录中的“局部分叉优化”，而应视为统一基线的一部分：

### 1. CLI 稳定性与打包验收链路已形成第一轮闭环

已完成：

- `ctr` 的用户可见命令已建立 packaged CLI E2E 主看护
- 新增 shell / wrapper / staged 包 acceptance 层，覆盖：
  - `setup -> status -> code`
  - `start --daemon -> status -> stop`
  - `restart --daemon`
  - stale pid / occupied port
  - `release:stage` wrapper 主路径
- 发布前验证链路已区分：
  - CI：build / 常规测试 / packaged CLI E2E
  - 本地维护者：`release:verify` / `release:stage`

当前判断：

- 该分叉主线已完成第一轮“可发布质量门槛”收口
- 后续仍可继续补场景，但不再是最优先未闭环路径

### 2. 新用户入口可用性已完成第一轮统一收口

已完成：

- `ctr init --force` 不再只是复制静态示例，而是直接生成最小可用模板
- `ctr setup` fresh / repair / rebuild / migration 主路径已纳入 packaged CLI 回归
- legacy migration 已补齐缺失 `api_base_url` 等最少必要字段的补全逻辑
- setup 在默认端口冲突时会自动切换可用端口，避免新用户首次运行直接失败
- `init` / `setup` / example config 已开始共享“最小可用配置”心智

当前判断：

- 新用户入口的“配置能写出来且服务能起来”这一层已形成第一轮闭环
- 后续更高层的“模型真实可用 / Claude 真正可用”继续由 compatibility 与 doctor 主线承接

### 3. `doctor` 主线已完成首轮落地

已完成：

- `ctr doctor` 命令已接入 CLI
- doctor 可执行：
  - 配置存在性与格式诊断
  - 低风险确定性自动修复
  - 服务可启动性检查
  - 用户确认后的模型最小探测
- doctor 的模型探测已改为复用运行时 dispatch 构造，不再手写与真实链路不一致的探测请求

当前判断：

- doctor 已具备首轮可用性
- 后续重点不再是“有没有 doctor”，而是让 doctor 消费更多运行时兼容信息与真实 provider 经验

### 4. OpenAI-compatible 兼容差异内化主线已启动，但尚未闭环

已完成：

- 内部 `compatibilityProfile` 已引入模型编译层
- 运行时 dispatch 不再只看 `interface`
- legacy migration 已开始把旧 `transformer` 语义内化成内部 hint，而不是重新暴露给用户
- 协议层对 tool 定义已开始同时兼容 anthropic/openai 两类输入形态

未闭环的原因：

- 真实 provider 的兼容差异仍未形成完整矩阵
- 当前主要只锁定了“内化兼容画像”的基础骨架与首轮工具定义保真
- 针对 `gpt90`、`qianfan_coding`、`minimax` 这类真实在用接口的 tool / tool_result / 流式约束差异，还缺更完整的真实回归与更细粒度适配

当前判断：

- 这是当前最明确的未闭环演进路径
- 后续若要避免统一配置抽象再次被现实 provider 差异击穿，应优先继续推进此主线

### 5. TriggerRouter / SmartRouter 对外心智收编主线已正式启动，但尚未进入实现闭环

当前判断：`in_progress`

原因：

- 虽然统一 Router 的设计与实施文档已经存在
- 当前真实实现和用户文档仍主要保留 `TriggerRouter` / `SmartRouter` 两套显式对外概念
- 也就是说，运行时收敛主线已启动，但“对外产品心智收编”仍未进入代码层闭环
- 现阶段已完成的是：统一基线单列 + 独立实施拆解启动

当前边界：

- README 仍以 `TriggerRouter` 和 `SmartRouter` 作为主要功能说明入口
- `setup` 结束后的引导也仍显式提示 `TriggerRouter` / `SmartRouter`
- 示例配置仍以分立模块表达为主，而不是统一 Router 表达

为什么它必须单列：

1. 这不是单纯文案问题，而是产品心智迁移主线
2. 如果不单列，后续很容易只推进运行时兼容，却遗漏用户侧认知收编
3. 它和统一 Router 的 schema/dispatch 收敛有关，但完成标准不同，不能混成一条

## 七、当前优先启动的未闭环路径

统一基线判断：

- **当前优先持续推进的未闭环主线**：`OpenAI-compatible 兼容差异内化`
- **当前尚未正式启动、但必须单列纳入后续计划的主线**：`TriggerRouter / SmartRouter 对外心智收编`

原因：

1. 它直接关系到“统一模型配置心智是否真实成立”
2. 它已经在真实用户环境中暴露为默认模型工具调用失败问题
3. 它位于配置产品化、统一 Router、doctor 三条主线的交叉点

同时，`TriggerRouter / SmartRouter` 对外心智收编主线之所以必须补列，是因为：

1. 它在设计层已经明确存在
2. 但当前还没有进入实施闭环
3. 如果不显式标记为 `not_started`，后续会继续被“统一 Router 已在进行中”这一笼统表述掩盖

当前已启动的第一批动作：

- 内部 compatibility profile 已落地到模型编译层
- 运行时 dispatch 已接入 compatibility profile
- doctor 探测已改为复用真实 dispatch 逻辑

下一批建议动作：

1. 为真实在用 provider 建立更明确的兼容矩阵
   - `gpt90`
   - `qianfan_coding`
   - `minimax`
2. 把 compatibility profile / dispatch format 暴露到更可见的调试面
   - compiled preview
   - doctor 输出
   - 必要时 `/ui`
3. 针对 tool / tool_result / stream 要求补更细的 provider-specific 回归样本
4. 在不增加用户侧心智负担的前提下，继续消化 legacy compatibility 语义

而对 `TriggerRouter / SmartRouter` 对外心智收编主线，建议的启动前动作是：

1. 先把最终产品心智目标重新写成独立执行条目
2. 明确“哪些用户侧入口必须改为统一 Router 表达”
   - README
   - setup 完成页
   - example config
   - `/ui`
3. 再决定是以“统一 Router 默认输出”还是“兼容期双轨表达”切入

## 八、当前尚未闭环的主线清单

为避免后续继续被“笼统 in_progress”掩盖，这里明确列出截至 2026-04-15 的未闭环主线：

### 1. OpenAI-compatible 兼容差异内化

状态：`in_progress`

为什么未闭环：

- compatibility profile 已引入
- dispatch / migration hint / doctor probe 已开始收敛
- 但针对真实 provider 的兼容差异矩阵仍未完整建立

当前关键未闭环点：

- `gpt90`
- `qianfan_coding`
- `minimax`
- tools / tool_result / stream / 特殊字段要求的 provider-specific 适配仍需继续补齐

优先级判断：`P0`

### 2. TriggerRouter / SmartRouter 对外心智收编

状态：`in_progress`

为什么未闭环：

- 已正式单列成独立主线
- 但 README / setup 完成页 / example config / `/ui` 还未真正切到统一 Router 对外叙事

当前关键未闭环点：

- 用户仍主要通过 `TriggerRouter` / `SmartRouter` 理解产品
- 统一 Router 仍更多停留在设计文档与内部实现层

优先级判断：`P0`

### 3. 配置产品化最终收口

状态：`in_progress`

为什么未闭环：

- `Models` 抽象、message IR、setup/init/migration、doctor、warning 通道等都已建立
- 但 setup、配置文件、`/ui` 还没有完全以一套最终产品入口完全收口

当前关键未闭环点：

- repair / warning / capability / compatibility 仍未在所有入口完全一致
- 最终“用户只理解统一模型配置”的承诺还需更多真实 provider 验证支撑

优先级判断：`P1`

### 4. 治理观测增强 / 运营化

状态：`in_progress`

为什么未闭环：

- metrics、anomaly、snapshot、archive、时间窗趋势都已具备
- 但还处于“持续增强”阶段，尚未形成更成熟的长期运营闭环

当前关键未闭环点：

- 更强的可视化、调优闭环与长期使用验证仍待继续推进

优先级判断：`P2`

### 统一优先级结论

当前建议的闭环顺序：

1. OpenAI-compatible 兼容差异内化
2. TriggerRouter / SmartRouter 对外心智收编
3. 配置产品化最终收口
4. 治理观测增强 / 运营化

## 九、关联文档索引

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
