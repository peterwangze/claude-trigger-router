# Models 配置迁移指南

这份文档说明如何从旧版 `Providers + provider,model` 迁移到新版 `Models + modelId`。

如果你是新用户，建议直接从 `README.md` 或 `config/trigger.example.yaml` 的 `Models` 示例开始；如果你已经有稳定运行的旧配置，这份文档就是迁移说明。

## 1. 迁移目标

迁移后，你应该得到这样的使用方式：

- 每个模型接入项只配置接入信息
- 路由层统一引用 `Models[].id`
- 消息协议转换由路由层自动完成

新的模型配置主线是：

| 字段 | 说明 |
|------|------|
| `id` | 模型标识 |
| `api` | 接口地址 |
| `key` | API Key |
| `interface` | 接口类型，`openai` 或 `anthropic` |
| `model` | 目标模型名 |
| `thinking` | 可选思考档位 |
| `metadata` | 可选 capability hint |

注意：用户经常会把“最少要配置什么”理解成 `api / key / interface / thinking` 四项，但在当前实现里，真正能唯一确定一个可用模型接入项的最小集合仍然是：

- `id`
- `api`
- `key`
- `interface`
- `model`

其中 `thinking` 只是可选增强项。

## 2. 为什么从 Providers 迁到 Models

旧配置的主要成本是：

- 需要先理解 `Providers`
- 路由字段里要重复写 `provider,model`
- 不同上游协议差异暴露给了使用者

新配置的主要收益是：

- 路由字段统一引用 `modelId`
- 新旧上游协议都通过 `interface` 收敛
- `thinking` 和 capability hint 有统一入口
- setup、保存、预览、运行时使用同一套归一化与校验逻辑

## 3. 新旧配置对照

### 旧写法

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

Router:
  default: "openrouter,anthropic/claude-sonnet-4"
  think: "openrouter,anthropic/claude-opus-4"
```

### 新写法

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
  think: "opus"
```

## 4. 字段映射关系

| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `Providers[].api_base_url` | `Models[].api` | 统一为新字段名 |
| `Providers[].api_key` | `Models[].key` | 统一为新字段名 |
| `Providers[].models[]` | `Models[].model` | 每个模型拆成一个接入项 |
| `Providers[].transformer` | `Models[].interface` | 转成用户可理解的接口类型 |
| `protocol` | `interface` | 旧命名仍兼容，但新文档统一使用 `interface` |
| `provider,model` | `modelId` | 路由层统一引用方式 |

兼容性说明：

- 当前版本仍兼容旧字段 `api_base_url / api_key / protocol`
- 归一化后会同步补齐新旧字段，以保证运行时兼容
- 对外文档与新配置模板统一以 `api / key / interface` 为准

## 5. 路由字段怎么迁

### Router

旧写法：

```yaml
Router:
  default: "openrouter,anthropic/claude-sonnet-4"
  think: "deepseek,deepseek-reasoner"
```

新写法：

```yaml
Router:
  default: "sonnet"
  think: "deepseek_reasoner"
```

### TriggerRouter

旧写法：

```yaml
TriggerRouter:
  rules:
    - name: architecture
      model: "openrouter,anthropic/claude-opus-4"
```

新写法：

```yaml
TriggerRouter:
  rules:
    - name: architecture
      model: "opus"
```

### SmartRouter

旧写法：

```yaml
SmartRouter:
  router_model: "openrouter,anthropic/claude-sonnet-4"
  candidates:
    - model: "openrouter,anthropic/claude-sonnet-4"
    - model: "deepseek,deepseek-reasoner"
```

新写法：

```yaml
SmartRouter:
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用编程"
    - model: "deepseek_reasoner"
      description: "复杂推理"
```

### Governance

这些字段也推荐统一改成 `modelId`：

- `Governance.sticky.alignment.summarizer_model`
- `Governance.cascade.levels[].from`
- `Governance.cascade.levels[].to`
- `Governance.semantic.classifier_model`
- `Governance.shadow.verifier_model`

例如：

```yaml
Governance:
  sticky:
    alignment:
      summarizer_model: "sonnet"

  cascade:
    levels:
      - from: "sonnet"
        to: "opus"

  shadow:
    verifier_model: "sonnet"
```

## 6. `ctr setup` 现在会做什么

`ctr setup` 当前会优先走 `Models` 主线。

如果检测到旧配置：

- 会读取当前项目配置
- 会检测旧 `~/.ccr/config.yaml`
- 会尝试把旧 `Providers` 派生成 `Models`
- 会把部分 `provider,model` 引用改写成 `modelId`
- 会在缺字段时提示补齐
- 会输出 `warnings`

当前 setup 预设是：

- `openrouter`
- `deepseek`
- `openai-compatible`
- `anthropic`
- `custom`

其中 `anthropic` 预设会直接带入：

- `api: https://api.anthropic.com/v1/messages`
- `interface: anthropic`

## 7. 自动迁移的当前规则

旧 `Providers` 转 `Models` 时，当前实现遵循这些规则：

- 一个旧 provider 下的每个 model，都会生成一个 `Models[]` 项
- `id` 会按 `provider_model` 风格派生
- `api_base_url` 会映射到 `api`
- `api_key` 会映射到 `key`
- `interface` 会根据 endpoint 粗略推断
  - 包含 `/v1/messages` -> `anthropic`
  - 其他默认 -> `openai`

同时，为了兼容现有运行时，归一化后内部仍会保留：

- `api_base_url`
- `api_key`
- `protocol`

但这些已经不再是推荐的用户主配置入口。

## 8. capability hint 与 warning

迁移后你可以继续补充 capability hint：

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

当前 warning 行为：

- 不支持 reasoning 时，`thinking` 会被忽略
- 不支持 tools 时，tool 定义和 tool call/result 会退化为文本
- 不支持 images 时，图片输入会退化为文本

warning 会出现在：

- `ctr setup`
- `POST /api/config`
- `GET /api/models/compiled`
- `GET /api/models/compiled/preview`
- `/ui`

## 9. 推荐迁移顺序

建议按下面顺序做，最稳妥：

1. 先把 `Providers` 展开成 `Models`
2. 再把 `Router.*` 改成引用 `modelId`
3. 再改 `TriggerRouter.rules[].model`
4. 再改 `SmartRouter.router_model / candidates[].model`
5. 最后改 Governance 里的模型引用

这样即使中间出问题，也更容易回退和排查。

## 10. 迁移后怎么验

### 用 `/api/models/compiled`

它可以帮助你确认：

- `modelId` 是否存在
- 编译后的内部 provider / model 映射是否正确
- `interface` 是否符合预期
- capability warning 是否符合预期

### 用 `/ui`

你可以直接：

- 预览当前草稿的 compiled models
- 查看 `errors / warnings / capabilityWarnings`
- 在保存前做修正

## 11. 当前兼容边界

当前版本已经支持：

- `Models`
- `Router / TriggerRouter / SmartRouter / Governance` 使用 `modelId`
- `thinking` 字符串档位与对象写法
- capability hint 编译
- capability warning 输出
- setup 迁移旧 `ccr` 配置

当前仍需注意：

- `Providers` 还没有被移除，只是降级为兼容层
- `interface=openai` 只表示协议兼容，不表示所有服务商行为完全一致
- `modelId` 自动派生规则稳定可用，但不一定是最终最适合你团队的命名
