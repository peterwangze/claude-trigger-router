# Release notes v1.20.1

`v1.20.1` 定位为“resume 恢复性能与长历史前置路径优化版”。这个 patch release 针对同一 session 中断退出后用 `resume` 恢复明显变慢甚至卡住的问题，收敛首包前路由与治理路径的可观测性和预算边界。

## 本次闭环

1. Resume preflight diagnostics
   - `/v1/messages` 首包前记录消息数、文本字符数、工具结果字符数、tool schema 字符数和阶段耗时。
   - trace span 新增 `preflight_diagnostics`，能区分 SmartRouter analysis、token count 和 context alignment summary 等慢点。
   - 维护者可以按 request/session 看出卡在 CTR 前置路径还是上游响应等待。

2. SmartRouter long-history budget
   - `SmartRouter.analysis_budget` 默认限制分析字符数和 recent message 数。
   - `analysis_scope=full_conversation` 仍可用，但进入 SmartRouter/semantic/fingerprint 前会记录截断与预算信息。
   - 同 session 且任务 fingerprint 未明显变化时，sticky correction 会先于 semantic classifier 和 SmartRouter fallback 复用稳定模型。

3. Token count reuse
   - context window guard 的 token count 增加请求签名级缓存诊断。
   - resume-sized 长历史请求重复进入时可复用估算结果，并在 `routerTokenDiagnostics` 中标记 cache hit。
   - 工具结果和大 schema 的前置估算成本进入 preflight 观测范围。

4. Alignment summary guardrail
   - context alignment 摘要只接收 bounded task context。
   - 新增独立 timeout、skip reason、输入字符数、截断状态和 summarizer model 诊断。
   - 模型切换仍可保留 alignment 保护，但不会默认把完整 resume 历史交给 loopback summarizer。

5. Resume stability release gate
   - 新增 `npm run test:resume-stability`。
   - `release:verify`、`Release Check` 和 `Publish Package` 固定执行 resume stability gate 与 closed review gate。
   - 发布前能用一条 targeted 命令覆盖长消息、tool results、`full_conversation`、semantic classifier、SmartRouter fallback、alignment enabled、context window guard 和同 session 第二轮恢复相关路径。

## 发布边界

- 不改变用户现有 Router/SmartRouter 配置语义；新增预算为防止长历史 resume 无界放大前置路径。
- 不声称消除上游模型自身排队或响应慢；本次重点是让 CTR 首包前路径有预算、可诊断、可回归。
- 不回退 v1.19.x 的流式稳定结论；resume 卡住作为 PI-031 独立闭环，不再混入 socket 断流问题。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:resume-stability
npm run test:stream-stability
npm run test:closed-review
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
