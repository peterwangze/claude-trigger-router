# Claude Trigger Router 配置指南

这份指南面向“想尽快把 Claude Code 跑起来，并且按模型能力做分工”的用户。

如果你只想先跑通，请先看 `README.md` 里的最小配置；如果你想把多模型路由配顺，这份文档更合适。

## 5 分钟上手

### 第一步：初始化配置

```bash
ctr init
```

默认会生成：

- `~/.claude-trigger-router/config.yaml`

### 第二步：填一个可用 provider

下面是最小可用示例：

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

### 第三步：启动服务

```bash
ctr start
```

第一次建议前台跑，确认没有配置报错。

### 第四步：启动 Claude Code

```bash
ctr code
```

如果能正常进入 Claude Code，会自动把请求走到本地路由器。

## 怎么按“能力”给模型分工

不要先从厂商名开始想，先从能力开始想。

### 快速低成本

适合：

- 简单改字
- 小范围重构
- 低风险脚本生成
- 日常问答

常见放法：

- `Router.background`
- TriggerRouter 中的 `simple_task`
- SmartRouter 的轻量候选项

### 强推理

适合：

- 数学推导
- 严谨分析
- 多步逻辑判断
- 难 bug 根因定位

常见放法：

- `Router.think`
- TriggerRouter 中的 `complex_reasoning`
- SmartRouter 的 reasoning 候选项

### 强架构 / 强评审

适合：

- 系统设计
- 技术方案比较
- 代码审查
- 风险评估
- 迁移计划

常见放法：

- TriggerRouter 中的 `architecture`
- TriggerRouter 中的 `code_review`
- SmartRouter 的高质量候选项

### 长上下文

适合：

- 超长代码库分析
- 长文档生成
- 长对话持续工作

常见放法：

- `Router.longContext`
- `Router.longContextThreshold`

## 什么时候用 TriggerRouter

在这些场景里优先用 TriggerRouter：

- 任务文本特征非常明确
- 你能用几个关键词或正则稳定命中
- 你希望可解释、可控、可复现

典型例子：

- 看到“代码审查”就切到评审模型
- 看到“架构设计”就切到架构模型
- 看到“深入分析”就切到推理模型

优点：

- 结果稳定
- 可预测
- 便于排查为什么命中

缺点：

- 规则要自己维护
- 规则覆盖不到的场景会漏掉

## 什么时候用 SmartRouter

在这些场景里优先用 SmartRouter：

- 任务类型多，但边界不清晰
- 你不想写太多规则
- 你已经有几类候选模型，想让一个路由模型来挑选

优点：

- 覆盖范围更宽
- 对模糊任务更友好

缺点：

- 会多一次路由模型调用
- 决策不像 TriggerRouter 那么直观

最常见的组合方式是：

- TriggerRouter 只处理少量高置信规则
- SmartRouter 处理剩余大多数任务
- Router.default 作为最终兜底

## 三套可直接复制的模板

### 模板 1：最小单模型

适合先跑通。

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

### 模板 2：规则驱动多模型

适合你已经知道不同任务要用哪类模型。

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

  - name: deepseek
    api_base_url: "https://api.deepseek.com/chat/completions"
    api_key: "sk-xxx"
    models:
      - "deepseek-chat"
      - "deepseek-reasoner"
    transformer:
      use: ["deepseek"]
      "deepseek-chat":
        use: ["tooluse"]

Router:
  default: "openrouter,anthropic/claude-sonnet-4"
  think: "deepseek,deepseek-reasoner"

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

    - name: "code_review"
      priority: 80
      enabled: true
      patterns:
        - type: exact
          keywords: ["代码审查", "code review"]
      model: "openrouter,anthropic/claude-sonnet-4"

    - name: "complex_reasoning"
      priority: 70
      enabled: true
      patterns:
        - type: exact
          keywords: ["深入分析", "reasoning"]
      model: "deepseek,deepseek-reasoner"
```

### 模板 3：规则 + 智能路由混合

适合多数长期使用场景。

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

  - name: deepseek
    api_base_url: "https://api.deepseek.com/chat/completions"
    api_key: "sk-xxx"
    models:
      - "deepseek-chat"
      - "deepseek-reasoner"
    transformer:
      use: ["deepseek"]
      "deepseek-chat":
        use: ["tooluse"]

Router:
  default: "openrouter,anthropic/claude-sonnet-4"
  think: "deepseek,deepseek-reasoner"
  longContext: "openrouter,anthropic/claude-sonnet-4"
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
      model: "openrouter,anthropic/claude-opus-4"

SmartRouter:
  enabled: true
  router_model: "openrouter,anthropic/claude-sonnet-4"
  candidates:
    - model: "openrouter,anthropic/claude-sonnet-4"
      description: "通用编程、代码生成、调试"
    - model: "deepseek,deepseek-reasoner"
      description: "复杂推理、严谨分析"
    - model: "openrouter,anthropic/claude-opus-4"
      description: "架构设计、规划、评审"
  cache_ttl: 600000
  max_tokens: 256
  fallback: "default"
```

## 常见错误与排查

### 1. 配置格式错

症状：

- `ctr start` 启动失败
- `POST /api/config` 返回 `Invalid configuration`

优先检查：

- 缩进是否正确
- `Providers` 是否为空
- `Router.default` 是否缺失

### 2. provider / model 引用错

症状：

- 某条规则配置了模型，但运行时报找不到模型
- SmartRouter 候选项不生效

优先检查：

- `model` 写法是否为 `provider,model`
- `provider` 名称是否与 `Providers[].name` 完全一致
- `model` 是否存在于该 provider 的 `models` 列表中

### 3. `ctr code` 连不到服务

症状：

- `ctr code` 提示目标端口上不是本服务
- 明明有端口占用，但还是不能启动 Claude Code

这通常说明：

- 服务根本没启动
- 启动在别的端口
- 目标端口上跑的是别的 HTTP 服务

先执行：

```bash
ctr status
```

再确认是否需要重新启动：

```bash
ctr start --daemon
```

### 4. TriggerRouter 没命中

优先检查：

- `TriggerRouter.enabled`
- `rules[].enabled`
- `analysis_scope`
- 文本里是否真的出现了你配置的关键词
- 正则是否写得过窄

### 5. SmartRouter 没生效

优先检查：

- `SmartRouter.enabled`
- `router_model`
- `candidates` 是否至少 2 个
- 请求是否已经被 TriggerRouter 提前命中

## 不建议现在依赖的字段

当前仓库里，这几个字段都不适合作为新手主线配置：

- `PROXY_URL`
- `API_TIMEOUT_MS`
- `NON_INTERACTIVE_MODE`

原因不是字段名有问题，而是当前代码里缺少清晰、稳定、容易验证的主线接线证据。想先稳定使用的话，可以先不配。

## 推荐阅读顺序

1. 先按 `README.md` 跑最小配置
2. 再复制本页三套模板中的一套
3. 最后才补高级字段和扩展示例
