# Release notes v1.13.0

`v1.13.0` 定位为“核心路由用户体感与看护补强版”。这个版本不继续扩展低频能力，而是回到普通用户每天最容易感知的基础路由与 SmartRouter：请求会走哪个模型、为什么这么走、是否会增加首包等待、错误是否可读，以及发布前能不能稳定拦住慢、卡、错路由回归。

## 本次主线

1. 路由预演入口。
   - 新增 `ctr doctor --route-preview`，支持 `--route-text`、`--route-model`、`--route-thinking`、`--route-web-search` 和 `--route-tokens`。
   - 预演不调用上游模型，也不调用 SmartRouter LLM，因此不会消耗额度；它会解释基础路由槽位、SmartRouter rule/semantic 预测、候选 LLM 选模的 pending 状态和额外等待风险。

2. 基础路由触发解释收口。
   - README、配置指南和 setup next steps 已统一基础路由顺序：显式上游模型 -> `longContext` -> `background` -> `think` -> `webSearch` -> `default`。
   - 文档明确显式 `provider,model` 会绕过基础槽位，`background` 当前只识别 Claude Code 的 `claude-3-5-haiku*` 后台请求，context window guard 仍可能 fallback 到 `Router.longContext`。

3. SmartRouter 起步模板降心智成本。
   - `config/trigger.smart-router.yaml` 改为两模型起步模板，只保留 `sonnet`、`reasoner`、`architecture` 和 `review`。
   - 原高级组合迁移到 `config/trigger.smart-router.advanced.yaml`，承接 semantic/sticky/governance、本地 fast model 和多候选调优。

4. SmartRouter 协作口径校准。
   - README 和配置指南明确当前默认仍是单模型 `route_only`。
   - `verify_only`、`compare_then_arbiter`、`cascade_on_evidence` 作为策略 contract、trace/UI 信号和后续演进边界存在，不默认并发调用额外模型。

5. 核心路由用户体感专项门禁。
   - 新增 `npm run test:route-ux`。
   - 专项覆盖 route preview、doctor 可读输出、SmartRouter 规则/候选 packaged slice、首包即时输出、上游中途断流可读 SSE error、远程中转取消上游和结构化 API error。

## 发布边界

- 本版本不新增默认多模型并发执行，不改变 `v1.10.0` 的协作 contract 能力边界。
- 本版本不替代 `v1.12.0` 的传输韧性修复；上游中途断流、远程中转取消和 SSE parser 可靠性继续作为回归底线。
- `ctr doctor --route-preview` 是确定性预演工具，不等价于真实 SmartRouter LLM 最终选择；当配置了 `router_model + candidates` 时，它会明确提示运行时仍需等待 SmartRouter 选择。

## 验证

本版本收口前至少需要通过：

```bash
npm run test:route-ux
npm run release:verify
```

本轮新增和复核的 targeted 看护：

- `src/router/route-preview.test.ts`
- `src/doctor/index.test.ts`
- `src/governance/stream-response-governance.test.ts`
- `src/index-startup.test.ts`
- `src/e2e/cli-e2e.test.ts` SmartRouter packaged slices
- `src/deploy-assets.test.ts`
