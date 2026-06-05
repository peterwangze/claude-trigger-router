# Release notes v1.16.0

`v1.16.0` 定位为“用户视角复审与入口一致性校准版”。这个版本不新增新的运行时路由策略，而是把项目目标、用户高频入口、已发布 closed 事项和 `/ui` 第一屏重新对齐到同一条产品主路径。

## 本次闭环

1. 项目目标与实现一致性复审
   - 复核 README、configuration guide、setup、doctor、`/ui`、远程客户端与运行时主路径。
   - 当前产品目标继续收敛为 Claude Code 本地/远程路由代理，不扩张为完整 agent 平台或托管控制面。
   - fresh setup、远程转发、配置保存、鉴权、route preview、结构化 API error 和发布门禁继续作为用户主路径底线。

2. 角色化 `/ui` 入口
   - `/ui` 第一屏新增本地使用者、远程客户端、服务维护者和路由设计辅助入口。
   - 新增 UX 诊断面板，帮助后续评估入口可见性、角色路径、核心路由解释和维护者排障入口。
   - 宽表格约束在工作台面板内，避免第一屏或维护者视图出现整页横向溢出。

3. 高频入口与核心路由体感验证
   - 复核 fresh setup、legacy migration、remote client、server profile、route preview、结构化 API error、stream error、remote forwarding 和 `/ui`。
   - `npm run test:e2e:cli:entry` 继续保护 help、setup、doctor、code、ui 等短入口。
   - packaged entry slice 继续覆盖 `setup can create a remote-service client config` 和 server deployment profile，避免远程客户端完成页与真实 CLI 入口漂移。
   - `npm run test:route-ux` 继续保护 route preview、即时流式输出、上游断流可读错误、远程中转取消和结构化错误。

4. 已发布 closed 事项校准
   - 抽样复核 v1.9.0 到 v1.15.0 的用户入口、远程客户端、SmartRouter 协作口径、流式韧性、配置产品化和 setup UX 闭环证据。
   - 本轮未发现需要推翻 closed 结论的新漂移。

## 发布边界

- 不改变 SmartRouter 默认运行时语义；v1.10.0 的协作模式仍是 contract，不默认开启多模型并发。
- 不新增新的模型调度策略、治理算法或远程部署形态。
- 不完成 v1.17.0 计划中的 UI CSS/JS helper 拆分、trace span 视图和真实浏览器 smoke。

## 发布前验证

本版本发布前至少执行：

```bash
npx vitest --run src/deploy-assets.test.ts
npm run test:ui
npm run test:e2e:cli:entry
npm run test:route-ux
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
