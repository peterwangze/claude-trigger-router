# Trigger 收编到 SmartRouter（统一路由引擎化）实施计划

> **统一进展承接说明（2026-04-21）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中对应 `P1` 主线的专项实施计划。
>
> 当前职责：承接“将 Trigger 收编到 SmartRouter，并把 SmartRouter 演进为统一路由引擎”的详细执行路径；对外口径收口属于该主线后置结果，而不是起始目标。

## 1. 计划定位

本计划对应统一进展基线中的主线：

- 将 Trigger 收编到 SmartRouter，并把 SmartRouter 演进为统一路由引擎

它不再以“先统一对外文案”为首要目标，而是先解决：

- 运行时是否真的以 SmartRouter 为统一入口
- Trigger 是否已经内收为 SmartRouter 的前置筛选能力
- 语义、粘连、上下文摘要等治理能力是否已经并入默认路由增强逻辑

只有这条逻辑主线成立后，README / setup / example config / `/ui` 的统一口径才有真实支撑。

## 2. 当前问题

当前实现虽然已经在配置层和决策顺序上做过统一收敛，但核心逻辑仍处于“旧模块编排 + 外层归一”的过渡状态：

1. `Router.routes / Router.decision / Router.defaults` 仍会被编译回 `TriggerRouter` / `SmartRouter` / `Governance`
2. `SmartRouter` 仍主要是 fallback 选择器，而不是统一路由引擎
3. `TriggerRouter` 仍是独立主链，不是 SmartRouter 的内收能力
4. `Governance.semantic / sticky / alignment` 仍以并列治理能力存在，而不是默认路由增强能力
5. 如果在此阶段先大面积统一对外口径，会出现“文案先统一、逻辑仍分叉”的落差

所以当前最主要的问题不是名称，而是：

- **SmartRouter 还没有真正成为统一路由入口**

## 3. 最终目标

完成后，运行时和配置层都应形成下面这套统一行为：

### 3.1 SmartRouter 成为统一路由入口

- `SmartRouter.enabled = false`
  - 不启用智能路由
  - 直接走默认路由配置
- `SmartRouter.enabled = true`
  - 启用统一路由引擎
  - 优先执行 SmartRouter 的路由逻辑
  - 未命中时由默认路由兜底

### 3.2 Trigger 内收为 SmartRouter 的前置能力

- 关键词 / 正则触发不再作为独立并列系统对外存在
- 而是 SmartRouter 内部第一层筛选能力
- 配置候选能力描述时，天然可以承接 Trigger 原本的高确定性命中前提

### 3.3 语义理解内收为 SmartRouter 的增强匹配

- 治理中的语义分析能力不再作为完全平行的能力面
- 而是并入 SmartRouter 的配置理解与路由判断

### 3.4 `router_model` 改为可选增强器

- 未配置 `router_model` 时：
  - 先关键词触发
  - 再语义增强匹配
  - 都未命中则走默认路由
- 配置 `router_model` 时：
  - 先关键词触发
  - 再语义增强匹配
  - 再由 `router_model` 结合：
    - 原始请求信息
    - 语义信息
    - 路由能力描述
    进行最终路由判断
  - 仍未命中则走默认路由

### 3.5 治理增强默认化

以下能力应默认开启，但允许显式关闭：

- 语义分析
- 语义粘连
- 上下文摘要提取
- 上下文摘要注入

也就是说，治理增强不再是额外外挂心智，而是 SmartRouter 的默认增强层。

## 4. 范围边界

### 本计划要做

1. SmartRouter runtime contract 定义
2. SmartRouter 配置结构演进
3. Trigger 前置能力内收
4. 语义增强与治理默认能力内收
5. 运行时 decision chain 重排与 trace / diagnostics 对齐
6. 在逻辑稳定之后，再推进 README / setup / example config / `/ui` 的口径收口

### 本计划暂不做

1. provider-specific compatibility 的新增抽象
2. 远程部署 / 多端接入
3. `/ui` 的双层工作台信息架构
4. 其他治理主线的长期运营化增强

这些内容属于其他专项主线，不在本计划第一轮中完成。

## 5. 实施阶段

### 阶段 C2-1：SmartRouter runtime contract 与配置结构

目标：

- 明确 SmartRouter 作为统一路由引擎时的配置 contract
- 不再把 `TriggerRouter` / `SmartRouter` / `Governance` 作为第一层并列运行时概念

涉及：

- `src/trigger/types.ts`
- `src/utils/config.ts`
- `src/models/compile.ts`

完成标准：

- 配置可以表达：
  - `enabled`
  - 关键词 / 正则前置能力
  - 语义增强能力
  - 可选 `router_model`
  - 默认兜底
  - 治理增强默认开关

### 阶段 C2-2：Trigger 前置能力内收与执行链重排

目标：

- 让 SmartRouter 真正成为统一执行入口
- Trigger 的规则匹配变成 SmartRouter 的第一阶段

涉及：

- `src/trigger/selector.ts`
- `src/trigger/index.ts`
- `src/router/index.ts`

完成标准：

- `SmartRouter.enabled = false` 时走默认路由
- `SmartRouter.enabled = true` 时按以下顺序执行：
  1. 关键词 / 正则触发
  2. 语义增强匹配
  3. `router_model` 决策（若已配置）
  4. 默认路由兜底

### 阶段 C2-3：治理默认能力内收

目标：

- 把语义分析、语义粘连、上下文摘要提取 / 注入纳入默认路由增强能力
- 保留显式关闭开关

涉及：

- `src/governance/*`
- `src/trigger/*`
- `src/router/*`

完成标准：

- 默认情况下这些能力参与路由增强
- 但仍可通过配置关闭
- trace / diagnostics / source labels 与新逻辑一致

### 阶段 C2-4：对外口径与模板收口

目标：

- 在核心逻辑稳定后，再统一 README / setup / example config / `/ui`

涉及：

- `README.md`
- `src/setup/index.ts`
- `config/trigger.example.yaml`
- `config/trigger.advanced.yaml`
- `src/server.ts`

完成标准：

- 对外不再先讲 TriggerRouter / SmartRouter 两套系统
- 统一表达为 SmartRouter 统一路由引擎
- Trigger 只保留为兼容说明或实现映射

## 6. 验收标准

本主线达到阶段闭环时，至少要满足：

1. SmartRouter 已成为统一路由入口
2. Trigger 已内收为 SmartRouter 的前置能力
3. `router_model` 可选且行为符合两种分支语义
4. 语义、粘连、上下文摘要等能力已默认纳入路由增强层，并支持显式关闭
5. routeSource / trace reason / diagnostics 已与新决策链一致
6. 对应 runtime / config / integration / E2E 测试已更新并通过
7. 在此基础上，对外口径、模板和 UI 再完成统一收口

## 7. 当前状态（2026-04-24）

当前状态：`closed`

当前闭环结论：

- SmartRouter 已成为统一路由运行时入口；`TriggerRouter` 类名仅作为兼容导出和文件边界保留。
- 关键词 / 正则规则已作为 SmartRouter 的 `rules` 前置能力执行，routeSource 与 trace reason 已从 `trigger_rule` 切换为 `smart_rule`。
- `router_model` 已是可选增强器：未配置时执行规则与语义增强后回落默认路由，配置时再进入 LLM 候选选择。
- legacy `llm_intent_recognition + intent_model` 已折入 SmartRouter semantic classifier；启用 SmartRouter 时不再并行跑独立 `intent_fallback` 主链。
- `semantic`、`sticky`、`sticky.alignment` 已作为 SmartRouter 默认增强层启用，并保留显式关闭开关。
- `Router.routes` / `Router.defaults` 归一后直接进入 SmartRouter runtime contract，不再额外派生并列的 `TriggerRouter` 或 Governance semantic / sticky 分支。
- 主请求链、响应链、同步路由、server 草稿视图、引用影响分析与保存 payload 已围绕 SmartRouter 派生 contract 工作。

本次阶段闭环验证：

- `npm test -- --run src/trigger/selector.test.ts src/trigger/trigger-router.test.ts src/utils/config.test.ts src/governance/trace.test.ts`
- `npm run build`

后续不再把“Trigger 收编到 SmartRouter”作为独立未闭环 P1 主线推进。README、setup、example config 与 `/ui` 的对外叙事和模板继续由“配置产品化最终收口”和“CLI / setup UX 重设计”承接。

## 8. 后续承接

后续应避免重新引入三套并列入口心智：

1. 运行时以 SmartRouter 为统一路由入口。
2. Trigger 只作为 SmartRouter 前置规则能力或 legacy 配置兼容名存在。
3. Governance 中的 semantic / sticky / alignment 默认路由增强能力优先投射到 SmartRouter；cascade、shadow、observability 继续作为治理/观测能力承接。
