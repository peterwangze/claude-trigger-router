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

## 2026-06-06 v1.17 Scope Update

用户反馈确认：当前 Web UI 不能只停留在“功能可达”和“第一屏有角色入口”，还需要成体系的视觉设计、不同角色任务流和设计到实现的辅助流程。本计划在原有双层工作台基础上追加 v1.17.0 的角色化 UI 体验设计事项。

本地 Codex 环境已安装以下辅助 skill，重启 Codex 后可用于后续 UI 设计/实现闭环：

- `figma-create-design-system-rules`
- `figma-generate-design`
- `figma-implement-design`

---

## Sequence Guard

Implementation order is mandatory:
1. capability/page inventory and shared context framing
2. top-level nav and landing split
3. user workspace flow cleanup
4. maintainer workspace flow cleanup and docs verification
5. role-aware design system, skill-assisted implementation, and browser smoke

Do not start step 3 before step 2 is test-backed and green.
Do not start broad visual polish before the role/task-flow checklist and design contract are written.

## File Map

- Modify: `src/server.ts` — `/ui` 顶层导航、首页分层、service context、页面区块编排
- Modify: `src/server.test.ts` — `/ui` HTML/section 断言
- Modify: `src/ui/workbench.ts` — `/ui` 页面编排入口
- Modify: `src/ui/workbench-styles.ts` — CSS helper 和响应式布局
- Modify: `src/ui/workbench-view-model.ts` — 角色、服务状态和首屏状态派生
- Modify: `src/ui/workbench-fragments.ts` — 角色入口、surface tabs 和 fragment contract
- Modify: `src/ui/workbench.dom.test.ts` — DOM smoke 与角色任务流断言
- Modify: `docs/configuration-guide.md` — 更新 `/ui` 使用说明
- Modify: `README.md` — 更新 UI 入口与角色说明
- Modify: `docs/superpowers/specs/2026-04-10-cli-setup-ux-redesign-design.md` — 如实现阶段需要，回填 setup 到 UI 的入口说明
- Modify: `docs/release-notes-v1.17.0.md` — 如进入发布收口，记录 UI 体验验收边界

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

---

## Chunk 5: Role-Aware Design System and Skill-Assisted Implementation

### Task 8: Lock the role and task-flow design brief

**Files:**
- Modify: `docs/superpowers/plans/2026-05-07-core-routing-version-plan.md`
- Modify: `docs/superpowers/plans/unified-progress-baseline.md`
- Modify: `docs/superpowers/plans/progress-issue-log.md`
- Optional: `docs/release-notes-v1.17.0.md`

- [x] **Step 1: Install UI design and implementation helper skills**

Installed local Codex skills:
- `figma-create-design-system-rules`
- `figma-generate-design`
- `figma-implement-design`

Codex must be restarted before these newly installed skills are available in the active session.

- [x] **Step 2: Write the role/task-flow checklist**

Checklist:
- local daily user can see service readiness, config health, and next action
- remote client can see remote readiness, token/registration state, and next action
- service maintainer can see auth, pool health, governance health, and operational risks
- route designer can inspect Router/SmartRouter decisions, capability warnings, and preview paths

- [x] **Step 3: Define the UI design contract**

Contract:
- information architecture and first-screen hierarchy
- design tokens for color, spacing, typography, density, badges, and state tones
- component inventory for tabs, role entry, status rows, tables, trace detail, warnings, and save actions
- empty/loading/error/success states for each role surface
- responsive behavior for desktop and mobile

- [x] **Step 4: Verify the contract is reflected in v1.17 planning docs**

Expected: v1.17.0 explicitly includes role-aware UI design, skill-assisted implementation, and browser smoke.

Closed 2026-06-06:
- Role/task-flow checklist is now the minimum UX contract for `/ui`: local daily user, remote client, service maintainer, and route designer must each have a clear first-screen path and next action.
- Information architecture keeps the first screen as service state plus role entry, then separates user configuration work from maintainer observability.
- Design token contract stays operational and dense: neutral page background, white panels, restrained teal/blue accents, warning/critical/ok state tones, 8px panel radius, compact status rows, no nested decorative card layouts.
- Component contract covers role cards, tabs, status tiles, action rows, tables, alerts, trace evidence detail, validation issues, capability warnings, and save/preview actions.
- State contract requires explicit empty/loading/error/success copy for config loading, compiled preview, save failure, trace detail, health, pool health, benchmark, exports, and archives.
- Responsive contract requires desktop and mobile smoke to reject horizontal page overflow and keep primary actions reachable.
- Implementation contract requires reusing `src/ui/workbench-styles.ts`, `src/ui/workbench-view-model.ts`, `src/ui/workbench-fragments.ts`, and existing inline script state; no parallel SPA state model is introduced in v1.17.

### Task 9: Implement role-aware visual system without duplicating page state

**Files:**
- Modify: `src/ui/workbench.ts`
- Modify: `src/ui/workbench-styles.ts`
- Modify: `src/ui/workbench-view-model.ts`
- Modify: `src/ui/workbench-fragments.ts`
- Test: `src/ui/workbench.dom.test.ts`

- [x] **Step 1: Write failing DOM/style contract tests**

Assert stable anchors for:
- role-specific first-screen entry
- user, remote, maintainer, and route-design task paths
- state badges and warning tones
- responsive table containers and non-overlapping compact panels

- [x] **Step 2: Implement the minimal visual system**

Keep the operational-tool feel: dense, quiet, readable, and role-guided. Reuse current data payloads and helpers; do not introduce a parallel client-side state model.

- [x] **Step 3: Run targeted UI tests**

Run: `npm run test:ui`
Expected: PASS.

Closed 2026-06-06:
- Existing role-aware first-screen entry remains the visual system baseline.
- `workbench-styles.ts` now constrains app shell, hero, role grid, task map, sticky surface tabs, panels and wide tables so compact role panels cannot push the page into horizontal overflow.
- `workbench.dom.test.ts` locks the new shell/grid max-width contract.
- No new client-side state model was introduced; implementation still uses the existing server-rendered HTML and inline script state.

### Task 10: Add browser-level layout and interaction smoke

**Files:**
- Modify: `scripts/ui-browser-smoke.mjs`
- Test: `npm run test:ui` or a dedicated browser smoke script if added

- [x] **Step 1: Define smoke viewport coverage**

Cover at least:
- desktop width
- narrow mobile width
- role entry navigation
- trace detail expansion
- config save/error affordance without text overlap

- [x] **Step 2: Run the browser smoke against a local UI target**

Expected: no blank UI, no horizontal page overflow, no overlapping role/task content, and primary actions remain reachable.

- [x] **Step 3: Feed failures back into the CSS/fragment contract**

Expected: browser-only failures become repeatable DOM/style assertions or a stable smoke check before v1.17.0 closes.

Closed 2026-06-06:
- Added `scripts/ui-browser-smoke.mjs` and `npm run test:ui:browser`.
- The smoke builds `dist`, starts CTR with an isolated HOME and fake upstream, opens `/ui` through Edge/Chrome CDP, checks desktop and mobile viewports, switches from the maintainer role card, and asserts no document-level horizontal overflow.
- Browser-only overflow risks are now backed by CSS constraints in `workbench-styles.ts` and DOM style assertions in `workbench.dom.test.ts`.
- Verification passed: `npm run test:ui`; `npm run test:ui:browser`.
