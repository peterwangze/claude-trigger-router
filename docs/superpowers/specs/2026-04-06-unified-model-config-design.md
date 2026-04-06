# 统一模型配置与消息协议转换设计

## 1. 设计目标

在现有 `Models` 抽象基础上，把模型配置进一步收敛为更稳定、可理解、可扩展的产品入口，并由路由统一完成目标协议的消息格式转换。

目标不是把所有上游 API 变成完全一样，而是让用户在大多数场景下只需要关心：

- 这个模型的接口地址是什么
- 认证 key 是什么
- 它走哪一类接口协议
- 它是否启用某种思考类型

## 2. 要解决的问题

当前已有的 `Models` 抽象已经比旧 `Providers` 更简单，但仍存在几个问题：

1. `protocol` 仍带有较强实现味道
2. 用户不容易区分“厂商”与“协议兼容类型”
3. thinking 能力对不同模型/服务的支持不一致
4. 路由层与请求格式之间还缺少更明确的中间层边界

## 3. 核心结论

### 3.1 可以朝“四参数模型配置”收敛，但应分层表达

结论不是把所有内部字段删到只剩 4 个，而是：

- 对用户主入口，可以收敛到 4 类核心参数
- 对内部编译结果，仍保留更细粒度能力描述

建议的用户入口字段：

```yaml
Models:
  - id: sonnet
    api: https://api.openai.com/v1/chat/completions
    key: ${OPENAI_API_KEY}
    interface: openai
    thinking: auto
```

这里的 4 个核心参数是：

- `api`
- `key`
- `interface`
- `thinking`

此外，仍需要保留一个 `id` 作为配置内引用键；如果用户还需要指定远端模型名，则应作为“扩展字段”保留，例如：

```yaml
    model: anthropic/claude-sonnet-4
```

也就是说，更准确的表述应是：

> 模型配置可收敛为“1 个引用 id + 4 个核心连接参数 + 少量可选扩展字段”。

### 3.2 `interface` 应替代当前对 `protocol` 的用户心智暴露

建议把对外术语从 `protocol` 逐步收敛为 `interface`。

原因：

- `protocol` 更像内部实现细节
- `interface` 更适合表达“你要按哪类 API 协议和它说话”
- 用户更容易理解 “OpenAI-compatible 也是 `openai` interface”

建议第一版只保留两类核心接口：

- `openai`
- `anthropic`

未来如确有必要，再考虑增加新的核心接口类型。

### 3.3 厂商不是核心抽象，协议兼容性才是

系统不应该围绕“OpenRouter / DeepSeek / SiliconFlow / 某某平台代理”构建一堆一等抽象。

更合理的建模方式是：

- 服务商只是提供 `api + key`
- 关键在于它兼容哪种 `interface`
- 其余差异通过能力声明和兼容规则处理

## 4. 推荐配置分层

建议把模型配置拆成三层理解：

### 4.1 用户输入层

尽量少字段：

```ts
interface IUserModelConfig {
  id: string;
  api: string;
  key: string;
  interface: "openai" | "anthropic";
  thinking?: "off" | "auto" | "on" | "low" | "medium" | "high";
  model?: string;
}
```

说明：

- `id`：本地引用名
- `api`：接口地址
- `key`：认证密钥
- `interface`：目标协议兼容类型
- `thinking`：可选的用户级思考模式
- `model`：远端模型标识，保留为可选扩展字段

### 4.2 编译层

编译器把用户输入转换成内部配置：

```ts
interface ICompiledModelEndpoint {
  id: string;
  api_base_url: string;
  api_key: string;
  interface: "openai" | "anthropic";
  model: string;
  capabilities: {
    thinking: {
      supported: boolean;
      mode?: "off" | "auto" | "on";
      effort?: "low" | "medium" | "high";
      budget_tokens?: number;
    };
    tools?: boolean;
    images?: boolean;
    systemMessageStyle?: "openai" | "anthropic";
  };
}
```

### 4.3 运行层

运行层不再使用用户原始字段，而只消费编译结果：

- 路由只决定 `modelId`
- 消息转换层根据 `interface + capabilities` 输出目标请求格式
- 上游执行层只关心发送和响应解析

## 5. thinking 抽象建议

### 5.1 对外简化

建议对用户暴露两种兼容方式：

#### 方式 A：极简模式

```yaml
thinking: auto
```

#### 方式 B：高级模式

```yaml
thinking:
  mode: on
  effort: high
```

### 5.2 兼容策略

如果目标接口或模型不支持 thinking：

- 默认不应直接报致命错误
- 应在校验或 UI 中给出“将被忽略”提示
- 只有当用户显式要求强依赖时，才升级为错误

这可以减少“配置了思考参数导致整个模型不可用”的摩擦。

## 6. 统一消息中间表示

### 6.1 为什么需要 message IR

如果没有统一消息中间表示，路由层、governance、response governance 和 provider 调用层都容易直接耦合到 OpenAI / Anthropic 请求体结构。

引入 message IR 的价值在于：

- 路由只决定“给谁”
- 治理只决定“是否升级/重试/补摘要”
- 消息转换层单独决定“怎么按接口协议发出去”

### 6.2 建议的 message IR

```ts
interface IMessageIR {
  system: string[];
  messages: Array<{
    role: "user" | "assistant" | "tool";
    parts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; url: string }
      | { type: "tool_call"; id: string; name: string; arguments: string }
      | { type: "tool_result"; tool_call_id: string; content: string }
    >;
  }>;
  options?: {
    thinking?: {
      enabled?: boolean;
      effort?: "low" | "medium" | "high";
      budget_tokens?: number;
    };
  };
}
```

第一阶段不需要一次覆盖所有消息块，但至少应覆盖当前主路径：

- system 文本
- user / assistant 文本
- tool call
- tool result

## 7. 协议转换边界

建议新增独立转换边界：

- `message-ir.ts`
- `protocols/openai.ts`
- `protocols/anthropic.ts`

转换流程：

```text
app request
  -> extract / normalize
  -> message IR
  -> route modelId
  -> load compiled model endpoint
  -> protocol adapter(openai/anthropic)
  -> upstream request body
```

### 7.1 2026-04-06 首轮实现状态

当前已经完成两轮基础落地：

- 新增 `src/protocols/message-ir.ts` 作为统一消息中间表示
- 新增 `src/protocols/anthropic.ts` 与 `src/protocols/openai.ts` 作为协议适配边界
- SmartRouter、Context Alignment、Semantic Router、Shadow Supervisor、Image Agent 的内部请求构造已开始通过这些边界完成
- `/v1/messages` 主请求链路在选模后会先归一化为 `message IR`
- 已新增统一分发入口 `src/protocols/index.ts`，再按目标模型 `interface` 输出上游请求体
- OpenAI-compatible 目标模型当前已支持把 Anthropic 风格的 tool use / tool result 请求转换为 OpenAI chat `tool_calls` / `tool` 消息
- 编译后的 `modelMap` 已开始显式产出 `capabilities`，用于表达 reasoning / tools / images / system message style
- `Models[].metadata` 当前可用来声明 `supports_reasoning / supports_tools / supports_images` 等 capability hint
- 协议分发阶段已开始消费 capability：对于 `thinking.supported=false` 的模型，会自动忽略请求中的 thinking 并记录 diagnostics
- 对 `tools/images unsupported` 的模型，协议分发现已提供首轮文本降级，而不是继续静默透传不兼容消息块
- `/api/models/compiled`、`/api/models/compiled/preview` 与 `/ui` 现已开始暴露 capability warning，帮助用户在保存前看到潜在降级行为
- `normalizeAndValidateConfig(...)` 与 `ctr setup` 现也会透出这些 warning，使 capability 风险不再只停留在 compiled preview 层
- `/ui` 的 Validation Summary 与保存流程现已开始按 severity 展示 errors / warnings，warning 进入日常编辑主路径
- `/ui` 的 Models 表单现已提供 capability 显式控件，降低直接编辑 `metadata` JSON 的门槛
- `/ui` 的 Capability Warnings 面板现已开始提供快捷修正动作，warning 正从只读提示演进为可操作入口

当前仍未完成的部分：

- `router` 与上游最终出站执行层虽然已通过协议分发入口衔接，但 capability 仍处于首轮显式化阶段
- 对图片、音频、结构化输出等更复杂消息块的覆盖仍需继续扩展
- 对 OpenAI Responses、音频/视频多模态、结构化输出 schema 等更细粒度接口差异仍需单独抽象
- warning 虽已进入 repair/save UI，但 setup CLI capability 引导与更复杂的多步修正策略仍未完全联动

## 8. setup、配置文件、/ui 的统一策略

### 8.1 setup

setup 应优先收集：

- `api`
- `key`
- `interface`
- `model`
- `thinking`（可选）

只有在高级模式中再暴露更细字段。

### 8.2 配置文件

配置文件对外推荐新字段，但保留旧字段兼容：

- 推荐：`api` / `key` / `interface`
- 兼容：`api_base_url` / `api_key` / `protocol`

### 8.3 /ui

`/ui` 应优先渲染统一字段名，并把旧字段视为兼容层，不作为主路径心智。

## 9. 向后兼容策略

### 9.1 兼容旧 Models

旧配置：

```yaml
Models:
  - id: sonnet
    api_base_url: https://...
    api_key: sk-...
    protocol: openai
    model: anthropic/claude-sonnet-4
```

应继续可用，并在编译期被归一化到新结构。

### 9.2 兼容旧 Providers

旧 `Providers` 继续保留迁移和兼容能力，但对新用户不再作为首推路径。

## 10. 风险与约束

### 风险 1：用户误以为只填 4 个字段就永远不需要 `model`

缓解：

- 文档中明确“4 个核心参数”不等于“只有 4 个字段”
- `model` 仍是常见且重要的扩展字段

### 风险 2：把 interface 设计成厂商品牌枚举

缓解：

- 明确 interface 只描述协议兼容性
- 服务商品牌只在模板和推荐中出现，不进入核心 schema

### 风险 3：消息 IR 一次设计过大

缓解：

- 先覆盖文本 + tool call 主路径
- 图片、音频、结构化输出等后续再增量扩展

## 11. 结论

可以把模型配置朝“四参数核心入口”方向推进，但应采用分层方案：

- 对用户：`api` / `key` / `interface` / `thinking`
- 对内部：保留编译层能力结构
- 对运行时：统一 message IR，再按协议转换

这样既能继续降低配置门槛，也不会把兼容性和运行细节硬塞给用户。
