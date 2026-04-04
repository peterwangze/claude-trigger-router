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

### Semantic Router

- 支持 prototype 模式
- 支持 classifier 模式
- classifier 失败时自动回退到 prototype 匹配

### Shadow Supervisor

- 支持规则审计模式
- 支持 verifier model 模式
- 支持 `sync_guard` 模式，在高风险命中时联动 cascade 做受控升级

### 集成测试能力

- 抽取 `response-governance` helper
- 覆盖 `semantic + cascade + shadow sync_guard` 组合场景

## 关键实现文件

- `src/governance/types.ts`
- `src/governance/trace.ts`
- `src/governance/session-store.ts`
- `src/governance/context-alignment.ts`
- `src/governance/cascade-gate.ts`
- `src/governance/semantic-router.ts`
- `src/governance/shadow-supervisor.ts`
- `src/governance/response-governance.ts`
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

- 28 个测试文件通过
- 261 个测试通过
- 构建通过

## 当前边界

当前版本的治理能力已经可用，但仍有边界：

- `cascade` / `sync_guard` 目前只对非流式响应自动重投
- Semantic Router 还未接入真正 embedding 引擎
- Shadow Supervisor 的 verifier 仍是最小可用模式，未支持更复杂策略
- Governance trace 目前主要用于日志和测试，尚未形成可视化面板

## 升级建议

如果你已经在使用旧版路由配置，建议采用以下顺序逐步启用治理能力：

1. 先启用 `Governance.sticky`
2. 再启用 `Governance.sticky.alignment`
3. 再启用 `Governance.cascade`
4. 然后启用 `Governance.semantic`
5. 最后再启用 `Governance.shadow`

## 下一步建议

建议的后续优先级：

1. 支持流式响应下的 cascade / sync_guard 策略
2. 为 Semantic Router 增加真正 embedding 模式
3. 为 Shadow Supervisor 增加更细粒度 verifier 策略与采样控制
4. 暴露治理 trace 和指标观测能力

## 关联文档

- 演进路线：`docs/superpowers/plans/2026-04-04-router-evolution-roadmap.md`
- 演进设计：`docs/superpowers/specs/2026-04-04-router-governance-design.md`
- 实施计划：`docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`
- 进展跟踪：`docs/superpowers/plans/2026-04-04-router-evolution-tracker.md`
- 里程碑说明：`docs/superpowers/plans/2026-04-04-governance-milestone-summary.md`
