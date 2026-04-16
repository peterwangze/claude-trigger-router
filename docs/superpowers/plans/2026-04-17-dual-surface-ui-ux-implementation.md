# UI 双层工作台实施计划

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“UI 双层工作台收敛”这一行的实施计划部分。
>
> 当前职责：承接使用者界面 / 维护者界面的页面分层、导航收敛与实施顺序；统一进展入口不再展开执行细节。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 `/ui` 从“配置编辑 + 治理观测 + 维护信息”的混合能力页，逐步收敛为“使用者工作台 + 维护者工作台”双层产品界面，在不破坏现有功能的前提下完成角色分层、导航收口和入口一致性。

**Architecture:** 实施分成 4 个 chunk。先做页面能力归类与 service context 顶栏；再拆首页与导航；随后收拢使用者工作台主路径；最后收拢维护者工作台的观测与运维能力，并同步 README / setup 说明。整个过程必须复用现有 `/ui` 数据接口和渲染逻辑，不允许为了分层而复制一套平行页面状态。

**Tech Stack:** TypeScript, Fastify HTML rendering helpers, Vitest, existing `/ui` helpers in `src/server.ts`

---

## Sequence Guard

Implementation order is mandatory:
1. capability/page inventory and shared context framing
2. top-level nav and landing split
3. user workspace flow cleanup
4. maintainer workspace flow cleanup and docs verification

Do not start step 3 before step 2 is test-backed and green.

## File Map

- Modify: `src/server.ts` — `/ui` 顶层导航、首页分层、service context、页面区块编排
- Modify: `src/server.test.ts` — `/ui` HTML/section 断言
- Modify: `docs/configuration-guide.md` — 更新 `/ui` 使用说明
- Modify: `README.md` — 更新 UI 入口与角色说明
- Modify: `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` — 如实现阶段需要，回填 setup 到 UI 的入口说明

---

## Chunk 1: Shared Context and Capability Inventory

### Task 1: Introduce shared service context header in `/ui`

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `/ui` renders a shared context header containing:
- current service mode
- local vs remote target label
- current config / service summary

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add a top summary block only; do not yet split the navigation.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

### Task 2: Make existing sections classifiable as user vs maintainer

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions for semantic section groups such as:
- `data-surface="user"`
- `data-surface="maintainer"`

or equivalent explicit headings.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Do not move all sections yet; only add group labels / wrappers so later nav split has stable anchors.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

---

## Chunk 2: Top-Level Navigation and Landing Split

### Task 3: Split `/ui` landing into 使用者工作台 and 维护者工作台

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Assert the rendered UI contains:
- `使用者工作台`
- `维护者工作台`
- no longer presents the old mixed landing as the only first screen

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add top-level nav / tabs / anchors that separate the two surfaces while preserving old section content under the new buckets.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

### Task 4: Route setup and docs to the user-facing workspace first

**Files:**
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`

- [ ] **Step 1: Write the doc checklist**

Checklist:
- setup success path references user workspace first
- maintainer workspace is described as a separate surface for observability / maintenance
- `/ui` is no longer described as a single mixed debug page

- [ ] **Step 2: Verify current docs fail checklist**

Read affected sections and confirm mismatch.

- [ ] **Step 3: Write minimal doc updates**

Only describe behavior that has landed.

- [ ] **Step 4: Verify docs against checklist**

Expected: PASS.

---

## Chunk 3: User Workspace Cleanup

### Task 5: Keep config editing, preview, warnings, and save in the user surface

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that the user workspace contains:
- Draft Config Editor
- Models / Router controls
- Validation Summary
- Capability Warnings
- Save actions

and does not foreground anomaly / archive panels.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Reorder existing sections into one coherent user-edit flow; do not rewrite form logic.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

---

## Chunk 4: Maintainer Workspace Cleanup and Final Verification

### Task 6: Keep metrics, alerts, archives, and service status in the maintainer surface

**Files:**
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that the maintainer workspace contains:
- governance metrics
- anomaly alerts
- snapshots / exports / schedules / archives
- service status summary

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Group current observability and maintenance sections under the maintainer surface without changing their data contracts.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

### Task 7: Run final UI-focused regression and build verification

**Files:**
- Test: `src/server.test.ts`

- [ ] **Step 1: Run focused UI tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

- [ ] **Step 2: Run build verification**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Review final diffs before handoff**

Expected:
- no duplicated UI data flows
- user and maintainer surfaces are clearly named
- current `/ui` functionality remains reachable
