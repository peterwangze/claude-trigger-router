# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run build` - Bundle the CLI from `src/cli.ts` into `dist/cli.js` with esbuild.
- `npm run dev` - Watch and run `src/cli.ts` via `tsx` during CLI development.
- `npm test` - Run the full Vitest suite (`src/**/*.test.ts`) in Node.
- `npx vitest run src/trigger/selector.test.ts` - Run a single test file.
- `npm run test:e2e:cli` - Run the CLI end-to-end test.
- `npm run test:e2e:acceptance` - Run the acceptance-style CLI flow.
- `npm run verify:package` - Smoke-check the packaged output on Windows via PowerShell.
- `npm run release:verify` / `npm run release:stage` / `npm run release:clean` - Release workflow helpers.

## Runtime And Config Notes

- Runtime config is not stored in the repo. The CLI reads and writes user config under `~/.claude-trigger-router/` (`config.yaml`, `config.yml`, or `config.json`).
- `config/trigger.example.yaml` and `config/trigger.advanced.yaml` are the in-repo examples for TriggerRouter rules.
- `ctr setup` is the preferred entry point for real users: it detects existing config, migrates legacy config when possible, writes a minimal usable config, and can start the service.
- `ctr doctor` is the repair path: it normalizes malformed config, backfills deterministic fields, can restart the service, and optionally probes configured upstream models.

## High-Level Architecture

### CLI surface

- `src/cli.ts` is the command entry point for `ctr`. It owns command parsing and dispatches into runtime (`run`), setup (`runSetupCli`), and doctor (`runDoctorCli`).
- The build output is a single bundled Node CLI at `dist/cli.js`; `scripts/build.js` controls that bundle.

### Request pipeline

- `src/index.ts` is the main service bootstrap. It initializes config, logging, PID metadata, compiled model registry, Fastify hooks, and then starts the local proxy service.
- Incoming `/v1/messages` requests flow through this order:
  1. API key/auth hook
  2. governance trace/session extraction
  3. TriggerRouter selection
  4. optional agent injection
  5. fallback router selection
  6. protocol conversion into the upstream provider request
  7. response governance / streaming governance before returning to Claude Code

### Model abstraction and dispatch

- The repo is centered on symbolic model IDs in `Models`, not only raw `provider,model` strings.
- `src/models/compile.ts` compiles user-facing `Models` config into a provider registry plus a `modelMap`, and resolves symbolic references used by router/governance sections.
- `src/protocols/index.ts` converts Claude-style message input into the upstream request format and applies capability fallbacks when a target model lacks thinking/tools/images support.
- `src/router/index.ts` is the final fallback selector when TriggerRouter did not lock a model. It handles long-context routing, background model routing, thinking routing, web-search routing, and the default route.

### Routing layers

- `src/trigger/index.ts` owns TriggerRouter orchestration. It can route by explicit rules, sticky session behavior, SmartRouter, and intent analysis.
- `src/trigger/analyzer.ts`, `src/trigger/matcher.ts`, `src/trigger/intent.ts`, and `src/trigger/selector.ts` are the analysis/matching pieces behind TriggerRouter.
- `src/trigger/smart-router.ts` is an LLM-driven chooser that asks a router model to pick from configured candidate models when hard rules do not match.

### Governance layer

- Governance is a second-stage control plane under `src/governance/`.
- `response-governance.ts` and `stream-response-governance.ts` handle post-selection quality controls such as cascade escalation retries, sticky session persistence, and shadow supervision.
- `context-alignment.ts` summarizes context when switching models between turns.
- `trace.ts`, `metrics.ts`, and `metrics-export.ts` persist observability data that is also exposed by the local server/UI.

### Setup, migration, and repair

- `src/setup/` contains the onboarding path: detecting current state, migrating from legacy `claude-code-router` config, building minimal configs, persisting them, and deciding service actions.
- `src/doctor/` is intentionally separate from setup: it assumes a broken or suspect config and focuses on deterministic repair plus optional live probing.

### Server and UI helpers

- `src/server.ts` wraps `@musistudio/llms` and exposes local endpoints for config inspection, governance metrics, trace data, and model reference analysis.
- `src/service-health.ts` and `src/utils/processCheck.ts` are the service lifecycle primitives used by `start`, `stop`, `restart`, `status`, setup, and doctor.

### Agents

- `src/agents/index.ts` registers built-in request mutators/tool injectors. Right now the main built-in agent is `image.agent.ts`.
- Agent handling happens before final upstream dispatch, so agent-added tools are part of the routed request body.

## Testing Notes

- Vitest is configured in `vitest.config.ts` with `environment: 'node'` and `include: ['src/**/*.test.ts']`.
- Coverage is currently focused on `src/trigger/**/*.ts`; if you add governance/setup behavior, expect tests to be file-specific rather than enforced by coverage gates.
- There are both unit-style tests near each module and CLI/e2e tests under `src/e2e/`.
