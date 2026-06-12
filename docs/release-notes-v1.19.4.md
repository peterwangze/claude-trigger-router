# Release notes v1.19.4

`v1.19.4` 定位为“常见场景稳定性与可用性全量复审版”。这个 patch release 承接 `v1.19.3` 后用户反馈的高频断流风险，不再只修单点异常，而是把本地直连、远程 thin proxy、agent/tool follow-up、手动停止、错误后继续、第二轮会话、诊断可见性和发布门禁放到同一条稳定性链路里复审。

## 本次闭环

1. Agent stream rewrite stability
   - `rewriteStream()` 支持下游 cancel 传播、safe enqueue/close，并保留 handler 真实错误语义。
   - agent/tool follow-up 内部 reader 使用 `finally` 释放，follow-up response body 缺失时安全结束。
   - 覆盖 handler 抛错、下游取消、空 body 和工具续写路径的回归测试。

2. Stream stability gate
   - 新增 `npm run test:stream-stability`，聚合 rewriteStream、SSE parser、stream governance、startup wiring 和 route UX 稳定性看护。
   - 一条命令覆盖 remote SSE 长流、agent/tool follow-up、stream_guard、手动停止、第二轮会话、错误后继续、结构化错误和 route preview。

3. Stream diagnostics visibility
   - `streamLifecycle` 进入 governance trace/detail API 和 Web UI trace 详情。
   - trace spans 新增 `stream_lifecycle`，展示 start/chunk/error/cancel/finalize、chunk/byte 计数、上游错误和客户端取消原因。
   - 维护者可以按 request id/session id 判断断流来自上游、客户端取消还是 CTR 内部防护。

4. Management probe stability
   - 复查 `API_TIMEOUT_MS`、remote status、doctor probe、SmartRouter 内部请求和 verifier 超时边界。
   - 确认模型长流主路径仍只把 `API_TIMEOUT_MS` 用作远端响应开始 timeout，不作为整条 stream 总时长限制。
   - 远程 service/registration timeout 统一输出可读诊断；模型池 HEAD 探测新增 800ms 短 timeout，避免 Web UI/doctor 管理入口被单个慢端点卡住。

## 发布边界

- 不改变模型厂商配置、SmartRouter 路由选择、remote discovery 或 `/ui` 配置向导语义。
- 不新增用户配置项；本次修复是流式生命周期、管理探测和发布门禁的稳定性收敛。
- 不声明解决上游模型供应商、系统代理或中间网络自身的 idle timeout；CTR 保证自身不把内部控制器竞态升级成不可读 socket close，并尽量把错误/取消原因暴露给维护者。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:stream-stability
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
