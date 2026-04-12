# 发布说明

维护者后续发布建议走 GitHub Actions + npm trusted publishing。

当前仓库有两条配套工作流：

- `Release Check`：在 PR、`master` push 和手动触发时执行发布前检查
- `Publish Package`：在版本 tag、GitHub Release 或手动触发时执行正式发布

## 一次性准备

1. 在 npm 包 `@peterwangze/claude-trigger-router` 的包设置中添加 trusted publisher
2. GitHub source repository 选择：
   - owner: `peterwangze`
   - repository: `claude-trigger-router`
   - workflow: `publish.yml`
   - environment: 留空
3. 确认 npm 包权限为 `public`

## 推荐正式发布流程

推荐主流程：

1. 更新版本号
2. 本地先执行发布包验证：

```bash
npm run release:verify
```

这一步会依次执行：

- `npm run build`
- `npm test -- --run`
- `npm pack --dry-run`
- `npm pack`
- 将 tarball 安装到隔离目录
- 运行 `ctr --help`、`ctr version`、`ctr upgrade`

只有这一步通过后，才继续正式发布，避免“发布后才发现包内容或 CLI 启动有问题”。

如果你想手动验收“待发布的新包 CLI”，可以先执行：

```bash
npm run release:stage
```

它会完成两件事：

- 把当前版本打包并安装到仓库内的隔离目录 `.release-stage`
- 准备一个隔离的测试 HOME 目录 `.release-home`，并自动生成测试配置

这样你在手动验证时不会污染自己真实的 `~/.claude-trigger-router` 配置。

Windows 下脚本会额外生成一个包装命令 `.release-stage\ctr-release-home.cmd`，自动把 `HOME` / `USERPROFILE` 指向 `.release-home`。你可以直接用它验证新功能，例如：

```bash
".release-stage\\ctr-release-home.cmd" --help
".release-stage\\ctr-release-home.cmd" version
".release-stage\\ctr-release-home.cmd" init --force
".release-stage\\ctr-release-home.cmd" setup
".release-stage\\ctr-release-home.cmd" start --port 5678
".release-stage\\ctr-release-home.cmd" status
".release-stage\\ctr-release-home.cmd" stop
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
   - `npm test -- --run`
   - `npm run build`
   - `npm pack --dry-run`
   - `npm publish --access public --provenance`

也支持两种补充触发方式：

- 发布 GitHub Release
- 在 Actions 中手动 `workflow_dispatch`

## 工作流保护

当前发布工作流已经内置：

- tag / release 与 `package.json` 版本一致性校验
- npm 已发布版本检查，避免重复发布同一版本
- 发布前 tarball 预检查

建议统一使用 `vX.Y.Z` 形式的 tag，例如 `v1.0.1`。

## Release Check 会检查什么

`Release Check` 会提前检查：

- `npm ci`
- `npm test -- --run`
- `npm run build`
- `npm pack --dry-run`
- 当前 `package.json.version` 是否已经发布到 npm
- 如果 `package.json` 已改动，版本号是否真的发生变化

它会在这些情况下直接失败：

- `package.json` 改了，但版本号没有变化
- `package.json` 改了，而且目标版本已经存在于 npm

这样可以把常见发布问题提前暴露在 PR 或合入 `master` 之前。

## 本地兜底发布

如果需要手动发布，仍可在本地执行：

```bash
npm run release:verify
npm run release:publish
```

其中：

- `npm run release:verify`：只做构建、测试、打包、隔离安装和 CLI 冒烟检查
- `npm run release:stage`：把待发布包安装到 `.release-stage`，并准备 `.release-home` 测试配置，供你手动调用新包 CLI 验收功能
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
