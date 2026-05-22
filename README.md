# Claude Trigger Router

Claude Trigger Router 是给 Claude Code 用的本地路由代理。

你可以把它理解成 Claude Code 和上游模型之间的一层本地服务：Claude Code 仍然照常使用，但请求会先经过 `ctr`，再按你的配置转发到 OpenAI、Anthropic、OpenRouter、DeepSeek 或其他 OpenAI-compatible 接口。

它适合这些场景：

- 想用统一配置管理多个模型和供应商
- 想让日常任务走便宜/快的模型，复杂任务自动切到更强模型
- 想在 Claude Code 外层增加配置校验、健康检查、治理观测和 UI 工作台
- 想从 `claude-code-router` 迁移到更清晰的 `Models + Router` 配置心智

## v1.6.0 发布定位

`v1.6.0` 是多模型收益运营化版。它把已有 `ctr eval`、LLM judge、真实 trace outcome、quality evidence、task comparison 和 `/ui` benchmark summary 连成一条更可运营的收益判断链路。

这个版本新增 benchmark history CLI/API/UI、人工校准 UI 表单、按核心路由场景重排的固定任务集，以及离线评测与真实 trace 的同屏解释口径。它不把完整 server/cloud 托管平台、主动模型池运营或 agent 平台化纳入发布承诺。完整发布边界见 [docs/release-notes-v1.6.0.md](docs/release-notes-v1.6.0.md)。

## 版本路线

从用户使用频率看，版本演进会优先回到最常用的基础路由和 SmartRouter 体验：

- `v1.3.0`：基础路由常用体验，已收口 `Router.default` / `think` / `longContext` / `background` / `webSearch` 五槽位、doctor 诊断、UI 路由解释和 packaged smoke。
- `v1.4.0`：SmartRouter 常用体验，已收口规则模板、候选模型配置向导、路由决策解释、切换体感摘要和配置路径级调优建议。
- `v1.5.0`：入口基础功能稳定与易用性巩固，已补 packaged entry smoke、remote/server setup slice、UI DOM smoke 和配置保存安全线。
- `v1.6.0`：多模型收益运营化，已补 benchmark history、人工校准 UI、核心路由场景任务集和评测/真实 trace 统一解释。
- `v1.7.0`：服务化与模型池安全体验，继续补服务端安全默认值、密钥轮换手册、主动 pool health、成本/速率元数据和更多调度策略。

完整版本计划见 [docs/superpowers/plans/2026-05-07-core-routing-version-plan.md](docs/superpowers/plans/2026-05-07-core-routing-version-plan.md)。

## 功能概览

- **本地代理服务**：默认监听 `127.0.0.1:5678`，接管 Claude Code 上游请求。
- **统一模型配置**：用 `Models[]` 描述模型接入项，路由直接引用 `Models[].id`。
- **协议兼容**：支持 `openai` / `anthropic` 两类接口协议，OpenRouter、DeepSeek 等 OpenAI-compatible 服务按 `openai` 配。
- **基础路由**：用 `Router.default`、`Router.think`、`Router.longContext` 等槽位指定不同任务的默认模型。
- **SmartRouter**：先用显式规则命中高确定性任务，也可以在规则未命中时让路由模型从候选模型中自动选择。
- **Governance 观测**：记录 trace、metrics、异常摘要和健康状态，帮助你理解路由选择和运行风险。
- **路由评测**：`ctr eval --tasks` 查看固定任务契约，`ctr eval --input results.json` 离线评分，`ctr eval --run --models "sonnet;haiku"` 真实调用 CTR 做多模型 A/B；追加 `--judge-model` 后可调用一个 LLM 裁判模型给结果打分。
- **doctor 诊断**：检查配置、服务可启动性、基础路由槽位、上下文窗口提示、鉴权安全状态、模型兼容策略和可选模型探测。
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

角色化手册：

- 配置角色总览：[docs/configuration-roles.md](docs/configuration-roles.md)
- 服务提供者/维护者：[docs/server-maintainer-guide.md](docs/server-maintainer-guide.md)
- 远程服务使用者：[docs/remote-client-guide.md](docs/remote-client-guide.md)

这些模板仍以 `ctr deploy init --target server` 生成的配置为起点。生成的 server profile 会写入 `Runtime.security` 默认策略：公网监听必须有鉴权、bootstrap key 只用于 admin、远程客户端使用 managed `client + read-only` key，公网部署前应放在 HTTPS 反向代理或内网之后。`GET /api/service-info` 会返回同一策略和部署 checklist，方便 `/ui`、`ctr status` 和维护脚本复核。

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

安全边界：

- 如果配置了 `HOST: "0.0.0.0"` 但没有设置 `APIKEY` 或 active managed key，运行时会为了安全强制只监听 `127.0.0.1`。
- `APIKEY` 定位为 bootstrap/admin key；服务端启动后用它调用 `POST /api/auth/keys` 生成给远程使用者的 managed key。
- 远程日常 token 推荐同时授予 `client + read-only`：`client` 用于模型调用，`read-only` 用于 ready/status、compiled models 和 governance 观测接口。
- `admin` key 才能访问 `/ui`、配置保存和 auth 管理。列表接口只返回 key 前后缀，secret 只在创建时返回一次。
- `operator` key 用于日常运维写操作，例如重启、治理指标快照/定时快照、异常阈值和归档删除；它不能读取配置、保存配置或管理 auth key。
- managed key 支持过期、撤销和 `quota.request_limit` / `quota.token_limit` / `quota.window_seconds`；窗口配额会持久化到本地状态文件，超限时 429 会返回 `quota.windowResetAt` 和 `Retry-After`。
- `GET /api/service-info` 会返回脱敏的 `auth` / `security` 摘要和 quota 用量；`GET /api/auth/audit` 可用 admin key 查看最近鉴权允许/拒绝记录。
- `POST /api/auth/keys/:id/rotate` 会生成替代 managed key、只返回一次新 secret，并立即吊销旧 key；用于定期轮换、交接和疑似泄漏处置。
- 公网入口仍建议放在 HTTPS 反向代理之后；远程浏览器访问 UI 时建议使用本地隧道、内网访问，或由反向代理处理认证。

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
- 在没有可用配置时询问“本地使用”、“连接远程服务”还是“部署为远程服务端”
- 本地使用时创建最小可用配置
- 连接远程服务时写入 `Runtime.remote_service`，不要求你先填写本地 provider/model
- 部署为远程服务端时生成 server profile 和 bootstrap admin `APIKEY`，但不会自动启动服务
- 本地使用时，引导填写默认模型 ID、接口地址、API Key 和模型名
- 本地使用时，可选追加复杂任务模型，并生成 SmartRouter 起步模板
- 保存配置后按角色输出下一步：本地路径提示 `ctr code` 和路由模板，远程客户端路径提示 `ctr status` / 远端 ready 检查，服务端路径提示 `ctr doctor` / `ctr start --daemon`

本地使用路径完成后按这个顺序使用：

```bash
ctr status
ctr code
```

`ctr code` 会带着本地代理环境启动 Claude Code。之后你在 Claude Code 里的请求会经过本地 Trigger Router。

如果 setup 选择的是“连接远程服务”，当前主要用于生成远程服务连接配置并通过 `ctr status` 检查远端 ready 状态；日常直连远程服务时，请按服务维护者提供的 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 配置 Claude Code。首次日常使用仍建议先跑通本地 `Models + Router.default` 主路径。如果选择“部署为远程服务端”，setup 只生成配置，不会自动启动；请先编辑 `Models[].key` / `Models[].model`，再运行 `ctr doctor` 和 `ctr start --daemon`。

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

## 基础路由五个槽位

日常使用优先理解这五个槽位。最小可用配置只需要 `default`；当你开始接入多个模型时，再逐步补 `think`、`longContext`、`background` 和 `webSearch`。

| 槽位 | 何时触发 | 推荐放什么模型 |
|---|---|---|
| `Router.default` | 普通请求、规则未命中、其他槽位未配置时 | 稳定通用模型 |
| `Router.think` | 请求包含 `thinking` 时 | 推理能力更强的模型 |
| `Router.longContext` | 输入超过 `longContextThreshold`，或当前模型 `safe_input_tokens` 不够时 | 上下文窗口更大的模型 |
| `Router.background` | Claude Code 轻量后台模型请求时 | 便宜、快、可本地化的模型 |
| `Router.webSearch` | 请求包含 `web_search` 工具时 | 支持搜索工具或搜索结果处理稳定的模型 |

可复制模板见 `config/trigger.routing.yaml`。它把五个槽位都写完整，并给模型补了 `metadata.context_window_tokens` / `metadata.safe_input_tokens`，方便 `ctr doctor` 和运行时提前识别大上下文请求。

常见误区：

- 不要把 `Router.longContext` 指向比默认模型窗口更小的模型。
- 不确定某个模型是否支持 reasoning 时，先不要放进 `Router.think`；运行 `ctr doctor` 会提示能力不匹配。
- `background` 可以先不配，未配置时会回到 `default`。
- `webSearch` 不是“联网开关”，它只是 web search 请求出现时的模型槽位。

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

可复制的 SmartRouter 常用模板见 `config/trigger.smart-router.yaml`。它已经把 `coding`、`review`、`architecture`、`long_context` 和 `fast_reply` 五类高频任务写成规则，并保留 `router_model + candidates` 作为规则未命中时的智能兜底起点。

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

  - id: long_context
    api: "https://api.example.com/v1/messages"
    key: "sk-xxx"
    interface: "anthropic"
    model: "vendor/long-context"
    metadata:
      context_window_tokens: 200000
      safe_input_tokens: 180000
```

当前行为：

- `supports_reasoning: false`：忽略 `thinking`
- `supports_tools: false`：工具调用退化为文本表达
- `supports_images: false`：图片输入退化为文本描述
- `context_window_tokens`：模型总上下文窗口；路由会用 `input + max_tokens + thinking budget` 做容量保护
- `safe_input_tokens`：建议输入上限；当前请求超过已选模型上限时，会优先切到 `Router.longContext`

多模型上下文大小不一致时，建议给小窗口模型和长上下文模型都补上这两个字段，并配置 `Router.longContext`。不确定时可以先不配，等主路径跑通后再补；未声明上下文窗口的模型会保持原有兼容行为。

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
- 当前监听地址和远程客户端接入建议
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

如果你想比较不同模型组合在固定任务上的质量和速度，可以先把多模型输出整理成 JSON，再运行离线评测：

```bash
ctr eval --tasks
ctr eval --input results.json
ctr eval --run --models "sonnet;haiku"
ctr eval --run --models "sonnet;haiku" --judge-model sonnet
ctr eval --history
```

输入文件可以是数组，也可以是 `{ "results": [...] }`：

```json
[
  {
    "taskId": "coding_fix",
    "model": "provider,model",
    "output": "模型输出文本",
    "latencyMs": 1200,
    "humanScore": 0.9,
    "judgeScore": 0.85,
    "calibrationNotes": "人工或外部 LLM 裁判的可选说明",
    "judgeFindings": ["可选裁判发现"]
  }
]
```

`ctr eval --tasks` 会列出固定任务的 prompt、expected output、关键词、字符数、延迟预算、质量维度和 result template；加 `--json` 可导出给后续自动执行器或外部脚本。当前内置任务覆盖 quick reply、coding、architecture、long context、server auth/deployment 和 model pool incident。评测会输出按模型和任务聚合的 pass rate、quality、speed、latency、best run、维度均分和失败 findings；默认是离线 deterministic rubric，不等同于人工复核。

如果你已经有人工复核或外部 LLM 裁判结果，可以在输入里补 `humanScore` / `judgeScore`，范围是 `0..1`。报告会生成 calibration summary，并标出 deterministic rubric 与人工/裁判结果差异较大的任务，帮助维护者判断某个模型组合是否真的带来质量提升。

如果想把多次评测变成可比较的历史趋势，给离线或自动评测追加 `--save-history`：

```bash
ctr eval --input results.json --save-history --history-label baseline
ctr eval --run --models "sonnet;haiku" --save-history --history-label smart-router-candidates
ctr eval --history
```

benchmark history 默认保存到 `~/.claude-trigger-router/benchmark-history.json`，只保存摘要、模型均分、best run 和趋势指标，不保存原始模型输出。需要放到别的位置时可以用 `--history-file path/to/history.json`。

也可以让 CTR 自动调用一个裁判模型：

```bash
ctr eval --input results.json --judge-model sonnet --base-url http://127.0.0.1:5678 --api-key <client-or-bootstrap-key>
ctr eval --run --models "sonnet;haiku" --judge-model sonnet --base-url http://127.0.0.1:5678 --api-key <client-or-bootstrap-key>
```

裁判模型会通过同一个 CTR `/v1/messages` 入口收到固定 JSON rubric 提示，并返回 `judgeScore`、`judgeFindings` 和 `calibrationNotes`。如果裁判响应不可解析、超时或返回 HTTP 错误，报告会记录 `judge_error`，但不会把失败裁判误算进 calibration score。

如果本机或远端 CTR 已启动，也可以显式自动跑固定任务集：

```bash
ctr eval --run --models "sonnet;haiku" --base-url http://127.0.0.1:5678 --api-key <client-or-bootstrap-key>
```

`--run` 会对每个模型逐个调用 `POST /v1/messages`，默认 `--concurrency 2`、`--timeout-ms 30000`、`--max-tokens 768`。多个模型用分号 `;` 分隔，因为 legacy 模型引用本身可能包含逗号。追加 `--judge-max-tokens 256` 可调整裁判输出长度。该模式会真实调用模型服务并消耗上游额度；启用 `--judge-model` 时会额外消耗裁判模型额度。

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
- 当前监听地址；server/cloud 会提示远程客户端应设置的 `ANTHROPIC_BASE_URL`
- 当前鉴权状态；如果 server/cloud 或公网监听没有配置 `APIKEY` / managed key，会提示安全风险
- 如果启用了 `Runtime.remote_service`，会单独检查远程服务可达和 ready 状态
- 基础路由槽位：`Router.default` / `think` / `longContext` / `background` / `webSearch` 是否能解析到模型
- 上下文窗口提示：槽位模型是否缺少 `metadata.context_window_tokens` / `metadata.safe_input_tokens`，以及 `Router.longContext` 是否真的比默认模型更适合大上下文
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
| `ctr eval --tasks` | 查看固定评测任务、prompt 和 rubric |
| `ctr eval --input results.json` | 离线固定任务集评测 |
| `ctr eval --run --models "sonnet;haiku"` | 自动调用 CTR 后评测固定任务集 |
| `ctr eval --run --models "sonnet;haiku" --judge-model sonnet` | 自动执行并追加 LLM 裁判校准 |
| `ctr eval --history` | 查看已保存 benchmark 历史趋势 |
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
- 基础路由五槽位示例：`config/trigger.routing.yaml`
- SmartRouter 常用规则示例：`config/trigger.smart-router.yaml`
- 高级示例：`config/trigger.advanced.yaml`
- 配置细节：`docs/configuration-guide.md`
- Models 迁移：`docs/models-migration-guide.md`
- 发布验证：`docs/releasing.md`
