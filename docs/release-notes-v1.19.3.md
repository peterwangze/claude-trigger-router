# Release notes v1.19.3

`v1.19.3` 定位为“Claude 流式断流系统修复版”。这个 patch release 承接 `v1.19.2` 后用户继续复现的断流问题：约 10 分钟直接中断、不到 10 分钟随机中断、API error 后继续很快又停、同一 session 第二轮明显卡顿或卡住，以及手动终结后新对话出现 `API Error: The socket connection was closed unexpectedly.`。

## 本次闭环

1. Stream lifecycle diagnostics
   - 默认流式透传路径记录 `start / chunk / upstream_error / client_cancel / finalize` 生命周期事件。
   - 事件包含 request id、session id、chunk 数、字节数、终态和错误信息，便于区分上游断流、客户端手动取消和正常结束。
   - 新增正常流、上游错误和客户端取消回归测试。

2. Safe streaming shutdown
   - 默认透传路径在上游 read error 时继续保留已输出 chunk，并尽量追加可读 `event: error` SSE 后温和关闭。
   - 下游已经取消或关闭时，`enqueue / close` 不再把内部控制器异常冒泡成 socket-level 断连。
   - `stream_guard` 缓冲路径遇到上游异常时也返回可读 SSE error，不再直接 `controller.error()`。

3. Upstream cancellation propagation
   - 远程 thin proxy 把客户端 close / aborted 和返回流 cancel 传播到上游 fetch。
   - agent/tool follow-up 内部 `/v1/messages` fetch 绑定外层请求的 abort signal，手动停止时不留下半开的内部续写请求。
   - 远程流正常建立后仍不会被 `API_TIMEOUT_MS` 当作整条 stream 总时长限制。

4. Second-turn and continue regressions
   - 新增同一 session 手动停止后第二轮请求必须获得全新 abort signal 的回归测试。
   - 新增远程 socket 错误后继续请求不继承旧 signal、仍能独立完成流式输出的回归测试。
   - 保留 v1.19.2 的长流响应开始超时、agent follow-up continuity 和结构化 502 看护。

## 发布边界

- 不改变模型厂商配置、SmartRouter 路由选择、remote discovery 或 `/ui` 配置向导语义。
- 不新增用户配置项；本次修复是传输层行为收敛和回归看护补强。
- 不声明解决上游模型供应商、系统代理或中间网络自身的 idle timeout；CTR 能保证自身不把内部 stream 错误升级成不可读 socket close，并能在客户端取消时及时释放当前请求的上游连接。

## 发布前验证

本版本发布前至少执行：

```bash
npm test -- --run src/governance/stream-response-governance.test.ts src/index-startup.test.ts
npm run build
npm run test:route-ux
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
