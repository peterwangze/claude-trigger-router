# Release notes v1.19.2

`v1.19.2` 定位为“新版 Claude 长任务超时与流式中断修复版”。这个 patch release 不改变模型配置、路由选择或远程接入语义，重点修复新版 Claude 在 CTR 后面执行长任务时更容易暴露的两个可用性问题：约 10 分钟返回 `API Error: The operation times out.`，以及 agent/tool 流式续写中途静默停止。

## 本次闭环

1. Remote stream timeout fix
   - 远程客户端模式下，`Runtime.remote_service` thin proxy 不再把 `API_TIMEOUT_MS` 当成整条模型流的总时长上限。
   - `API_TIMEOUT_MS` 只保护远端服务“开始响应”的等待期；远端已返回响应头并建立 stream 后，CTR 不再在 600 秒主动 abort。
   - 客户端连接关闭仍会取消上游 fetch，远端不可达仍返回结构化 `remote_service_unavailable`。

2. Agent follow-up stream continuity
   - agent 工具续写链路不再因为 `ReadableStreamDefaultController.desiredSize === 0` 就提前 `break`。
   - 继续让 Web Streams 负责背压排队，避免长任务或新版 Claude 工具调用续写时出现“任务执行到一半突然停掉”。
   - 保留原有上游断流的可读 SSE error 和治理 trace 收尾逻辑。

3. Regression coverage
   - `src/index-startup.test.ts` 新增远程 SSE 响应建立后超过 600 秒不 abort 的回归测试。
   - `src/index-startup.test.ts` 新增 agent/tool follow-up stream 不因背压静默截断的回归测试。
   - 本轮继续复用 route UX 和 release verify 门禁保护普通路由、远程中转、结构化错误和 UI 主路径。

## 发布边界

- 不改变 `API_TIMEOUT_MS` 对 SmartRouter、intent、alignment、cascade retry 等内部短请求的含义。
- 不新增新的配置项；用户不需要为了长 Claude 任务手动调大默认配置。
- 不改变 `/ui` 配置向导、provider templates、remote discovery 或 server/client 角色口径。
- 不声明解决上游模型服务自身 idle timeout 或网络代理超时；本次修复的是 CTR 本地主动 abort 和 agent stream 提前退出。

## 发布前验证

本版本发布前至少执行：

```bash
npx vitest --run src/index-startup.test.ts
npm run build
npm run test:route-ux
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
