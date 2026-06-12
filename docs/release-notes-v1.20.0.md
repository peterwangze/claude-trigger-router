# Release notes v1.20.0

`v1.20.0` 定位为“发布与进展治理可持续化版”。这个 minor release 不改变模型配置、路由选择或运行时转发语义，重点把 v1.19.x 连续稳定性修复沉淀成长期发布门禁和进展治理机制，减少“已经闭环但真实用户又踩中”的情况。

## 本次闭环

1. Release gate hardening
   - `release:verify`、`Release Check` 和 `Publish Package` 固定执行 `npm run test:stream-stability`。
   - stream stability gate 覆盖 rewriteStream、SSE parser、stream governance、startup wiring、route UX 和关键 packaged CLI slice。
   - 发布前不再依赖人工记得额外跑断流专项。

2. Closed item review gate
   - 新增 `npm run test:closed-review`。
   - 自动检查统一基线近期执行顺序中的 closed 事项是否保留回归触发口径。
   - 确认 PI-009 这类“closed 事项文档结论与实现漂移”的问题记录仍作为制度化反例存在。

3. Progress governance links
   - `test:closed-review` 同时检查统一基线、版本路线和问题记录之间的关键互链。
   - 检查默认推进版本口径，防止新增事项绕过统一入口或多入口互相打架。
   - v1.20.0 之后的版本演进默认继续以版本计划入口为排期事实源，再回到统一基线确认状态。

## 发布边界

- 不改变用户配置字段、provider 模板、SmartRouter 行为或 `/ui` 配置向导语义。
- 不新增模型调用能力；本次是发布工程和进展治理机制化。
- 不替代人工复审；`test:closed-review` 是最低治理线，用来拦截缺少回归触发口径、入口互链或问题记录规则的漂移。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:stream-stability
npm run test:closed-review
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
