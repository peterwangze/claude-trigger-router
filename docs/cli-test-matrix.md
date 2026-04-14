# CLI 测试矩阵

这份文档只关注用户可见命令和真实使用路径，目标是把“不会异常退出、不会误改文件、不会误导用户、行为符合命令语义”变成发布前可核对的门禁。

## 1. 测试分层

当前 CLI 测试分成 3 层：

- `src/setup/index.test.ts`
  - 关注 setup 向导内部编排、分支决策、提示文案与错误处理
- `src/e2e/cli-e2e.test.ts`
  - 关注打包后 CLI 的主要命令与选择路径
  - 重点校验隔离 HOME、副作用白名单、主流程行为
- `src/e2e/cli-acceptance.test.ts`
  - 关注更贴近真实人工验证的 shell / wrapper / staged 包路径
  - 重点校验 Windows 终端输出、wrapper、daemon 生命周期、release stage 验收链路

## 2. 当前自动覆盖范围

### 基础命令

- `help` / `--help` / `-h` / 空命令
- `version`
- `upgrade`
- `doctor`
- `ui`（跳过打开浏览器）
- `ui` 在服务未就绪时的明确提示
- `init --force`
- `init --force -> start --daemon -> status -> stop` 的最小模板可启动性
- 非法 `--port` 参数的安全失败
- 未知命令

### 服务生命周期

- `start` 前台启动
- `start --daemon`
- `start --daemon` 启动失败时不再输出误导性成功提示
- `status`
- `stop`
- 前台 `start` 在服务已运行时的清晰提示
- `restart`
- `restart --daemon`
- `restart` 与 `restart --daemon` 当前等价，且 CLI 会明确提示默认走后台模式
- 端口被非本服务占用时的安全提示
- stale PID 文件的安全清理

### Claude 入口

- 服务未运行时执行 `code` 的安全失败
- 服务未运行时，即使设置 `CTR_AUTO_START=1`，`code` 仍会明确失败而不是误导性继续执行
- 服务运行时执行 `code`，并验证传给 Claude 的 `ANTHROPIC_BASE_URL`
- 服务运行但本机未安装 Claude Code CLI 时，`code` 的明确失败提示
- `setup -> status -> code` 的真实 shell/wrapper 主路径

### 配置诊断

- `doctor` 对低风险格式问题的自动修复
- `doctor` 在用户拒绝时不会执行模型探测
- `doctor` 在用户同意后会对模型发送最小探测请求

### setup 主要选择路径

- 首次 fresh setup
- 使用 provider preset 的 fresh setup
- 跳过 legacy 迁移，转 fresh setup
- 读取 legacy 失败后转 fresh setup
- 当前配置可复用
- 当前配置放弃后重新 fresh setup
- 当前配置放弃后迁移 `claude-code-router`
- 当前配置非法后的 repair
- 当前配置非法后 cancel
- 当前配置不可解析后的 rebuild
- 当前配置不可解析后 cancel

### 路由功能

- TriggerRouter 命中后切到目标模型
- SmartRouter 在候选模型间做选择

### 发布前 staged 包路径

- `release:stage` 能生成 `.release-stage`
- wrapper 能指向隔离 `.release-home`
- wrapper 下可执行：
  - `--help`
  - `version`
  - `upgrade`
  - `ui`
  - `setup`
  - `status`
  - `stop`

## 3. 每层重点防护目标

### `cli-e2e`

- 打包后的 npm 包真实可安装、可执行
- 主命令不会异常退出
- 命令只修改允许的隔离文件
- setup 与路由主流程可走通

### `cli-acceptance`

- 真实 shell / wrapper 行为与人工使用一致
- Windows 终端输出中不出现异常控制字符、乱码占位符、不可见污染
- daemon / restart / stale pid 这类“人工最容易踩坑”的状态场景可被提前拦住
- `release:stage` 产物本身可作为手工验收入口使用

## 4. 当前发布门禁

发布前建议至少通过：

```bash
npm run build
npm test -- --run
npm run test:e2e:cli
npm run test:e2e:acceptance
npm run release:verify
```

其中：

- `release:verify` 已包含 `test:e2e:cli`
- `release:verify` 已包含 `test:e2e:acceptance`

## 5. 仍建议保留的人工验收重点

自动化已经尽量接近真实路径，但发布前仍建议人工快速确认：

- `ctr setup` 的输入体验是否自然，是否存在误导性文案
- `ctr code` 连接真实 Claude Code 时的交互是否正常
- `ui` 页面在真实浏览器中的打开与交互是否符合预期
- 新增配置模板和 README 的指引是否和实现一致

## 6. 后续增补原则

后续新增用户可见命令、选项、setup 分支或发布脚本行为时，优先补到这 3 层之一：

- 能只测流程编排的，补单元/集成
- 涉及打包后用户行为的，补 `cli-e2e`
- 涉及 shell、wrapper、stage、终端体验、残留状态的，补 `cli-acceptance`
