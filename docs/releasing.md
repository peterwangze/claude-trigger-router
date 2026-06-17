# 发布说明

维护者后续发布建议走 GitHub Actions + npm trusted publishing。

当前仓库有两条配套工作流：

- `Release Check`：在 PR、`master` push 和手动触发时执行发布前检查
- `Publish Package`：在版本 tag、GitHub Release 或手动触发时执行正式发布

本次 `v1.20.2` patch release 的优先级是 API 报错后继续 / resume 继续慢卡补丁。发布检查需要优先保护既有 `setup / start / status / code / doctor / ui` 入口主路径，以及 fresh setup、远程转发、远端 SSE 建立后不被 600 秒总时长定时器 abort、stream lifecycle 诊断、trace/detail 可见 abort reason、agent/tool follow-up stream 不因背压或客户端取消静默截断、rewriteStream 下游 cancel 传播、第二轮对话和错误后继续请求不继承旧 abort signal、resume 长历史首包前 preflight 诊断、SmartRouter/semantic/alignment 预算、token count 紧凑签名、preflight loopback 短超时、配置保存、鉴权、route preview 可读解释、`/v1/messages` 流式即时透传、上游中途断流的可读 SSE error、远程中转客户端断开取消上游、结构化 API error 返回不回退、管理类 probe timeout 诊断、`/ui` 配置向导、quick config 常用厂商模板、remote discovery、remote availability、远端 registration 摘要、server/client 角色口径、trace evidence detail 可达、closed 事项复审口径和真实浏览器布局不横向溢出。

## 一次性准备

1. 在 npm 包 `@peterwangze/claude-trigger-router` 的包设置中添加 trusted publisher
2. GitHub source repository 选择：
   - owner: `peterwangze`
   - repository: `claude-trigger-router`
   - workflow: `publish.yml`
   - environment: 留空
3. 确认 npm 包权限为 `public`
4. 确认发布 workflow 使用 Node 24 / npm 11.5.1+；npm trusted publishing 依赖新版 npm CLI，旧版 npm 可能在 publish PUT 阶段表现为误导性的 404。

## 推荐正式发布流程

推荐主流程：

1. 更新版本号
   - `vX.Y.0` 这类 minor release 还需要同步更新版本依赖用例、README 发布定位和对应 release notes。
   - 本次 `v1.20.2` 的发布边界以 `docs/release-notes-v1.20.2.md` 为准：主打 API 报错后继续 / resume 继续路径的诊断去全量重扫、token count 紧凑签名、preflight loopback 短超时，以及既有 resume stability / stream stability / closed review 看护。
2. 本地先执行发布包验证：

```bash
npm run release:verify
```

从 v1.20.0 开始，`release:verify`、`Release Check` 和 `Publish Package` 都会固定执行常见场景稳定性专项：

```bash
npm run test:stream-stability
```

这条专项把 rewriteStream 取消传播、SSE parser、stream lifecycle 诊断、上游中途断流可读 SSE error、下游取消安全关闭、远程 thin proxy 响应开始超时、远端 SSE 建立后的长流式任务、客户端断开取消上游、agent 工具续写、第二轮/继续请求 signal 隔离、结构化 502、route preview 和基础流式即时透传串成同一个发布前门禁。它关注用户能直接感知的“长任务会不会随机停、第二轮会不会卡住、手动停止后新对话会不会继承旧断流、错误后继续是否仍可读”，不是只检查内部函数返回。

从 v1.20.1 开始，`release:verify`、`Release Check` 和 `Publish Package` 都会固定执行 resume 稳定性专项：

```bash
npm run test:resume-stability
```

这条专项把 preflight diagnostics、长历史 token count cache、`analysis_scope=full_conversation` 预算、sticky 快速路径、semantic classifier、SmartRouter fallback、alignment summary 防卡预算、context window guard 和同 session 恢复路径串成同一个发布前门禁。它关注用户能直接感知的“resume 后首包前是否无解释地变慢或卡住”，不是只检查单个函数返回。

v1.19.1 期间建议在正式 `release:verify` 前额外跑一次 UI 配置向导专项：

```bash
npx vitest --run src/deploy-assets.test.ts
npm run test:ui
npm run test:ui:browser
npm run test:e2e:acceptance -- -t "release:stage creates a usable isolated wrapper that points to the staged HOME"
npm run test:e2e:cli:entry
npm run test:route-ux
```

这条专项把 README/发布说明入口、`/ui` 配置向导第一屏、一键模型配置、常用厂商模板、DeepSeek 最小配置草稿、advanced controls 默认折叠、真实浏览器桌面/移动布局、release stage wrapper 和 help/setup/doctor/code/ui 短入口串成同一个发布前门禁。它关注用户能直接感知的“能不能进入、能不能少想一步完成配置、页面会不会溢出、浏览器 smoke 会不会卡住”，不是只检查内部函数返回。

v1.12.0 期间建议在正式 `release:verify` 前额外跑一次流式稳定专项：

```bash
npm test -- --run src/governance/stream-response-governance.test.ts src/utils/SSEParser.transform.test.ts src/index-startup.test.ts
npm test -- --run --coverage
npm run test:ui
npm run test:e2e:cli:entry
npm run test:e2e:cli
npm run test:e2e:acceptance
```

其中 coverage 口径已经从早期 `src/trigger/**/*.ts` 扩展到 setup、config、models、protocols、governance、server、auth、doctor、cli 主链；`test:ui` 是源码侧 `/ui` DOM smoke，用于保护配置载入、compiled preview、保存失败提示、Health action、benchmark history 和人工校准表单这类基础交互；`test:e2e:cli:entry` 是较短的打包后入口 smoke，用于先保护 help、init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui；后续新增入口功能时，先补对应看护再扩展低频能力。

这一步会依次执行：

- `npm run build`
- `npm test -- --run`
- `npm run test:stream-stability`
- `npm run test:resume-stability`
- `npm run test:closed-review`
- `npm run test:ui`
- `npm run test:e2e:cli:entry`
- `npm run test:e2e:cli`
- `npm run test:e2e:acceptance`
- `npm pack --dry-run`
- `npm pack`
- 将 tarball 安装到隔离目录
- 运行 `ctr --help`、`ctr version`、`ctr upgrade`

其中两层打包后验证分别承担不同职责：

- `npm run test:e2e:cli:entry`：覆盖打包后 CLI 的入口 smoke，优先保护 help、init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui
- `npm run test:e2e:cli`：覆盖打包后 CLI 的主要命令、选择路径与文件副作用边界；当前 Windows 本地完整运行约 3-4 分钟
- `npm run test:e2e:acceptance`：通过真实 shell / 全局 wrapper / 隔离 HOME 做更贴近人工验收的主路径看护

当前已经覆盖：

- `help` / `--help` / `-h` / 空命令
- `init`
- `version`
- `upgrade`
- `start` / `status` / `stop` / `restart`
- `code`
- `ui`
- `setup` 的复用、迁移、跳过迁移、新建、repair、rebuild、cancel 等主选择路径
- `setup -> status -> code` 这种最容易暴露终端接管、wrapper、隔离 HOME、副作用边界问题的主流程
- `start --daemon -> status -> stop` 的真实 shell/wrapper 路径
- `restart --daemon` 的真实 shell/wrapper 生命周期
- 目标端口被非本服务占用时的安全提示与“无额外文件修改”边界
- 残留 / 失效 PID 文件的安全清理
- `release:stage` 生成的 `.release-stage\ctr-release-home.cmd` wrapper 是否真的指向隔离 `.release-home`
- v1.12.0 流式传输韧性发布承诺的 stream governance 即时透传、上游中途断流可读 SSE error、远程中转客户端断开取消上游、SSE parser 跨 chunk / 多字节解析、结构化 API error 返回，以及 v1.10.0 routing advisor / SmartRouter collaboration 不回退检查

只有这一步通过后，才继续正式发布，避免“发布后才发现包内容、CLI 启动或 setup 主流程有问题”。

标准发布命令统一为：

```bash
npm run release
```

它等价于：

```bash
npm run release:publish
```

也就是调用统一的 `scripts/release-package.ps1` 发布链路，而不是直接裸跑 `npm publish`。

注意区分：

- `npm run release:verify` / `npm run release:stage`：这是维护者本地手动验收链路，包含本地打包、隔离安装、stage wrapper 等“贴近真实机器”的检查
- GitHub Actions：只保留 CI 适合做的构建、常规测试和 packaged CLI E2E，不再直接跑 `verify:package`

这样做是因为 `verify:package` 更偏向开发者本地验证，混入 CI 后容易把“本地/手工验收”问题误伤成工作流不稳定问题。

如果你想手动验收“待发布的新包 CLI”，可以先执行：

```bash
npm run release:stage
```

它会完成两件事：

- 把当前版本打包并安装到仓库内的隔离目录 `.release-stage`
- 准备一个隔离的测试 HOME 目录 `.release-home`，并自动生成测试配置
- 准备一个独立的 server profile HOME 目录 `.release-server-home`，并通过 staged wrapper 执行 `deploy init --target server --force`
- 在同一个 `.release-home` 下同时放入 `claude-code-router` legacy 配置样本，保证迁移验证走主流程 HOME

这样你在手动验证时不会污染自己真实的 `~/.claude-trigger-router` 配置。

如果你想指定测试端口，可以这样执行：

```bash
npm run release:stage -- -Port 6789
```

脚本会同时：

- 把 staged 配置里的 `PORT` 改成你指定的端口
- 在推荐命令清单里使用同一个端口

Windows 下脚本会额外生成一个包装命令 `.release-stage\ctr-release-home.cmd`，自动把 `HOME` / `USERPROFILE` 指向 `.release-home`。你可以直接用它验证新功能，例如：

```bash
".release-stage\\ctr-release-home.cmd" --help
".release-stage\\ctr-release-home.cmd" version
".release-stage\\ctr-release-home.cmd" setup
".release-stage\\ctr-release-home.cmd" status
".release-stage\\ctr-release-home.cmd" ui
".release-stage\\ctr-release-home.cmd" stop
".release-stage\\ctr-release-home.cmd" init --force
".release-stage\\ctr-release-server-home.cmd" deploy init --target server --force
".release-stage\\ctr-release-home.cmd" start --port 5678
```

`npm run release:stage` 的输出里也会直接打印一组“推荐验证清单”，顺序会尽量贴近真实用户主路径：

- `help`
- `version`
- `setup`
- `status`
- `ui`
- `stop`

如果你还想额外验证手动配置路径，再继续执行：

- `init --force`
- `start`
- `status`
- `stop`

如果你还想额外验证 server 部署入口，`release:stage` 会生成：

```bash
.release-server-home\.claude-trigger-router\config.yaml
```

Windows 下可以继续使用：

```bash
".release-stage\\ctr-release-server-home.cmd" doctor
```

该 profile 与普通 staged HOME 隔离，避免 server 模板覆盖本地用户主路径测试配置。

对于本次 `claude-code-router` 配置迁移这种高频通用能力，`release:stage` 现在也会默认在同一个主流程 HOME 中准备 legacy 配置样本。Windows 下可直接继续使用同一个 wrapper：

```bash
".release-stage\\ctr-release-home.cmd" setup
```

它会在 `.release-home` 中同时读取脚本自动生成的 legacy 样本：

```bash
.release-home\.claude-code-router\config.json
```

迁移后的目标配置请重点检查：

```bash
.release-home\.claude-trigger-router\config.yaml
```

如果要先修改测试配置，请编辑：

```bash
.release-home\.claude-trigger-router\config.yaml
```

这个 staged 配置文件顶部会额外提示你优先修改：

- `Models[*].key`
- `Models[*].api` / `model`
- `PORT`

并且示例里的 `sk-xxx` 会自动替换成更显眼的占位值 `REPLACE_WITH_REAL_API_KEY`，避免直接拿着示例值做验证。

验证完成后执行：

```bash
npm run release:clean
```

它会清理 `.release-stage` 和本地 tarball。

3. 提交并推送到 `master`
4. 创建并推送版本 tag，例如：

```bash
git tag v1.0.1
git push origin v1.0.1
```

5. `Publish Package` workflow 会自动执行：
   - `npm ci`
   - `npm run build`
   - `npm test -- --run`
   - `npm run test:stream-stability`
   - `npm run test:resume-stability`
   - `npm run test:closed-review`
   - `npm run test:e2e:cli:entry`
   - `npm run test:e2e:cli`
   - npm trusted publishing 版本门禁
   - `npm publish --access public`

也支持两种补充触发方式：

- 发布 GitHub Release
- 在 Actions 中手动 `workflow_dispatch`

## 工作流保护

当前发布工作流已经内置：

- tag / release 与 `package.json` 版本一致性校验
- npm 已发布版本检查，避免重复发布同一版本
- npm trusted publishing CLI 版本检查，避免旧 npm 在发布阶段才失败
- 发布前 tarball 预检查

## 处理 GitHub Actions 发布 404

如果发布日志中已经完成 build、pack 和 provenance 生成，但最后在：

```text
PUT https://registry.npmjs.org/@peterwangze%2fclaude-trigger-router - Not found
```

失败，优先检查两件事：

- npm 包设置里 trusted publisher 是否精确指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- workflow 是否使用 Node 24 / npm 11.5.1+；旧 npm 不支持 trusted publishing 的正式发布路径

如果目标版本还没有发布，可以在修复 workflow 后从 Actions 页面用 `workflow_dispatch` 触发当前 `master` 的 `Publish Package`。如果当前代码已经继续演进，建议 bump 到下一个 patch 版本并重新打 tag，避免同一个版本号对应不同源码快照；单纯 rerun 旧 tag 的失败 job 仍会使用旧 tag 上的 workflow 文件。

建议统一使用 `vX.Y.Z` 形式的 tag，例如 `v1.0.1`。

如果你想快速查看当前 CLI 自动化覆盖矩阵，可参考：

```bash
docs/cli-test-matrix.md
```

## Release Check 会检查什么

`Release Check` 会提前检查：

- `npm ci`
- `npm run build`
- `npm test -- --run`
- `npm run test:e2e:cli`
- 当前 `package.json.version` 是否已经发布到 npm
- 如果 `package.json` 已改动，版本号是否真的发生变化
- 当前提交是否已经带有匹配的 `vX.Y.Z` release tag

它会在这些情况下直接失败：

- `package.json` 改了，但版本号没有变化
- `package.json` 改了，而且目标版本已经存在于 npm，但当前提交没有匹配的 `vX.Y.Z` tag

这样可以把常见发布问题提前暴露在 PR 或合入 `master` 之前。

如果 `master` push 和 `vX.Y.Z` tag push 几乎同时发生，tag 触发的 `Publish Package` 可能先把版本发布到 npm。`Release Check` 会识别当前提交是否正好带有匹配 tag；如果是，它会把“npm 已存在”视为已完成发布提交，而不是误判为版本冲突。

## 本地兜底发布

如果需要手动发布，仍可在本地执行：

```bash
npm run release:verify
npm run release:publish
```

其中：

- `npm run release:verify`：做构建、常规测试、packaged CLI E2E、打包、隔离安装和 CLI 冒烟检查
- `npm run release:stage`：把待发布包安装到 `.release-stage`，并在同一个 `.release-home` 中准备基础验收配置与 legacy 迁移验证样本；推荐先按 `help -> version -> setup -> status -> ui -> stop` 验收主路径，再按需补充 `init -> start -> status -> stop`
- `npm run release:clean`：清理 `.release-stage`、`.release-home` 和本地 tarball
- `npm run release:publish`：发布前先检查目标版本是否已存在于 npm；如果不存在，会先执行完整验证，再执行 `npm publish`

如果你已经刚刚执行过验证，也可以直接调用底层脚本跳过重复验证：

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/release-package.ps1 -Action publish -SkipVerify
```

如果本机 `@peterwangze` scope 曾指向 GitHub Packages，需要先确认：

```bash
npm config get registry
```

并检查 `~/.npmrc` 中：

```text
@peterwangze:registry=https://registry.npmjs.org/
```

## 发布后检查

发布完成后建议确认：

```bash
npm view @peterwangze/claude-trigger-router version --registry=https://registry.npmjs.org/
npm install -g @peterwangze/claude-trigger-router
ctr --help
```
