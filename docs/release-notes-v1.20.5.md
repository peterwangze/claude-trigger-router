# Release notes v1.20.5

`v1.20.5` 是 Web UI 配置可见性与路由路径修正版。这个 patch release 继续承接 `v1.20.4` 的概念图一致性，把用户配置、模板选择和保存前后的路由结果放到第一屏可确认的位置。

## 本次闭环

1. Realtime config visibility
   - 快速配置区新增“当前配置”快照，实时展示 `Runtime`、监听地址、`Router`、`Models`、`SmartRouter` 和 `Governance` 摘要。
   - API key 只做脱敏展示，方便核对配置来源但不暴露完整密钥。

2. Dynamic route path
   - 首屏新增路由路径示意图，展示请求进入本地 CTR、命中 `Router.default`、转发到模型厂商和上游模型的完整链路。
   - 点击厂商模板后立即显示“新增模型/更新模型”的拟写入路径，保存前就能确认 `Router.default` 将指向哪里。

3. Safer quick config
   - 一键配置改为合并写入：相同 `Model ID` 更新现有模型，不同 `Model ID` 新增模型。
   - 不再因为快速配置而清空已有 `Models`、`Router` 其他槽位、`SmartRouter`、`Governance` 等高级配置。
   - 模板写入保留 `provider_template` 和 `metadata.vendor_hint`，后续回填和厂商识别更稳定。

4. Template and button behavior
   - 既有配置回填新增 Z.ai、Moonshot、MiniMax、百炼、方舟、千帆、讯飞星辰等域名识别。
   - 高级 Models 表单里的“应用模板”会真正刷新 API、默认模型和 vendor hint，同时保留用户自己的 id/key。
   - Anthropic/OpenRouter 示例模型同步到当前模板口径。

## 发布边界

- 不改变 `/api/*` 契约。
- 不改变实际路由运行时选择逻辑，只修复 UI 配置写入与可视化反馈。
- 不新增前端框架；继续使用当前 TypeScript 原生 DOM 工作台。

## 发布前验证

本版本发布前至少执行：

```bash
npm test -- --run src/ui/workbench.dom.test.ts src/server.test.ts src/provider-presets.test.ts src/setup/templates.test.ts
npm run build
npm run test:ui:browser
npm run release:verify
```

本次已额外通过内置 Browser 对 `/ui` 做桌面与移动端渲染、模板点击、控制台健康和无横向溢出验证。
