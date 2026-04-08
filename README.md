# Claude Trigger Router

面向 Claude Code 的本地模型路由代理。它接管 Claude Code 发出的上游请求，再按你的规则和路由策略分发到不同模型。

核心目标只有两件事：

- 让你用 `Models[].id` 管理模型，而不是到处手写 `provider,model`
- 让你只关心模型接入信息，消息格式转换由路由层统一处理

## 快速开始

### 1. 安装

```bash
npm install -g @peterwangze/claude-trigger-router
```

### 2. 运行初始化向导

```bash
ctr setup
```

`ctr setup` 会：

- 检查当前配置是否可复用
- 检测旧版 `~/.ccr/config.yaml`
- 尝试迁移成新的 `Models` 配置
- 提供 `openrouter` / `deepseek` / `openai-compatible` / `anthropic` / `siliconflow` / `custom` 预设
- 在需要时询问最少必要字段
- 保存配置后启动服务并进入 Claude Code

### 3. 使用最小配置

如果你更喜欢手动编辑，也可以先执行：

```bash
ctr init
```

然后把 `~/.claude-trigger-router/config.yaml` 调整为：

```yaml
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

### 4. 启动服务

```bash
ctr start
```

确认配置可用后，可改为后台运行：

```bash
ctr start --daemon
```

### 5. 启动 Claude Code

```bash
ctr code
```

`ctr code` 会检查目标端口上是否真的是 Claude Trigger Router，然后再注入 `ANTHROPIC_BASE_URL` 并拉起 Claude Code。

## 新配置心智

推荐始终从 `Models` 出发。每个模型接入项描述的是“这个模型怎么连”，而不是“内部 provider 怎么拼”。

每个模型的最少必填字段是：

| 字段 | 是否必填 | 说明 |
|------|----------|------|
| `id` | 必填 | 模型唯一标识，供 Router / TriggerRouter / SmartRouter / Governance 引用 |
| `api` | 必填 | 上游接口地址 |
| `key` | 必填 | 对应 API Key |
| `interface` | 必填 | 接口类型，当前支持 `openai` / `anthropic` |
| `model` | 必填 | 目标模型名 |
| `thinking` | 可选 | 思考强度，推荐 `off / auto / on / low / medium / high` |

额外可选项：

- `metadata.vendor_hint`
- `metadata.supports_reasoning`
- `metadata.supports_tools`
- `metadata.supports_images`

兼容性说明：

- 当前实现仍兼容旧字段 `api_base_url` / `api_key` / `protocol`
- 保存和对外展示优先使用新字段 `api` / `key` / `interface`
- `thinking` 既支持简写字符串，也支持 `{ mode, effort, budget_tokens }` 对象

## 接口类型怎么选

`interface` 只表示目标上游期望的消息协议类型，不等于“厂商名”。

常见映射如下：

| 场景 | `api` 示例 | `interface` |
|------|------------|-------------|
| OpenAI 官方 | `https://api.openai.com/v1/chat/completions` | `openai` |
| Anthropic 官方 | `https://api.anthropic.com/v1/messages` | `anthropic` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `openai` |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `openai` |
| SiliconFlow / 本地兼容服务 | 对应兼容地址 | `openai` |

路由层会按 `interface` 把统一消息转换成目标上游请求体。

当前统一转换已覆盖：

- 文本消息
- 图片输入
- tool call / tool result
- `thinking`

如果目标模型声明不支持某项能力，路由会做显式降级，并给出 warning。

## 常见路由配置

### 单模型

```yaml
Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"

Router:
  default: "sonnet"
```

### 规则路由

```yaml
Models:
  - id: sonnet
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-sonnet-4"

  - id: opus
    api: "https://openrouter.ai/api/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "anthropic/claude-opus-4"

Router:
  default: "sonnet"

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
      model: "opus"
```

### 规则 + 智能路由

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

SmartRouter:
  enabled: true
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程与调试"
    - model: "reasoner"
      description: "复杂推理与严谨分析"
```

完整示例见 `config/trigger.example.yaml`。

## warning 与 capability hint

如果你已经知道某个模型不支持完整能力，可以在配置里显式声明：

```yaml
Models:
  - id: restricted
    api: "https://api.example.com/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "vendor/text-only"
    thinking: "high"
    metadata:
      supports_reasoning: false
      supports_tools: false
      supports_images: false
```

当前行为：

- `supports_reasoning: false` 时，请求里的 `thinking` 会被忽略
- `supports_tools: false` 时，工具定义和 tool call/result 会退化为文本
- `supports_images: false` 时，图片块会退化为文本说明

这些信息会出现在：

- `ctr setup` 的配置提示
- `POST /api/config` 返回的 `warnings`
- `GET /api/models/compiled`
- `/ui` 的 Draft Config Preview 和 Capability Warnings

## `/ui` 可以做什么

访问 `http://127.0.0.1:3456/ui` 后，可以直接：

- 编辑 `Models` 草稿
- 预览 compiled model map
- 查看 `errors / warnings / capabilityWarnings`
- 保存当前草稿配置
- 对部分 warning 执行快捷修正

适合用来做配置校准，但主线配置入口仍然建议优先用 `ctr setup` 或直接编辑配置文件。

## 旧配置迁移

如果你还在使用旧的 `Providers + provider,model` 配置：

- 当前版本仍然兼容旧格式
- `ctr setup` 会优先尝试迁移旧 `ccr` 配置
- 路由字段推荐逐步改成直接引用 `Models[].id`

迁移后的核心变化是：

- `provider,model` -> `modelId`
- `api_base_url` -> `api`
- `api_key` -> `key`
- `protocol` -> `interface`

详见 `docs/models-migration-guide.md`。

## 常用命令

```bash
ctr setup
ctr init
ctr start
ctr start --daemon
ctr stop
ctr restart --daemon
ctr status
ctr code
```

## 推荐阅读

- 配置模板与分工建议：`docs/configuration-guide.md`
- 旧配置迁移：`docs/models-migration-guide.md`
- 完整示例：`config/trigger.example.yaml`
