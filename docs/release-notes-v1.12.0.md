# Release notes v1.12.0

`v1.12.0` 定位为“流式传输韧性与远程中转稳定性修复版”。用户在 `v1.11.0` 上仍复现 `The socket connection was closed unexpectedly`、同模型经中转响应更慢和输出突然卡住，说明首轮修复只覆盖了默认全量缓冲和结构化 error hook 两个问题，还缺少上游中途断流、远程中转取消和跨 chunk 解码的防线。

## 本次主线

1. 上游流式中途断开不再硬断 socket。
   - 问题：`v1.11.0` 默认透传流式 chunk 后，如果上游 body 在中途抛错，错误仍会冒泡到 ReadableStream controller，客户端可能继续看到 socket 异常。
   - 修复：默认透传路径捕获上游 stream read error，保留已输出 chunk，并追加 `event: error` / `type: upstream_stream_error` 的可读 SSE 事件后关闭流。

2. 远程中转在客户端断开时主动取消上游。
   - 问题：`Runtime.remote_service` thin proxy 直接 `reply.send(response.body)`，没有把客户端连接关闭绑定到远端 fetch abort；客户端已经断开时，上游请求可能继续挂住并放大卡顿和资源占用。
   - 修复：远程转发使用 `AbortController`，将 `reply.raw close` 绑定到上游 abort；远端 SSE 响应也进入同一套流式治理包装。

3. SSE parser 修复多字节字符跨 chunk 解码。
   - 问题：parser 每个 chunk 新建 `TextDecoder`，中文等多字节字符被网络拆开时可能产生替换字符或 JSON 解析失败。
   - 修复：parser 持续复用同一个 `TextDecoder` 并在 flush 时收尾。

## 发布边界

- 本版本不新增 SmartRouter 协作模式，不改变远程客户端配置心智。
- `v1.11.0` 仍保留为首轮止血版本；`v1.12.0` 是针对用户在 `v1.11.0` 上再次复现的二次修复版。
- 远程中转的非 SSE 响应仍保持原始 body 透传，不注入 SSE error event。

## 验证

本版本收口前至少需要通过：

```bash
npm run release:verify
```

本轮新增和复核的 targeted 看护：

- `src/governance/stream-response-governance.test.ts`
- `src/utils/SSEParser.transform.test.ts`
- `src/index-startup.test.ts`
- `src/deploy-assets.test.ts`
