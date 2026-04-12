# 模型配置迁移指南

这份文档面向旧用户。

如果你之前使用的是：

- `Providers`
- `provider,model`
- `claude-code-router`

那么这里说明怎么迁到当前推荐的：

- `Models`
- `modelId`
- `claude-trigger-router`

如果你是新用户，不建议先看这份文档，直接按 `README.md` 走 `ctr setup` 即可。

## 1. 迁移后的目标

迁移完成后，推荐你得到这样的配置方式：

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

迁移目标只有两点：

- 每个模型直接配置成一个 `Models[]` 项
- 路由字段统一引用 `Models[].id`

## 2. 为什么要迁

旧配置的问题主要是：

- 用户要理解 `Providers`
- 路由字段里到处写 `provider,model`
- 不同厂商协议差异暴露给用户

新配置的收益是：

- 模型接入项更直接
- 路由字段更短、更稳定
- `openai` / `anthropic` 协议通过 `interface` 统一收敛
- `setup`、保存、运行时都围绕同一套配置心智

## 3. 新旧写法对照

旧写法：

```yaml
Providers:
  - name: openrouter
    api_base_url: "https://openrouter.ai/api/v1/chat/completions"
    api_key: "sk-xxx"
    models:
      - "anthropic/claude-sonnet-4"
      - "anthropic/claude-opus-4"

Router:
  default: "openrouter,anthropic/claude-sonnet-4"
  think: "openrouter,anthropic/claude-opus-4"
```

新写法：

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

最常见的映射关系如下：

- `Providers[].api_base_url` -> `Models[].api`
- `Providers[].api_key` -> `Models[].key`
- `Providers[].models[]` -> `Models[].model`
- `protocol` -> `interface`
- `provider,model` -> `modelId`

当前实现仍兼容这些旧字段：

- `api_base_url`
- `api_key`
- `protocol`

但新文档和新模板统一以这些字段为准：

- `api`
- `key`
- `interface`

## 5. 路由字段怎么迁

基础路由：

```yaml
Router:
  default: "provider_a,model-x"   # 旧
  think: "provider_b,model-y"     # 旧
```

改成：

```yaml
Router:
  default: "model_x"
  think: "model_y"
```

规则路由：

```yaml
TriggerRouter:
  rules:
    - name: architecture
      model: "provider_a,model-opus"
```

改成：

```yaml
TriggerRouter:
  rules:
    - name: architecture
      model: "opus"
```

智能路由：

```yaml
SmartRouter:
  router_model: "provider_a,model-sonnet"
  candidates:
    - model: "provider_a,model-sonnet"
    - model: "provider_b,model-reasoner"
```

改成：

```yaml
SmartRouter:
  router_model: "sonnet"
  candidates:
    - model: "sonnet"
      description: "通用任务"
    - model: "reasoner"
      description: "复杂推理"
```

治理字段也建议统一迁成 `modelId`，尤其是：

- `Governance.sticky.alignment.summarizer_model`
- `Governance.cascade.levels[].from`
- `Governance.cascade.levels[].to`
- `Governance.semantic.classifier_model`
- `Governance.shadow.verifier_model`

## 6. 最推荐的迁移方式

当前最推荐直接用：

```bash
ctr setup
```

如果检测到旧 `claude-code-router` 配置，`setup` 会优先给出迁移选项。

当前已经通过 packaged CLI E2E 验证的主路径包括：

- 当前配置有效时放弃并迁移旧配置
- 首次使用直接迁移旧配置
- 跳过迁移后新建
- 旧配置读取失败时回退到新建

也就是说，迁移现在不是旁路流程，而是主流程的一部分。

## 7. 自动迁移当前会做什么

当前自动迁移规则可以概括为：

- 旧 provider 下的每个 model，会展开成一个 `Models[]` 项
- 新 `id` 会按 provider + model 派生
- 接口类型会按 endpoint 协议推断
  - 包含 `/v1/messages` 通常推成 `anthropic`
  - 其他默认推成 `openai`
- `Router.default` 会尽量改写成新的模型 id

如果某些字段无法安全自动补齐，`setup` 会继续提示你手动输入最少必要项。

## 8. 推荐迁移顺序

如果你是手动迁移，建议按这个顺序：

1. 先把 `Providers` 展开成 `Models`
2. 再改 `Router.*`
3. 再改 `TriggerRouter.rules[].model`
4. 再改 `SmartRouter.router_model / candidates[].model`
5. 最后再改 `Governance` 里的模型引用

这样最容易分阶段验证，也最容易回退。

## 9. 迁移后怎么验

最低限度建议这样验证：

```bash
ctr setup
ctr status
ctr code
```

如果你是维护者或者想做发版前验证，建议再执行：

```bash
npm run release:verify
```

它现在包含打包后的 CLI E2E，会覆盖 setup 主路径和安装后主命令。

## 10. 迁移后的常见结论

迁移后请记住这几个原则：

- 新增模型时优先加到 `Models`
- 路由字段优先引用 `Models[].id`
- `thinking` 是可选增强项，不是接入必填项
- `interface` 表示协议，不表示厂商名

## 11. 参考文档

- 主入口：`README.md`
- 配置指南：`docs/configuration-guide.md`
- 最小示例：`config/trigger.example.yaml`
- 完整高级示例：`config/trigger.advanced.yaml`
- 发布验证：`docs/releasing.md`
