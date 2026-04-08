# Claude Trigger Router 配置指南

这份文档面向已经准备开始长期使用 Claude Trigger Router 的用户。主线只有一条：

- 先把模型接入项收敛到 `Models`
- 再让 `Router / TriggerRouter / SmartRouter / Governance` 全部引用 `Models[].id`

如果你还在用旧版 `Providers + provider,model`，请同时阅读 `docs/models-migration-guide.md`。

## 1. 最小配置心智

推荐把每个模型都理解成一个独立接入项：

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

其中：

| 字段 | 是否必填 | 说明 |
|------|----------|------|
| `id` | 必填 | 模型标识，供所有路由模块引用 |
| `api` | 必填 | 上游接口地址 |
| `key` | 必填 | API Key |
| `interface` | 必填 | 接口类型，当前支持 `openai` / `anthropic` |
| `model` | 必填 | 目标模型名 |
| `thinking` | 可选 | 思考强度，推荐写字符串档位 |

推荐优先把 `thinking` 写成字符串：

- `off`
- `auto`
- `on`
- `low`
- `medium`
- `high`

需要更细控制时，仍可写成：

```yaml
thinking:
  mode: "on"
  effort: "high"
  budget_tokens: 2048
```

## 2. `interface` 怎么选

`interface` 是消息协议类型，不是厂商名。

| 供应方 | `api` 示例 | `interface` |
|--------|------------|-------------|
| OpenAI 官方 | `https://api.openai.com/v1/chat/completions` | `openai` |
| Anthropic 官方 | `https://api.anthropic.com/v1/messages` | `anthropic` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `openai` |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `openai` |
| 本地 / 自建兼容服务 | 对应兼容地址 | 按兼容协议填写 |

当前实现会基于 `interface` 统一把消息转换成目标上游格式，已覆盖：

- 文本消息
- 图片输入
- tool call / tool result
- `thinking`

这意味着你在配置文件里不需要再显式关心内部 transformer 细节。

## 3. setup、迁移和保存时的统一行为

### `ctr setup`

`ctr setup` 当前的主线路径是：

- 检测现有配置是否可复用
- 检测旧 `~/.ccr/config.yaml`
- 尝试迁移为 `Models` 配置
- 在缺字段时补齐最小必要输入
- 保存前统一执行归一化和校验
- 输出 `warnings`

setup 内置的 provider 预设目前是：

- `openrouter`
- `deepseek`
- `openai-compatible`
- `anthropic`
- `siliconflow`
- `custom`

其中：

- 选择 `anthropic` 时，会默认带入 `https://api.anthropic.com/v1/messages`
- 选择 `siliconflow` 时，会默认带入 `https://api.siliconflow.cn/v1/chat/completions`
- 选择 `custom` 时，需要你自己填写 `API Base URL`
- `/ui` 的 Provider template 与 `ctr setup` 现在共用同一份预设目录，避免两边示例漂移

### `POST /api/config`

保存配置前会统一：

- 归一化旧字段与新字段
- 校验必填项
- 返回 `errors`
- 返回非阻断 `warnings`

### `/ui`

`/ui` 适合做配置校准：

- 编辑 `Models` 草稿
- 预览 compiled model map
- 查看 `errors / warnings / capabilityWarnings`
- 保存当前草稿配置
- 对部分 warning 做快捷修正

## 4. capability hint 怎么配

如果你知道某个模型虽然走某种接口协议，但能力上有限制，可以在 `metadata` 里声明提示：

```yaml
Models:
  - id: restricted
    api: "https://api.example.com/v1/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "vendor/text-only"
    metadata:
      vendor_hint: "proxy-text-only"
      supports_reasoning: false
      supports_tools: false
      supports_images: false
```

当前 capability hint 的作用：

| 字段 | 运行时行为 |
|------|------------|
| `supports_reasoning: false` | 忽略 `thinking` 并给出 warning |
| `supports_tools: false` | tool 定义和 tool call/result 退化为文本 |
| `supports_images: false` | 图片输入退化为文本说明 |

这些提示会出现在：

- `ctr setup`
- `POST /api/config`
- `GET /api/models/compiled`
- `GET /api/models/compiled/preview`
- `/ui`

## 5. 路由字段怎么引用模型

### Router

基础路由字段直接写 `modelId`：

```yaml
Router:
  default: "sonnet"
  think: "reasoner"
  longContext: "opus"
  background: "cheap_fast"
  webSearch: "sonnet"
```

### TriggerRouter

适合高确定性任务分流：

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
      model: "opus"
```

### SmartRouter

适合模糊任务自动分流：

```yaml
SmartRouter:
  enabled: true
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程与调试"
    - model: "reasoner"
      description: "复杂推理"
    - model: "opus"
      description: "架构设计与评审"
```

### Governance

治理相关字段也可以直接写 `modelId`：

```yaml
Governance:
  enabled: true
  sticky:
    enabled: true
    alignment:
      enabled: true
      summarizer_model: "sonnet"

  cascade:
    enabled: true
    levels:
      - from: "sonnet"
        to: "opus"

  shadow:
    enabled: true
    verifier_model: "sonnet"
```

## 6. 三套推荐模板

### 模板 A：最小单模型

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

### 模板 B：规则驱动多模型

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

  - id: deepseek_reasoner
    api: "https://api.deepseek.com/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "deepseek-reasoner"
    thinking: "high"

Router:
  default: "sonnet"
  think: "deepseek_reasoner"

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

    - name: "complex_reasoning"
      priority: 70
      enabled: true
      patterns:
        - type: exact
          keywords: ["深入分析", "reasoning"]
      model: "deepseek_reasoner"
```

### 模板 C：规则 + 智能路由混合

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

  - id: deepseek_reasoner
    api: "https://api.deepseek.com/chat/completions"
    key: "sk-xxx"
    interface: "openai"
    model: "deepseek-reasoner"
    thinking: "high"

Router:
  default: "sonnet"
  think: "deepseek_reasoner"
  longContext: "opus"
  longContextThreshold: 60000

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

SmartRouter:
  enabled: true
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程、代码生成、日常调试"
    - model: "deepseek_reasoner"
      description: "复杂推理、严谨分析"
    - model: "opus"
      description: "架构设计、系统规划、复杂评审"
```

完整可复制版本见 `config/trigger.example.yaml`。

## 7. 常见问题

### 配置保存失败

优先检查：

- `Models[].id` 是否重复
- `Models[].api / key / interface / model` 是否缺失
- `Router.default` 是否存在
- `TriggerRouter / SmartRouter / Governance` 是否引用了不存在的 `modelId`

### warning 很多，但配置还能保存

这通常说明配置不是“非法”，而是“存在运行时降级风险”。最常见的情况：

- `thinking` 会被忽略
- tools 会退化为文本
- images 会退化为文本

这类问题建议在 `/ui` 或 `GET /api/models/compiled` 中先确认。

### 还可以继续使用 `Providers` 吗

可以，但新配置不建议继续扩展在 `Providers` 上。当前更推荐：

1. 把存量配置迁到 `Models`
2. 让所有路由字段都引用 `modelId`
3. 只把 `Providers` 作为兼容层保留
