# Release notes v1.20.4

`v1.20.4` 定位为“Web UI 概念图一致性与国内厂商模板更新版”。这个 patch release 承接 `v1.20.3` 的本地优先工作台，并进一步让 `/ui` 对齐已确认的概念图：首屏突出本地状态、快速配置和常用模板，远程接入、维护观测与复杂路由继续归入高级特性。

## 本次闭环

1. Concept-aligned workbench
   - 顶部改为更明确的品牌区、页面分区和本地模式状态。
   - 本地状态改为横向状态带，优先展示服务、端口、模式、模型数和 `Router.default`。
   - 快速配置作为主路径，右侧保留高级特性入口，减少第一屏信息竞争。

2. Domestic provider template refresh
   - 常用模板分为“模型厂商”和“聚合平台”两组。
   - 模型厂商顺序调整为 GLM / DeepSeek / Kimi / MiniMax / GPT / Claude。
   - 聚合平台顺序调整为阿里百炼 / 火山引擎 / 百度千帆 / 讯飞星辰 / OpenRouter。
   - 模板默认值按当前公开 API 习惯更新，保留旧模板键的兼容读取边界。

3. Release clarity
   - README、配置指南和示例配置同步到新模板口径。
   - 发布指南和部署资产测试改为以 `v1.20.4` 作为本次 UI 变更承载版本。
   - 浏览器 smoke 继续看护桌面/移动真实布局，避免安装新版后仍看到旧 UI。

## 发布边界

- 不改变 `/api/*` 契约和路由运行时语义。
- 不新增 React/Vite 前端栈；继续沿用当前 TypeScript 原生 DOM 模板。
- 不删除远程和维护能力，只调整默认信息层级、视觉密度和模板分类。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:ui
npm run build
npm run test:ui:browser
npm run test:closed-review
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁；本次 UI 改动已额外用概念图与浏览器截图做视觉对照。
