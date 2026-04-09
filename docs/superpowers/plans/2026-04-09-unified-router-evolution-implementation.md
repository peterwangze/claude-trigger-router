# Unified Router Evolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `TriggerRouter + SmartRouter + Governance` 的组合实现收敛为一套统一 Router 决策系统，严格按“运行时链路统一 -> 默认治理边界稳定 -> schema/兼容保真 -> 写出链路 -> setup/UI/docs 输出统一化”的顺序落地。

**Architecture:** 实施分成 6 个 chunk。先只改运行时与 trace，确保 `rule -> semantic -> smart decision -> sticky correction -> context alignment` 成立；再锁定 sticky/alignment/semantic 默认边界与 observability 保真；随后才引入 unified Router schema、migration diagnostics 与参数保真；最后补齐 setup 持久化、`/ui`、example config 和文档。所有任务均以最小 TDD 步骤推进，不允许在早期阶段提前切换 setup/UI 默认输出。

**Tech Stack:** TypeScript, Vitest, Fastify, js-yaml, existing trigger/governance/setup/config modules in Claude Trigger Router

---

## Sequence Guard

Implementation order is mandatory:
1. runtime decision chain and trace
2. default-governance boundaries (cost, fallback, disable granularity, observability preservation)
3. unified schema normalization and parameter preservation
4. unified write path / persistence
5. setup / UI / example config
6. docs and final verification

Do not start steps 3-5 until step 2 is test-backed and green.

## File Map

**Runtime chain**
- Modify: `src/trigger/selector.ts` — 统一 Router 决策链编排，重排 rule/semantic/smart/sticky/alignment 顺序。
- Modify: `src/trigger/index.ts` — 更新 route source、trace reason、统一日志文案。
- Modify: `src/trigger/types.ts` — 扩展统一 Router 决策元数据与后续 unified schema 类型。
- Modify: `src/trigger/smart-router.ts` — 支持结构化 router hint、预筛选候选摘要输入。
- Modify: `src/governance/semantic-router.ts` — 支持 semantic profile 与 description fallback。
- Modify: `src/governance/trace.ts` — 统一 trace reason、记录阶段与默认治理动作。
- Modify: `src/governance/context-alignment.ts` — 明确 alignment 触发条件与失败 trace。
- Modify: `src/governance/session-store.ts` — 支撑 sticky correction 的状态读取与写回。

**Config / compatibility / persistence**
- Modify: `src/utils/config.ts` — 双读 unified/legacy schema、参数保真校验、migration matrix。
- Modify: `src/server.ts` — preview / diagnostics / `/ui` unified Router 展示。
- Modify: `src/setup/types.ts` — setup 侧 unified Router 类型。
- Modify: `src/setup/templates.ts` — 统一 Router 模板输出。
- Modify: `src/setup/index.ts` — setup 向导改为 unified Router 心智。
- Modify: `src/setup/persist.ts` — setup 保存链路默认写 unified Router 结构。
- Modify: `config/trigger.example.yaml` — unified Router 示例与兼容说明。

**Docs**
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`
- Modify: `docs/models-migration-guide.md`

**Primary tests**
- Modify: `src/trigger/selector.test.ts`
- Modify: `src/trigger/smart-router.test.ts`
- Modify: `src/governance/semantic-router.test.ts`
- Modify: `src/utils/config.test.ts`
- Modify: `src/server.test.ts`
- Modify: `src/setup/index.test.ts`
- Modify: `src/setup/templates.test.ts`

## Chunk 1: Runtime Decision Chain

### Task 1: Expand unified route-source metadata

**Files:**
- Modify: `src/trigger/types.ts`
- Test: `src/trigger/selector.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests in `src/trigger/selector.test.ts` for the new route-source vocabulary:

```ts
it('labels semantic route hits as semantic_match', async () => {
  expect(result.routeSource).toBe('semantic_match');
});

it('labels sticky reuse after smart evaluation as sticky_correction', async () => {
  expect(result.routeSource).toBe('sticky_correction');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trigger/selector.test.ts`
Expected: FAIL because `routeSource` union/runtime results do not yet support the new values.

- [ ] **Step 3: Write minimal implementation**

Update `src/trigger/types.ts` so `IAnalysisResult.routeSource` can represent the unified phases.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/trigger/selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/types.ts src/trigger/selector.test.ts
git commit -m "refactor: expand unified router decision metadata"
```

### Task 2: Reorder `ModelSelector` to `rule -> semantic -> smart -> sticky correction`

**Files:**
- Modify: `src/trigger/selector.ts`
- Test: `src/trigger/selector.test.ts`

- [ ] **Step 1: Write the failing test**

Add order-sensitive tests:

```ts
it('evaluates semantic match before smart router and before sticky correction', async () => {
  // semantic should win over later phases.
});

it('applies sticky correction only after smart router picks a model', async () => {
  // sticky acts as correction, not pre-filter.
});

it('does not let sticky correction override an explicit trigger rule', async () => {
  // rule should still win.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trigger/selector.test.ts`
Expected: FAIL because current implementation still runs sticky before semantic/smart routing.

- [ ] **Step 3: Write minimal implementation**

Refactor `src/trigger/selector.ts` so the order is:
1. keyword/regex rule
2. semantic match
3. smart router
4. sticky correction
5. optional legacy intent fallback only if still required during compatibility window

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/trigger/selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/selector.ts src/trigger/selector.test.ts
git commit -m "refactor: reorder unified router decision chain"
```

### Task 3: Align trace reasons and trigger logs with unified phases

**Files:**
- Modify: `src/trigger/index.ts`
- Modify: `src/governance/trace.ts`
- Test: `src/trigger/selector.test.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions such as:

```ts
expect(req.governanceTrace.routeReason).toContain('semantic_match:architecture');
expect(req.governanceTrace.routeReason).toContain('sticky_correction');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trigger/selector.test.ts src/server.test.ts`
Expected: FAIL because trace reason names still use legacy labels.

- [ ] **Step 3: Write minimal implementation**

Update `src/trigger/index.ts` and `src/governance/trace.ts` so semantic hits, sticky correction, smart-router decisions, and alignment use unified reason strings.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/trigger/selector.test.ts src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/index.ts src/governance/trace.ts src/trigger/selector.test.ts src/server.test.ts
git commit -m "refactor: align trace reasons with unified router phases"
```

## Chunk 2: Default Governance Boundaries

### Task 4: Make sticky/alignment/semantic defaults observable and disable-able

**Files:**
- Modify: `src/trigger/selector.ts`
- Modify: `src/governance/context-alignment.ts`
- Modify: `src/governance/session-store.ts`
- Modify: `src/governance/trace.ts`
- Test: `src/trigger/selector.test.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for governance boundaries:

```ts
it('records when sticky correction is skipped because explicit routing wins', async () => {
  expect(req.governanceTrace.routeReason).toContain('sticky_skipped:explicit_route');
});

it('records alignment failure without blocking the final model decision', async () => {
  expect(result.matched).toBe(true);
  expect(req.governanceTrace.routeReason).toContain('alignment_failed');
});

it('allows semantic default behavior to be disabled explicitly', async () => {
  expect(result.routeSource).toBe('smart_router');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trigger/selector.test.ts src/server.test.ts`
Expected: FAIL because boundary behavior is not fully encoded.

- [ ] **Step 3: Write minimal implementation**

Implement only the runtime changes needed to make sticky/alignment/semantic defaults explainable and observable.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/trigger/selector.test.ts src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/selector.ts src/governance/context-alignment.ts src/governance/session-store.ts src/governance/trace.ts src/trigger/selector.test.ts src/server.test.ts
git commit -m "refactor: stabilize unified router default governance boundaries"
```

### Task 5: Lock governance budgets and observability preservation

**Files:**
- Modify: `src/utils/config.ts`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that ensure:

```ts
it('preserves observability anomaly thresholds during unified migration', () => {
  expect(result.config.Governance?.observability?.anomaly_thresholds?.cascade_warn_rate).toBe(0.4);
});

it('keeps sticky alignment summary budget configurable and validated', () => {
  expect(result.errors).toEqual([]);
});

it('allows disabling semantic defaults without removing route semantics entirely', () => {
  expect(result.errors).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Extend validation/normalization only enough to preserve observability fields, sticky alignment budget fields, and semantic enable/disable boundaries.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts src/utils/config.test.ts
git commit -m "test: lock unified router governance boundary parameters"
```

## Chunk 3: Unified Schema and Compatibility

### Task 6: Introduce route-level semantic profile types and config shape

**Files:**
- Modify: `src/trigger/types.ts`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add config normalization tests for a unified route shape:

```ts
it('accepts route semantic profiles in unified Router schema', () => {
  const result = normalizeAndValidateConfig({
    Router: {
      default: 'sonnet',
      routes: [{
        name: 'architecture',
        model: 'opus',
        description: '架构设计',
        priority: 90,
        match: {
          semantic: true,
          semantic_profile: {
            threshold: 0.2,
            prototype: '重构 系统 结构 模块 拆分 架构 设计',
          },
        },
      }],
    },
    Models: [...],
  } as any);
  expect(result.errors).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add the smallest necessary types in `src/trigger/types.ts` for unified `Router.routes[]`, `match.semantic_profile`, and `decision.router_hint`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/types.ts src/utils/config.test.ts
git commit -m "feat: add unified router semantic profile types"
```

### Task 7: Derive semantic prototypes with explicit precedence

**Files:**
- Modify: `src/governance/semantic-router.ts`
- Modify: `src/trigger/selector.ts`
- Test: `src/governance/semantic-router.test.ts`
- Test: `src/trigger/selector.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests covering precedence:

```ts
it('prefers explicit semantic profile prototype over description fallback', () => {});
it('falls back to route description when semantic profile prototype is absent', () => {});
it('preserves legacy Governance.semantic.prototypes during migration', async () => {});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/governance/semantic-router.test.ts src/trigger/selector.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add the smallest helper path to build semantic prototypes using:
1. explicit `semantic_profile.prototype`
2. route `description`
3. legacy `Governance.semantic.prototypes`

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/governance/semantic-router.test.ts src/trigger/selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/governance/semantic-router.ts src/trigger/selector.ts src/governance/semantic-router.test.ts src/trigger/selector.test.ts
git commit -m "feat: derive semantic profiles from unified routes"
```

### Task 8: Feed structured router hints into `SmartRouterSelector`

**Files:**
- Modify: `src/trigger/smart-router.ts`
- Modify: `src/trigger/selector.ts`
- Test: `src/trigger/smart-router.test.ts`
- Test: `src/trigger/selector.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that verify prompt construction includes `task_summary` and `top_route_candidates`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/trigger/smart-router.test.ts src/trigger/selector.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update `src/trigger/smart-router.ts` and `src/trigger/selector.ts` so smart-router prompt input includes:
- `task_summary`
- `top_route_candidates`
- original request text

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/trigger/smart-router.test.ts src/trigger/selector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/smart-router.ts src/trigger/selector.ts src/trigger/smart-router.test.ts src/trigger/selector.test.ts
git commit -m "feat: add structured hints to smart router decisions"
```

### Task 9: Normalize unified Router input without breaking legacy config

**Files:**
- Modify: `src/utils/config.ts`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add dual-read tests:

```ts
it('normalizes unified Router routes into runtime-compatible trigger and semantic config', () => {
  expect(result.config.TriggerRouter?.rules?.[0].name).toBe('architecture');
  expect(result.config.Governance?.semantic?.prototypes?.architecture).toContain('重构');
});

it('keeps legacy TriggerRouter and SmartRouter configs working unchanged', () => {
  expect(result.errors).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add a focused normalization step that translates unified Router input into current runtime-compatible `TriggerRouter` / `SmartRouter` / `Governance` structures before validation.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts src/utils/config.test.ts
git commit -m "feat: normalize unified router config into runtime structures"
```

### Task 10: Enforce migration-matrix parameter preservation

**Files:**
- Modify: `src/utils/config.ts`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add round-trip preservation tests for:
- smart decision `router_model` / `candidates` / `cache_ttl` / `max_tokens` / `fallback`
- sticky `session_ttl_ms` / `fingerprint_similarity_threshold` / `break_on_explicit_route`
- alignment `enabled` / `summarizer_model` / `max_summary_tokens`
- semantic `enabled` / `mode` / `threshold` / `classifier_model` / `prototypes`
- observability anomaly thresholds

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Implement only the preservation logic required by the tests.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts src/utils/config.test.ts
git commit -m "test: lock unified router migration parameter preservation"
```

### Task 11: Expose preview diagnostics for unified migration

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add API preview assertions for `referenceImpact` and `migrationDiagnostics`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update preview responses to include preserved fields, downgraded fields (if any), and missing references.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat: expose unified router migration diagnostics"
```

## Chunk 4: Unified Write Path and Product Outputs

### Task 12: Persist unified Router config from setup

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/setup/persist.ts`
- Modify: `src/setup/index.ts`
- Test: `src/setup/index.test.ts`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests asserting setup persistence writes unified Router structure by default.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/setup/index.test.ts src/utils/config.test.ts`
Expected: FAIL because the write path still persists only the legacy split structure.

- [ ] **Step 3: Write minimal implementation**

Add the smallest writer/serializer path needed so setup persistence can write unified Router by default while still accepting legacy read paths.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/setup/index.test.ts src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts src/setup/persist.ts src/setup/index.ts src/setup/index.test.ts src/utils/config.test.ts
git commit -m "feat: persist unified router config from setup"
```

### Task 13: Generate unified Router templates in setup

**Files:**
- Modify: `src/setup/types.ts`
- Modify: `src/setup/templates.ts`
- Test: `src/setup/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Add template tests that expect `routes`, `decision`, and default sticky/alignment output.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/setup/templates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update setup template generation to prefer the unified Router shape.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/setup/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup/types.ts src/setup/templates.ts src/setup/templates.test.ts
git commit -m "feat: generate unified router setup templates"
```

### Task 14: Update setup flow to teach one Router story

**Files:**
- Modify: `src/setup/index.ts`
- Test: `src/setup/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add setup tests asserting the generated config or messaging references unified Router concepts instead of separate TriggerRouter/SmartRouter/Governance concepts.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/setup/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update only the setup wording and emitted draft structure necessary to pass the tests.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/setup/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup/index.ts src/setup/index.test.ts
git commit -m "refactor: align setup flow with unified router defaults"
```

### Task 15: Refresh the example config to the unified Router shape

**Files:**
- Modify: `config/trigger.example.yaml`
- Test: `src/utils/config.test.ts`

- [ ] **Step 1: Write the failing test**

Add a config normalization fixture test using a minimal copy of the new example shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL if the new example shape cannot yet be normalized.

- [ ] **Step 3: Write minimal implementation**

Update `config/trigger.example.yaml` to the unified Router structure, keeping a short legacy compatibility comment block.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/trigger.example.yaml src/utils/config.test.ts
git commit -m "docs: update example config to unified router schema"
```

### Task 16: Refactor `/ui` from split controls to unified Router controls

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions against the generated `/ui` HTML (or relevant rendering helper):

```ts
it('renders unified Router controls in /ui instead of split routing sections', async () => {
  expect(html).toContain('Unified Router');
  expect(html).not.toContain('<strong>TriggerRouter</strong>');
  expect(html).not.toContain('<strong>SmartRouter</strong>');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL because `/ui` still renders split sections.

- [ ] **Step 3: Write minimal implementation**

Update only the `/ui` wording, grouping, and compatibility hints needed to express the unified Router product story while preserving existing functionality.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "refactor: present unified router controls in ui"
```

## Chunk 5: Docs and Final Verification

### Task 17: Rewrite README and config docs to one Router story

**Files:**
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`
- Modify: `docs/models-migration-guide.md`

- [ ] **Step 1: Write the failing doc checklist**

Use this checklist during the task:
- README no longer teaches TriggerRouter/SmartRouter/Governance as separate user-facing systems
- unified Router examples exist
- migration guide explains old-to-new route mapping
- default sticky/alignment/semantic behavior is described as one Router experience

- [ ] **Step 2: Verify current docs fail the checklist**

Read the three files and confirm the old split story is still present.
Expected: checklist FAIL.

- [ ] **Step 3: Write minimal documentation updates**

Update docs so the public story is one Router decision system with rules + semantic assist + smart fallback + default governance.

- [ ] **Step 4: Verify docs against the checklist**

Re-read the touched sections and confirm every checklist item now passes.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/configuration-guide.md docs/models-migration-guide.md
git commit -m "docs: unify router product narrative"
```

### Task 18: Run focused regression suite for the unified Router rollout

**Files:**
- Test: `src/trigger/selector.test.ts`
- Test: `src/trigger/smart-router.test.ts`
- Test: `src/governance/semantic-router.test.ts`
- Test: `src/utils/config.test.ts`
- Test: `src/server.test.ts`
- Test: `src/setup/index.test.ts`
- Test: `src/setup/templates.test.ts`

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
npm test -- src/trigger/selector.test.ts src/trigger/smart-router.test.ts src/governance/semantic-router.test.ts src/utils/config.test.ts src/server.test.ts src/setup/index.test.ts src/setup/templates.test.ts
```

Expected: PASS.

- [ ] **Step 2: If a test fails, fix the minimal regression**

Touch only the file responsible for the failure. Re-run the same command until green.

- [ ] **Step 3: Run build verification**

Run: `npm run build`
Expected: PASS and `dist` is regenerated without build errors.

- [ ] **Step 4: Review migration-critical files before final handoff**

Manually inspect the final diffs for:
- `src/trigger/selector.ts`
- `src/utils/config.ts`
- `src/setup/persist.ts`
- `src/server.ts`
- `config/trigger.example.yaml`
- `README.md`

Expected: no accidental re-introduction of split user-facing concepts, no dropped compatibility fields.

- [ ] **Step 5: Commit**

```bash
git add src/trigger/selector.ts src/trigger/smart-router.ts src/governance/semantic-router.ts src/utils/config.ts src/server.ts src/setup/index.ts src/setup/persist.ts src/setup/templates.ts src/trigger/types.ts src/governance/trace.ts src/governance/context-alignment.ts src/governance/session-store.ts config/trigger.example.yaml README.md docs/configuration-guide.md docs/models-migration-guide.md src/trigger/selector.test.ts src/trigger/smart-router.test.ts src/governance/semantic-router.test.ts src/utils/config.test.ts src/server.test.ts src/setup/index.test.ts src/setup/templates.test.ts
git commit -m "feat: unify router decision flow and config experience"
```
