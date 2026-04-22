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

## 7. 当前状态（2026-04-21）

当前已完成：

- 在统一进展基线中单独列出该主线
- 已识别此前把“对外口径收口”放在“核心逻辑演进”之前的顺序偏差
- 已将这条主线重新校准为：先完成 SmartRouter 统一路由引擎化，再继续收口对外口径
- SmartRouter runtime contract 第一轮已开始落地：
  - `router_model` 改为可选
  - SmartRouter 已可直接承载内收规则、语义增强与 sticky 默认增强配置
  - selector / trigger 入口已开始优先消费 SmartRouter 的新 contract，而不再只看旧 Trigger/Governance 分支
- 主请求链与响应链已开始接入 SmartRouter 默认增强：
  - 上下文摘要注入优先从 SmartRouter sticky alignment 读取
  - sticky 会话持久化不再强依赖 Governance 总开关
  - smart routing 的 trace reason 已开始去掉旧的 `smart_decision` 过渡命名
- legacy intent 识别已开始内收到 SmartRouter 语义增强：
  - 旧的 `llm_intent_recognition + intent_model` 会在 runtime 中被编译进 SmartRouter semantic classifier
  - 启用 SmartRouter 时，不再默认并行跑独立的 `intent_fallback` 主链
- SmartRouter 默认增强已开始默认打开：
  - `semantic`
  - `sticky`
  - `sticky.alignment`
  在 SmartRouter 启用时默认生效，但仍可显式关闭
- `routeSync` 已开始对齐统一路由主链，不再只是旧 Trigger-only 规则匹配
- Trigger runtime 的启停语义已开始挂到派生后的 SmartRouter contract 上，不再继续双看 Trigger/Smart 两套开关

当前未完成：

- Trigger 仍未完全内收到 SmartRouter 运行时主链，当前仍保留兼容分支
- 治理默认能力尚未完全转化为 SmartRouter 默认增强层，当前仍处于“主请求链 / 响应链部分桥接，其他治理分支仍保留旧入口”的阶段
- routeSource / trace reason / diagnostics 仍未完全统一为 SmartRouter 统一路由引擎语义
- README / setup / example config / `/ui` 的继续收口应后置，不再作为当前第一阶段目标

## 8. 推荐执行顺序

建议按下面顺序推进，而不是继续先改口径：

1. 先做 SmartRouter runtime contract
2. 再做 Trigger 前置能力内收
3. 再做治理默认能力内收
4. 最后再做 README / setup / example config / `/ui` 收口

这样可以保证：

- 逻辑先成立
- 口径再统一
- 避免再次出现“文案先行、行为滞后”的问题
