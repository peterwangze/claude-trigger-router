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

## 正式发布

推荐流程：

1. 更新版本号
2. 提交并推送到 `master`
3. 创建 GitHub Release 并发布
4. `Publish Package` workflow 会自动执行：
   - `npm ci`
   - `npm test -- --run`
   - `npm run build`
   - `npm publish --access public --provenance`

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
