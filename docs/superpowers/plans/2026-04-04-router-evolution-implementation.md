# Router 治理化演进实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Claude Trigger Router 上，分阶段落地 Sticky Routing、Context Alignment、Cascade Reasoning Gate、Semantic Router 和 Shadow Supervisor，使项目具备基础模型治理能力。

**Architecture:** 采用“先治理底座，再逐项接入能力”的方式。新逻辑集中在 `src/governance/`，现有 `src/trigger/`、`src/router/`、`src/utils/config.ts` 和 `src/server.ts` 只做集成与配置承接。所有高级能力均需支持独立开关、独立测试、独立降级。

**Tech Stack:** TypeScript, Vitest, Node.js, 本地配置 YAML/JSON, 现有 `TriggerRouter` / `SmartRouter` / `service-health` / `setup`

---

## File Structure

- Create: `src/governance/types.ts`
- Create: `src/governance/index.ts`
- Create: `src/governance/trace.ts`
- Create: `src/governance/session-store.ts`
- Create: `src/governance/context-alignment.ts`
- Create: `src/governance/semantic-router.ts`
- Create: `src/governance/cascade-gate.ts`
- Create: `src/governance/shadow-supervisor.ts`
- Create: `src/governance/*.test.ts`
- Modify: `src/utils/config.ts`
- Modify: `src/constants.ts`
- Modify: `src/trigger/index.ts`
- Modify: `src/trigger/selector.ts`
- Modify: `src/router/index.ts`
- Modify: `src/server.ts`
- Modify: `config/trigger.example.yaml`
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`

## Hard Rules

- 所有治理能力默认关闭，开启后也必须支持子开关。
- `Governance.enabled = false` 时，行为必须退化回当前稳定主链。
- Sticky 命中只能是“偏好”，不能无条件覆盖显式强规则。
- Cascade 升级必须有最大重试次数，禁止无限重入。
- Shadow Supervisor 第一阶段只允许异步审计，不得默认同步阻断。
- Context Alignment 失败时必须放行，但要记录 trace。
- 任何新能力接入都必须输出结构化 trace，不能只打散乱日志。

## Milestones

1. 治理配置骨架与 trace 能力完成
2. Session State + Sticky Routing 完成
3. Context Alignment 完成
4. Cascade Reasoning Gate 完成
5. Semantic Router 完成
6. Shadow Supervisor 完成
7. 文档、示例配置、全量测试与构建通过

---

## Chunk 1: 治理底座与配置骨架

### Task 1: 定义 Governance 类型与默认配置

**Files:**
- Create: `src/governance/types.ts`
- Modify: `src/trigger/types.ts`
- Modify: `src/constants.ts`
- Modify: `src/utils/config.ts`

- [ ] **Step 1: 为治理模块新增类型**

定义至少这些结构：
- `IGovernanceConfig`
- `IStickyRoutingConfig`
- `IContextAlignmentConfig`
- `ICascadeGateConfig`
- `ISemanticRouterConfig`
- `IShadowSupervisorConfig`
- `IGovernanceTrace`

- [ ] **Step 2: 在应用配置中接入 `Governance?` 顶层字段**
- [ ] **Step 3: 增加默认配置常量和校验逻辑**
- [ ] **Step 4: 为配置校验补测试**

Run: `npm test -- --run src/setup/*.test.ts src/trigger/*.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/types.ts src/trigger/types.ts src/constants.ts src/utils/config.ts
git commit -m "feat(governance): add governance config schema"
```

### Task 2: 建立结构化治理 trace

**Files:**
- Create: `src/governance/trace.ts`
- Create: `src/governance/trace.test.ts`
- Modify: `src/server.ts`
- Modify: `src/utils/log.ts`

- [ ] **Step 1: 先写 trace 创建与追加记录的失败测试**
- [ ] **Step 2: 实现 `createGovernanceTrace()`、`appendTraceReason()`、`finalizeTrace()`**
- [ ] **Step 3: 在请求入口生成 `requestId` 并串联到日志**
- [ ] **Step 4: 让现有 TriggerRouter / SmartRouter 路由原因进入 trace**

Run: `npm test -- --run src/governance/trace.test.ts src/trigger/*.test.ts src/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/trace.ts src/governance/trace.test.ts src/server.ts src/utils/log.ts
git commit -m "feat(governance): add structured routing trace"
```

---

## Chunk 2: Session State 与 Sticky Routing

### Task 3: 实现 Session State Store

**Files:**
- Create: `src/governance/session-store.ts`
- Create: `src/governance/session-store.test.ts`

- [ ] **Step 1: 先写内存存储的失败测试**

覆盖：
- set/get
- TTL 过期
- clear
- 同 session 覆盖更新

- [ ] **Step 2: 实现内存版 `SessionStateStore`**
- [ ] **Step 3: 预留可选文件持久化接口，但第一版不强制启用**

Run: `npm test -- --run src/governance/session-store.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/governance/session-store.ts src/governance/session-store.test.ts
git commit -m "feat(governance): add session state store"
```

### Task 4: 在路由前接入 Sticky Routing

**Files:**
- Create: `src/governance/sticky-routing.test.ts`
- Modify: `src/trigger/index.ts`
- Modify: `src/trigger/selector.ts`
- Modify: `src/router/index.ts`

- [ ] **Step 1: 写 sticky 命中与 break 条件失败测试**

至少覆盖：
- 同会话同任务优先复用最近成功模型
- 显式规则命中时允许打破 sticky
- 长上下文切换时允许打破 sticky
- 没有 sessionKey 时退化为原有逻辑

- [ ] **Step 2: 实现 sticky 决策函数**
- [ ] **Step 3: 将 sticky 结果写入 trace**
- [ ] **Step 4: 请求完成后回写 `lastSuccessfulModel`**

Run: `npm test -- --run src/governance/sticky-routing.test.ts src/trigger/*.test.ts src/router/*.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance src/trigger/index.ts src/trigger/selector.ts src/router/index.ts
git commit -m "feat(governance): add sticky routing policy"
```

---

## Chunk 3: Context Alignment

### Task 5: 实现模型切换时的 Context Alignment

**Files:**
- Create: `src/governance/context-alignment.ts`
- Create: `src/governance/context-alignment.test.ts`
- Modify: `src/trigger/index.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: 写“模型未切换时不生成摘要”的失败测试**
- [ ] **Step 2: 写“模型切换时生成并注入摘要”的失败测试**
- [ ] **Step 3: 实现摘要请求封装与注入逻辑**
- [ ] **Step 4: 摘要长度、失败降级、trace 回写全部补齐**

Run: `npm test -- --run src/governance/context-alignment.test.ts src/trigger/*.test.ts src/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/context-alignment.ts src/governance/context-alignment.test.ts src/trigger/index.ts src/server.ts
git commit -m "feat(governance): add context alignment on model switch"
```

---

## Chunk 4: Cascade Reasoning Gate

### Task 6: 实现失败证据识别

**Files:**
- Create: `src/governance/cascade-gate.ts`
- Create: `src/governance/cascade-gate.test.ts`

- [ ] **Step 1: 先写失败证据提取测试**

至少覆盖：
- 编译失败
- 测试失败
- `TODO`
- `...rest of code`
- 空输出或过短输出

- [ ] **Step 2: 实现 `detectFailureEvidence()`**
- [ ] **Step 3: 实现升级层级决策函数**

Run: `npm test -- --run src/governance/cascade-gate.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/governance/cascade-gate.ts src/governance/cascade-gate.test.ts
git commit -m "feat(governance): add cascade gate evidence detection"
```

### Task 7: 在主链接入自动升级

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/server.ts`
- Modify: `src/trigger/index.ts`

- [ ] **Step 1: 写“首轮失败触发升级”的失败测试**
- [ ] **Step 2: 写“达到最大次数后停止升级”的失败测试**
- [ ] **Step 3: 实现标准档 -> 高推理档 -> 抢救档升级路径**
- [ ] **Step 4: 升级请求携带原始失败证据和上下文摘要**
- [ ] **Step 5: 记录升级前后模型、耗时与结果**

Run: `npm test -- --run src/governance/cascade-gate.test.ts src/router/*.test.ts src/server.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/router/index.ts src/server.ts src/trigger/index.ts
git commit -m "feat(governance): wire cascade reasoning escalation"
```

---

## Chunk 5: Semantic-Augmented Trigger

### Task 8: 实现语义意图接口与原型匹配

**Files:**
- Create: `src/governance/semantic-router.ts`
- Create: `src/governance/semantic-router.test.ts`
- Modify: `src/trigger/selector.ts`

- [ ] **Step 1: 先写 prototype 匹配与阈值判断测试**
- [ ] **Step 2: 实现 `analyzeSemanticIntent()` 接口**
- [ ] **Step 3: 实现 embedding/classifier 双模式占位结构**
- [ ] **Step 4: 先接入最小可用模式：prototype + 可注入分类器**

Run: `npm test -- --run src/governance/semantic-router.test.ts src/trigger/selector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/semantic-router.ts src/governance/semantic-router.test.ts src/trigger/selector.ts
git commit -m "feat(governance): add semantic intent router"
```

### Task 9: 调整决策顺序为“规则 -> 语义 -> SmartRouter”

**Files:**
- Modify: `src/trigger/index.ts`
- Modify: `src/trigger/selector.ts`
- Modify: `README.md`

- [ ] **Step 1: 写集成测试验证顺序**
- [ ] **Step 2: 实现顺序调整与 trace 输出**
- [ ] **Step 3: 文档更新路由优先级说明**

Run: `npm test -- --run src/trigger/*.test.ts src/governance/*.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/trigger/index.ts src/trigger/selector.ts README.md
git commit -m "feat(governance): place semantic routing before smart router"
```

---

## Chunk 6: Shadow Supervisor

### Task 10: 实现异步影子审查

**Files:**
- Create: `src/governance/shadow-supervisor.ts`
- Create: `src/governance/shadow-supervisor.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: 先写异步审查不阻断主链的失败测试**
- [ ] **Step 2: 写规则审查失败测试**
- [ ] **Step 3: 实现规则审查器与可注入 verifier**
- [ ] **Step 4: 在 `async_audit` 模式下记录审查结果与风险级别**

Run: `npm test -- --run src/governance/shadow-supervisor.test.ts src/server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance/shadow-supervisor.ts src/governance/shadow-supervisor.test.ts src/server.ts
git commit -m "feat(governance): add async shadow supervisor"
```

### Task 11: 为高风险场景预留同步守卫能力

**Files:**
- Modify: `src/governance/shadow-supervisor.ts`
- Modify: `src/governance/types.ts`

- [ ] **Step 1: 加入 `sync_guard` 模式配置结构**
- [ ] **Step 2: 第一版只接线，不默认开启**
- [ ] **Step 3: 确保未开启时无行为变化**

Run: `npm test -- --run src/governance/shadow-supervisor.test.ts src/governance/*.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/governance/shadow-supervisor.ts src/governance/types.ts
git commit -m "feat(governance): reserve sync guard mode"
```

---

## Chunk 7: 文档、示例配置与最终验证

### Task 12: 更新示例配置和用户文档

**Files:**
- Modify: `config/trigger.example.yaml`
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`

- [ ] **Step 1: 为 `Governance` 增加可复制示例**
- [ ] **Step 2: 在 README 中新增治理模式说明**
- [ ] **Step 3: 在配置指南中给出低成本和高质量两套预设**

- [ ] **Step 4: Commit**

```bash
git add config/trigger.example.yaml README.md docs/configuration-guide.md
git commit -m "docs: add governance configuration examples"
```

### Task 13: 跑全量验证

**Files:**
- Verify only

- [ ] **Step 1: 跑治理模块测试**

Run: `npm test -- --run src/governance/*.test.ts`
Expected: PASS

- [ ] **Step 2: 跑路由相关回归测试**

Run: `npm test -- --run src/trigger/*.test.ts src/router/*.test.ts src/server.test.ts`
Expected: PASS

- [ ] **Step 3: 跑全量测试**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 4: 跑构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/governance src/trigger src/router src/server.ts src/utils/config.ts README.md docs config
git commit -m "feat: add router governance foundation"
```

## Completion Criteria

- [ ] `Governance` 配置结构、默认值和校验已落地
- [ ] 请求 trace 能追踪 sticky / semantic / smart / cascade / shadow 全链路
- [ ] Sticky Routing 与 Context Alignment 可工作且可关闭
- [ ] Cascade Gate 能根据失败证据自动升级，且有最大尝试次数
- [ ] Semantic Router 已接入主链并可配置阈值
- [ ] Shadow Supervisor 已支持异步审计
- [ ] `npm test -- --run` 全部通过
- [ ] `npm run build` 通过

Plan complete and saved to `docs/superpowers/plans/2026-04-04-router-evolution-implementation.md`. Ready to execute?
