# Claude Trigger Router

> 面向 Claude Code 的本地模型路由代理。你可以把 TriggerRouter（规则路由）、SmartRouter（智能路由）和基础 Router 组合起来，把不同任务分发给更合适的模型。

## 它解决什么问题

Claude Code 默认只会请求一个上游模型；而实际工作里，不同任务往往适合不同能力：

- 架构设计想用更强的规划模型
- 代码审查想用更稳的分析模型
- 复杂推理想用专门的 reasoning 模型
- 日常小任务又希望更快、更便宜

Claude Trigger Router 作为本地 HTTP 代理运行在 `http://127.0.0.1:3456`，拦截 Claude Code 发出的请求，再按你的配置决定最终转给哪个 provider / model。

```text
Claude Code
    │  ANTHROPIC_BASE_URL=http://127.0.0.1:3456
    ▼
Claude Trigger Router
    │
    ├─ TriggerRouter 命中“架构设计” ──→ 架构模型
    ├─ TriggerRouter 命中“代码审查” ──→ 审查模型
    ├─ SmartRouter 智能判断        ──→ 候选模型中最合适的一项
    ├─ Token 超过阈值             ──→ 长上下文模型
    └─ 其他请求                  ──→ Router.default
```

Claude Code 本身不需要改造，仍然像平常一样工作。

## 核心能力

- `TriggerRouter`：按关键词 / 正则 / 优先级把请求路由到指定模型
- `SmartRouter`：当规则没命中时，用一个路由模型从候选模型中做智能选择
- `Router`：提供 `default`、`think`、`longContext`、`webSearch`、`background` 等基础分流能力
- CLI：提供 `ctr init/start/stop/restart/status/code`，方便初始化、启动和接入 Claude Code
- 管理 API：支持读取配置、保存配置、查看 transformer、重启服务

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 18+ | 运行本工具 |
| Claude Code CLI | 最新版 | 由本路由器代理 |

安装 Claude Code CLI：

```bash
npm install -g @anthropic-ai/claude-code
```

## 快速开始

### 1. 安装

```bash
npm install -g @peterwangze/claude-trigger-router
```

### 2. 初始化配置

```bash
ctr init
```

这会把示例配置复制到 `~/.claude-trigger-router/config.yaml`。

### 3. 先跑最小可用配置

把 `~/.claude-trigger-router/config.yaml` 改成这样：

```yaml
Providers:
  - name: openrouter
    api_base_url: "https://openrouter.ai/api/v1/chat/completions"
    api_key: "sk-xxx"
    models:
      - "anthropic/claude-sonnet-4"
    transformer:
      use: ["openrouter"]

Router:
  default: "openrouter,anthropic/claude-sonnet-4"
```

### 4. 启动服务

首次建议前台启动，方便确认配置是否正确：

```bash
ctr start
```

确认没问题后，再切后台模式：

```bash
ctr start --daemon
```

### 5. 启动 Claude Code

```bash
ctr code
```

`ctr code` 会先检查本地是否真的是 Claude Trigger Router 在监听目标端口，然后再设置 `ANTHROPIC_BASE_URL` 并启动 Claude Code。

## 三种常见配置路径

### 1. 最小单模型

适合先跑通链路：

- 一个 provider
- 一个默认模型
- 不启用 TriggerRouter
- 不启用 SmartRouter

### 2. 规则驱动多模型

适合你已经明确知道“什么任务该去什么模型”：

- `architecture` → 架构模型
- `code_review` → 审查模型
- `complex_reasoning` → 推理模型
- 其他请求 → `Router.default`

### 3. 规则 + 智能路由混合

适合“少数场景强规则，其余场景让路由模型兜底选择”：

- 先由 TriggerRouter 处理高置信度任务
- 未命中时交给 SmartRouter 从候选模型中挑选
- 再由基础 Router 处理长上下文 / thinking / web_search 等通用分流

更完整的可复制模板见 `docs/configuration-guide.md`。

## 配置结构

### 1. Providers

每个 provider 定义一个上游 API 和它可用的模型列表。

```yaml
Providers:
  - name: openrouter
    api_base_url: "https://openrouter.ai/api/v1/chat/completions"
    api_key: "sk-xxx"
    models:
      - "anthropic/claude-sonnet-4"
      - "anthropic/claude-opus-4"
    transformer:
      use: ["openrouter"]
```

常用字段：

| 字段 | 说明 |
|------|------|
| `name` | provider 名称，在路由配置里作为前缀使用 |
| `api_base_url` | 上游 API 地址 |
| `api_key` | 对应 provider 的密钥 |
| `models` | 该 provider 可用模型列表 |
| `transformer` | 请求 / 响应格式转换配置 |

### 2. Router 基础路由

| 配置项 | 说明 |
|--------|------|
| `Router.default` | 必填。默认模型，格式 `provider,model` |
| `Router.background` | 后台任务模型 |
| `Router.think` | 深度思考模型 |
| `Router.longContext` | 长上下文模型 |
| `Router.longContextThreshold` | 长上下文切换阈值 |
| `Router.webSearch` | 网络搜索模型 |
| `Router.image` | 图像分析扩展示例，不是主线路由必需项 |

### 3. TriggerRouter

`TriggerRouter` 适合“高确定性”路由。

```yaml
TriggerRouter:
  enabled: true
  analysis_scope: "last_message"
  rules:
    - name: "architecture"
      priority: 90
      enabled: true
      patterns:
        - type: exact
          keywords: ["架构设计", "system design"]
      model: "openrouter,anthropic/claude-opus-4"
```

关键字段：

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用 |
| `analysis_scope` | `last_message` 或 `full_conversation` |
| `llm_intent_recognition` | 可选，启用额外 LLM 意图识别 |
| `intent_model` | 开启意图识别时使用的模型 |
| `rules` | 路由规则列表 |

规则字段：

| 字段 | 说明 |
|------|------|
| `name` | 规则名称 |
| `priority` | 数值越大优先级越高 |
| `enabled` | 是否启用 |
| `description` | 规则说明 |
| `patterns` | `exact` 或 `regex` 模式 |
| `model` | 命中后使用的模型 |

### 4. SmartRouter

`SmartRouter` 适合“规则写不完，但又不想所有请求都打到一个默认模型”的场景。

```yaml
SmartRouter:
  enabled: true
  router_model: "openrouter,anthropic/claude-sonnet-4"
  candidates:
    - model: "openrouter,anthropic/claude-sonnet-4"
      description: "通用编程、代码生成、日常调试"
    - model: "deepseek,deepseek-reasoner"
      description: "复杂推理、严谨分析"
    - model: "openrouter,anthropic/claude-opus-4"
      description: "架构设计、系统规划、长文档"
```

| 配置项 | 说明 |
|--------|------|
| `enabled` | 是否启用 |
| `router_model` | 用来做路由决策的模型 |
| `candidates` | 候选模型列表，至少 2 个 |
| `cache_ttl` | 决策缓存时间 |
| `max_tokens` | 路由模型最大输出 token |
| `fallback` | 预留字段，当前不建议依赖差异化行为 |

## 路由优先级

一次请求会按大致如下顺序确定最终模型：

1. `TriggerRouter.rules[].model`
2. `SmartRouter.candidates[].model`
3. `Router.longContext`
4. 子代理模型标签
5. `Router.background`
6. `Router.think`
7. `Router.webSearch`
8. `CUSTOM_ROUTER_PATH`
9. `Router.default`

这意味着：如果 TriggerRouter 已经命中，后面的路由层不会再介入。

## CLI 与管理 API

### CLI

```bash
ctr init
ctr start
ctr start --daemon
ctr stop
ctr restart --daemon
ctr status
ctr code
```

### 管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 读取当前配置 |
| `POST` | `/api/config` | 保存配置；保存前会先校验 |
| `GET` | `/api/health` | 健康检查与服务签名 |
| `GET` | `/api/transformers` | 查看已加载 transformer |
| `POST` | `/api/restart` | 重启服务 |
| `GET` | `/ui` | 管理 API 说明页，不是完整 Web UI |

## 示例能力与非主线能力

### 图像路由

项目里保留了 `Router.image` 与 image agent 相关能力，但它更适合作为扩展示例，而不是默认上手主线。

如果你当前目标只是把 Claude Code 按“编程 / 审查 / 架构 / 推理”分工路由，可以先忽略它。

### `/ui`

`/ui` 目前只是管理 API 的说明页，不是完整可操作的 Web 控制台。

## 高级 / 预留配置说明

下面这些字段目前不建议放进你的最小可用配置里：

| 配置项 | 当前建议 |
|--------|----------|
| `API_TIMEOUT_MS` | 当前仅接线到 TriggerRouter 内部回环 LLM 调用（SmartRouter / intent detection），不影响 `ctr code` 探活或普通 provider 转发 |
| `PROXY_URL` | 当前仓库里缺少明确的生效入口，建议视为预留字段 |
| `NON_INTERACTIVE_MODE` | 当前未看到与 `ctr code` 或 Claude Code 行为的稳定映射，建议视为预留字段 |

如果你需要的是“先稳定可用”，优先只配置：

- `Providers`
- `Router.default`
- `TriggerRouter.rules`
- `SmartRouter`

## 故障排查

### `ctr code` 提示服务未运行

先检查：

```bash
ctr status
```

如果还没启动：

```bash
ctr start --daemon
```

如果端口上跑着别的服务，`ctr code` 现在不会误判为本项目服务；请改用正确端口，或先停止占用该端口的服务。

### 配置保存失败

`POST /api/config` 现在会在保存前校验配置。常见原因：

- `Providers` 为空
- `Router.default` 缺失
- `TriggerRouter` / `SmartRouter` 里引用了不存在的模型

### TriggerRouter 没命中

依次检查：

- `TriggerRouter.enabled` 是否为 `true`
- `rules[].enabled` 是否为 `true`
- `analysis_scope` 是否与你的对话位置匹配
- 关键词或正则是否真的覆盖了你的请求文本

### SmartRouter 没生效

依次检查：

- `SmartRouter.enabled` 是否为 `true`
- `router_model` 是否有效
- `candidates` 是否至少有 2 个，并且都在 `Providers` 中声明
- 是否已经被更高优先级的 TriggerRouter 提前命中

## 配置指南

更面向新手、可直接复制的配置模板见：`docs/configuration-guide.md`

## 致谢

- 基于 `claude-code-router` 的兼容配置思路扩展
- 感谢所有提供多模型路由使用反馈的用户
