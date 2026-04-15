# Claude Trigger Router

Claude Code 的本地路由代理。

它的目标很简单：

- 用一个本地服务接管 Claude Code 的上游请求
- 按你的配置把请求路由到不同模型
- 用统一的模型配置格式管理 OpenAI / Anthropic 及兼容接口

## 安装

```bash
npm install -g @peterwangze/claude-trigger-router
```

安装后先确认：

```bash
ctr version
ctr help
```

## 最推荐的开始方式

直接运行：

```bash
ctr setup
```

`ctr setup` 会按顺序处理这些事情：

- 检查当前 `~/.claude-trigger-router` 配置是否可以直接复用
- 检查旧的 `claude-code-router` 配置是否可以迁移
- 如果都不适用，就引导你创建最小可用配置
- 保存配置后启动本地服务

这是当前最推荐、也是覆盖最完整的用户入口。

## 最小配置

如果你想手动编辑，可以先生成模板：

```bash
ctr init --force
```

然后编辑 `~/.claude-trigger-router/config.yaml`，最小可用配置类似这样：

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

`ctr init --force` 现在和 `ctr setup` 一样，都会落到同一类“最小可用配置”心智：

- 必要运行时字段已补齐
- `Models[0]` 已是可校验的最小接入结构
- `Router.default` 已指向默认模型 ID
- 修改最少必要字段后即可直接 `ctr start`

最少只需要关心这几个字段：

- `api`：目标接口地址
- `key`：API Key
- `interface`：接口类型，当前支持 `openai` / `anthropic`
- `thinking`：可选，支持的模型才需要配置

消息格式转换由路由层统一处理，不需要你自己按不同厂商手写消息体。

## TriggerRouter：规则路由

`TriggerRouter` 是当前产品的核心功能之一。

它适合“高确定性任务”：

- 架构设计
- 代码审查
- 长文档评审
- 复杂推理

这类任务通常可以通过关键词或规则稳定识别，然后直接路由到你指定的模型。

示例：

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

可以简单理解成：

- 默认请求走 `Router.default`
- 命中 TriggerRouter 规则的请求，优先切到规则指定模型

## SmartRouter：候选模型自动选择

`SmartRouter` 是当前产品的另一个核心功能。

它适合“规则难以穷举，但模型选择仍然很重要”的任务：

- 通用编程 vs 深度推理
- 日常修复 vs 架构设计
- 常规回答 vs 长上下文分析

你提供一个路由模型和一组候选模型，`SmartRouter` 会在规则未命中时，从候选模型里自动挑一个更合适的目标。

示例：

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
      description: "通用编程、代码生成、日常调试"
    - model: "reasoner"
      description: "复杂推理、严谨分析"
```

可以简单理解成：

- TriggerRouter 解决“能明确命中的规则任务”
- SmartRouter 解决“规则没命中时的动态选模”

两者可以同时启用：

- 先让 `TriggerRouter` 处理高确定性任务
- 再让 `SmartRouter` 处理剩余的模糊任务

## `interface` 怎么选

`interface` 表示目标上游接口协议，不是厂商名。

常见场景：

- OpenAI 官方：`interface: openai`
- Anthropic 官方：`interface: anthropic`
- OpenRouter：`interface: openai`
- DeepSeek 兼容接口：`interface: openai`
- 其他 OpenAI-compatible 服务：`interface: openai`

## 常用命令

初始化或修复配置：

```bash
ctr setup
ctr init
```

服务生命周期：

```bash
ctr start
ctr start --daemon
ctr status
ctr restart
ctr restart --daemon
ctr stop
```

配合 Claude Code 使用：

```bash
ctr code
```

其它：

```bash
ctr version
ctr upgrade
ctr doctor
ctr ui
```

## doctor

如果你已经有配置，但不确定为什么服务起不来、模型不可用，或者迁移后想做一次统一体检，可以运行：

```bash
ctr doctor
```

`ctr doctor` 会按顺序执行：

- 诊断当前配置文件是否存在格式问题
- 自动修复低风险、可确定补全的结构问题
- 确认修复后的配置是否还能通过本地校验并让服务启动
- 在征得你同意后，对配置中的模型发送最小探测请求，确认模型是否真实可用

其中模型探测会消耗少量额度，所以 doctor 会先征求你的确认。

## 推荐使用顺序

首次使用：

```bash
ctr help
ctr version
ctr setup
ctr status
ctr code
```

如果你更喜欢手动配置：

```bash
ctr init --force
ctr start
ctr code
```

后台运行：

```bash
ctr start --daemon
ctr status
ctr ui
ctr code
```

补充说明：

- `ctr restart` 当前默认按后台模式重启
- `ctr restart --daemon` 只是更显式的等价写法

## 旧配置迁移

如果你之前在用 `claude-code-router`：

- `ctr setup` 会自动探测旧配置
- 会优先提供迁移选项
- 迁移后的新配置会落到 `~/.claude-trigger-router/config.yaml`

当前推荐的新配置心智是：

- 每个模型直接写成一个 `Models[]` 项
- 路由规则直接引用 `Models[].id`
- 不再让用户到处手写 `provider,model`

## UI

运行：

```bash
ctr ui
```

当前会打开：

```text
http://127.0.0.1:5678/ui
```

如果本地服务还没启动，CLI 会先提醒你运行 `ctr start` 或 `ctr start --daemon`。

它适合做配置查看和调试，但主线入口仍然建议优先使用 `ctr setup`。

## 示例配置

最小示例：

- `config/trigger.example.yaml`

完整高级示例：

- `config/trigger.advanced.yaml`

如果你需要高级路由能力，再继续看这些文档：

- `docs/configuration-guide.md`
- `docs/models-migration-guide.md`
- `docs/releasing.md`
