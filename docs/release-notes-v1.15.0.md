# Release notes v1.15.0

`v1.15.0` 定位为“CLI/setup UX 重设计收口版”。这个版本不扩展新的运行时路由策略，而是把 fresh setup、legacy migration、remote client、server profile、SmartRouter 起步引导和短入口 smoke 继续收敛到同一条用户主路径。

## What changed

1. migration-first 与 model-id-first 主路径收口。
   - `ctr setup` 继续优先复用当前配置或迁移旧 `claude-code-router` 配置；fresh setup 才进入新建流程。
   - fresh setup 的核心问题保持为默认模型 `Models[].id`，`Router.default` 引用这个 model id。
   - setup 持久化边界写出 canonical `Models[].id/api/key/interface/model/thinking/metadata`，不会把 `api_base_url/api_key/protocol` 作为新配置入口回流。
   - `ctr help` 和 README quick start 已同步“复用/迁移优先；首次按 Models[].id 创建默认路由”的入口心智。

2. 多模型与 SmartRouter 起步引导。
   - fresh setup 在最小配置后可继续添加复杂任务模型。
   - 新增基础槽位引导：复杂任务模型可直接接到 `Router.think`，或同时接到 `Router.think + Router.longContext`。
   - SmartRouter 起步仍是可选项：可只生成复杂任务规则，也可生成规则 + candidates 智能兜底。
   - 配置指南已说明 setup 可以直接生成可运行、可解释的多模型/SmartRouter 起步配置。

3. 完成页 next steps 一致性。
   - 本地使用完成页明确提示先用 `ctr doctor` 或 `ctr status` 确认代理状态，再用 `ctr code` 进入 Claude Code；需要查看配置、路由原因或健康状态时运行 `ctr ui`。
   - 远程客户端完成页继续提示 `doctor/status -> code` 的本地 thin proxy 主路径。
   - 服务端部署完成页继续提示检查 `Models[].id/api/key/interface/model` 后运行 `ctr doctor && ctr start --daemon`。
   - packaged CLI E2E 覆盖三类 setup profile 的完成提示和副作用边界。

4. CLI 帮助与入口 smoke 补强。
   - packaged help e2e 现在断言 setup、doctor、code、ui 和 route preview 示例的用户可见文案。
   - `npm run test:e2e:cli:entry` 已纳入 help smoke，短入口门禁覆盖 help、init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui。

## Validation

Targeted validation before release:

```bash
npx vitest --run src/setup/index.test.ts src/setup/templates.test.ts src/cli-run.test.ts src/build-script.test.ts src/deploy-assets.test.ts
npx vitest --run src/e2e/cli-e2e.test.ts -t "setup can create a fresh config on first use when no current or legacy config exists"
npx vitest --run src/e2e/cli-e2e.test.ts -t "setup can create a fresh config|setup can create a remote-service client config|setup can create a server deployment profile"
npx vitest --run src/e2e/cli-acceptance.test.ts -t "fresh setup -> status -> code smoke"
npm run test:e2e:cli:entry
```

Final release gate:

```bash
npm run release:verify
```
