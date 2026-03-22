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
    ├─ Token 数 > 60000     ──→ Provider C (长上下文模型)
    └─ 其他请求             ──→ Provider D (默认模型)
```

Claude Code 本身完全不感知切换过程，仍然以为自己在与 Anthropic API 通信。

## ✨ 功能特性

- **智能触发路由**: 分析用户输入，自动识别任务类型并路由到合适的模型
- **关键词匹配**: 支持精确匹配和正则表达式两种模式
- **优先级系统**: 触发规则可配置优先级，灵活控制路由逻辑
- **LLM 意图识别**: 可选的 LLM 辅助意图识别，提高识别准确率
- **配置灵活**: 支持 YAML/JSON 配置文件
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
| `Router.image` | string | 图像分析模型（请求包含图片内容时使用） |

### Providers 提供商配置

每个 Provider 对象包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 提供商标识名，在路由配置中用作 `"name,model"` 的前缀 |
| `api_base_url` | string | API 端点 URL |
| `api_key` | string | 该提供商的 API 密钥 |
| `models` | string[] | 该提供商支持的模型列表 |
| `transformer` | object | 可选。请求/响应转换器配置 |

### REST API 端点

服务启动后提供以下管理接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 读取当前配置文件内容 |
| `POST` | `/api/config` | 保存新配置（自动备份原配置） |
| `GET` | `/api/transformers` | 查看已加载的 transformer 列表 |
| `POST` | `/api/restart` | 触发服务热重启 |
| `GET` | `/ui` | Web 管理界面 |

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

## 🔄 路由优先级

一次请求经过以下链路依次决定最终使用的模型：

| 优先级 | 条件 | 使用模型 | 配置项 |
|--------|------|----------|--------|
| 1 | 触发规则关键词/正则匹配成功 | 规则指定模型 | `TriggerRouter.rules[].model` |
| 2 | Token 数超过阈值 | 长上下文模型 | `Router.longContext` |
| 3 | System 提示含 `<CTR-SUBAGENT-MODEL>` 标签 | 子代理指定模型 | 动态注入 |
| 4 | 请求模型为 `claude-3-5-haiku-*` | 后台任务模型 | `Router.background` |
| 5 | 请求含 `thinking` 参数 | 深度思考模型 | `Router.think` |
| 6 | 工具列表含 `web_search` 类型工具 | 网络搜索模型 | `Router.webSearch` |
| 7 | 配置了自定义路由器路径 | 自定义路由器决定 | `CUSTOM_ROUTER_PATH` |
| 8 | 以上均不满足 | 默认模型 | `Router.default` |

> **注意**：触发路由（优先级 1）在所有原有路由逻辑之前执行。一旦触发匹配，后续路由逻辑均跳过。

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

## 🛠️ CLI 命令

```bash
ctr init                  # 初始化配置文件（从示例模板复制）
ctr start                 # 前台启动服务（调试用，Ctrl+C 退出）
ctr start --daemon        # 后台启动服务（daemon 模式）
ctr start -d              # 同上，简写
ctr stop                  # 停止后台服务
ctr restart               # 重启后台服务
ctr code                  # 运行 Claude Code（自动检查服务是否已启动）
ctr ui                    # 打开 Web UI
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
