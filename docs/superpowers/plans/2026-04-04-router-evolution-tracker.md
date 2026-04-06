# Router 治理化演进进展跟踪

## 文档说明

本文件用于跟踪基于 `advice/演进思路.md` 的治理化演进推进情况。它不是设计文档，也不是实施清单，而是一个持续更新的项目视图。

关联文档：

- 演进计划：`docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
- 演进设计：`docs/superpowers/specs/2026-04-04-router-governance-design.md`
- 实施计划：`docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`

## 更新时间

- 建档日期：2026-04-04
- 当前状态：治理主链已落地，进入指标观测增强与配置产品化并行阶段

## 状态图例

- `not_started`：尚未开始
- `in_progress`：开发中
- `blocked`：被依赖或外部条件阻塞
- `done`：已完成

## 当前基线

当前仓库已具备的基础能力：

| 能力 | 状态 | 说明 |
|------|------|------|
| TriggerRouter | done | 已具备规则驱动路由 |
| SmartRouter | done | 已支持候选模型智能选择 |
| Router 基础分流 | done | 已支持 default / think / longContext / webSearch / background |
| `ctr setup` 主线能力 | done | 已有实现与相关测试骨架 |
| 配置校验与健康检查 | done | 已具备服务探活和配置保存校验 |

这些能力构成治理化演进的起点，但不代表治理功能已完成。

## 演进主线看板

| 主线 | 目标 | 当前状态 | 下一步 | 完成标准 |
|------|------|----------|--------|----------|
| 治理底座 | 引入 Governance 配置、trace、统一日志 | done | 继续做稳定性和可观测字段补充 | 能完整追踪一次请求的治理路径 |
| Sticky Routing | 同会话优先复用稳定模型 | done | 继续结合真实请求数据调优命中策略 | 同会话具备粘性复用能力 |
| Context Alignment | 模型切换时自动注入技术摘要 | done | 优化摘要长度、失败降级和可解释性 | 跨模型切换时可稳定交接上下文 |
| Cascade Gate | 失败后自动升级推理强度 | done | 基于指标继续调优触发器与升级链 | 出现明确失败证据时可自动升级 |
| Semantic Router | 用语义补齐关键词规则 | done | 继续调优阈值与 prototype/classifier 组合 | 非关键词表达也能稳定命中 |
| Shadow Supervisor | 对低质量输出进行监督 | done | 继续观察 async_audit 数据并谨慎评估 sync_guard | 可记录并识别偷懒/占位符输出 |
| 文档与配置模板 | 给出可复制启用方案 | done | 转入 release notes 与阶段总结维护 | README/配置指南/示例配置一致 |
| 指标观测 | 将 trace 升级为可聚合观测面板 | in_progress | 增强运营化能力并与配置工作台打通 | 可查看近期 sticky / cascade / shadow / alignment 指标及时间窗分桶趋势 |
| 配置产品化 | 降低模型/provider/setup/ui 配置门槛 | in_progress | 统一 `Models` 抽象、配置草稿工作台和最小配置路径 | 用户可通过 setup 或 `/ui` 完成主要配置与预览修正 |

## 里程碑跟踪

| 里程碑 | 状态 | 目标时间 | 备注 |
|--------|------|----------|------|
| M0: 治理规划与文档完成 | done | 2026-04-04 | 已产出演进计划、设计、实施计划、跟踪文档 |
| M1: Governance 配置与 trace 完成 | done | 2026-04-04 | 已完成配置骨架、trace 存储与调试 API |
| M2: Sticky + Session Store 完成 | done | 2026-04-04 | 已支持会话粘性与状态持久窗口 |
| M3: Context Alignment 完成 | done | 2026-04-04 | 已支持切模摘要与 system 注入 |
| M4: Cascade Gate 完成 | done | 2026-04-04 | 已支持失败证据识别与重试升级 |
| M5: Semantic Router 完成 | done | 2026-04-04 | 已支持 classifier / embedding 双模式 |
| M6: Shadow Supervisor 完成 | done | 2026-04-04 | 已支持 verifier 与 sync_guard |
| M7: 全链路验证与文档收口 | done | 2026-04-04 | 已补齐文档、测试、配置模板 |
| M8: 治理指标观测增强 | in_progress | 2026-04-04 | 已新增 metrics API 与 UI 摘要卡片 |
| M9: 时间窗趋势观测 | in_progress | 2026-04-05 | 已支持按时间窗聚合与 bucket 趋势查看 |

## 当前决策记录

### 决策 1：先做治理底座，再做高级能力

原因：

- 如果没有 trace、session state 和统一配置，后续 Sticky/Cascade/Shadow 都会变成零散逻辑

### 决策 2：Sticky 优先于 Semantic 和 Shadow

原因：

- 当前最直接的质量损失点来自跨模型切换后的上下文断裂

### 决策 3：Shadow 第一版只做异步审计

原因：

- 避免一开始就把同步阻断带入主路径，影响稳定性和时延

### 决策 4：所有治理能力必须默认关闭

原因：

- 保持与当前用户行为兼容，避免无意改变已有路由策略

## 风险清单

| 风险 | 当前状态 | 影响 | 缓解策略 |
|------|----------|------|----------|
| SessionKey 难以稳定提取 | open | Sticky 误命中 | 第一版允许无 sessionKey 时退化 |
| Alignment 摘要质量不足 | open | 可能放大错误 | 限制摘要模板与长度，保留关闭开关 |
| 自动升级成本过高 | open | token 成本上升 | 只在失败证据命中时升级，并限制次数 |
| 语义模型部署复杂度增加 | open | 提高使用门槛 | 第一版允许 classifier/embedding 二选一 |
| Shadow 审计增加时延或成本 | open | 用户体验波动 | 先异步采样，不默认同步阻断 |

## 建议推进顺序

建议按以下顺序推进：

1. Governance 配置 + trace
2. Session Store + Sticky Routing
3. Context Alignment
4. Cascade Gate
5. Semantic Router
6. Shadow Supervisor
7. 文档和模板收口

## 最近更新

### 2026-04-04

- 完成对 `advice/演进思路.md` 的工程化拆解
- 完成 4 份治理化演进文档初稿
- 明确以 `src/governance/` 作为后续实现承载层
- 明确分阶段落地，而不是一次性并入主链
- 完成 Governance 全链路主能力：sticky / alignment / cascade / semantic / shadow
- 新增 `GET /api/governance/metrics`，支持聚合近期 sticky / cascade / shadow / alignment 指标
- `/ui` 新增治理指标摘要卡片，用于快速观察近期治理命中情况
- 已补充聚合指标与调试页相关测试，当前阶段可作为轻量观测面板使用

### 2026-04-05

- `GET /api/governance/metrics` 新增 `windowMs` 与 `bucketCount` 参数
- 指标接口已支持按最近时间窗输出 buckets，用于观察 sticky / cascade 趋势变化
- `/ui` 新增时间窗选择器与 bucket 卡片摘要，支持快速查看最近 15m / 1h / 6h / 24h
- 已补充时间窗聚合与服务端 API 覆盖测试，当前阶段具备轻量趋势观测能力
- `/ui` 新增 route reason / final model / semantic intent Top 5 排行
- `/ui` 新增 bucket 详细趋势表，可直接对比 sticky / cascade / shadow / alignment 命中率
- governance trace 已支持落盘到本地 `~/.claude-trigger-router/governance-traces.json`
- 重启服务后会自动加载近期治理 trace，时间窗观测不再只依赖单次进程生命周期
- metrics 已支持异常检测，当前可提示 cascade / shadow 命中率偏高、平均时延偏高及最新 bucket 突增
- `/ui` 新增 anomaly alerts 面板，可直接高亮当前窗口中的治理风险信号
- 新增 `GET /api/governance/metrics/export`，支持导出治理指标快照
- 当前导出支持 `json` 与 `csv`，便于对接外部看板和离线分析
- governance trace 持久化新增滚动归档与保留策略，主文件只保留近期窗口
- 历史 trace 会归档到 `~/.claude-trigger-router/governance-trace-archives/`，并按保留数量自动清理旧归档
- anomaly 检测已支持动态基线与细粒度阈值参数，可按窗口场景调整灵敏度
- `GET /api/governance/metrics` 与导出接口现可通过 query 自定义 min sample、rate 和 latency 阈值
- 新增导出历史记录与定时快照调度能力
- 支持 `GET /api/governance/metrics/exports`、`POST /api/governance/metrics/snapshots`、`POST /api/governance/metrics/schedules`
- 新增治理归档管理 API，可列出、按日期筛选、查看和删除归档文件
- 支持 `GET /api/governance/archives`、`GET /api/governance/archives/:file`、`POST /api/governance/archives/:file/delete`
- Governance 现已支持正式 `observability.anomaly_thresholds` 配置项
- `/ui` 新增 anomaly tuning 面板，默认读取配置阈值，并允许当前页面临时覆盖查询参数
- 定时快照调度已支持本地持久化和服务重启恢复
- `governance-metric-schedules.json` 会保存当前 schedule 元数据，重启后自动恢复有效任务
- 归档文件现默认使用压缩格式保存，减少本地存储占用
- 归档列表查询新增分页参数，可支撑更长时间窗口下的归档浏览
- `/ui` anomaly tuning 已支持直接写回配置文件
- 新增 `POST /api/governance/observability/anomaly-thresholds`，用于单独保存治理异常阈值
- `/ui` 新增快照/归档管理面板，可直接查看导出历史、调度状态和归档列表
- 管理面板现支持手动创建快照、查看 exports/schedules，以及按日期+分页浏览 archives

### 2026-04-06

- 对原始演进计划进行进度校准，确认治理主链未偏离原设计目标
- 明确当前偏离主要来自“文档滞后于实现”，而非架构方向偏离
- 将配置易用性工作正式视为并行主线，而不是治理主线之外的零散优化
- 配置产品化当前已包含 `Models` 抽象、setup 生成 models 配置、provider template、`/ui` 草稿编辑、引用影响分析、修复建议、preset merge/dry-run/summary 等能力
- 后续需把“统一 provider 协议抽象 + 最简模型配置参数 + 路由统一消息转换”纳入正式路线图
- 已补充配置产品化第二阶段计划：`docs/superpowers/plans/2026-04-06-config-productization-phase-2.md`
- 已补充统一模型配置与消息协议转换设计：`docs/superpowers/specs/2026-04-06-unified-model-config-design.md`
- 已完成第二阶段首个兼容实现：`Models` 新增 `api` / `key` / `interface` 公共字段，并保持旧字段兼容
- `ctr setup`、配置保存和 `/ui` 草稿入口已开始切换到新的公共字段命名

## 下次更新时应补充的内容

- 实际排期
- owner / 负责人
- 每个里程碑的起止日期
- 已完成测试与构建记录
- 上线试运行观察结果
- 配置产品化主线的阶段拆分与验收标准
