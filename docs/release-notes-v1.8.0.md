# v1.8.0 Release Notes

`v1.8.0` 定位为“低侵入 agent/tool 增强与架构减压版”。这个版本承接已有 image agent、tools fallback、governance trace、远程转发和模型池基础，目标是让 agent/tool 能力继续服务 Claude Code 路由代理，而不是扩张成一套平行 agent 平台。

## 本次发布主线

- Runtime pipeline contract：新增 `src/runtime/pipeline.ts`，把 `auth -> remote_forward -> smart_router -> agent_tools -> router -> context_guard -> protocol_dispatch -> agent_stream -> response_governance` 固化为请求级阶段记录和顺序看护。
- 管理 API route contract：新增 `src/server/management-routes.ts`，统一记录管理接口 method、path、domain、requiredScope 和 sensitive response，并让 `apiKeyAuth` 复用同一权限矩阵。
- UI fragment contract：新增 `src/ui/workbench-fragments.ts`，抽出 surface tabs、HTML escaping、inline JSON helper 和关键 DOM anchor contract，降低 `/ui` 继续扩展时的单文件压力。
- Route handoff summary：governance trace、API 和 `/ui` 都能展示 initial/final model、pipeline 阶段、切换状态和 failed/cascade/context guard 风险摘要。
- Tool capability guardrail：工具可以声明 required model capabilities，运行时只注入当前 selected model 能满足的工具，并把 allow/deny 原因写入 trace。
- 输入/输出 guardrail：非阻断识别 prompt injection、secret exfiltration、placeholder output、tool result error 和 refusal/incomplete output，并写入 governance trace。
- Trace spans：`governanceTrace.spans` 统一承载 runtime pipeline、model pool fallback、input guardrail 和 output guardrail 证据，为 UI 和后续排障提供同一观测结构。

## 发布边界

本版本聚焦低侵入增强与架构减压，不宣称以下能力：

- 独立 agent 编排、任务队列、长任务工作流或完整工具平台。
- 完整 cloud 托管控制面、节点集群编排或多租户组织/计费系统。
- 阻断式安全网关；当前输入/输出 guardrail 是 trace-first 的非阻断看护。
- 全量浏览器端 trace span 可视化；本轮先稳定数据 contract 和 route handoff 摘要入口。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.8.0`
- `ctr version` 输出 `Version: 1.8.0`
- `v1.8.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.8.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
