# Claude Trigger Router

Claude Trigger Router 是给 Claude Code 用的本地路由代理。

你可以把它理解成 Claude Code 和上游模型之间的一层本地服务：Claude Code 仍然照常使用，但请求会先经过 `ctr`，再按你的配置转发到 OpenAI、Anthropic、OpenRouter、DeepSeek 或其他 OpenAI-compatible 接口。

它适合这些场景：

- 想用统一配置管理多个模型和供应商
- 想让日常任务走便宜/快的模型，复杂任务自动切到更强模型
- 想在 Claude Code 外层增加配置校验、健康检查、治理观测和 UI 工作台
- 想从 `claude-code-router` 迁移到更清晰的 `Models + Router` 配置心智

## 功能概览

- **本地代理服务**：默认监听 `127.0.0.1:5678`，接管 Claude Code 上游请求。
- **统一模型配置**：用 `Models[]` 描述模型接入项，路由直接引用 `Models[].id`。
- **协议兼容**：支持 `openai` / `anthropic` 两类接口协议，OpenRouter、DeepSeek 等 OpenAI-compatible 服务按 `openai` 配。
- **基础路由**：用 `Router.default`、`Router.think`、`Router.longContext` 等槽位指定不同任务的默认模型。
- **SmartRouter**：先用显式规则命中高确定性任务，也可以在规则未命中时让路由模型从候选模型中自动选择。
- **Governance 观测**：记录 trace、metrics、异常摘要和健康状态，帮助你理解路由选择和运行风险。
- **doctor 诊断**：检查配置、服务可启动性、鉴权安全状态、模型兼容策略和可选模型探测。
- **UI 工作台**：`ctr ui` 打开本地页面，查看服务上下文、远程状态、鉴权安全状态、配置草稿、compiled models、capability warnings、治理 trace、metrics 和 Health 摘要。
- **远程状态基础**：可配置 `Runtime.remote_service`，通过 `/api/remote-status` 查看远程服务健康、compiled model 摘要和治理告警摘要。默认用户不需要配置远程模式。

## 部署模式与边界

当前配置里可以用 `Runtime.mode` 表达部署心智：

- `local`：默认模式。你的机器上运行一个本地 `ctr` 服务，Claude Code 通过本地代理访问上游模型。
- `server`：把 `ctr` 作为远程路由服务运行。它暴露 `/api/service-info`、`/api/remote-status`、`/api/registration`、`/ui` 等服务端状态和管理入口。
- `cloud`：保留给托管/云端形态的配置语义；当前 npm 包仍按自托管进程运行，不包含托管控制面或集群编排。

已落地的远程能力聚焦在“远程服务连接配置、状态查询和注册摘要”。它不会默认替代本地代理主路径，也不会自动启用尚未实现的集群、节点调度或托管控制面。

如果要把当前机器作为远程 `server` 暴露给其他客户端，先生成安全默认的服务端配置：

```bash
ctr deploy init --target server
```

该命令会写入 `HOST: "0.0.0.0"`、随机 bootstrap `APIKEY`、`Runtime.mode: "server"`、日志开关、健康检查所需端口和一份可编辑的 `Models + Router.default` 起步模板。它不会覆盖已有配置；如需重建模板，显式追加 `--force`。

npm 包也随附可复制部署模板：

- `config/deploy/docker-compose.server.yaml`
- `config/deploy/systemd/claude-trigger-router.service`

这些模板仍以 `ctr deploy init --target server` 生成的配置为起点。首次暴露给其他机器前，请先确认 `APIKEY` 或 active managed key 存在，并优先放在 HTTPS 反向代理或内网之后。

生成后确认或调整的最小结构如下：

```yaml
HOST: "0.0.0.0"
PORT: 5678
APIKEY: "ctr_bootstrap_..."

Runtime:
  mode: "server"

Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"

Router:
  default: "sonnet"
```

启动方式：

```bash
ctr doctor
ctr start --daemon
```

注意：如果配置了 `HOST: "0.0.0.0"` 但没有设置 `APIKEY` 或 active managed key，运行时会为了安全强制只监听 `127.0.0.1`。`APIKEY` 现在定位为 bootstrap/admin key；服务端启动后可以用它调用 `POST /api/auth/keys` 生成 managed client key，再把生成的一次性 secret 填到远程客户端的 `Runtime.remote_service.auth_token`。managed key 支持 `admin` / `client` / `read-only` scope、过期时间、撤销和可选 `quota.request_limit` / `quota.token_limit` / `quota.window_seconds`；运行时会按模型调用用量拒绝超额请求，并把 quota usage 持久化到 `.claude-trigger-router/auth-quota-usage.json`，服务重启后仍会延续计数。窗口配额超限时 429 会返回 `quota.windowResetAt` 和 `Retry-After`。状态查询和管理请求不会消耗模型调用配额。`client` key 只用于模型调用，不能读取/保存配置或重启服务；`read-only` key 只能读取健康、服务状态、compiled models、transformers 和 governance 观测接口；需要同一个远程 token 同时调用模型和读取 ready/status 时，请生成同时带 `client` 与 `read-only` 的 managed key；`admin` key 才能访问 `/ui`、配置、重启、auth 管理和治理写操作。列表接口只返回前后缀，不回显 secret。`GET /api/service-info` 会返回脱敏的 `auth` / `security` 摘要和按 key 汇总的 quota 用量；`/ui` 维护者工作台也会显示 Auth quota 表，便于定位哪把 managed key 接近或耗尽配额。`GET /api/auth/audit` 可用 admin key 查看最近鉴权允许/拒绝记录。公网入口仍建议放在 HTTPS 反向代理之后。启用 `APIKEY` 或 managed key 后 `/ui` 也会受认证保护；远程浏览器访问 UI 时建议使用本地隧道、内网访问，或由反向代理处理认证。

## 安装

```bash
npm install -g @peterwangze/claude-trigger-router
```

安装后确认命令可用：

```bash
ctr version
ctr help
```

## 5 分钟跑起来

首次使用最推荐走交互式 setup：

```bash
ctr setup
```

`ctr setup` 会自动处理：

- 复用已有 `~/.claude-trigger-router/config.yaml`
- 探测并迁移旧 `claude-code-router` 配置
- 在没有可用配置时询问“本地使用”还是“连接远程服务”
- 本地使用时创建最小可用配置
- 连接远程服务时写入 `Runtime.remote_service`，不要求你先填写本地 provider/model
- 本地使用时，引导填写默认模型 ID、接口地址、API Key 和模型名
- 本地使用时，可选追加复杂任务模型，并生成 SmartRouter 起步模板
- 保存配置后启动本地服务

本地使用路径完成后按这个顺序使用：

```bash
ctr status
ctr code
```

`ctr code` 会带着本地代理环境启动 Claude Code。之后你在 Claude Code 里的请求会经过本地 Trigger Router。

如果 setup 选择的是“连接远程服务”，当前主要用于生成远程服务连接配置并检查远程状态；首次日常使用仍建议先跑通本地 `Models + Router.default` 主路径。

## 手动配置

如果你更喜欢手动编辑，可以先生成模板：

```bash
ctr init --force
```

配置文件位置：

```text
~/.claude-trigger-router/config.yaml
```

最小可用配置如下：

```yaml
HOST: "127.0.0.1"
PORT: 5678

LOG: true
LOG_LEVEL: "debug"

Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"
    thinking: "auto"

Router:
  default: "sonnet"
```

你第一次通常只需要改：

- `Models[0].api`：上游接口地址
- `Models[0].key`：API Key
- `Models[0].interface`：接口协议，通常是 `openai` 或 `anthropic`
- `Models[0].model`：上游真实模型名
- `Router.default`：默认使用哪个 `Models[].id`

改完后启动：

```bash
ctr start
ctr code
```

后台运行：

```bash
ctr start --daemon
ctr status
ctr code
```

## `interface` 怎么选

`interface` 表示上游接口协议，不是厂商名。

常见写法：

| 服务 | interface |
|---|---|
| OpenAI 官方 | `openai` |
| Anthropic 官方 | `anthropic` |
| OpenRouter | `openai` |
| DeepSeek | `openai` |
| 其他 OpenAI-compatible 服务 | `openai` |

路由层会负责请求格式转换，你不需要自己按不同供应商手写消息体。

## 配多个模型

每个 `Models[]` 项都是一个可被路由引用的模型接入项：

```yaml
Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"

  - id: reasoner
    api: "https://api.deepseek.com/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "deepseek-reasoner"
    thinking: "high"

Router:
  default: "sonnet"
  think: "reasoner"
```

推荐所有路由字段都引用 `Models[].id`，比如上面的 `sonnet`、`reasoner`。

## 显式规则路由

适合能用关键词稳定识别的任务，例如架构设计、代码审查、长文档评审。

```yaml
Router:
  default: "sonnet"

SmartRouter:
  enabled: true
  analysis_scope: "last_message"
  rules:
    - name: "architecture"
      priority: 90
      enabled: true
      patterns:
        - type: exact
          keywords: ["架构设计", "system design"]
      model: "reasoner"
```

规则命中时优先使用规则指定模型；没命中时回到 `Router.default`。

## 智能模型选择

如果任务边界比较模糊，可以让 SmartRouter 用一个路由模型从候选模型中选择：

```yaml
SmartRouter:
  enabled: true
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程、代码生成、日常调试"
    - model: "reasoner"
      description: "复杂推理、严谨分析、架构设计"
```

推荐心智：

- `Router.default` 负责默认去向
- `SmartRouter.rules` 负责高确定性任务
- `SmartRouter.candidates` 负责规则未命中时的智能兜底

## capability hint

如果你明确知道某个模型能力受限，可以配置 `metadata`：

```yaml
Models:
  - id: text_only
    api: "https://api.example.com/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "vendor/text-only"
    metadata:
      supports_reasoning: false
      supports_tools: false
      supports_images: false
```

当前行为：

- `supports_reasoning: false`：忽略 `thinking`
- `supports_tools: false`：工具调用退化为文本表达
- `supports_images: false`：图片输入退化为文本描述

不确定时可以先不配，等主路径跑通后再补。

## UI 工作台

启动服务后运行：

```bash
ctr ui
```

默认打开：

```text
http://127.0.0.1:5678/ui
```

当前 UI 分成两层：

- **使用者工作台**：查看和编辑配置草稿、模型、路由、compiled preview 和保存结果。
- **维护者工作台**：查看 Governance trace、Health 摘要、metrics、异常阈值、快照和归档。

首屏状态区会显示：

- 本地服务 ready 状态、端口、模型数和 `Router.default`
- `Runtime.mode` 与当前服务角色
- 远程服务状态摘要
- Registration 模型和上游服务摘要
- Auth 与 Security 摘要，用于发现 server/cloud 或公网监听无鉴权风险

维护者工作台里的 Health 摘要来自 `GET /api/governance/health`，用于快速判断近期治理状态：

- `idle`：还没有 trace 样本，先让请求经过路由服务
- `healthy`：当前窗口没有治理告警
- `watch`：存在 warning，需要关注级联、影子监督或延迟趋势
- `critical`：存在 critical 告警，应优先查看异常列表和最近 trace

同一份摘要也会出现在 `GET /api/governance/metrics` 的 `health` 字段里。异常数量按总告警数展示，并同时给出 critical / warning 明细，避免只看到单类告警而低估风险。

Health 摘要下方的 action 可以直接把 trace 表切到对应排查视图：cascade action 会筛选 `cascadeTriggered=true`，shadow action 会筛选 `shadowChecked=true`，其他 action 会回到近期 trace。

如果服务没有启动，`ctr ui` 会提示先运行：

```bash
ctr start
```

或：

```bash
ctr start --daemon
```

## doctor 诊断

配置不确定、服务起不来、模型不可用、迁移后想体检，都可以运行：

```bash
ctr doctor
```

它会检查：

- 配置文件是否存在或能否解析
- 缺失字段和低风险结构问题
- 配置是否能通过本地校验
- 服务是否可启动
- 当前服务上下文：`local` / `server` / `cloud`
- 当前鉴权状态；如果 server/cloud 或公网监听没有配置 `APIKEY` / managed key，会提示安全风险
- 如果启用了 `Runtime.remote_service`，会单独检查远程服务可达和 ready 状态
- 模型兼容策略和请求编译方式
- capability hint 可能触发的运行时降级
- 在你确认后，对模型发送最小探测请求

模型探测会消耗少量额度，所以 doctor 会先征求确认。如果当前是远程客户端配置且没有本地 `Models`，doctor 会跳过本地模型探测。

## 远程服务状态

默认情况下，你只需要本地模式，不需要配置远程服务。

如果你已经有一个远程 Trigger Router 服务，可以通过 `ctr setup` 选择“连接远程服务”，或手动配置远程目标：

```yaml
Runtime:
  mode: "local"
  remote_service:
    enabled: true
    base_url: "https://router.example.com"
    auth_token: "${CTR_REMOTE_AUTH_TOKEN}" # 推荐使用远程服务端生成的 managed key；如需 ready/status 探测，同时授予 client 与 read-only scope

Router: {}
```

启用后，服务状态接口会返回远程健康、compiled model 摘要和治理告警摘要：

```text
GET /api/remote-status
```

相关服务端状态接口：

```text
GET /api/service-info
GET /api/remote-status
GET /api/registration
GET /api/auth/audit
```

这条能力当前作为远程接入基础 contract 提供，用于服务发现、状态检查和注册摘要；它不表示已经自动把 Claude Code 请求转发到远端。首次使用仍建议从本地 `ctr setup -> ctr start -> ctr code` 开始。

## 常用命令

| 命令 | 用途 |
|---|---|
| `ctr setup` | 首次配置、复用、迁移、修复配置 |
| `ctr init --force` | 生成最小配置模板 |
| `ctr deploy init --target server` | 生成安全默认的自托管 server 配置 |
| `ctr start` | 前台启动本地服务 |
| `ctr start --daemon` | 后台启动本地服务 |
| `ctr status` | 查看服务状态 |
| `ctr restart` | 重启服务，默认按后台模式 |
| `ctr stop` | 停止服务 |
| `ctr code` | 带 Trigger Router 环境启动 Claude Code |
| `ctr doctor` | 配置和服务诊断 |
| `ctr ui` | 打开本地 UI 工作台 |
| `ctr version` | 查看版本 |
| `ctr upgrade` | 升级 |

## 旧配置迁移

如果你之前使用 `claude-code-router`：

```bash
ctr setup
```

setup 会自动探测旧配置，并优先提供迁移选项。迁移后的配置会写入：

```text
~/.claude-trigger-router/config.yaml
```

迁移后的推荐心智是：

- 每个模型写成一个 `Models[]` 项
- 路由引用 `Models[].id`
- 少写旧式 `provider,model`

## 更多示例和文档

- 最小示例：`config/trigger.example.yaml`
- 高级示例：`config/trigger.advanced.yaml`
- 配置细节：`docs/configuration-guide.md`
- Models 迁移：`docs/models-migration-guide.md`
- 发布验证：`docs/releasing.md`
