# Claude Trigger Router

Claude Trigger Router 是给 Claude Code 用的本地模型路由代理。Claude Code 仍按原来的方式工作，但请求会先经过 `ctr`，再按你的配置转发到 Anthropic、OpenAI、OpenRouter、DeepSeek 或其他 OpenAI-compatible 服务。

它适合想把多个模型接到同一个 Claude Code 入口里的人：日常任务走快模型，复杂任务切到强模型，长上下文、后台请求、web search 和代码审查都可以有自己的路由策略。

## 你会得到什么

- 一个本地 Claude Code 代理：默认监听 `127.0.0.1:5678`。
- 一份统一模型配置：用 `Models[].id/api/key/interface/model` 管模型接入。
- 基础路由：用 `Router.default`、`think`、`longContext`、`background`、`webSearch` 覆盖高频场景。
- SmartRouter：用规则、语义匹配、候选模型画像和 LLM 路由选择更合适的模型。
- 治理与 UI：通过 `ctr doctor` 和 `ctr ui` 看配置、健康状态、路由原因、trace 和协作证据。

## 5 分钟跑起来

安装：

```bash
npm install -g @peterwangze/claude-trigger-router
ctr version
```

初始化配置：

```bash
ctr setup
```

检查并启动：

```bash
ctr doctor
ctr start --daemon
ctr status
```

通过路由器进入 Claude Code：

```bash
ctr code
```

打开本地工作台：

```bash
ctr ui
```

第一次使用时，`ctr setup` 会先复用当前配置或迁移旧 `claude-code-router` 配置；确实需要新建时，再按 `Models[].id` 创建默认模型和 `Router.default`。它也能连接远程服务，或生成服务端部署 profile。

## 最小配置长什么样

配置文件默认在：

```text
~/.claude-trigger-router/config.yaml
```

最小可用配置：

```yaml
HOST: "127.0.0.1"
PORT: 5678

Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"

Router:
  default: "sonnet"
```

`interface` 表示上游接口协议，不是厂商名。OpenRouter、DeepSeek 和大多数 OpenAI-compatible 服务通常用 `openai`；Anthropic 官方接口用 `anthropic`。

新配置只推荐写 `id/api/key/interface/model/thinking/metadata`。旧字段 `api_base_url/api_key/protocol` 只作为历史配置兼容读取，不作为新配置入口。

## 配多个模型

每个 `Models[]` 项都是一个可被路由引用的模型接入项。路由字段建议引用 `Models[].id`，不要把供应商和模型名散落在各处。

```yaml
Models:
  - id: fast
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-3-5-haiku"

  - id: deep
    api: "https://api.deepseek.com/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "deepseek-reasoner"

Router:
  default: "fast"
  think: "deep"
  longContext: "deep"
```

常用路由槽位：

| 槽位 | 用途 |
|---|---|
| `default` | 普通请求和兜底模型 |
| `think` | 明确需要推理的任务 |
| `longContext` | 长上下文或当前模型窗口不够时 |
| `background` | Claude Code 轻量后台请求 |
| `webSearch` | 带 web search 工具的请求 |

基础路由的实际判断顺序是：显式上游模型 -> `longContext` 阈值 -> `background` -> `think` -> `webSearch` -> `default`。因此超长输入会先进入长上下文槽位；`background` 当前只识别 Claude Code 发出的 `claude-3-5-haiku*` 后台模型请求；如果请求模型已经是 `provider,model` 这类上游引用，基础槽位不会再覆盖。最终定模后还会执行 context window guard，如果已选模型放不下，会优先 fallback 到 `Router.longContext`。

可复制模板：

- [config/trigger.example.yaml](config/trigger.example.yaml)：最小配置
- [config/trigger.routing.yaml](config/trigger.routing.yaml)：基础路由五槽位
- [config/trigger.smart-router.yaml](config/trigger.smart-router.yaml)：SmartRouter 两模型起步模板
- [config/trigger.smart-router.advanced.yaml](config/trigger.smart-router.advanced.yaml)：SmartRouter 多候选高级模板
- [config/trigger.advanced.yaml](config/trigger.advanced.yaml)：高级治理示例

## SmartRouter

SmartRouter 适合任务边界不稳定、模型能力差异明显、或者你想让真实运行证据反哺路由的场景。

```yaml
SmartRouter:
  enabled: true
  router_model: "fast"
  candidates:
    - model: "fast"
      description: "快速回复、轻量修改、日常解释"
    - model: "deep"
      description: "复杂推理、架构设计、深度代码审查"
```

推荐心智：

- `Router.default` 负责默认去向。
- `SmartRouter.rules` 负责能被关键词稳定识别的任务。
- `SmartRouter.candidates` 负责规则未命中时的智能兜底。
- `SmartRouter.routing_budget.latency_budget_ms` 和 `confidence_threshold` 用来控制速度/质量取舍。
- `SmartRouter.collaboration.mode` 可表达 `route_only`、`verify_only`、`compare_then_arbiter`、`cascade_on_evidence` 这类策略 contract；当前默认仍是单模型 `route_only`，不会默认并发调用多个模型。

从 `v1.10.0` 开始，SmartRouter 会把真实 trace 中的质量、失败、延迟、cascade、shadow 和人工校准证据纳入候选模型画像，并在 route decision 中展示 `routingMode`、`collaborationMode` 和 `routingEvidence`。

## UI 与诊断

```bash
ctr doctor
ctr doctor --route-preview --route-text "请做架构设计"
ctr ui
```

`ctr doctor` 用来检查配置、服务启动、模型引用、上下文窗口、鉴权状态和可选模型探测。`--route-preview` 可以在不调用上游模型、不消耗额度的情况下预演当前请求会命中哪个槽位或 SmartRouter 路径；模型探测会消耗少量额度，所以会先征求确认。

`ctr ui` 默认打开：

```text
http://127.0.0.1:5678/ui
```

UI 主要看四件事：

- 当前服务是否 ready。
- 编译后的模型和路由是否符合预期。
- 最近请求为什么选了某个模型。
- governance trace、metrics、Health 摘要和 SmartRouter 协作证据。

## 部署模式与边界

默认使用本地模式即可。只有需要让多台机器共享同一个 CTR 服务时，才需要看远程/服务端配置。

```bash
ctr deploy init --target server
ctr doctor
ctr start --daemon
```

当前支持的角色：

| 模式 | 适合谁 | 说明 |
|---|---|---|
| `local` | 单机 Claude Code 用户 | 默认模式，本地代理转发到上游模型 |
| `server` | 服务维护者 | 暴露远程 CTR 服务，提供模型调用、状态和管理接口 |
| `local + remote_service` | 远程服务使用者 | 本地 `ctr code` 作为 thin proxy，把模型请求转发到远端 CTR |
| `cloud` | 未来托管形态 | 只保留配置语义，当前 npm 包不包含托管控制面 |

远程 Claude Code 直接连接服务端时，推荐使用：

```bash
ANTHROPIC_BASE_URL=https://router.example.com
ANTHROPIC_AUTH_TOKEN=<managed-key>
```

远程客户端可通过 `ctr doctor`、`ctr ui` 或 `GET /api/remote-status` 查看 remote discovery 与 remote availability：它会显示远端是否 ready、远端注册模型数、upstream 服务数和下一步处理提示；当前边界仍是 service 级，不包含节点/集群编排或托管控制面。

启用鉴权后，浏览器直接打开 `/ui` 不能自动携带 `Authorization` header。受保护 UI 需要 admin key，建议通过内网、本地隧道或 HTTPS 反向代理注入 `Authorization: Bearer <admin-key>`；不要把 admin key 放进 URL。

更多部署细节：

- [docs/configuration-roles.md](docs/configuration-roles.md)
- [docs/server-maintainer-guide.md](docs/server-maintainer-guide.md)
- [docs/remote-client-guide.md](docs/remote-client-guide.md)

## 常用命令

| 命令 | 用途 |
|---|---|
| `ctr setup` | 首次配置、复用配置、迁移旧配置 |
| `ctr doctor` | 配置和服务诊断 |
| `ctr start --daemon` | 后台启动本地服务 |
| `ctr status` | 查看服务状态 |
| `ctr code` | 带路由环境启动 Claude Code |
| `ctr ui` | 打开本地 UI 工作台 |
| `ctr eval --tasks` | 查看内置评测任务 |
| `ctr eval --run --models "fast;deep"` | 真实调用 CTR 做多模型评测 |
| `ctr stop` | 停止后台服务 |
| `ctr upgrade` | 查看升级指引 |

## 文档入口

- 配置指南：[docs/configuration-guide.md](docs/configuration-guide.md)
- Models 迁移：[docs/models-migration-guide.md](docs/models-migration-guide.md)
- CLI 测试矩阵：[docs/cli-test-matrix.md](docs/cli-test-matrix.md)
- 发布说明：[docs/release-notes-v1.20.2.md](docs/release-notes-v1.20.2.md)
- 发布验证：[docs/releasing.md](docs/releasing.md)

## v1.20.2 发布定位

`v1.20.2` 是 API 报错后继续 / resume 继续慢卡补丁版。它修掉 v1.20.1 后仍可能触发的长历史诊断重扫、token cache 完整签名和内部路由 loopback 长等待。

这一版继续使用 `test:resume-stability` 看护长消息、tool results、`analysis_scope=full_conversation`、SmartRouter fallback、semantic classifier、alignment enabled、context window guard 和同 session 恢复路径；同时保留 `test:stream-stability` 与 `test:closed-review` 作为发布护栏，并补紧凑 token 签名和 preflight 短超时回归。完整发布边界见 [docs/release-notes-v1.20.2.md](docs/release-notes-v1.20.2.md)。

## License

MIT
