# Claude Trigger Router

> 基于 claude-code-router 的智能触发路由器，通过分析输入内容自动将请求分发到最适合处理该任务的模型。

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

### 2. 配置

创建配置文件 `~/.claude-trigger-router/config.yaml`：

```yaml
# 基础配置
HOST: "127.0.0.1"
PORT: 3456

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

### 3. 启动服务

```bash
ctr start
```

### 4. 使用

```bash
# 使用路由器运行 Claude Code
ctr code

# 打开 Web UI
ctr ui
```

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

1. **触发路由**: 根据关键词/正则匹配路由
2. **自定义路由**: 如果配置了 `CUSTOM_ROUTER_PATH`
3. **原有路由**: Token 数量、background、think、webSearch 等
4. **默认路由**: `Router.default`

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
ctr start       # 启动服务
ctr stop        # 停止服务
ctr restart     # 重启服务
ctr code        # 运行 Claude Code
ctr ui          # 打开 Web UI
ctr help        # 显示帮助
```

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
