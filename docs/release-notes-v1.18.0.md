# Release notes v1.18.0

`v1.18.0` 定位为“治理观测运营化增强版”。这个版本不改变默认路由运行时语义，而是把维护者已经能看到的 trace、metrics、pool health、key quota 和 guardrail 信号继续收敛成可排序、可行动、可在 Web UI 中快速扫描的运营闭环。

## 本次闭环

1. Routing outcome scorecard
   - `/api/governance/metrics` 新增 `outcomeScorecard`。
   - route reason、final model、semantic intent 三类 outcome 会按 priority score 排序。
   - scorecard 同时结合 model switch、alignment、cascade、latency、quality evidence 和 task comparison，给出 status、evidence、action 和 configPath。
   - CSV export 同步包含 scorecard 摘要和条目。

2. Operations risk
   - `/api/service-info` 新增 `operations` 汇总。
   - model pool health 与 managed key quota 不再只分散在两个表格中，而是合并为统一 status 和 actions。
   - `/ui` 维护者工作台新增 Operations risk 面板。

3. Guardrail summary
   - `/api/governance/metrics` 新增 `guardrails` 汇总。
   - 输入侧 prompt injection / secret exfiltration 和输出侧 placeholder / tool error 会按 code、severity、count、rate 和 action 汇总。
   - `/ui` 维护者工作台新增 Guardrail summary 面板。

4. Web UI 功能审视与视觉设计优化
   - 维护者工作台顶部新增 decision rail。
   - Operations、Guardrails 和 Outcome 三类运营信号先汇总为状态和下一步动作，再进入明细表。
   - decision rail 在桌面保持三列，在移动端回落单列，并纳入 DOM/style/browser smoke 看护。

## 发布边界

- 不改变 SmartRouter 默认运行时语义。
- 不新增新的模型调度策略或远程部署形态。
- 不新增平行观测结构；新增汇总均复用现有 trace、metrics、service-info、pool health、auth quota 和 UI contract。
- 后续部署形态与远程接入收敛进入 v1.19.0。

## 发布前验证

本版本发布前至少执行：

```bash
npx vitest --run src/deploy-assets.test.ts
npm run test:ui
npm run test:ui:browser
npm run test:e2e:cli:entry
npm run test:route-ux
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
