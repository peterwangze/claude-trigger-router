# 部署形态与远程接入实施计划

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“部署形态与远程接入收敛”这一行的实施计划部分。
>
> 当前职责：承接 local / server / cloud 部署、服务端 / 客户端职责、远程注册与状态查询的详细实施拆解；统一进展入口不再展开实现细节。

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏当前本地单机主路径的前提下，把 Claude Trigger Router 逐步收敛为同时支持 `local / server / cloud` 三类部署心智、具备最小服务端 / 客户端边界、并可承接远程注册与状态查询的统一路由服务。

**Architecture:** 实施分成 5 个 chunk。先定义服务模式与 service info，再补远程连接配置与状态查询；随后补最小注册语义；然后让 setup / doctor / `/ui` 能表达“本地 vs 远程”心智；最后统一文档与回归验证。所有阶段都必须复用现有 config、compiled models、server API 和 observability 结构，不允许另起平行运行时。

**Tech Stack:** TypeScript, Vitest, Fastify, existing config/server/setup/doctor modules in Claude Trigger Router

---

## Sequence Guard

Implementation order is mandatory:
1. service mode metadata and runtime boundaries
2. remote connection config and status APIs
3. registration semantics and persistence
4. setup / doctor / `/ui` UX alignment
5. docs and regression verification

Do not start step 3 before step 2 is test-backed and green.

## File Map

**Runtime / server**
- Modify: `src/index.ts` — 启动时写入 runtime mode 与 service metadata
- Modify: `src/server.ts` — 暴露 service info / remote status / registration API
- Modify: `src/utils/config.ts` — 新增 Runtime / remote_service / Registration 归一化与校验
- Modify: `src/service-health.ts` — 区分本地服务状态与远程目标连通性摘要

**Setup / doctor / CLI / UI**
- Modify: `src/setup/index.ts` — 新增“本地使用 vs 连接远程服务”入口
- Modify: `src/setup/templates.ts` — 生成 remote-service 相关最小配置草稿
- Modify: `src/doctor/index.ts` — 区分本地配置诊断与远程服务诊断
- Modify: `src/cli.ts` — 更新 help 文案与 mode 说明
- Modify: `src/server.ts` — `/ui` 展示 service context、remote status 与 registration summary

**Primary tests**
- Modify: `src/utils/config.test.ts`
- Modify: `src/server.test.ts`
- Modify: `src/setup/index.test.ts`
- Modify: `src/cli-run.test.ts`
- Modify: `src/doctor/index.test.ts`

---

## Chunk 1: Service Mode and Service Info

### Task 1: Add runtime mode schema and normalization

**Files:**
- Modify: `src/utils/config.ts`
- Test: `src/utils/config.test.ts`

- [x] **Step 1: Write the failing test**

Add tests for:

```ts
it('accepts Runtime.mode as local server or cloud', () => {
  expect(result.errors).toEqual([]);
});

it('normalizes remote_service config without breaking local defaults', () => {
  expect(result.config.Runtime?.mode).toBe('server');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Add conservative config normalization for:
- `Runtime.mode`
- `Runtime.remote_service`
- `Registration`

Default remains `local`.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts`
Expected: PASS.

### Task 2: Expose service info endpoint and runtime metadata

**Files:**
- Modify: `src/index.ts`
- Modify: `src/server.ts`
- Test: `src/server.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions for a service info endpoint or equivalent response helper:

```ts
expect(body.runtimeMode).toBe('server');
expect(body.serviceRole).toBe('router_service');
expect(body.remoteEnabled).toBe(false);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Expose service runtime metadata using existing server / health primitives.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

---

## Chunk 2: Remote Connection and Status Queries

### Task 3: Support remote target config for clients

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/setup/templates.ts`
- Test: `src/utils/config.test.ts`
- Test: `src/setup/templates.test.ts`

- [x] **Step 1: Write the failing test**

Add tests ensuring remote-service drafts can be created with:
- base URL
- auth token placeholder
- mode `local` with remote target enabled, or explicit remote client semantics if introduced

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts src/setup/templates.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Reuse current setup flow to generate a remote target draft without asking provider-specific questions first.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts src/setup/templates.test.ts`
Expected: PASS.

### Task 4: Expose remote status and compiled-model summary queries

**Files:**
- Modify: `src/server.ts`
- Modify: `src/service-health.ts`
- Test: `src/server.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions for remote status summary including:
- health
- compiled model count
- capabilities summary
- governance alert summary

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Extend existing summary endpoints instead of inventing parallel APIs when possible.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/server.test.ts`
Expected: PASS.

2026-04-26 closure note:

- Remote client config now has a template-level draft path via `buildRemoteServiceConfig()`: it records `Runtime.mode = local`, enables `Runtime.remote_service`, stores the base URL and token placeholder, and no longer requires local `Providers` / `Router.default` when a remote service is enabled.
- `GET /api/remote-status` now reuses existing runtime, compiled-model and governance primitives to expose remote health, compiled model count/capability summary and governance anomaly counts in one status contract.
- Review closure tightened the contract by normalizing returned remote `baseUrl` and adding an enabled-remote integration assertion for `/api/remote-status`.
- Targeted verification used: `npm test -- --run src/setup/templates.test.ts src/utils/config.test.ts src/service-health.test.ts src/server.test.ts`.

---

## Chunk 3: Registration Semantics

### Task 5: Define minimal registration payloads and persistence

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `src/server.ts`
- Test: `src/utils/config.test.ts`
- Test: `src/server.test.ts`

- [x] **Step 1: Write the failing test**

Cover:
- model registration list normalization
- upstream service reference normalization
- rejecting ambiguous node-only registration in first phase

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/config.test.ts src/server.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Keep registration semantics narrow:
- `models`
- `upstream_services`

Do not introduce cluster/node orchestration in this phase.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/utils/config.test.ts src/server.test.ts`
Expected: PASS.

2026-04-27 closure note:

- `Registration.models` now reuses the same minimal model endpoint normalization and validation contract as `Models`, including aliases, endpoint normalization, required fields, duplicate IDs, and thinking hints.
- `Registration.upstream_services` now normalizes service references by trimming IDs, URLs and tokens, removing trailing slashes from base URLs, validating duplicates and malformed entries, and preserving normalized values through `/api/config` persistence.
- `GET /api/registration` exposes a redacted registration view with counts, model IDs/interfaces and upstream service IDs/base URLs while returning only `*Configured` booleans for secrets.
- Node / cluster registration fields remain explicitly rejected in this phase, keeping registration semantics limited to `models` and `upstream_services`.
- Targeted verification used: `npm test -- --run src/utils/config.test.ts src/server.test.ts`; build verification used: `npm run build`.

---

## Chunk 4: Setup / Doctor / UI Alignment

### Task 6: Make setup distinguish local vs remote entry

**Files:**
- Modify: `src/setup/index.ts`
- Test: `src/setup/index.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions that setup can ask:
- `当前要本地使用，还是连接远程服务？`
- remote path asks for service URL before model/provider questions

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/setup/index.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Preserve current migration-first path; only branch into remote flow when user explicitly chooses it.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/setup/index.test.ts`
Expected: PASS.

2026-04-27 closure note:

- Fresh setup now asks `当前要本地使用，还是连接远程服务？` before provider/model questions.
- The local path remains the default and keeps the existing model/provider setup flow after the new entry choice.
- The remote path asks only for remote service URL and optional auth token, then persists a `Runtime.remote_service` client draft without requiring local provider/model fields.
- Existing migration-first and current-config reuse flows remain before this branch; the local/remote choice is only used when building a fresh config.
- Targeted verification used: `npm test -- --run src/setup/templates.test.ts src/setup/index.test.ts`.

### Task 7: Update doctor and `/ui` to show service context

**Files:**
- Modify: `src/doctor/index.ts`
- Modify: `src/server.ts`
- Test: `src/doctor/index.test.ts`
- Test: `src/server.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions that:
- doctor output distinguishes local config vs remote service checks
- `/ui` shows current service context and remote status summary

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/doctor/index.test.ts src/server.test.ts`
Expected: FAIL.

- [x] **Step 3: Write minimal implementation**

Reuse current health/config summary primitives; only add the minimal service-context framing.

- [x] **Step 4: Run targeted tests**

Run: `npm test -- src/doctor/index.test.ts src/server.test.ts`
Expected: PASS.

2026-04-27 closure note:

- `doctor` now prints the normalized service context (`Runtime.mode` plus local agent / router service role) before model probing.
- When `Runtime.remote_service.enabled` is set, `doctor` probes the configured remote service through the existing service-info contract and reports reachable / ready state separately from the local service health check.
- `/ui` first screen now renders service mode, service role, remote service summary and registration summary alongside the existing ready / port / model / default-router status tiles.
- The UI refresh action now uses `/api/service-info` and `/api/remote-status`, so the displayed context stays aligned with the existing runtime and remote-status API contracts.
- Targeted verification used: `npm test -- --run src/doctor/index.test.ts src/server.test.ts`.

---

## Chunk 5: Docs and Final Verification

### Task 8: Align public docs with deployment modes and remote access

**Files:**
- Modify: `README.md`
- Modify: `docs/configuration-guide.md`

- [ ] **Step 1: Write the doc checklist**

Checklist:
- local / server / cloud meanings are explicit
- remote service path is documented as optional, not default
- service/client responsibilities are described without inventing unsupported features
- `/ui` and setup references mention local vs remote context

- [ ] **Step 2: Verify current docs fail the checklist**

Read the affected sections and confirm gaps.

- [ ] **Step 3: Write minimal documentation updates**

Update only the behavior that has landed.

- [ ] **Step 4: Verify docs against checklist**

Expected: PASS.

### Task 9: Run focused regression suite

**Files:**
- Test: `src/utils/config.test.ts`
- Test: `src/server.test.ts`
- Test: `src/setup/index.test.ts`
- Test: `src/doctor/index.test.ts`
- Test: `src/cli-run.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/utils/config.test.ts src/server.test.ts src/setup/index.test.ts src/doctor/index.test.ts src/cli-run.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build verification**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Review final diffs before handoff**

Expected:
- no accidental split runtime
- no unsupported cluster semantics
- local path remains default and intact
