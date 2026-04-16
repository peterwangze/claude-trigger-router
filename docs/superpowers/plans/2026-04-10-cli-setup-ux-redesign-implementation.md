# CLI / Setup UX Redesign Implementation Plan

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“CLI / setup UX 重设计”这一行的实施计划部分。
>
> 当前职责：承接 setup 流程重排、CLI 帮助文本、README 与模板统一化的详细实施计划；顶层入口不再展开执行细节。


> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `ctr setup` so it is migration-first, model-id-first, and consistent with the project's `Models[].id` product story across setup, init, help text, and README.

**Architecture:** Keep the existing setup pipeline (`detect -> decide branch -> build draft -> persist -> ensure service -> enter Claude Code`) and change the user experience by reordering branch decisions and replacing the fresh-setup questionnaire. Reuse existing migration, normalization, and persistence code instead of building a parallel flow; only introduce small helpers where they reduce branching inside `src/setup/index.ts`.

**Tech Stack:** TypeScript, Vitest, js-yaml, existing setup modules under `src/setup`, CLI entry in `src/cli.ts`, docs in `README.md`

---

## File Structure

- Modify: `src/setup/detect.ts` — keep environment probing centralized; only extend if the new top-level setup prompts need a normalized summary of current/legacy/service state.
- Modify: `src/setup/decision.ts` — lock in the new branch ordering semantics so reuse/repair/legacy migration/fresh init are decided in the right order.
- Modify: `src/setup/setup.ts` — preserve the execution pipeline while allowing the new entry decisions to flow through without bypasses.
- Modify: `src/setup/index.ts` — replace the preset-first fresh setup questionnaire, update current-config prompt wording, and keep migration as the first meaningful branch for users without a usable current config.
- Modify: `src/setup/templates.ts` — continue using template helpers, but support model-id-first draft creation cleanly if the current provider-shaped input becomes awkward.
- Modify: `src/cli.ts` — align `help` and `init` next-step copy with the new `Models + Router.default` story.
- Modify: `README.md` — align quick-start and setup description with the new migration-first, minimal-config-first flow.
- Test: `src/setup/detect.test.ts` — only if detection output changes.
- Test: `src/setup/decision.test.ts` — assert new branch ordering and invalid combinations.
- Test: `src/setup/setup.test.ts` — assert orchestration still performs the right actions for reuse, migrate, rebuild, and fresh init.
- Test: `src/setup/index.test.ts` — assert new prompt order, model-id-first fresh flow, legacy-first flow, and updated output shape.
- Test: `src/setup/templates.test.ts` — assert any new helper or updated minimal-config behavior.
- Test: `src/cli-run.test.ts` — assert help text and setup command wording now match the product story.

---

## Chunk 1: Reorder Setup Entry Decisions

### Task 1: Lock branch semantics before changing prompts

**Files:**
- Modify: `src/setup/decision.ts`
- Test: `src/setup/decision.test.ts`

- [ ] **Step 1: Write the failing branch-order tests**

```ts
it('prefers legacy migration after create when legacy config exists', () => {
  expect(
    decideSetupBranch({
      detection: {
        currentConfig: { kind: 'missing' },
        legacyConfig: { kind: 'found', path: '/tmp/.ccr/config.yaml', config: {} },
        detectedService: { kind: 'none' },
      },
      currentConfigAction: 'create',
      legacyConfigAction: 'migrate',
    })
  ).toEqual({ kind: 'migrate_legacy' });
});

it('falls back to fresh init only after legacy skip', () => {
  expect(
    decideSetupBranch({
      detection: {
        currentConfig: { kind: 'missing' },
        legacyConfig: { kind: 'found', path: '/tmp/.ccr/config.yaml', config: {} },
        detectedService: { kind: 'none' },
      },
      currentConfigAction: 'create',
      legacyConfigAction: 'skip',
    })
  ).toEqual({ kind: 'fresh_init' });
});
```

- [ ] **Step 2: Run the focused decision test**

Run: `npm test -- src/setup/decision.test.ts`
Expected: FAIL if current branching still allows the wrong order or lacks explicit coverage.

- [ ] **Step 3: Implement the minimal branch-order change**

```ts
export function decideSetupBranch(input: IDecideSetupBranchInput): SetupBranchDecision {
  const { detection, currentConfigAction, legacyConfigAction } = input;

  if (currentConfigAction === 'cancel') {
    ensureNoLegacyAction(legacyConfigAction);
    return { kind: 'cancelled' };
  }

  switch (detection.currentConfig.kind) {
    case 'missing':
      if (currentConfigAction !== 'create') {
        return invalidAction();
      }
      return ensureLegacyFlow(detection, legacyConfigAction);
    // keep remaining cases unchanged except for coverage-driven cleanups
  }
}
```

- [ ] **Step 4: Re-run the decision test**

Run: `npm test -- src/setup/decision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup/decision.ts src/setup/decision.test.ts
git commit -m "refactor: lock setup branch ordering"
```

### Task 2: Preserve orchestration while entry behavior changes

**Files:**
- Modify: `src/setup/setup.ts`
- Test: `src/setup/setup.test.ts`

- [ ] **Step 1: Add orchestration tests for migrate-first and skip-to-fresh flows**

```ts
it('asks legacy branch before building a fresh draft when current config is missing', async () => {
  const deps = createDeps({
    detectSetupEnvironment: vi.fn().mockResolvedValue({
      currentConfig: { kind: 'missing' },
      legacyConfig: { kind: 'found', path: '/tmp/.ccr/config.yaml', config: {} },
      detectedService: { kind: 'none' },
    }),
    chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
    chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
  });

  await runSetup(deps as any);

  expect(deps.migrateLegacyConfig).toHaveBeenCalledTimes(1);
  expect(deps.buildFreshConfig).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused setup orchestration test**

Run: `npm test -- src/setup/setup.test.ts`
Expected: FAIL until orchestration assertions reflect the intended behavior.

- [ ] **Step 3: Apply the minimal orchestration cleanup**

```ts
if ((currentConfigAction === 'create' || currentConfigAction === 'overwrite') &&
    (detection.legacyConfig.kind === 'found' || detection.legacyConfig.kind === 'read_error')) {
  legacyConfigAction = await deps.chooseLegacyConfigAction({ legacyConfig: detection.legacyConfig });
}

const branch = decideSetupBranch({ detection, currentConfigAction, legacyConfigAction });
```

Keep the `runSetup` phases unchanged: decide once, persist once, ensure service once, then enter Claude Code.

- [ ] **Step 4: Re-run the setup orchestration test**

Run: `npm test -- src/setup/setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup/setup.ts src/setup/setup.test.ts
git commit -m "test: cover setup migration-first orchestration"
```

---

## Chunk 2: Replace Preset-First Fresh Setup With Model-Id-First Setup

### Task 3: Make fresh setup ask for model identity before connection details

**Files:**
- Modify: `src/setup/index.ts`
- Modify: `src/setup/templates.ts`
- Test: `src/setup/index.test.ts`
- Test: `src/setup/templates.test.ts`

- [ ] **Step 1: Write the failing fresh-setup prompt-order test**

```ts
it('builds a fresh config by asking for model id before preset selection', async () => {
  const io = {
    choose: vi
      .fn()
      .mockResolvedValueOnce('使用常见接入模板')
      .mockResolvedValueOnce('openrouter')
      .mockResolvedValueOnce('保持默认'),
    input: vi
      .fn()
      .mockResolvedValueOnce('sonnet')
      .mockResolvedValueOnce('sk-test')
      .mockResolvedValueOnce('anthropic/claude-sonnet-4'),
    info: vi.fn(),
  };

  await runSetupCli({
    readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
    readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
    probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    backupCurrentConfig: vi.fn().mockResolvedValue(null),
    writeConfig: vi.fn().mockResolvedValue(undefined),
    executeStart: vi.fn().mockResolvedValue(undefined),
    executeReload: vi.fn().mockResolvedValue(undefined),
    executeRestart: vi.fn().mockResolvedValue(undefined),
    verifyHealth: vi.fn().mockResolvedValue(true),
    enterClaudeCode: vi.fn().mockResolvedValue(undefined),
    io,
  });

  expect(io.input).toHaveBeenNthCalledWith(1, '默认模型 ID');
  expect(io.choose).toHaveBeenNthCalledWith(1, '这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
});
```

- [ ] **Step 2: Run the fresh-setup test file**

Run: `npm test -- src/setup/index.test.ts`
Expected: FAIL because `buildFreshConfig()` still starts with `选择 provider 预设`.

- [ ] **Step 3: Implement the minimal model-id-first helper**

Use either a focused helper inside `src/setup/index.ts` or a small helper added to `src/setup/templates.ts`.

```ts
async function buildFreshConfig(io: ISetupIO): Promise<ISetupConfigDraft> {
  const defaultModelId = await io.input('默认模型 ID');
  const connectionMode = await io.choose('这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);

  const preset = connectionMode === '使用常见接入模板'
    ? await io.choose('选择接入模板', listProviderPresetKeys('setup')) as ProviderPresetKey
    : 'custom';

  const apiBaseUrl = preset === 'custom'
    ? await io.input('API Base URL')
    : await io.input('API Base URL（留空使用预设）', '');
  const apiKey = await io.input('API Key');
  const upstreamModel = await io.input('上游模型名');

  const draft = buildMinimalConfig({
    providers: [{
      name: defaultModelId,
      preset,
      api_key: apiKey,
      api_base_url: apiBaseUrl,
      models: [upstreamModel],
    }],
    defaultModel: defaultModelId,
  });

  return draft;
}
```

If helper naming becomes awkward, add a helper in `src/setup/templates.ts` that accepts `modelId`, `preset`, `apiKey`, `apiBaseUrl`, and `upstreamModel`, but keep all prompt wording in `src/setup/index.ts`.

- [ ] **Step 4: Update template tests for the new draft shape**

Example assertion to add:

```ts
it('keeps Router.default aligned with explicit model id', () => {
  const config = buildMinimalConfig({
    providers: [{
      name: 'sonnet',
      preset: 'openrouter',
      api_key: 'sk-test',
      models: ['anthropic/claude-sonnet-4'],
    }],
    defaultModel: 'sonnet',
  });

  expect(config.Router.default).toBe('sonnet');
  expect(config.Models?.[0].id).toBe('sonnet');
});
```

- [ ] **Step 5: Re-run the focused fresh-setup tests**

Run: `npm test -- src/setup/index.test.ts src/setup/templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/setup/index.ts src/setup/templates.ts src/setup/index.test.ts src/setup/templates.test.ts
git commit -m "feat: make setup fresh flow model-id-first"
```

### Task 4: Make current-config and legacy prompts reflect the new UX contract

**Files:**
- Modify: `src/setup/index.ts`
- Test: `src/setup/index.test.ts`

- [ ] **Step 1: Add failing prompt-copy tests for reusable current config and legacy migration**

```ts
it('offers direct reuse before reconfiguration when current config is valid', async () => {
  // ...setup omitted...
  expect(io.info).toHaveBeenCalledWith('检测到当前 claude-trigger-router 配置已可用。');
  expect(io.choose).toHaveBeenCalledWith(
    '你想直接使用它，还是重新调整？',
    ['直接使用当前配置（推荐）', '检查并调整当前配置', '放弃当前配置，重新开始']
  );
});

it('offers migration as the recommended legacy action', async () => {
  // ...setup omitted...
  expect(io.choose).toHaveBeenCalledWith(
    '检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？',
    ['迁移旧配置（推荐）', '先预览迁移结果', '跳过迁移，手动新建']
  );
});
```

- [ ] **Step 2: Run the focused setup CLI test**

Run: `npm test -- src/setup/index.test.ts`
Expected: FAIL until prompt text and option mapping change.

- [ ] **Step 3: Implement the prompt wording and option mapping**

```ts
if (currentConfig.kind === 'valid') {
  deps.io.info('检测到当前 claude-trigger-router 配置已可用。');
  return mapCurrentChoice(await deps.io.choose(
    '你想直接使用它，还是重新调整？',
    ['直接使用当前配置（推荐）', '检查并调整当前配置', '放弃当前配置，重新开始']
  ));
}

if (legacyConfig.kind === 'found') {
  return mapLegacyChoice(await deps.io.choose(
    '检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？',
    ['迁移旧配置（推荐）', '先预览迁移结果', '跳过迁移，手动新建']
  ));
}
```

Notes for implementation:
- `检查并调整当前配置` should still map to existing branch behavior (`overwrite` or `repair`) based on current validity.
- `先预览迁移结果` can initially map to the same migration path if the codebase has no dedicated preview step yet, but only if the prompt/output immediately shows the migrated model-id result before persistence. If that preview cannot be implemented in this slice, remove the option from the implementation plan and keep just two options; do not fake a preview.
- Do not regress current invalid/parse-error recovery prompts.

- [ ] **Step 4: Re-run the setup CLI test**

Run: `npm test -- src/setup/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/setup/index.ts src/setup/index.test.ts
git commit -m "refactor: align setup prompts with migration-first UX"
```

---

## Chunk 3: Align CLI Copy, Init Copy, README, and Final Verification

### Task 5: Update help text and init next steps to match the product story

**Files:**
- Modify: `src/cli.ts`
- Test: `src/cli-run.test.ts`

- [ ] **Step 1: Add failing CLI copy tests**

```ts
it('describes setup as reuse or migration first in help output', async () => {
  const { printHelp } = await import('./cli');
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  printHelp();

  const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
  expect(output).toContain('setup       检测并复用已有配置，必要时迁移旧配置或新建最小配置');
});
```

Also add an assertion around `initConfig()` output so it no longer references `Providers` and instead points to `Models` and `Router.default`.

- [ ] **Step 2: Run the CLI help test**

Run: `npm test -- src/cli-run.test.ts`
Expected: FAIL until copy changes.

- [ ] **Step 3: Implement the minimal copy rewrite**

```ts
console.log('  2. 在 `Models` 下补全你的模型接入信息');
console.log('  3. 将 `Router.default` 设置为默认模型 ID');
console.log('  4. 如需高级路由，再继续配置规则或智能路由');
```

Update the `setup` help line and examples to describe it as the recommended reuse/migration-first path.

- [ ] **Step 4: Re-run the CLI help test**

Run: `npm test -- src/cli-run.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/cli-run.test.ts
git commit -m "docs: align cli help with setup ux"
```

### Task 6: Align README quick start with the implemented setup behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the quick-start setup section**

Replace the current bullet list so it reflects the actual behavior after implementation:

```md
`ctr setup` 会：

- 优先检查当前配置是否可直接复用
- 检测旧版 `~/.ccr/config.yaml` 并优先提供迁移
- 在需要新建时，先询问默认模型 ID，再收集最少必要接入信息
- 只生成最小可用配置（`Models + Router.default`），高级路由稍后再补
- 保存配置后启动服务并进入 Claude Code
```

- [ ] **Step 2: Verify README no longer teaches setup as preset-first**

Run: `npm test -- src/cli-run.test.ts src/setup/index.test.ts`
Expected: PASS (README itself is not unit-tested here; this step guards the behavior the docs now describe).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update setup quick start flow"
```

### Task 7: Run final regression checks for the redesigned setup path

**Files:**
- Test: `src/setup/decision.test.ts`
- Test: `src/setup/setup.test.ts`
- Test: `src/setup/index.test.ts`
- Test: `src/setup/templates.test.ts`
- Test: `src/cli-run.test.ts`

- [ ] **Step 1: Run the setup and CLI regression suite**

Run: `npm test -- src/setup/decision.test.ts src/setup/setup.test.ts src/setup/index.test.ts src/setup/templates.test.ts src/cli-run.test.ts`
Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS with updated CLI and setup sources compiling cleanly.

- [ ] **Step 3: Commit the final integrated change**

```bash
git add src/setup/decision.ts src/setup/decision.test.ts src/setup/setup.ts src/setup/setup.test.ts src/setup/index.ts src/setup/index.test.ts src/setup/templates.ts src/setup/templates.test.ts src/cli.ts src/cli-run.test.ts README.md
git commit -m "feat: redesign setup cli flow"
```

---

## Notes For The Implementer

- Reuse existing migration and persistence code; do not add a second setup pipeline.
- Keep behavior-driven changes small and test-first; most of this redesign should land as prompt-order and branch-order changes, not a large architecture rewrite.
- If the current `ISetupIO.choose()` API makes preview-like behavior awkward, do not invent a fake preview state. Either implement a real preview step with explicit output assertions or reduce the implemented option set to what the code can support honestly.
- Do not let README or help text get ahead of the code. The docs update task comes after the behavior changes for that reason.

Plan complete and saved to `docs/superpowers/plans/2026-04-10-cli-setup-ux-redesign-implementation.md`. Ready to execute?
