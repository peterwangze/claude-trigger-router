# Release notes v1.11.0

`v1.11.0` 定位为“基础路由流式稳定性与 socket 错误修复版”。这个版本不扩展新的路由能力，专门回看 `v1.5.0` 之后的入口、runtime pipeline、流式治理、远程客户端和 SmartRouter 协作改动，优先修复用户反馈的两个 P0/P1 可用性问题。

## 修复重点

1. 基础路由流式输出恢复即时透传。
   - 问题：`v1.8.0` 引入流式 response governance 后，`governStreamingResponse` 会先完整收集上游 SSE，再一次性输出。长回复或普通 Claude Code 会话中，客户端长时间收不到增量 token，容易表现为输出中断。
   - 修复：默认 `stream_guard` 未开启时改为边转发原始 chunk、边旁路收集文本和 usage 用于 trace / output guardrail；只有显式开启 `Governance.cascade.stream_guard` 时才保留 buffer-and-retry。

2. API error 不再被转换成 socket-level hook error。
   - 问题：运行时 `onSend` 看到 `{ error: ... }` payload 时会把它作为 Fastify hook error 传出，客户端可能看到 `The socket connection was closed unexpectedly`，而不是稳定的结构化 API 错误。
   - 修复：保留上游结构化错误 payload 返回；model pool fallback 尝试失败后也返回 payload，不再把普通 API error 当成传输层异常。

3. SSE parser 修复跨 chunk 状态丢失。
   - 问题：`SSEParserTransform` 的当前事件对象只存在于单次 parse 调用里；当上游把 `event:`、`data:`、空行拆成多个网络 chunk 时，事件状态可能丢失。
   - 修复：parser 现在跨 chunk 保留当前事件，并能 flush 没有尾随空行的最终事件，降低 agent/tool stream 和 stream guard 场景的偶发中断风险。

## 看护

- `src/governance/stream-response-governance.test.ts` 新增“上游未关闭前就能读到首个 chunk”的回归测试。
- `src/utils/SSEParser.transform.test.ts` 新增 SSE 跨 chunk 和无尾随空行 flush 测试。
- `src/index-startup.test.ts` 新增上游 API error payload 不触发 socket-level hook error 的测试。

## 发布边界

本版本是稳定性修复版，不新增 SmartRouter 协作模式、不改变 v1.10.0 的 routing advisor / budget / collaboration contract，也不改变远程客户端推荐配置。发布前需要重点验证：

```bash
npm run build
npm test -- --run
npm test -- --run --coverage
npm run test:e2e:cli:entry
```

若要做正式发布，仍以 `npm run release:verify` 作为最终门禁。
