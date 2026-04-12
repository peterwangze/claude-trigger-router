# Claude Trigger Router

Claude Code 的本地路由代理。

它的目标很简单：

- 用一个本地服务接管 Claude Code 的上游请求
- 按你的配置把请求路由到不同模型
- 用统一的模型配置格式管理 OpenAI / Anthropic 及兼容接口

当前对用户主流程已经做了打包态 CLI E2E 验证，覆盖：

- 安装后的 `ctr help / init / version / upgrade`
- `start / status / stop / restart`
- `code`
- `ui`
- `setup` 的复用、迁移、新建、repair、rebuild、cancel 主路径

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

最少只需要关心这几个字段：

- `api`：目标接口地址
- `key`：API Key
- `interface`：接口类型，当前支持 `openai` / `anthropic`
- `thinking`：可选，支持的模型才需要配置

消息格式转换由路由层统一处理，不需要你自己按不同厂商手写消息体。

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
ctr ui
```

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

它适合做配置查看和调试，但主线入口仍然建议优先使用 `ctr setup`。

## 示例配置

更完整的配置示例见：

- `config/trigger.example.yaml`

如果你需要高级路由能力，再继续看这些文档：

- `docs/configuration-guide.md`
- `docs/models-migration-guide.md`
- `docs/releasing.md`

## 发布前验证

如果你是维护者，发布前建议执行：

```bash
npm run release:verify
```

这一步现在会包含：

- 常规测试
- 打包后的 CLI E2E
- tarball 安装校验
- 安装后 CLI 冒烟校验

这样可以尽量避免“发出去再发现 CLI 不可用”。
