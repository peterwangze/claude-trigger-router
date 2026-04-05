# Governance 演进 Release Notes

发布日期：2026-04-04

版本性质：治理化演进里程碑收口版

## 概览

本次发布将 Claude Trigger Router 从“本地多模型路由代理”推进到“具备最小治理闭环的本地模型治理层原型”。

这次不是单点功能更新，而是一整轮体系化增强，覆盖：

- 会话连续性
- 模型切换交接
- 失败证据升级
- 语义意图补足
- 输出质量审计
- 治理 trace 与配置治理

## 新增能力

### Governance 基础设施

- 新增 `Governance` 顶层配置
- 新增结构化治理 trace
- 新增治理默认值、归一化和配置校验

### Sticky Routing

- 引入 session state store
- 同一会话内相似任务优先复用最近稳定模型

### Context Alignment

- 模型切换时自动生成技术交接摘要
- 摘要自动注入后续请求的 `system`

### Cascade Gate

- 检测失败证据：空输出、过短输出、编译失败、测试失败、占位符
- 非流式响应支持自动升级重投
- 流式响应支持 `stream_guard` buffer-and-retry 升级策略

### Semantic Router

- 支持 prototype 模式
- 支持 classifier 模式
- 支持 embedding-based 本地相似度模式
- classifier 失败时自动回退到 prototype 匹配

### Shadow Supervisor

- 支持规则审计模式
- 支持 verifier model 模式
- 支持 `sync_guard` 模式，在高风险命中时联动 cascade 做受控升级

### 集成测试能力

- 抽取 `response-governance` helper
- 抽取 `stream-response-governance` helper
- 覆盖 `semantic + cascade + shadow sync_guard` 组合场景
- 覆盖 `streaming + tool call + governance` 组合场景

### Trace 调试能力

- 支持 governance trace 内存存储
- 支持 `GET /api/governance/traces`
- 支持 `GET /api/governance/metrics`
- 支持按 `requestId` / `sessionKey` / `limit` 过滤
- 支持简易 `/ui` governance trace 调试页
- `/ui` 新增近期 sticky / cascade / shadow / alignment 指标摘要卡片
- metrics 支持时间窗聚合与 bucket 趋势摘要
- `/ui` 新增 route / model / intent 排行与 bucket 详细趋势表
- governance trace 支持本地持久化，重启后可保留近期观测窗口
- metrics 支持基础异常检测，`/ui` 可直接展示 anomaly alerts
- metrics 支持 `json/csv` 导出，便于外部分析与后续看板对接
- governance trace 持久化支持滚动归档与保留策略，避免主文件持续膨胀
- anomaly 检测支持动态基线与细粒度阈值参数，可按不同观测窗口调整规则
- metrics 支持导出历史记录与定时快照任务，便于形成周期性观测资产

## 关键实现文件

- `src/governance/types.ts`
- `src/governance/trace.ts`
- `src/governance/session-store.ts`
- `src/governance/context-alignment.ts`
- `src/governance/cascade-gate.ts`
- `src/governance/semantic-router.ts`
- `src/governance/shadow-supervisor.ts`
- `src/governance/response-governance.ts`
- `src/governance/stream-response-governance.ts`
- `src/index.ts`
- `src/trigger/selector.ts`
- `src/utils/config.ts`

## 文档与配置更新

- `README.md` 已补充 Governance 说明
- `docs/configuration-guide.md` 已补充治理增强模板
- `config/trigger.example.yaml` 已补充完整 Governance 示例
- `docs/superpowers/plans/2026-04-04-governance-milestone-summary.md` 已记录当前里程碑状态

## 验证结果

本轮发布前验证已完成：

```bash
npm test -- --run
npm run build
```

结果：

- 29 个测试文件通过
- 264 个测试通过
- 构建通过

## 当前边界

当前版本的治理能力已经可用，但仍有边界：

- `stream_guard` 当前采用 buffer-and-retry 方式，流式场景会增加额外等待
- Semantic Router 已支持本地 embedding 风格匹配，但还未接入真正外部 embedding 引擎
- Shadow Supervisor 的 verifier / sync_guard 仍是最小可用模式，未支持更复杂策略编排
- Governance metrics 当前基于内存 trace 聚合，重启后不会保留历史窗口
- `/ui` 已具备轻量指标面板，但仍未形成正式持久化观测系统
- 当前趋势观测为轻量 bucket 聚合，尚未支持同比、环比和异常告警
- 当前排行与趋势仍基于内存 trace 计算，适合调试和轻量观测，不适合作为长期 BI 数据源
- 当前持久化采用本地 JSON 文件，尚未支持多实例共享或远程集中存储
- 当前异常检测为规则阈值版，尚未支持动态基线、自适应阈值或告警通知编排
- 当前导出是按请求时实时聚合生成的快照，不包含增量订阅或历史任务调度
- 当前归档采用本地文件轮转策略，尚未提供归档压缩或按日期查询能力
- 当前动态阈值仍通过 query 参数传入，尚未接入正式配置文件或 UI 调参面板
- 当前定时快照调度为进程内任务，服务重启后不会自动恢复调度计划

## 升级建议

如果你已经在使用旧版路由配置，建议采用以下顺序逐步启用治理能力：

1. 先启用 `Governance.sticky`
2. 再启用 `Governance.sticky.alignment`
3. 再启用 `Governance.cascade`
4. 然后启用 `Governance.semantic`
5. 最后再启用 `Governance.shadow`

## 下一步建议

建议的后续优先级：

1. 优化流式 `stream_guard` 的延迟与重投策略
2. 为 Semantic Router 增加真正外部 embedding/provider 接入
3. 为 Shadow Supervisor 增加更细粒度 verifier 策略与采样控制
4. 为 metrics 增加持久化时间窗、导出、异常检测和告警能力

## 关联文档

- 演进路线：`docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
- 演进设计：`docs/superpowers/specs/2026-04-04-router-governance-design.md`
- 实施计划：`docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`
- 进展跟踪：`docs/superpowers/plans/2026-04-04-router-evolution-tracker.md`
- 里程碑说明：`docs/superpowers/plans/2026-04-04-governance-milestone-summary.md`
