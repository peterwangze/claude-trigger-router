# Release notes v1.14.0

`v1.14.0` 定位为“配置产品化最终收口版”。这个版本不扩展新的路由策略，而是把用户每天会接触的配置入口收敛到同一套字段、同一套槽位解释、同一套 capability warning action 和同一套保存/预览 contract。

## 本次主线

1. `Models` 字段心智统一。
   - 新配置统一推荐 `Models[].id/api/key/interface/model/thinking/metadata`。
   - `api_base_url/api_key/protocol` 继续兼容读取，但 doctor 修复、UI 保存和配置写回会回到推荐字段。
   - README、配置指南、setup 问答、doctor 和 `/ui` 字段说明已统一口径。

2. 路由槽位配置产品化。
   - setup 完成提示给出 `config/trigger.routing.yaml`、SmartRouter 起步/高级模板和逐槽位 route preview 参数。
   - doctor 槽位体检输出基础路由顺序和验证命令。
   - route preview 固定展示判断顺序：显式上游模型 -> `longContext` -> `background` -> `think` -> `webSearch` -> `default`。

3. capability warning action 一致。
   - `thinking_ignored` 保持 warning，并给出移除 `thinking` 或确认 reasoning 能力的 action。
   - `tools_text_fallback`、`images_text_fallback`、`context_window_hint_missing`、`safe_input_hint_missing` 保持 info，并在 CLI、doctor、setup、保存 API 和 `/ui` 中复用同一条 action。
   - context metadata 提示只在配置了 `Router.longContext`、确实需要容量比较和 fallback 时出现，避免打扰最小可用配置。

4. 配置保存与预览一致性看护。
   - `POST /api/config` 成功和失败都返回 `capabilityWarnings` 与统一 `issueReport`。
   - 保存成功返回 canonical `normalizedConfig`，`/ui` 会刷新草稿并保留保存响应中的 warning/action。
   - 保存写回继续输出推荐字段，不把旧别名重新写进 `Models[]`。

## 发布边界

- 本版本不改变基础路由和 SmartRouter 的运行时选择顺序。
- 本版本不新增默认多模型并发执行。
- 本版本不替代 v1.12.0/v1.13.0 的流式稳定性和核心路由用户体感门禁；这些继续作为回归底线。

## 验证

本版本收口前至少需要通过：

```bash
npx vitest --run src/doctor/index.test.ts src/setup/index.test.ts src/setup/setup.test.ts src/server.test.ts src/ui/workbench.dom.test.ts src/router/route-preview.test.ts src/deploy-assets.test.ts src/utils/validation-contract.test.ts
npm run release:verify
```

本轮新增和复核的 targeted 看护：

- `src/doctor/index.test.ts`
- `src/setup/index.test.ts`
- `src/setup/setup.test.ts`
- `src/server.test.ts`
- `src/ui/workbench.dom.test.ts`
- `src/router/route-preview.test.ts`
- `src/deploy-assets.test.ts`
- `src/utils/validation-contract.test.ts`
