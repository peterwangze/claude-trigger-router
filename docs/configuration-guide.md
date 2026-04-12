# 配置指南

这份文档只回答 3 个问题：

- 一个模型最少怎么配
- 路由字段应该怎么引用模型
- 什么时候用 `setup`，什么时候手动改配置

如果你是新用户，优先看 `README.md` 并先跑一次：

```bash
ctr setup
```

## 1. 推荐配置心智

当前推荐始终以 `Models` 为主。

每个 `Models[]` 项都表示一个“可直接使用的模型接入项”，路由层统一负责消息格式转换。

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

## 2. `interface` 怎么选

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

## 3. `thinking` 怎么理解

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

## 4. 路由字段怎么引用模型

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

智能路由：

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

治理模块：

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

## 5. 什么时候用 `ctr setup`

优先用 `ctr setup` 的场景：

- 首次使用
- 不确定现有配置是否还能复用
- 之前用过 `claude-code-router`，希望迁移
- 当前配置损坏、缺字段或需要 repair / rebuild

优先手动改配置的场景：

- 你已经稳定使用当前配置
- 只是想新增一个模型或微调路由字段
- 你明确知道自己要改哪几个字段

## 6. `ctr setup` 当前会做什么

`ctr setup` 当前主线路径：

- 复用当前可用配置
- 迁移旧 `claude-code-router` 配置
- 在没有可用配置时新建最小配置
- 在当前配置损坏时 repair / rebuild

当前对用户主流程已经补了打包态 E2E，覆盖：

- 复用
- 迁移
- 跳过迁移后新建
- invalid repair
- parse error rebuild
- cancel

## 7. capability hint 什么时候配

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
```

当前行为：

- `supports_reasoning: false`：忽略 `thinking`
- `supports_tools: false`：工具能力退化为文本
- `supports_images: false`：图片输入退化为文本说明

如果你不确定，不建议一开始就配太多 capability hint，先让模型跑通主路径。

## 8. 建议的配置演进顺序

最稳的顺序是：

1. 先保证 `Models + Router.default` 可用
2. 再增加 `Router.think / longContext / background`
3. 再加 `TriggerRouter`
4. 再加 `SmartRouter`
5. 最后再加 `Governance`

这样排查问题最简单，也最符合当前文档和测试覆盖的主路径。

## 9. 参考文件

- 主入口：`README.md`
- 最小示例：`config/trigger.example.yaml`
- 完整高级示例：`config/trigger.advanced.yaml`
- 旧配置迁移：`docs/models-migration-guide.md`
- 发布验证：`docs/releasing.md`
