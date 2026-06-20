# Release notes v1.20.3

`v1.20.3` 定位为“Web UI 本地优先重构版”。这个 patch release 聚焦 `/ui` 的信息架构和视觉体验：把路由用户最常用的本地配置和状态查看放到第一层，把远程接入、维护观测和复杂路由收进高级特性。

## 本次闭环

1. Local-first workbench
   - 首屏改为本地状态、端口、模式、角色、模型数和 `Router.default` 优先。
   - 顶部快捷动作收敛为载入配置、预览配置和刷新状态。
   - 本地就绪度直接从现有 view model 派生，不新增后端状态契约。

2. Quick configuration as the main path
   - 快速配置成为默认主任务：厂商模板、Model ID、API Key、上游模型和 API 地址集中展示。
   - 常用厂商模板保留点击填充能力，但在视觉上从辅助入口服务本地配置。
   - 高级 JSON 草稿、多模型、SmartRouter 和治理诊断继续保留在折叠高级配置中。

3. Advanced features hierarchy
   - 页面切换改为“本地工作台 / 高级特性”。
   - 远程接入、维护观测和高级路由移动到第二层入口。
   - 维护者工作台仍承接 auth、安全、model pool health、governance trace、metrics、benchmark 和归档。

4. Apple-inspired visual refresh
   - 样式切换到更克制的系统 UI：白 / 浅灰背景、细边线、低阴影、8px 圆角和蓝色强调。
   - 移除旧首页的大量并列状态卡压力，降低远程/维护信息在第一屏的干扰。
   - 继续用真实浏览器 smoke 看护桌面/移动无横向溢出。

## 发布边界

- 不改变 `/api/*` 契约和路由运行时语义。
- 不新增 React/Vite 前端栈；继续沿用当前 TypeScript 原生 DOM 模板。
- 不删除维护者能力，只调整默认信息层级和视觉优先级。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:ui
npm run build
npm run test:ui:browser
npm run test:closed-review
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁；本次 UI 改动已额外用生成概念图与浏览器截图做视觉对照。
