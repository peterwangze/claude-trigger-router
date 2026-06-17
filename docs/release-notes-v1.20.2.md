# Release notes v1.20.2

`v1.20.2` 定位为“API 报错后继续 / resume 继续慢卡补丁版”。这个 patch release 针对 v1.20.1 后仍复现的继续对话慢卡，修掉首包前诊断、缓存签名和内部 loopback 仍可能放大长历史的路径。

## 本次闭环

1. Analysis diagnostics no full-history rebuild
   - `analysis_scope=full_conversation` 在应用 recent-window 预算后，不再为了精确 `originalChars` 重新拼完整会话。
   - `originalChars` 改为估算值并标记 `originalCharsEstimated`。
   - 诊断本身不再绕回完整历史文本重建。

2. Compact token count cache signature
   - token count cache 不再用完整 `messages/system/tools` JSON 作为 key。
   - 签名改为 role、内容长度、工具名、schema 长度和少量采样。
   - cache 命中前不再先做一次完整长历史序列化。

3. Preflight loopback timeout budget
   - SmartRouter fallback 和 semantic classifier 默认使用 30000ms preflight 短超时。
   - 新增 `SmartRouter.preflight_timeout_ms` 和 `semantic.timeout_ms` 可配置覆盖。
   - API 报错后继续时，内部路由 LLM 不再继承 600000ms 级别的长流主路径 `API_TIMEOUT_MS`。

## 发布边界

- 不改变 Router/SmartRouter 的路由语义，只收紧首包前性能预算。
- 不声称消除上游模型自身慢响应；本次修复的是 CTR 前置诊断、token 估算签名和内部路由 loopback 的慢卡。
- v1.20.1 的 preflight diagnostics 和 resume stability gate 继续保留，v1.20.2 在其上补真实继续对话路径的性能缺口。

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
