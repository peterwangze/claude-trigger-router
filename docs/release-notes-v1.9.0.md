# Release notes v1.9.0

`v1.9.0` 定位为“用户入口与远程客户端一致性收口版”。这个版本不新增大型能力，重点是把已经落地的远程转发、setup 下一步、鉴权变量、受保护 UI 入口和 README 新用户路径统一到同一套用户心智。

## 本次主线

- 远程客户端 proxy 心智统一：README、configuration roles、configuration guide 和 remote client guide 均明确 `Runtime.mode: local` 且 `Runtime.remote_service.enabled` 时，本地 `ctr code` 可作为 thin proxy 转发 `/v1/messages` 与 `/v1/chat/completions` 到远端 CTR；直接连接远端只是可选路径。
- setup remote-client next steps 收口：`ctr setup` 远程客户端路径现在提示先运行 `ctr doctor` / `ctr status` 检查远端 ready，再运行本地 `ctr code` 进入 Claude Code；setup 单测和 packaged CLI entry smoke 已同步。
- 远程 Claude Code 鉴权口径统一：面向 Claude Code 推荐 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`；本地 `ctr code` 也注入 `ANTHROPIC_AUTH_TOKEN` 并清理 `ANTHROPIC_API_KEY`，原始 HTTP 客户端仍可用 `Authorization: Bearer` 或 `x-api-key`。
- `/ui` admin 入口最小闭环：`ctr ui` 输出、README、configuration guide、server maintainer guide 和 UI Auth scope guide 均说明受保护 `/ui` 需要 admin key，并建议通过内网/本地隧道或反向代理注入 `Authorization: Bearer <admin-key>`，不要把 admin key 放进 URL。
- README 新用户路径前置：`5 分钟跑起来` 已移动到项目介绍之后，直接给出 `ctr setup -> ctr status/doctor -> ctr code -> ctr ui` 主路径；版本定位、部署和维护者内容后移。

## 发布边界

- 本版本不声明完整 cloud 托管控制面、节点/集群编排或独立 agent 平台。
- `/ui` 本轮完成可执行访问指导和 CLI 提示，不新增长期 key URL、一次性 token 或 loopback header proxy；后续若实现新的 UI auth 入口，必须补 server/auth/UI smoke。
- 远程客户端仍是本地 thin proxy + 远端只读状态/注册摘要，不做服务发现或远端注册写回。

## 验证

本版本收口前至少需要通过：

```bash
npm run release:verify
```

本轮已为新增闭环补充 targeted 看护：

- `src/setup/index.test.ts`
- `npm run test:e2e:cli:entry`
- `src/deploy-assets.test.ts`
- `src/cli-run.test.ts`
- `npm run test:ui`
