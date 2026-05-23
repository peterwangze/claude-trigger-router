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
- `src/ui/workbench.dom.test.ts`
  - 关注 `/ui` 工作台真实 DOM 脚本执行和基础交互
  - 重点校验配置载入、compiled preview、保存失败 validation issue 和 Health action 过滤

## 2. 当前自动覆盖范围

### 基础命令

- `help` / `--help` / `-h` / 空命令
- `version`
- `upgrade`
- `doctor`
- `ui`（跳过打开浏览器）
- `ui` 在服务未就绪时的明确提示
- `init --force`
- `deploy init --target server --force`
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
- `doctor` 会用用户可理解的兼容策略说明替代内部兼容 profile 字符串
- `doctor` 会预览 capability 降级导致的运行时兼容提示，而不是只展示编译期 code
- `doctor` 探测失败时会输出中文失败解释、处理建议和原始远端错误
- `doctor` 在 server/cloud 模式下输出监听地址、远程客户端 `ANTHROPIC_BASE_URL`、维护入口和 managed `client + read-only` key 指引

### 部署入口

- `deploy init --target server --force` 会生成带随机 bootstrap `APIKEY`、`HOST: 0.0.0.0`、`Runtime.mode: server`、`Models` 和 `Router.default` 的自托管 server 起步配置
- `deploy init --target server` 在已有配置时不会覆盖文件，会提示显式追加 `--force`
- deploy 入口不会自动启动服务；后续仍要求维护者运行 `ctr doctor` 和 `ctr start --daemon`
- `ctr status` 在 server/cloud 模式下输出 role、listener、auth 摘要、维护入口和远程客户端连接说明；服务已 ready 时优先使用 live `/api/service-info`，PID 元数据缺失时也不能误报停止
- `ctr setup` 在本地使用和连接远程服务两条 fresh 路径中输出统一角色说明，避免把 remote service、server deploy 和 managed key 混成同一条用户路径
- `ctr setup` fresh 路径支持“部署为远程服务端”，生成 server profile / bootstrap admin `APIKEY` / `Runtime.mode: server`，并且不自动启动服务
- `ctr setup` 保存后按角色输出状态反馈：本地路径说明本地代理已 start/reuse/reload/restart 并提示 `ctr code`，远程客户端路径提示先用 `ctr doctor` / `ctr status` 检查本地代理与远端 ready，再运行本地 `ctr code` 由本地代理转发模型调用，直连远端所需环境变量只作为可选路径，服务端路径不启动服务
- `ctr setup` 复用已有 `Runtime.mode: server/cloud` 配置时不能自动启动服务或进入 Claude Code，本地代理 next steps 只适用于 `Runtime.mode: local`

### UI / 服务状态

- `/ui` 首屏展示服务 ready、端口、模型数、`Router.default`、`Runtime.mode`、listener、远程状态和 Registration 摘要
- `POST /api/config` 保存前复用 validation issue contract；已有配置备份失败时必须拒绝写入，避免 UI save 静默覆盖用户配置
- `POST /api/config` 保存 `Runtime` / `Registration` / `Auth` 等已配置分支时不能静默丢弃，尤其要保留 managed key 记录且不暴露一次性 secret
- 维护者工作台展示 role / listener / remote client connection guide，和 `/api/service-info` 的 listener / clientConnection contract 对齐
- 维护者工作台展示 Governance trace、metrics、Health 摘要、异常阈值、快照和归档入口
- Compiled Models 区展示 `Registration.models` 编译出的 model pools、active endpoint、priority endpoint 列表和 upstream warning，覆盖同模型多源池化的编译期契约
- `GET /api/governance/metrics` 返回 `health` 摘要和 routing `outcome` scorecard，覆盖 `idle / healthy / watch / critical`、模型切换率、切换后 alignment、Top model switches，以及 route reason / final model / semantic intent 分组 outcome
- `GET /api/governance/health` 返回维护者健康摘要、关键指标、模型切换 signals、routing outcome、异常列表和建议 action
- Health action 可联动 trace 过滤：cascade action 对应 `cascadeTriggered=true`，shadow action 对应 `shadowChecked=true`
- UI HTML 渲染测试覆盖 `/api/governance/health` 数据源、Health 状态占位、routing outcome 指标、分组 outcome 面板和健康摘要说明入口
- UI DOM smoke 执行 `renderWorkbenchHtml()` 生成的内联脚本，覆盖载入当前配置、compiled models 预览、保存失败 validation issue 展示和 Health action trace 过滤，防止字符串级 HTML 断言漏掉脚本拼接或 DOM 绑定错误

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

- SmartRouter.rules 命中后切到目标模型
- SmartRouter 在候选模型间做选择

### 发布前 staged 包路径

- `release:stage` 能生成 `.release-stage`
- wrapper 能指向隔离 `.release-home`
- `release:stage` 会额外生成 `.release-server-home` server profile，并通过 staged wrapper 执行 `deploy init --target server --force`
- npm 包随附 `config/deploy/docker-compose.server.yaml` 与 `config/deploy/systemd/claude-trigger-router.service`
- staged wrapper 启动后的服务能返回 `/ui` HTML 与 `GET /api/governance/health`
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
- 单个子命令超时时，harness 会清理子进程树并输出 stdout/stderr 摘要，便于定位卡点

### `cli-acceptance`

- 真实 shell / wrapper 行为与人工使用一致
- Windows 终端输出中不出现异常控制字符、乱码占位符、不可见污染
- daemon / restart / stale pid 这类“人工最容易踩坑”的状态场景可被提前拦住
- `release:stage` 产物本身可作为手工验收入口使用
- staged 包路径会直接 smoke `/ui` 和 `/api/governance/health`，避免维护者工作台只在源码测试中可用

## 4. v1.5 入口稳定专项门禁

v1.5.0 期间新增或修改功能前，先确认这些入口契约不退化：

- `setup`：覆盖 fresh setup、复用已有配置、legacy migration、repair、rebuild、远程客户端和服务端部署三类角色；不能误启动、误覆盖或把 next steps 指向错误角色。
- `start/status/stop/restart`：覆盖前台、后台、alternate port、端口被非本服务占用、stale PID、服务已运行和配置错误；失败信息必须给出清晰下一步。
- `code`：只在服务 ready 时进入 Claude Code；本地/远程代理环境变量必须正确注入；服务未运行或 Claude CLI 缺失时必须明确失败。
- `doctor/setup/ui save`：复用同一 validation issue contract；写入前保留备份，不能静默丢弃 `Runtime` / `Registration` / `Auth` 等已配置分支。
- `/ui`：现阶段保留 HTML / API smoke，并新增 `npm run test:ui` 的 jsdom DOM smoke；后续真实浏览器 smoke 继续覆盖基础路由解释、键鼠流程和维护者 Health 展示。
- coverage：入口看护范围从早期 `src/trigger/**/*.ts` 扩展到 setup、config、models、protocols、governance、server、auth、doctor、cli 主链。

专项验证建议加跑：

```bash
npm test -- --run --coverage
npm run test:ui
npm run test:e2e:cli:entry
npm run test:e2e:cli
npm run test:e2e:acceptance
```

这组检查不是替代 `release:verify`，而是在 v1.5.0 期间提前暴露入口主路径、UI 交互和 coverage 口径漂移。`test:ui` 是源码侧 `/ui` DOM smoke；`test:e2e:cli:entry` 是较短的入口 smoke，覆盖 init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui；完整 `test:e2e:cli` 仍保留为发布门禁，当前在 Windows 本地约 3-4 分钟。

## 5. 当前发布门禁

发布前建议至少通过：

```bash
npm run build
npm test -- --run
npm run test:ui
npm run test:e2e:cli:entry
npm run test:e2e:cli
npm run test:e2e:acceptance
npm run release:verify
```

其中：

- `release:verify` 已包含 `test:e2e:cli`
- `release:verify` 已包含 `test:e2e:acceptance`
- `test:e2e:acceptance` 已包含 release-stage wrapper 的 `/ui` HTML 与治理健康 API smoke

## 6. 仍建议保留的人工验收重点

自动化已经尽量接近真实路径，但发布前仍建议人工快速确认：

- `ctr setup` 的输入体验是否自然，是否存在误导性文案
- `ctr code` 连接真实 Claude Code 时的交互是否正常
- `ui` 页面在真实浏览器中的打开与交互是否符合预期
- 维护者工作台 Health 摘要是否能根据真实 trace 显示可理解的状态和建议 action
- 新增配置模板和 README 的指引是否和实现一致
- server 部署入口生成的 bootstrap key 是否只用于维护者管理，远程客户端是否改用 managed `client + read-only` key

## 7. 后续增补原则

后续新增用户可见命令、选项、setup 分支或发布脚本行为时，优先补到这 3 层之一：

- 能只测流程编排的，补单元/集成
- 涉及打包后用户行为的，补 `cli-e2e`
- 涉及 shell、wrapper、stage、终端体验、残留状态的，补 `cli-acceptance`
