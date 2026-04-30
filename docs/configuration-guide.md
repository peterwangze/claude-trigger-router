# 配置指南

这份文档只回答 4 个问题：

- 一个模型最少怎么配
- 路由字段应该怎么引用模型
- 什么时候用 `setup`，什么时候手动改配置
- 如果接入远程服务，`Runtime` 和 `Registration` 当前能表达什么

如果你是新用户，优先看 `README.md` 并先跑一次：

```bash
ctr setup
```

如果你不确定自己属于哪种部署角色，先看 `docs/configuration-roles.md`。当前三条路径是：

- 本地使用者：配置 `Models + Router.default`，运行 `ctr start / ctr status / ctr code`。
- 服务维护者：用 `ctr deploy init --target server` 生成 server 配置，并用 admin/bootstrap key 管理服务。
- 远程使用者：拿到服务地址和 managed `client + read-only` key，再配置 `Runtime.remote_service` 或直接设置 Claude Code 的 `ANTHROPIC_BASE_URL`。

## 1. 推荐配置心智

当前推荐始终以 `Models` 为主。

每个 `Models[]` 项都表示一个“可直接使用的模型接入项”，路由层统一负责消息格式转换。

默认部署模式是 `Runtime.mode: local`，也就是本机运行本地代理服务。只有当你明确要连接已经存在的远程 Trigger Router 服务时，才需要配置 `Runtime.remote_service`。

最小可用示例：

```yaml
HOST: "127.0.0.1"
PORT: 5678

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

一个模型接入项当前真正的最小必填集合是：

- `id`
- `api`
- `key`
- `interface`
- `model`

可选字段：

- `thinking`
- `metadata.vendor_hint`
- `metadata.supports_reasoning`
- `metadata.supports_tools`
- `metadata.supports_images`

## 2. 部署模式与 `Runtime`

`Runtime.mode` 用来表达当前服务形态：

- `local`：默认形态，本机运行代理服务并使用本地 `Models + Router` 配置。
- `server`：把当前进程作为远程路由服务运行，提供 service info、remote status、registration 和 UI 等服务端入口。
- `cloud`：为云端/托管形态保留的配置语义；当前包不包含托管控制面或集群编排。

服务端最小形态仍然需要一份可用的本地模型配置：

```yaml
HOST: "0.0.0.0"
PORT: 5678
APIKEY: "change-me"

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

然后启动服务：

```bash
ctr start --daemon
```

如果配置了非本机 `HOST` 但没有配置 `APIKEY` 或 active managed key，运行时会强制回退到 `127.0.0.1`。远程客户端访问该服务时，`Runtime.remote_service.auth_token` 应填写服务端生成的 managed `client + read-only` key；bootstrap `APIKEY` 只建议维护者使用。公网部署建议放在 HTTPS 反向代理后面。启用 `APIKEY` 或 managed key 后 `/ui` 也会受认证保护；远程浏览器访问 UI 时建议使用本地隧道、内网访问，或由反向代理处理认证。

远程客户端配置是可选路径，不是默认路径。最小写法：

```yaml
Runtime:
  mode: "local"
  remote_service:
    enabled: true
    base_url: "https://router.example.com"
    auth_token: "${CTR_REMOTE_AUTH_TOKEN}" # 远程服务端生成的 managed client + read-only key

Router: {}
```

这个配置允许本机没有 `Models`，用于连接远程服务并查看远程状态摘要。当前已落地的是远程服务连接配置、状态查询和注册摘要，不要把它理解成已经有自动远端请求转发、集群节点调度或托管控制面。

相关状态接口：

- `GET /api/service-info`
- `GET /api/remote-status`
- `GET /api/registration`
- `GET /api/governance/health`

## 3. `interface` 怎么选

`interface` 表示目标上游协议，不是厂商名。

常见映射：

- OpenAI 官方：`openai`
- Anthropic 官方：`anthropic`
- OpenRouter：`openai`
- DeepSeek 兼容接口：`openai`
- 其他 OpenAI-compatible 服务：`openai`

当前主路径只要求你配置：

- `api`
- `key`
- `interface`
- `model`

请求体转换由路由统一完成，不需要你自己按供应方手写消息格式。

## 4. `thinking` 怎么理解

`thinking` 是可选增强项，不是模型接入的必填项。

推荐优先用字符串写法：

```yaml
thinking: "auto"
```

当前常用写法：

- `off`
- `auto`
- `on`
- `low`
- `medium`
- `high`

如果需要更细控制，仍可使用对象：

```yaml
thinking:
  mode: "on"
  effort: "high"
  budget_tokens: 2048
```

## 5. 路由字段怎么引用模型

当前推荐所有路由模块都直接引用 `Models[].id`。

基础路由：

```yaml
Router:
  default: "sonnet"
  think: "reasoner"
  longContext: "opus"
  background: "cheap_fast"
  webSearch: "sonnet"
```

规则路由：

```yaml
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
      model: "opus"
```

智能兜底：

```yaml
SmartRouter:
  enabled: true
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程与调试"
    - model: "reasoner"
      description: "复杂推理"
```

默认情况下，`SmartRouter` 会启用语义增强和 sticky 稳定性修正，但不会自动启用 `sticky.alignment` 上下文摘要注入。Claude Code 会在每次请求里携带已有会话上下文；只有在你明确需要跨模型切换交接摘要，并接受额外一次 summarizer 调用带来的首包等待时，才建议显式开启：

```yaml
SmartRouter:
  sticky:
    enabled: true
    alignment:
      enabled: true
      summarizer_model: "sonnet"
      max_summary_tokens: 256
```

治理模块：

```yaml
Governance:
  enabled: true
  cascade:
    enabled: true
    levels:
      - from: "sonnet"
        to: "opus"

  shadow:
    enabled: true
    verifier_model: "sonnet"
```

## 6. 什么时候用 `ctr setup`

优先用 `ctr setup` 的场景：

- 首次使用
- 想在本地使用、连接远程服务和部署远程服务端之间选择
- 不确定现有配置是否还能复用
- 之前用过 `claude-code-router`，希望迁移
- 当前配置损坏、缺字段或需要 repair / rebuild

优先手动改配置的场景：

- 你已经稳定使用当前配置
- 只是想新增一个模型或微调路由字段
- 你明确知道自己要改哪几个字段

## 7. `ctr setup` 当前会做什么

`ctr setup` 当前主线路径：

- 复用当前可用配置
- 迁移旧 `claude-code-router` 配置
- 在没有可用配置时先询问“本地使用”、“连接远程服务”或“部署为远程服务端”
- 本地使用时新建最小配置
- 连接远程服务时写入 `Runtime.remote_service`，不要求先填写本地 provider/model
- 部署为远程服务端时写入 `HOST: "0.0.0.0"`、bootstrap admin `APIKEY`、`Runtime.mode: "server"` 和可编辑的 `Models + Router.default` 起步模板，并且不会自动启动服务
- 保存后按角色输出下一步：本地路径提示本地代理状态、`ctr code` 和路由模板；远程客户端路径提示 `ctr status`、远端 ready/status 和 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`；服务端路径提示 `ctr doctor` 与 `ctr start --daemon`
- 在当前配置损坏时 repair / rebuild

当前对用户主流程已经补了打包态 E2E，覆盖：

- 复用
- 迁移
- 跳过迁移后新建
- invalid repair
- parse error rebuild
- cancel

## 8. `doctor` 和 `/ui` 怎么看服务上下文

`ctr doctor` 会先诊断本地配置和服务可启动性，然后输出当前服务上下文：

- `Runtime.mode`
- 当前角色：本地代理或远程路由服务
- 当前监听地址，以及 server/cloud 模式下远程客户端应使用的 `ANTHROPIC_BASE_URL`
- 当前鉴权状态、bootstrap key 和 active managed key 摘要
- 如果启用了 `Runtime.remote_service`，会探测远程服务是否 reachable / ready

如果远程客户端配置没有本地 `Models`，doctor 会跳过本地模型探测，不会再询问是否探测 `0` 个模型。

`ctr ui` 首屏会显示：

- 本地服务 ready 状态和端口
- `Runtime.mode` 与服务角色
- 监听地址、维护入口和远程客户端连接建议
- 远程服务状态摘要
- Registration 模型和上游服务摘要

这些信息来自现有 `/api/service-info` 和 `/api/remote-status`，不会引入新的平行运行时。

维护者工作台还会展示治理 Health 摘要。它来自 `/api/governance/health`，同样也包含在 `/api/governance/metrics` 的 `health` 字段里：

- `idle`：当前窗口没有 trace 样本
- `healthy`：有样本且没有治理告警
- `watch`：存在 warning，建议查看 anomaly 列表、trace 和近期趋势
- `critical`：存在 critical 告警，应优先检查级联、影子监督、延迟或上游稳定性

Health 摘要只解释已有 trace / metrics / anomaly 数据，不会改变路由行为，也不会主动修复配置。

在 `/ui` 里点击 Health action 会联动 trace 表：cascade action 自动筛选 `cascadeTriggered=true`，shadow action 自动筛选 `shadowChecked=true`，其他 action 回到当前窗口的近期 trace，便于从健康摘要直接进入排查。

## 9. `Registration` 当前支持什么

`Registration` 当前支持最小注册语义和编译期 model pool：

- `models`：可注册模型列表，字段复用 `Models[]` 的最小模型配置语义；多个相同 `id` 会编译成同一个 logical model pool。
- `upstream_services`：上游服务引用列表，只保存服务 ID、base URL 和可选 token。
- `metadata.pool_endpoint_id`：可选，给某个 pool endpoint 一个稳定 ID。
- `metadata.pool_priority`：可选，数值越小优先级越高；当前 pool 策略固定为 `priority`。
- `metadata.pool_enabled`：可选，设为 `false` 时该 endpoint 会保留在 pool 中但不会成为 active endpoint。
- `metadata.upstream_service_id`：可选，将 endpoint 关联到 `upstream_services[].id`，用于维护者观测和后续调度。

示例：

```yaml
Registration:
  enabled: true
  upstream_services:
    - id: "edge-router"
      base_url: "https://edge.example.com"
      auth_token: "${CTR_EDGE_TOKEN}"
  models:
    - id: sonnet
      api: "https://edge-a.example.com/v1"
      key: "${EDGE_A_MODEL_KEY}"
      interface: "anthropic"
      model: "claude-sonnet-4-5"
      metadata:
        pool_endpoint_id: "sonnet-edge-a"
        pool_priority: 10
        upstream_service_id: "edge-router"
    - id: sonnet
      api: "https://edge-b.example.com/v1"
      key: "${EDGE_B_MODEL_KEY}"
      interface: "anthropic"
      model: "claude-sonnet-4-5"
      metadata:
        pool_endpoint_id: "sonnet-edge-b"
        pool_priority: 20
```

编译结果可以通过 `GET /api/models/compiled`、`POST /api/models/compiled/preview` 或 `/ui` 的 Compiled Models 区查看。当前阶段 pool 会把 priority active endpoint 编译成真实内部 provider；如果没有同名顶层 `Models[]` 覆盖，`Router.default: sonnet` 这类 logical model id 会解析到 active pool endpoint，并在治理 trace 中记录 `model_pool:<modelId>:<endpointId>`。当当前 pool endpoint 返回非流式 upstream error 时，运行时会按 priority 选择下一个 enabled endpoint 做一次本地重试，并记录 `model_pool_fallback:<modelId>:<endpointId>`；失败 endpoint 会进入短冷却，连续失败达到阈值后会进入更长的 `open` 熔断状态，后续 logical model 解析和 fallback candidate 会优先跳过冷却或熔断中的 endpoint。成功响应会写入内存延迟窗口，compiled model pool 和 `/ui` 可看到 endpoint 的平均延迟。更完整的持久化 health、least-latency 调度和运营视图仍在后续 P2-4 中推进。

当前明确不支持 `nodes`、`node_id`、`cluster` 这类集群/节点编排字段。

## 10. capability hint 什么时候配

如果你明确知道某个模型能力受限，可以补 `metadata`：

```yaml
Models:
  - id: restricted
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
- `supports_tools: false`：工具能力退化为文本
- `supports_images: false`：图片输入退化为文本说明
- `context_window_tokens`：声明模型总上下文窗口；运行时按 `input + max_tokens + thinking budget` 判断是否能安全承载
- `safe_input_tokens`：声明输入安全上限；已选模型放不下时会优先切到 `Router.longContext`

多模型上下文大小差异明显时，建议同时配置小窗口模型和长上下文模型的上下文 metadata，并设置 `Router.longContext`。如果所有候选模型都放不下，运行时会在发往上游前返回明确的 context window 错误，避免让小模型隐性截断或质量劣化。如果你不确定，不建议一开始就配太多 capability hint，先让模型跑通主路径。

## 11. 建议的配置演进顺序

最稳的顺序是：

1. 先保证 `Models + Router.default` 可用
2. 再增加 `Router.think / longContext / background`
3. 再加 `SmartRouter.rules`
4. 再加 `SmartRouter.router_model / candidates`
5. 最后再加 `Governance` 的 cascade / shadow / observability

这样排查问题最简单，也最符合当前文档和测试覆盖的主路径。

## 12. 参考文件

- 主入口：`README.md`
- 最小示例：`config/trigger.example.yaml`
- 完整高级示例：`config/trigger.advanced.yaml`
- 旧配置迁移：`docs/models-migration-guide.md`
- 发布验证：`docs/releasing.md`
