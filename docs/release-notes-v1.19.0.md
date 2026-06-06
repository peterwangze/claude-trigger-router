# Release notes v1.19.0

`v1.19.0` 定位为“部署形态与远程接入收敛版”。这个版本不新增托管控制面或集群调度，而是在现有 local thin proxy、server profile、remote status 和 registration 基础上，让远程客户端与服务维护者更清楚地判断连到谁、远端是否 ready、有哪些模型可用，以及失败后该找谁处理。

## 本次闭环

1. Remote service discovery
   - `/api/remote-status` 新增 `discovery` 摘要。
   - 远端 service-info、registration、当前 runtime role 和失败状态会被合并为 `disabled / misconfigured / unreachable / not_ctr_service / not_ready / ready`。
   - boundary 明确保持 service 级，`nodeOrchestration`、`clusterOrchestration` 和 `configWriteback` 均为 `unsupported`。
   - `/ui` Role & connection guide 新增 remote discovery 状态和动作提示。

2. Remote availability
   - `/api/remote-status` 新增 `availability` 摘要。
   - 远端 ready、registration 可用性、远端模型数、upstream 服务数、模型 ID、upstream service ID、客户端下一步和维护者动作进入同一运营状态。
   - `/ui` 同步展示 remote availability，并把 client next steps 合并到 remote discovery 动作列表。

3. Server/client guidance alignment
   - README、configuration guide、server maintainer guide 和 remote client guide 已同步 remote discovery / availability、service-scope 边界和 `client + read-only` key 口径。
   - `ctr doctor` 远程客户端路径新增 service-scope discovery 和远端注册摘要输出。
   - `ctr setup` 远程路径下一步新增 `/api/remote-status` discovery/availability 观测提示。

## 发布边界

- 不新增完整 cloud/托管控制面。
- 不新增节点/集群编排、多活调度或远端配置写回。
- 不改变远程模型调用转发语义；本地 `ctr` 仍作为 thin proxy 转发 `/v1/messages` 与 `/v1/chat/completions`。
- 后续发布与进展治理可持续化进入 v1.20.0。

## 发布前验证

本版本发布前至少执行：

```bash
npx vitest --run src/service-health.test.ts src/server.test.ts
npx vitest --run src/ui/workbench.dom.test.ts
npx vitest --run src/doctor/index.test.ts src/setup/index.test.ts src/deploy-assets.test.ts
npm run test:ui:browser
npm run test:e2e:cli:entry
npm run test:route-ux
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
