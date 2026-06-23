# Release notes v1.20.6

`v1.20.6` 是 Web UI 智能路由工作流优化版。这个 patch release 承接 `v1.20.5` 的配置可见性，把 `/ui` 首页从工程字段堆叠调整为更贴近用户操作心智的基础配置、SmartRouter 初始化、规则/候选管理和路由管线预览。

## 本次闭环

1. Homepage workflow
   - 首页新增“基础配置 -> 智能路由 -> 规则管理 -> 预览保存”四步流程提示。
   - 快速配置区改名为基础配置，强调先接入可用模型，再决定默认路由和智能路由策略。
   - 样式调整为类 Apple 的白底简约卡片、细边框、轻阴影和系统字体节奏。

2. SmartRouter first-screen actions
   - 首页新增 SmartRouter 状态卡，直接展示 enabled 状态、rules、candidates 和 fallback。
   - 支持在首页初始化 SmartRouter，自动从当前 `Models` / `Router.default` 生成候选和基础策略草稿。
   - 支持从首页新增规则、新增候选、清空 SmartRouter 草稿。

3. Rules and candidates management
   - 首页新增规则摘要和候选模型摘要，常用场景可直接查看、删除。
   - “编辑”入口会展开高级配置，复杂规则、patterns、semantic、sticky、governance 仍由原有高级表单承接。
   - 首页操作复用同一份草稿和保存链路，不引入第二套配置状态。

4. Route rendering diagram
   - 路由示意图从线性文本节点升级为阶段化管线视图。
   - 未启用 SmartRouter 时展示 `用户请求 -> CTR -> Router.default -> 模型`。
   - 启用 SmartRouter 后展示策略、首条规则、fallback 和最终模型路径，保存前也能看到模板拟写入后的效果。

## 发布边界

- 不改变 `/api/*` 契约。
- 不改变实际路由运行时选择逻辑，只优化 UI 工作流、草稿操作和可视化反馈。
- 不新增前端框架；继续使用当前 TypeScript 原生 DOM 工作台。
- SmartRouter 首页操作最终仍写入既有 `SmartRouter` 草稿字段，并通过现有预览/保存链路生效。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:ui
npm run test:ui:browser
npm run release:verify
```

本次 UI 修改已通过 DOM smoke 和真实浏览器桌面/移动 smoke，覆盖首页加载、配置草稿同步、SmartRouter 摘要、动态路由示意图和无横向溢出看护。
