# Release notes v1.10.0

`v1.10.0` 定位为“智能路由自适应与多模型协同增强版”。这个版本聚焦 SmartRouter 的用户强感知体验：理解真实任务反馈、看见候选模型画像、用 confidence 和 latency 约束平衡质量/速度，并把最小多模型协作模式与证据展示接入治理链路。

## 本次主线

- outcome-driven routing feedback：新增 routing advisor，将 governance trace 中的 `taskComparison`、`qualityEvidence`、latency、cascade 和 shadow 信号汇总为候选模型画像，并反哺 SmartRouter prompt、候选排序和缓存 key。
- 模型能力画像自动刷新：新增 `GET /api/governance/routing-advisor`，返回当前 SmartRouter candidates 的 profile source、样本量、失败率、平均延迟、best/fastest 任务计数、任务 key、score 和证据。
- confidence + latency budget：新增 `SmartRouter.routing_budget.latency_budget_ms` / `confidence_threshold`，请求 metadata 也可用 `ctr_latency_budget_ms` / `ctr_confidence_threshold` 覆盖；selector 会把预算 hint 传入 SmartRouter，SmartRouter 会基于历史 profile 做 latency guard 或 confidence guard。
- 多模型协作模式：新增 `SmartRouter.collaboration.mode` / `allowed_modes` / `confidence_threshold`，协作 contract 覆盖 `route_only`、`verify_only`、`compare_then_arbiter`、`cascade_on_evidence`。默认仍是 `route_only`，低置信且允许 `verify_only` 时会自动升级到验证模式。
- 协作收益可解释入口：route decision summary、governance trace 和 `/ui` Recent route decisions 已展示 `routingMode`、`collaborationMode` 和 `routingEvidence`，维护者能看到本次是否因 latency budget、confidence guard 或历史画像发生策略调整。

## 发布边界

- 本版本不声明完整自动化多 agent 编排、全量任务拆解执行器或跨请求在线学习系统。
- `compare_then_arbiter` / `cascade_on_evidence` 本轮作为可配置协作 contract、trace metadata 和可观测策略入口收口，不代表已经完成多模型并发执行编排。
- Routing advisor 以本地 governance trace 和现有 benchmark/quality evidence 为输入，不引入远端模型遥测或托管控制面。
- SmartRouter 仍遵守既有模型配置、鉴权、context guard、response governance 和 runtime pipeline 顺序；本轮不改变外部协议兼容边界。

## 验证

本版本收口前至少需要通过：

```bash
npm run release:verify
```

本轮已为新增闭环补充 targeted 看护：

- `src/governance/routing-advisor.test.ts`
- `src/trigger/smart-router.test.ts`
- `src/trigger/selector.test.ts`
- `src/trigger/trigger-router.test.ts`
- `src/server.test.ts`
- `src/server/management-routes.test.ts`
- `src/ui/workbench.dom.test.ts`
- `src/deploy-assets.test.ts`
