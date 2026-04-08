# 发布说明

维护者后续发布建议走 GitHub Actions + npm trusted publishing。

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
2. 提交并推送到 `master`
3. 创建并推送版本 tag，例如：

```bash
git tag v1.0.1
git push origin v1.0.1
```

4. `Publish Package` workflow 会自动执行：
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

## 本地兜底发布

如果需要手动发布，仍可在本地执行：

```bash
npm publish --access public --registry=https://registry.npmjs.org/
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
