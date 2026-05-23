# 配置角色总览

这份文档帮你先判断自己应该走哪条配置路径。

## 本地使用者

当 Claude Code 和 `ctr` 运行在同一台机器上时，选择这条路径。

- 从 `ctr setup` 开始。
- 配置 `Models + Router.default`。
- 运行 `ctr start` 或 `ctr start --daemon`。
- 用 `ctr status` 确认服务状态，然后运行 `ctr code`。

这是默认路径，也是首次使用时最稳的路径。

## 服务维护者

当你要把 `ctr` 作为共享的远程路由服务运行时，选择这条路径。

- 用 `ctr deploy init --target server` 生成 server 配置。
- 也可以在 fresh 环境里运行 `ctr setup` 并选择“部署为远程服务端”；setup 会生成 server profile，但不会自动启动服务。
- 保留 bootstrap `APIKEY` 或 admin managed key 用于维护。
- 给远程使用者发放 managed `client + read-only` key，不要发 admin/bootstrap key。
- 公网部署建议放在 HTTPS 反向代理或内网访问之后。
- 用 `ctr status`、`ctr doctor` 和 `ctr ui` 检查角色、监听地址、鉴权、配额和健康状态。

详细维护步骤见 `docs/server-maintainer-guide.md`。

## 远程服务使用者

当别人已经提供了一个可用的 Trigger Router 服务时，选择这条路径。

- 向服务维护者获取服务 base URL。
- 获取同时带 `client` 和 `read-only` scope 的 managed key。
- 使用 `Runtime.remote_service` 保存连接配置，并做 ready/status 检查；日常可以继续运行本地 `ctr code`，由本地 `ctr` 把模型调用转发到远端服务。
- 如果直接让 Claude Code 连接远程服务，把 `ANTHROPIC_BASE_URL` 设置为服务地址，把 `ANTHROPIC_AUTH_TOKEN` 设置为 managed key。

详细客户端步骤见 `docs/remote-client-guide.md`。

## 当前边界

`Runtime.remote_service` 当前是连接配置、ready/status 检查、注册摘要和本地 thin proxy 转发 contract。当 `Runtime.mode: local` 且 `Runtime.remote_service.enabled` 时，本地 `ctr code` 仍启动 Claude Code 连接本地 `ctr`，模型请求会由本地 `ctr` 转发到远程 router。它不表示已经有集群节点调度或托管控制面；直接让 Claude Code 连接远端只是可选路径。
