# v1.4.0 Release Notes

`v1.4.0` 定位为“SmartRouter 常用体验版”。这个版本把 CTR 的智能路由从“有能力但需要理解内部机制”推进到“能复制模板、能配置候选、能看懂为什么选模、能发现切换割裂，并能按配置路径调优”。

## 本次发布主线

- SmartRouter 规则模板：新增 `config/trigger.smart-router.yaml`，覆盖 coding、review、architecture、long_context、fast_reply 等高频任务。
- SmartRouter 配置解释：`/api/models/compiled` 和草稿 preview 返回归一化 explanation，`/ui` 展示规则顺序、候选模型、router_model、semantic/sticky 开关和 fallback。
- 候选模型向导：`/ui` Candidate guide 检查 fast / balanced / deep / long-context 候选覆盖，并支持把建议模型加入 `SmartRouter.candidates` 草稿。
- 路由决策可解释性：governance trace 记录 route source、rule、confidence、选中模型和 fallback reason，`/ui` 展示最近请求的可读 route decision。
- 切换体感治理：switch continuity summary 把 initial/final model、sticky、alignment、cascade 和 route source 合成为 stable / aligned / watch / critical 状态。
- 配置路径级调优建议：health routing tuning 将 context window、switch without alignment、switch cascade risk 和 slow route group 转成 `configSuggestions`，指向 `Router.longContext`、`SmartRouter.sticky.alignment`、`SmartRouter.rules`、`SmartRouter.candidates` 等可操作建议。

## 发布边界

本版本聚焦本地 SmartRouter 常用体验，不把 CTR 宣称为完整 benchmark 运营平台或完整 server/cloud 托管平台。以下事项进入后续版本，但不作为 `v1.4.0` 发布承诺：

- benchmark 历史看板。
- 人工校准 UI 表单。
- 固定任务集按核心路由场景重排。
- `ctr eval` 与真实 trace 的统一收益解释口径。
- 服务端安全默认策略、密钥轮换手册、主动 pool health、成本/速率元数据和更多调度策略。

对用户的建议口径是：`v1.4.0` 已经适合把 SmartRouter 用作日常多模型组合入口；如果要证明长期质量/速度收益，仍应结合 `ctr eval`、真实 trace 和后续 v1.5.0 的运营化能力。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.4.0`
- `ctr version` 输出 `Version: 1.4.0`
- `v1.4.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.4.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
