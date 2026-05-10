import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  appendTraceReason,
  createGovernanceTrace,
  finalizeTrace,
  GovernanceTraceStore,
  governanceTraceStore,
  recordGovernanceTrace,
  summarizeRouteDecisionTrace,
  summarizeSwitchContinuityTrace,
} from './trace';

describe('governance trace', () => {
  it('stores finalized traces in the trace store', () => {
    governanceTraceStore.clear();
    const trace = createGovernanceTrace({
      requestId: 'req-store',
      startedAt: 100,
    });
    const finalized = finalizeTrace(trace, { completedAt: 120 });
    recordGovernanceTrace(finalized);

    expect(governanceTraceStore.list()).toHaveLength(1);
    expect(governanceTraceStore.get('req-store')?.latencyMs).toBe(20);
  });

  it('creates a trace with sane defaults', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-1',
      initialModel: 'openrouter,anthropic/claude-sonnet-4',
      startedAt: 100,
    });

    expect(trace.requestId).toBe('req-1');
    expect(trace.initialModel).toBe('openrouter,anthropic/claude-sonnet-4');
    expect(trace.routeReason).toEqual([]);
    expect(trace.stickyHit).toBe(false);
    expect(trace.cascadeTriggered).toBe(false);
    expect(trace.cascadeEvidence).toEqual([]);
    expect(trace.shadowChecked).toBe(false);
    expect(trace.startedAt).toBe(100);
  });

  it('deduplicates route reasons when appending', () => {
    const trace = createGovernanceTrace({ requestId: 'req-2' });

    appendTraceReason(trace, 'smart_rule:architecture');
    appendTraceReason(trace, 'smart_rule:architecture');
    appendTraceReason(trace, 'smart_router');

    expect(trace.routeReason).toEqual([
      'smart_rule:architecture',
      'smart_router',
    ]);
  });

  it('finalizes trace and computes latency', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-3',
      startedAt: 100,
      routeReason: ['smart_rule:image_generation'],
    });

    const finalized = finalizeTrace(trace, {
      finalModel: 'openrouter,dall-e-3',
      completedAt: 180,
    });

    expect(finalized.finalModel).toBe('openrouter,dall-e-3');
    expect(finalized.completedAt).toBe(180);
    expect(finalized.latencyMs).toBe(80);
    expect(finalized.routeReason).toEqual(['smart_rule:image_generation']);
  });

  it('summarizes route decisions with source, rule, confidence and fallback context', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-decision',
      sessionKey: 'session-a',
      initialModel: 'sonnet',
      finalModel: 'opus',
      routeReason: ['request_received', 'smart_rule:architecture', 'context_window_fallback:sonnet->opus'],
      routeDecision: {
        source: 'smart_rule',
        ruleName: 'architecture',
        confidence: 1,
        model: 'opus',
      },
      semanticIntent: 'architecture',
      startedAt: 100,
      completedAt: 140,
      latencyMs: 40,
    });

    expect(summarizeRouteDecisionTrace(trace)).toEqual(expect.objectContaining({
      requestId: 'req-decision',
      sessionKey: 'session-a',
      source: 'smart_rule',
      sourceLabel: 'SmartRouter rule "architecture"',
      ruleName: 'architecture',
      semanticIntent: 'architecture',
      confidence: 1,
      confidenceLabel: '100%',
      initialModel: 'sonnet',
      finalModel: 'opus',
      fallbackReason: 'Context window guard switched sonnet->opus.',
      headline: 'SmartRouter rule "architecture" selected opus with 100% confidence.',
      latencyMs: 40,
    }));
  });

  it('summarizes legacy traces from route reasons when decision metadata is absent', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-legacy-decision',
      initialModel: 'sonnet',
      finalModel: 'sonnet',
      routeReason: ['request_received', 'smart_router:no_match'],
      startedAt: 100,
    });

    expect(summarizeRouteDecisionTrace(trace)).toEqual(expect.objectContaining({
      source: 'smart_router',
      sourceLabel: 'SmartRouter candidate selection',
      fallbackReason: 'SmartRouter did not match; request continued to the basic Router fallback path.',
      headline: 'SmartRouter candidate selection selected sonnet.',
    }));
  });

  it('keeps SmartRouter no-match decision summaries readable', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-no-match',
      finalModel: 'sonnet',
      routeReason: ['request_received', 'smart_router:no_match'],
      routeDecision: {
        source: 'no_match',
        confidence: 0,
        fallbackReason: 'SmartRouter did not match; request continued to the basic Router fallback path.',
      },
      startedAt: 100,
    });

    expect(summarizeRouteDecisionTrace(trace)).toEqual(expect.objectContaining({
      source: 'no_match',
      sourceLabel: 'SmartRouter no match',
      confidenceLabel: '0%',
      fallbackReason: 'SmartRouter did not match; request continued to the basic Router fallback path.',
      headline: 'SmartRouter no match selected sonnet with 0% confidence.',
    }));
  });

  it('summarizes model switch continuity with alignment and cascade risk', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-switch-risk',
      sessionKey: 'session-risk',
      initialModel: 'sonnet',
      finalModel: 'opus',
      routeReason: ['request_received', 'smart_router'],
      routeDecision: {
        source: 'smart_router',
        confidence: 0.8,
        model: 'opus',
      },
      semanticIntent: 'architecture',
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: ['compile failure'],
      startedAt: 100,
      latencyMs: 300,
    });

    expect(summarizeSwitchContinuityTrace(trace)).toEqual(expect.objectContaining({
      requestId: 'req-switch-risk',
      sessionKey: 'session-risk',
      status: 'critical',
      switched: true,
      transition: 'sonnet -> opus',
      source: 'smart_router',
      sourceLabel: 'SmartRouter candidate selection',
      semanticIntent: 'architecture',
      alignmentUsed: false,
      cascadeTriggered: true,
      headline: 'Model switched sonnet -> opus without alignment and then triggered cascade retry.',
      action: 'Enable or tune Governance.sticky.alignment before sending more traffic through this switching path.',
    }));
  });

  it('summarizes stable model continuity as no handoff needed', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-stable',
      initialModel: 'sonnet',
      finalModel: 'sonnet',
      routeReason: ['request_received', 'sticky_correction'],
      stickyHit: true,
      alignmentUsed: false,
      cascadeTriggered: false,
      startedAt: 100,
    });

    expect(summarizeSwitchContinuityTrace(trace)).toEqual(expect.objectContaining({
      status: 'stable',
      switched: false,
      finalModel: 'sonnet',
      headline: 'Sticky routing kept the request on sonnet.',
    }));
  });

  it('persists traces to disk and reloads them on restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-governance-trace-'));
    const persistFile = join(dir, 'governance-traces.json');

    try {
      const store = new GovernanceTraceStore({
        persistFile,
        persistEnabled: true,
      });

      store.add(createGovernanceTrace({
        requestId: 'req-persist',
        routeReason: ['sticky_routing'],
        startedAt: 100,
        latencyMs: 12,
      }));
      await store.flushPersistence();

      const persisted = JSON.parse(readFileSync(persistFile, 'utf-8'));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].requestId).toBe('req-persist');

      const reloadedStore = new GovernanceTraceStore({
        persistFile,
        persistEnabled: true,
      });

      expect(reloadedStore.get('req-persist')?.routeReason).toEqual(['sticky_routing']);
      expect(reloadedStore.list()).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not synchronously write traces on the request path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-governance-trace-async-'));
    const persistFile = join(dir, 'governance-traces.json');

    try {
      const store = new GovernanceTraceStore({
        persistFile,
        persistEnabled: true,
        persistDebounceMs: 10_000,
      });

      store.add(createGovernanceTrace({
        requestId: 'req-async-persist',
        routeReason: ['smart_router'],
        startedAt: 100,
      }));

      expect(existsSync(persistFile)).toBe(false);

      await store.flushPersistence();
      expect(JSON.parse(readFileSync(persistFile, 'utf-8'))[0].requestId).toBe('req-async-persist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('archives overflow traces and retains only the configured number of archive files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-governance-archive-'));
    const persistFile = join(dir, 'governance-traces.json');
    const archiveDir = join(dir, 'archives');

    try {
      const store = new GovernanceTraceStore({
        persistFile,
        archiveDir,
        persistEnabled: true,
        activePersistLimit: 2,
        retainArchiveFiles: 2,
      });

      for (let index = 0; index < 6; index += 1) {
        store.add(createGovernanceTrace({
          requestId: `req-archive-${index}`,
          routeReason: ['smart_router'],
          startedAt: 100 + index,
        }));
      }
      await store.flushPersistence();

      const active = JSON.parse(readFileSync(persistFile, 'utf-8'));
      const archives = readdirSync(archiveDir).filter((file) => file.endsWith('.json.gz'));

      expect(active).toHaveLength(2);
      expect(active[0].requestId).toBe('req-archive-5');
      expect(active[1].requestId).toBe('req-archive-4');
      expect(archives.length).toBeLessThanOrEqual(2);
      expect(store.list()).toHaveLength(2);
      expect(store.listArchives()[0].compressed).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists, reads, filters, and deletes archive files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-governance-archive-list-'));
    const persistFile = join(dir, 'governance-traces.json');
    const archiveDir = join(dir, 'archives');

    try {
      const store = new GovernanceTraceStore({
        persistFile,
        archiveDir,
        persistEnabled: true,
        activePersistLimit: 1,
        retainArchiveFiles: 5,
      });

      for (let index = 0; index < 4; index += 1) {
        store.add(createGovernanceTrace({
          requestId: `req-list-${index}`,
          routeReason: ['smart_router'],
          startedAt: new Date(`2026-04-0${index + 1}T08:00:00.000Z`).getTime(),
        }));
      }
      await store.flushPersistence();

      const archives = store.listArchives();
      expect(archives.length).toBeGreaterThan(0);

      const target = archives[0];
      const filtered = store.listArchives({
        date: new Date(target.startedAt ?? 0).toISOString().slice(0, 10),
      });
      const paged = store.listArchives({
        page: 1,
        pageSize: 1,
      });
      const traces = store.getArchivedTraces(target.file);

      expect(filtered.some((item) => item.file === target.file)).toBe(true);
      expect(paged).toHaveLength(1);
      expect(traces.length).toBeGreaterThan(0);
      expect(store.deleteArchive(target.file)).toBe(true);
      expect(store.getArchivedTraces(target.file)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
