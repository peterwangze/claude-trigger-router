# Claude Trigger Router

> 基于 claude-code-router 的智能触发路由器，通过分析输入内容自动将请求分发到最适合处理该任务的模型。

## 🏗️ 工作原理

Claude Trigger Router 作为 **HTTP 代理**运行在本地，拦截 Claude Code 发往 Anthropic API 的所有请求，根据配置规则决定转发给哪个模型和提供商。

```
Claude Code
    │  ANTHROPIC_BASE_URL=http://127.0.0.1:3456
    ▼
Claude Trigger Router  ← 你在这里配置规则
    │
    ├─ 关键词匹配 "生成图片" ──→ Provider A (支持图片的模型)
    ├─ 关键词匹配 "架构设计" ──→ Provider B (能力强的大模型)
    ├─ SmartRouter (LLM 智能选择) ──→ 候选模型列表中最优模型
    ├─ Token 数 > 60000     ──→ Provider C (长上下文模型)
    └─ 其他请求             ──→ Provider D (默认模型)
```

Claude Code 本身完全不感知切换过程，仍然以为自己在与 Anthropic API 通信。

## ✨ 功能特性

- **智能触发路由**: 分析用户输入，自动识别任务类型并路由到合适的模型
- **关键词匹配**: 支持精确匹配和正则表达式两种模式
- **优先级系统**: 触发规则可配置优先级，灵活控制路由逻辑
- **LLM 意图识别**: 可选的 LLM 辅助意图识别，提高识别准确率
- **配置灵活**: 支持 YAML/JSON 配置文件（读取优先 YAML；通过 API 保存时按原格式写回，默认写 YAML）
- **向后兼容**: 完全兼容 claude-code-router 的配置格式

## 🚀 快速开始

### 1. 安装

```bash
npm install -g @peterwangze/claude-trigger-router
```

### 2. 初始化配置

```bash
ctr init
```

此命令将示例配置文件复制到 `~/.claude-trigger-router/config.yaml`。

### 3. 编辑配置

打开 `~/.claude-trigger-router/config.yaml`，填入你的 API 密钥和模型信息：

```yaml
# 模型提供商
Providers:
  - name: openrouter
    api_base_url: "https://openrouter.ai/api/v1/chat/completions"
    api_key: "sk-xxx"
    models:
      - "anthropic/claude-sonnet-4"
      - "openai/dall-e-3"

# 基础路由
Router:
  default: "openrouter,anthropic/claude-sonnet-4"

# 触发路由
TriggerRouter:
  enabled: true
  analysis_scope: "last_message"
  rules:
    - name: "image_generation"
      priority: 100
      patterns:
        - type: exact
          keywords: ["生成图片", "create image"]
        - type: regex
          pattern: "(画|生成).{0,10}图"
      model: "openrouter,openai/dall-e-3"
```

### 4. 启动服务

```bash
ctr start --daemon    # 后台运行（推荐）
# 或
ctr start             # 前台运行（便于查看日志/调试）
```

### 5. 使用

#### 方式一：通过 `ctr code` 启动（推荐）

```bash
ctr code
```

`ctr code` 会自动设置 `ANTHROPIC_BASE_URL` 并启动 Claude Code CLI。

#### 方式二：手动设置环境变量

如果你使用 VS Code / Cursor 插件版 Claude Code，或者希望在自己的脚本中接入路由器，直接设置环境变量即可：

```bash
# macOS / Linux
export ANTHROPIC_BASE_URL=http://127.0.0.1:3456
claude

# Windows PowerShell
$env:ANTHROPIC_BASE_URL="http://127.0.0.1:3456"
claude
```

#### 方式三：VS Code / Cursor 插件配置

在 VS Code 设置中找到 Claude 扩展的 API Base URL 选项，填入：

```
http://127.0.0.1:3456
```

或者在项目根目录的 `.env` / shell profile 中持久化设置：

```bash
# ~/.bashrc 或 ~/.zshrc
export ANTHROPIC_BASE_URL=http://127.0.0.1:3456
```


## 📖 配置参数参考

### 全局配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `HOST` | string | `"127.0.0.1"` | 监听地址。配置了 `APIKEY` 时可设为 `"0.0.0.0"` 对外暴露 |
| `PORT` | number | `3456` | 监听端口 |
| `APIKEY` | string | - | 服务认证密钥，设置后所有请求须携带此 key |
| `PROXY_URL` | string | - | 代理地址，如 `"http://127.0.0.1:7890"` |
| `LOG` | boolean | `true` | 是否启用日志 |
| `LOG_LEVEL` | string | `"debug"` | 日志级别：`fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `API_TIMEOUT_MS` | number | `600000` | API 请求超时时间（毫秒） |
| `NON_INTERACTIVE_MODE` | boolean | `false` | 非交互模式，适合 CI/脚本环境 |
| `CUSTOM_ROUTER_PATH` | string | - | 自定义路由器模块的绝对路径（见路由优先级说明） |

### Router 基础路由配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `Router.default` | string | **必填**。默认模型，格式 `"provider,model"` |
| `Router.background` | string | 后台任务模型（claude-3-5-haiku 请求使用） |
| `Router.think` | string | 深度思考模型（请求含 `thinking` 参数时使用） |
| `Router.longContext` | string | 长上下文模型（Token 超阈值时使用） |
| `Router.longContextThreshold` | number | 长上下文切换阈值（默认 60000 tokens） |
| `Router.webSearch` | string | 网络搜索模型（工具列表含 `web_search` 时使用） |
| `Router.image` | string | 图像分析模型（见下方图像路由说明） |

> **图像路由说明：** 图像请求的处理路径取决于消息位置和 `forceUseImageAgent` 配置：
>
> - **直接切模型**（默认）：当最后一条用户消息中直接包含图片，且 `forceUseImageAgent` 未开启时，直接将请求模型切换为 `Router.image`，无额外工具注入。
> - **Image Agent 模式**：当图片出现在对话历史（非最后一条），或 `forceUseImageAgent: true` 时，启动 image agent：注入 `analyzeImage` 工具和对应系统提示；原始图片内容被替换为文本占位符 `[Image #N]`，图片数据缓存于内存；LLM 通过调用 `analyzeImage(imageId, task)` 触发服务内部回环请求，由 `Router.image` 模型完成实际图像分析。
>
> `forceUseImageAgent`（全局配置项，默认 false）设为 true 时，无论图片出现在哪条消息，均强制走 Image Agent 模式。

### Providers 提供商配置

每个 Provider 对象包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 提供商标识名，在路由配置中用作 `"name,model"` 的前缀 |
| `api_base_url` | string | API 端点 URL |
| `api_key` | string | 该提供商的 API 密钥 |
| `models` | string[] | 该提供商支持的模型列表 |
| `transformer` | object | 可选。请求/响应格式转换器配置（见下文） |

#### Transformer 配置

Transformer 负责在 Claude Code 使用的 Anthropic 格式与各 provider 实际 API 格式之间互相转换。不同的 provider 通常需要不同的 transformer 组合。

**内置 transformer 列表：**

| 名称 | 用途 |
|------|------|
| `openrouter` | 适配 OpenRouter API（添加必要请求头） |
| `deepseek` | 适配 DeepSeek API（处理推理内容、token 限制） |
| `gemini` | 适配 Google Gemini API（工具定义格式转换） |
| `vertex` | 适配 Google Vertex AI |
| `anthropic` | 标准 Anthropic 格式（通常不需要显式指定） |
| `tooluse` | 处理工具调用格式（部分模型需要） |

**配置格式：**

```yaml
transformer:
  use: ["transformer名称"]         # 全局使用的 transformer
  "model-name":                    # 针对特定模型覆盖
    use: ["other-transformer"]
```

**常用 provider 推荐配置：**

```yaml
# OpenRouter（推荐，支持多种模型）
- name: openrouter
  api_base_url: "https://openrouter.ai/api/v1/chat/completions"
  api_key: "sk-xxx"
  models: ["anthropic/claude-sonnet-4", "openai/gpt-4o"]
  transformer:
    use: ["openrouter"]

# DeepSeek
- name: deepseek
  api_base_url: "https://api.deepseek.com/chat/completions"
  api_key: "sk-xxx"
  models: ["deepseek-chat", "deepseek-reasoner"]
  transformer:
    use: ["deepseek"]
    "deepseek-chat":
      use: ["tooluse"]   # deepseek-chat 需要额外的工具调用处理

# Ollama（本地模型，无需 transformer）
- name: ollama
  api_base_url: "http://localhost:11434/v1/chat/completions"
  api_key: "ollama"
  models: ["qwen2.5-coder:latest"]
```

### REST API 端点

服务启动后提供以下管理接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 读取当前配置文件内容 |
| `POST` | `/api/config` | 保存新配置（自动备份原配置） |
| `GET` | `/api/transformers` | 查看已加载的 transformer 列表 |
| `POST` | `/api/restart` | 触发服务热重启 |
| `GET` | `/ui` | 管理 API 说明页（Web UI 开发中，暂未开放） |

---

## 📖 触发路由配置说明

### TriggerRouter 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用触发路由 |
| `analysis_scope` | string | "last_message" | 分析范围：last_message 或 full_conversation |
| `llm_intent_recognition` | boolean | false | 是否启用 LLM 意图识别 |
| `intent_model` | string | - | 意图识别使用的模型 |
| `rules` | array | [] | 触发规则列表 |

### 触发规则配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `name` | string | 规则名称 |
| `priority` | number | 优先级（数值越大优先级越高） |
| `enabled` | boolean | 是否启用 |
| `description` | string | 规则描述 |
| `patterns` | array | 触发模式列表 |
| `model` | string | 目标模型（格式：provider,model） |

### 模式类型

#### 精确匹配 (exact)

```yaml
patterns:
  - type: exact
    keywords:
      - "生成图片"
      - "create image"
    caseSensitive: false  # 可选，默认 false
```

#### 正则表达式 (regex)

```yaml
patterns:
  - type: regex
    pattern: "(画|生成).{0,10}图"
```

### SmartRouter 智能路由配置

SmartRouter 是关键词/正则匹配之后的第二道路由层。当规则匹配未命中时，由 `router_model` 分析请求并从 `candidates` 列表中选择最优模型。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | false | 是否启用 SmartRouter |
| `router_model` | string | - | **必填**（启用时）。用于路由决策的 LLM，格式 `"provider,model"` |
| `candidates` | array | [] | **必填**（启用时）。候选模型列表，至少 2 个 |
| `cache_ttl` | number | 600000 | 结果缓存时间（毫秒） |
| `max_tokens` | number | 256 | router_model 响应最大 token 数 |
| `fallback` | string | "default" | **预留字段，当前尚未实现差异化行为**。两个值均继续执行后续路由链（LLM 意图识别 → 默认路由） |

**候选模型配置：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型标识，格式 `"provider,model"` |
| `description` | string | 模型能力描述（供 router_model 参考） |

**示例：**

```yaml
SmartRouter:
  enabled: true
  router_model: "deepseek,deepseek-chat"
  candidates:
    - model: "deepseek,deepseek-chat"
      description: "通用编程、代码生成、调试"
    - model: "deepseek,deepseek-reasoner"
      description: "数学推理、逻辑推理、复杂分析"
    - model: "openrouter,anthropic/claude-opus-4"
      description: "架构设计、长篇文档撰写"
  cache_ttl: 600000
  fallback: "default"
```

## 🔄 路由优先级

一次请求经过以下链路依次决定最终使用的模型：

| 优先级 | 条件 | 使用模型 | 配置项 |
|--------|------|----------|--------|
| 1 | 触发规则关键词/正则匹配成功 | 规则指定模型 | `TriggerRouter.rules[].model` |
| 2 | SmartRouter 启用且 LLM 返回有效选择 | SmartRouter 选中模型 | `SmartRouter.candidates[].model` |
| 3 | Token 数超过阈值 | 长上下文模型 | `Router.longContext` |
| 4 | System 提示含 `<CTR-SUBAGENT-MODEL>` 标签 | 子代理指定模型 | 动态注入 |
| 5 | 请求模型为 `claude-3-5-haiku-*` | 后台任务模型 | `Router.background` |
| 6 | 请求含 `thinking` 参数 | 深度思考模型 | `Router.think` |
| 7 | 工具列表含 `web_search` 类型工具 | 网络搜索模型 | `Router.webSearch` |
| 8 | 配置了自定义路由器路径 | 自定义路由器决定 | `CUSTOM_ROUTER_PATH` |
| 9 | 以上均不满足 | 默认模型 | `Router.default` |

> **注意**：触发路由（优先级 1-2）在所有原有路由逻辑之前执行。一旦匹配成功，后续路由逻辑均跳过（包括自定义路由器）。

## 📝 示例场景

### 图片生成任务

当用户说"帮我生成一张风景图"时：

```yaml
- name: "image_generation"
  priority: 100
  patterns:
    - type: exact
      keywords: ["生成图片", "画一张图"]
    - type: regex
      pattern: "(画|生成).{0,10}图"
  model: "openrouter,openai/dall-e-3"
```

### 架构设计任务

当用户说"帮我设计系统架构"时：

```yaml
- name: "architecture"
  priority: 90
  patterns:
    - type: exact
      keywords: ["架构设计", "系统架构"]
    - type: regex
      pattern: "(架构|系统设计)"
  model: "openrouter,anthropic/claude-opus-4"
```

## 🔧 故障排查

### 查看日志

日志文件位于 `~/.claude-trigger-router/logs/`，按天滚动保存。

```bash
# 实时查看最新日志（macOS/Linux）
tail -f ~/.claude-trigger-router/logs/*.log

# 查看触发路由命中记录
grep "TriggerRouter" ~/.claude-trigger-router/logs/*.log
```

日志中触发路由成功时会出现：
```
[INFO] [TriggerRouter] Matched rule "image_generation" -> "openrouter,openai/dall-e-3"
```

### 常见问题

**服务启动失败**

```bash
# 使用前台模式查看详细错误
ctr start

# 常见原因：
# - 配置文件不存在 → 运行 ctr init
# - 配置文件格式错误 → 检查 YAML 缩进
# - API key 未填写 → 编辑 ~/.claude-trigger-router/config.yaml
```

**端口冲突**

```bash
# 指定其他端口启动
ctr start --daemon --port 3457

# 同时更新 Claude Code 接入地址
export ANTHROPIC_BASE_URL=http://127.0.0.1:3457
```

> **注意**：`--port` 参数仅对当次启动生效，不会修改配置文件。使用自定义端口启动后，后续执行 `ctr code`、`ctr ui`、`ctr restart` 等命令时，也需要同样传入 `--port 3457`，否则 CLI 会读取配置文件中的旧端口。
>
> 如需长期使用某个端口，建议直接修改 `~/.claude-trigger-router/config.yaml` 中的 `PORT` 字段，这样后续所有命令均无需额外传入 `--port`。

**触发路由未生效**

1. 确认 `TriggerRouter.enabled: true`
2. 确认请求文本中包含规则定义的关键词
3. 查看日志中是否有 `[TriggerRouter]` 相关输出
4. 使用 `analysis_scope: "full_conversation"` 可扩大匹配范围

**确认服务是否正常运行**

```bash
curl http://127.0.0.1:3456/api/config
```

返回配置内容则服务正常。

---

## 🛠️ CLI 命令

```bash
ctr init                  # 初始化配置文件（从示例模板复制）
ctr start                 # 前台启动服务（调试用，Ctrl+C 退出）
ctr start --daemon        # 后台启动服务（daemon 模式）
ctr start -d              # 同上，简写
ctr stop                  # 停止后台服务
ctr restart               # 重启后台服务
ctr code                  # 通过路由器运行 Claude Code（需先启动服务）
ctr ui                    # 打开管理 API 说明页（Web UI 开发中）
ctr help                  # 显示帮助
```

### 选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--daemon` | `-d` | 以后台（daemon）方式运行，配合 `start`/`restart` 使用 |
| `--port <port>` | `-p <port>` | 指定监听端口（默认读取配置文件，最终默认 3456） |
| `--force` | — | 强制覆盖已有配置文件，配合 `init` 使用 |

## 📁 项目结构

```
claude-trigger-router/
├── src/
│   ├── trigger/           # 触发路由核心模块
│   │   ├── types.ts       # 类型定义
│   │   ├── matcher.ts     # 模式匹配器
│   │   ├── analyzer.ts    # 上下文分析器
│   │   ├── intent.ts      # 意图识别器
│   │   ├── selector.ts    # 模型选择器
│   │   └── index.ts       # 模块入口
│   ├── router/            # 原有路由逻辑
│   ├── agents/            # Agent 系统
│   ├── middleware/        # 中间件
│   ├── utils/             # 工具函数
│   ├── server.ts          # 服务器配置
│   ├── index.ts           # 主入口
│   └── cli.ts             # CLI 入口
├── config/
│   └── trigger.example.yaml
├── package.json
└── README.md
```

## 🤝 致谢

本项目基于 [claude-code-router](https://github.com/musistudio/claude-code-router) 开发，感谢原作者的优秀工作。

## 📄 License

MIT
