# Models 配置迁移指南

这份文档专门说明如何从旧版 `Providers + provider,model` 配置迁移到新版 `Models + modelId` 配置。

如果你是新用户，建议直接从 `README.md` 和 `config/trigger.example.yaml` 的 `Models` 示例开始；如果你已经有一份稳定运行的旧配置，这份文档就是迁移说明。

## 为什么要迁移到 Models

旧配置的主要问题是：

- 需要先理解 `Providers`
- 需要在路由字段里手写 `provider,model`
- 需要知道什么时候该配 `transformer`
- 同一个 endpoint 下有多个模型时，配置可读性会快速下降

新版 `Models` 的目标是：

- 每个模型接入项只关心“这个模型怎么连”
- 路由层统一引用 `modelId`
- 协议转换由系统自动处理

最小模型接入项通常是：

- `api`
- `key`
- `interface`
- `model`
- `thinking` 可选
- `metadata` 可选

其中 `thinking` 新路径优先推荐直接写单个档位：

- `off`
- `auto`
- `on`
- `low`
- `medium`
- `high`

如果你需要显式传 `budget_tokens` 等细粒度参数，仍然可以继续写对象。

如果你还想告诉路由层“这个模型虽然兼容某类接口，但并不支持某些能力”，可以补充：

- `metadata.supports_reasoning`
- `metadata.supports_tools`
- `metadata.supports_images`

## 新旧配置对照

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

## 字段映射关系

| 旧字段 | 新字段 |
|------|------|
| `Providers[].name` | `Models[].id` 的命名参考，不再必须直接暴露 |
| `Providers[].api_base_url` | `Models[].api` |
| `Providers[].api_key` | `Models[].key` |
| `Providers[].models[]` | 拆成多个 `Models[].model` |
| `Providers[].transformer` | 改为 `Models[].interface`，由系统推导 |
| `provider,model` | `modelId` |

兼容说明：

- 当前版本会优先写出 `api` / `key` / `interface`
- 旧字段 `api_base_url` / `api_key` / `protocol` 仍然兼容，并会在加载时自动归一化

## Router / Trigger / SmartRouter 的迁移方法

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
    - model: "deepseek_reasoner"
```

## Governance 模型字段的迁移方法

这些字段现在也支持 `modelId`：

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

## setup 现在会做什么

`ctr setup` 现在默认生成 `Models` 配置。

如果检测到旧配置：

- setup 会尽量从旧 `Providers` 自动派生 `Models`
- 同时把旧 `Router.default = provider,model` 转成 `Router.default = modelId`

注意：

- 旧配置不会被立即删除
- 迁移是“生成新的 draft”，不是强制破坏旧配置

## 自动迁移目前的规则

系统当前会按这些规则从旧 `Providers` 派生 `Models`：

- 一个旧 provider 下的每个 model，都会生成一个 `Models[]` 项
- `id` 会按 `provider_model` 风格派生
- `protocol` 目前按 endpoint 粗略判断：
  - 包含 `/v1/messages` -> `anthropic`
  - 其他默认 -> `openai`
- `transformer` 不再直接迁移，而是交给运行时根据 `protocol` 推导

## 推荐迁移顺序

建议不要一次性把所有配置一起改完，推荐顺序：

1. 先把 `Providers` 对应地展开成 `Models`
2. 再把 `Router.*` 改成引用 `modelId`
3. 再改 `TriggerRouter.rules[].model`
4. 再改 `SmartRouter.router_model / candidates[].model`
5. 最后改 Governance 里的模型引用

这样如果中间某一步出问题，回退和排查都更容易。

## 迁移后的排查方法

如果你想确认 `modelId` 最终会被编译成什么内部模型引用，可以用：

```bash
GET /api/models/compiled
```

这个接口会返回：

- 编译后的内部 `providers`
- `modelMap`
- `capabilityWarnings`

可直接用于排查：

- `modelId` 是否存在
- `protocol` 是否正确
- 最终内部 `providerName / modelName` 是否符合预期
- 是否存在 `thinking` 被忽略、`tools/images` 会降级为文本等 capability warning

补充说明：

- `normalizeAndValidateConfig(...)` 现在除了 `errors` 之外，也会返回非致命 `warnings`
- `ctr setup` 会显示这些 warning，因此即使配置可以继续使用，你也能提前知道运行时可能发生的 capability 降级
- `/ui` 的草稿预览和保存流程现在也会显示这些 warning，并把 `error` 与 `warning` 分层展示
- `/ui` 的 Models 表单现在也提供 `supports_reasoning / supports_tools / supports_images / vendor_hint` 的显式编辑控件，普通场景无需再直接编辑 `metadata` JSON

## 当前兼容边界

当前版本已经支持：

- `Models`
- `Router` 使用 `modelId`
- `TriggerRouter` 使用 `modelId`
- `SmartRouter` 使用 `modelId`
- Governance 关键模型字段使用 `modelId`
- `thinking` 运行时映射
- `metadata` capability hint 编译
- 对 `thinking unsupported` 的自动忽略
- 对 `tools/images unsupported` 的文本降级
- setup 默认输出 `Models`
- legacy `Providers` 自动迁移辅助

但仍有这些边界：

- `Providers` 仍然兼容，不会立刻移除
- `protocol=openai` 只代表协议大类，不代表所有供应商行为完全一致
- `metadata` 当前主要是 capability hint，不是完整的供应商插件能力系统
- 自动派生的 `modelId` 命名是稳定可用的，但不一定是你最终最想要的人类可读命名

## 建议

如果你已经有稳定运行的旧配置：

- 先不要硬删 `Providers`
- 先平移出一版 `Models`
- 用 `/api/models/compiled` 对照确认
- 验证通过后，再逐步把路由字段从 `provider,model` 改成 `modelId`

这样迁移成本最低，也最安全。
