# v1.6.0 Release Notes

`v1.6.0` 定位为“多模型收益运营化版”。这个版本不继续扩展服务化或模型池策略，而是先把维护者判断“多模型组合是否真的带来质量/速度收益”的证据链做完整。

## 本次发布主线

- Benchmark history：`ctr eval --input/--run` 支持 `--save-history`，把评测摘要写入 `~/.claude-trigger-router/benchmark-history.json`；`ctr eval --history` 可查看最近分数、趋势和 Top models。
- History API/UI：新增 `/api/benchmark/history`，`/ui` 维护者工作台展示 benchmark history、最近趋势、Top models，并同屏显示真实 trace 的 task comparison / quality evidence 对齐摘要。
- 人工校准 UI：新增 `/api/benchmark/calibration` 与 `/ui` Human calibration 表单，维护者可把人工评分样本追加进 benchmark history；历史文件只保存摘要，不持久化原始模型输出。
- 核心路由场景任务集：固定任务新增 `routeScenario`，覆盖 default、think、long_context、background、rule_hit、candidate_selection，并保留 server_ops / pool_health 作为后续服务化证据。
- 评测与真实 trace 对齐：离线评测报告新增 `byRouteScenario`，UI benchmark history 同时展示离线 history、真实 task comparison 和 quality evidence，避免把 rubric 分数孤立看待。

## 发布边界

本版本聚焦收益运营化，不把 CTR 宣称为完整 server/cloud 托管平台、完整模型池运营平台或 agent 平台。以下事项进入后续版本，但不作为 `v1.6.0` 发布承诺：

- 服务端部署默认安全策略、密钥轮换手册和托管维护 checklist。
- 模型池主动健康探测、成本/速率元数据和更多调度策略。
- handoff summary、tool capability guardrail、输入/输出 guardrail 和 trace span 化。
- 更完整的可视化趋势图表或外部报表系统。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.6.0`
- `ctr version` 输出 `Version: 1.6.0`
- `v1.6.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.6.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
