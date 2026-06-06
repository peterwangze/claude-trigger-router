# Release notes v1.17.0

`v1.17.0` 定位为“UI 双层工作台收敛版”。这个版本不改变路由运行时语义，而是把 `/ui` 从功能集合页继续收敛为面向本地使用者、远程客户端、服务维护者和路由设计者的角色化工作台。

## 本次闭环

1. UI 渲染边界继续拆分
   - `workbench-styles.ts` 承接工作台 CSS helper。
   - `workbench-view-model.ts` 承接首屏状态派生。
   - `renderWorkbenchHtml()` 不再继续直接堆叠角色入口、服务状态和响应式样式。

2. Trace span 与路由证据视图
   - 维护者 Trace Detail 先展示 route decision、switch continuity、handoff stages、routing evidence 和 trace spans。
   - 原始 JSON 仍保留为深挖入口。
   - 新视图复用已有 trace payload，不新增平行观测结构。

3. 角色化 UI 体验设计 contract
   - 已把“Web UI 缺少设计、不同角色易用性不足”的反馈纳入 v1.17.0。
   - 已安装 `figma-create-design-system-rules`、`figma-generate-design`、`figma-implement-design` 三个 Codex/Figma 辅助 skill，Codex 重启后可用于后续设计系统和设计实现闭环。
   - UI contract 明确角色/任务流、信息架构、设计 token、组件状态、页面密度、响应式行为和不新增平行 UI 状态。

4. 真实浏览器 smoke
   - 新增 `npm run test:ui:browser`。
   - browser smoke 会 build、启动隔离 HOME 的 CTR、打开 `/ui`，在桌面和移动 viewport 检查角色入口、UX 设计辅助面板、trace evidence detail、维护者入口跳转和整页无横向溢出。
   - 浏览器失败会输出 URL、页面摘要和最宽元素，方便把真实布局问题回填进 CSS / fragment contract。

## 发布边界

- 不改变 SmartRouter 默认运行时语义。
- 不新增新的模型调度策略、治理算法或远程部署形态。
- 不把 `/ui` 改写成新的 SPA，也不新增平行客户端状态模型。
- 后续治理观测运营化进入 v1.18.0。

## 发布前验证

本版本发布前至少执行：

```bash
npx vitest --run src/deploy-assets.test.ts
npm run test:ui
npm run test:ui:browser
npm run test:e2e:cli:entry
npm run test:route-ux
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
