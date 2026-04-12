# CLI E2E Test Design

## 1. Background

`claude-trigger-router` is delivered to users primarily through the `ctr` CLI. Recent fixes exposed a structural gap: many regressions were caught only after packaging or after manual release validation, which means the current test strategy is still too implementation-centric and not sufficiently user-flow-centric.

This document defines a user-visible end-to-end test strategy for the packaged CLI. The target is not just "internal logic is correct", but "the published CLI behaves safely and predictably for real users".

## 2. Quality bar

The CLI test strategy must enforce four baseline requirements:

1. No unexpected process crash or abnormal exit for user-visible commands.
2. No writes outside the command's expected file footprint.
3. No misleading or destructive logic that changes user environment/config unexpectedly.
4. User-visible behavior must match the command/option promise.

These are release gates, not best-effort goals.

## 3. Test object

The primary test object is the packaged CLI installed from a locally packed tarball, not the raw TypeScript entrypoint.

All command validation should prefer this shape:

1. `npm pack`
2. install tarball into isolated prefix
3. execute installed `ctr`
4. assert exit code, output, side effects, and file changes

This avoids false confidence from source-only testing.

## 4. Isolation model

Every CLI E2E test must run inside an isolated environment:

- isolated HOME / USERPROFILE
- isolated workspace
- isolated package install prefix
- isolated logs / pid / config files
- optional fake external binaries (for example `claude`)

No test may read from or write to the real user home directory.

Recommended layout per test:

- `<temp>/home`
- `<temp>/workspace`
- `<temp>/prefix`
- `<temp>/artifacts`

## 5. File side-effect rules

### 5.1 Default forbidden areas

Unless explicitly allowed by the test case, these must remain untouched:

- real `%USERPROFILE%` / `$HOME`
- repo root outside declared test workspace
- arbitrary sibling directories
- legacy config locations not targeted by the command

### 5.2 Expected write whitelist

Allowed writes must be declared per flow. Typical allowed targets:

- `.claude-trigger-router/config.yaml`
- `.claude-trigger-router/config.json`
- `.claude-trigger-router/config.yml`
- `.claude-trigger-router/*.backup.*`
- `.claude-trigger-router/logs/**`
- `.claude-trigger-router/claude-trigger-router.pid`
- `.claude.json` only when `code` / `setup` compatibility flow requires it

Any write outside the declared whitelist is a test failure.

## 6. User-visible command matrix

Commands that must be covered as user contracts:

- `ctr`
- `ctr help`
- `ctr version`
- `ctr upgrade`
- `ctr init`
- `ctr setup`
- `ctr start`
- `ctr stop`
- `ctr restart`
- `ctr status`
- `ctr code`
- `ctr ui`

Options that must be covered as user contracts:

- `--help`, `-h`
- `--port`, `-p`
- `--daemon`, `-d`
- `--force`

## 7. Required command-level assertions

Every user-visible command needs these assertion dimensions:

- exit code contract
- stdout/stderr contract
- side-effect contract
- file mutation whitelist
- behavior contract

### 7.1 Help / default invocation

Must verify:

- no crash
- no file writes
- listed commands and options match reality
- examples do not describe unsupported behavior

### 7.2 Version

Must verify:

- no file writes
- current package version shown
- latest version resolution is resilient
- degraded network case is explicit but non-fatal

### 7.3 Upgrade

Must verify:

- guidance only, no actual install attempt
- no file writes
- source-preservation wording is not misleading

### 7.4 Init

Must verify:

- creates config only in expected location
- respects `--force`
- never overwrites unrelated config
- outputs accurate next-step guidance

### 7.5 Setup

This is the highest-priority command and must be modeled as a state machine.

Input dimensions:

- current config state
  - missing
  - valid
  - invalid
  - parse_error
- legacy config state
  - missing
  - found yaml
  - found json
  - read_error
- service state
  - none
  - self_healthy
  - self_unhealthy
  - non_self_occupied

User choice paths that must be covered:

- valid current config
  - reuse
  - inspect/adjust
  - abandon current config
    - then migrate legacy
    - then skip legacy
- invalid current config
  - repair
  - overwrite
    - then migrate legacy
    - then skip legacy
  - cancel
- parse_error current config
  - rebuild
  - cancel
- missing current config
  - create
    - then migrate legacy
    - then skip legacy

### 7.6 Start / stop / restart / status

Must verify:

- foreground start
- daemon start
- health reporting
- pid handling
- shutdown correctness
- restart behavior
- port override correctness
- port collision handling
- no silent launch-success messages when service actually exited

### 7.7 Code

Must verify:

- health precheck
- `.claude.json` compatibility behavior
- no overwrite of existing `.claude.json`
- environment injection correctness
- graceful failure when `claude` is missing

### 7.8 UI

Must verify:

- open-browser success path
- open-browser failure fallback
- URL correctness for custom port

## 8. Legacy migration as default user flow

`claude-code-router` migration is not an edge case. For new or returning users it is a default high-frequency path and must be treated as part of the main CLI contract.

The release-stage and CLI E2E strategy must therefore cover:

- legacy config discovery
- migration prompt display
- migration acceptance path
- migration skip path
- migrated config output
- migrated config startup viability
- preservation of legacy source file

Special emphasis:

- abandoning a valid current `claude-trigger-router` config must still allow legacy detection/migration
- migrated `Router.default` must become the new model id, not remain `provider,model`
- unsupported legacy fields must be reported, not silently dropped

## 9. E2E harness requirements

The packaged-CLI E2E harness must support:

- packing/installing local tarball
- locating installed `ctr`
- running commands with isolated HOME / USERPROFILE
- scripted stdin for interactive setup flows
- file tree snapshots before/after
- allowed-write whitelist assertions
- optional fake binaries in PATH
- alternate-port execution

Minimum helper API:

- `packAndInstallCli()`
- `runCtr(args, options)`
- `snapshotTree(root)`
- `diffSnapshot(before, after)`
- `assertOnlyPathsChanged(diff, whitelist)`

## 10. Initial high-value E2E slice

The first implemented slice should prioritize user-visible regression risk:

1. `help` / default command
2. `version` no-write behavior
3. `init --force` writes only expected config
4. `setup` abandon-current -> detect legacy -> migrate
5. `start --daemon` -> `status` -> `stop`
6. alternate-port lifecycle (`--port 6789`)

These do not complete the whole matrix, but they immediately cover the most visible and recently unstable user paths.

## 11. Release gate proposal

Before publish, the package must pass:

- unit / focused integration tests
- packaged CLI regression slice
- release tarball verification
- staged manual validation checklist

Recommended scripts:

- `npm run test:e2e:cli`
- `npm run release:verify`
- `npm run release:stage`

Release should be blocked if any of these conditions are observed:

- unhandled exception / unexpected stack trace
- non-whitelisted file write
- misleading success message for a failed lifecycle command
- migrated config cannot pass startup on a clean port

## 12. Deliverables

This design should be followed by:

1. packaged-CLI E2E harness
2. initial high-value E2E regression slice
3. gradual expansion to full command/choice-path coverage

The target state is: every user-visible CLI command and every meaningful setup choice path is validated through packaged, isolated, end-to-end execution.
