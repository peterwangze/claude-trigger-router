import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
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

    appendTraceReason(trace, 'trigger_rule:architecture');
    appendTraceReason(trace, 'trigger_rule:architecture');
    appendTraceReason(trace, 'smart_router');

    expect(trace.routeReason).toEqual([
      'trigger_rule:architecture',
      'smart_router',
    ]);
  });

  it('finalizes trace and computes latency', () => {
    const trace = createGovernanceTrace({
      requestId: 'req-3',
      startedAt: 100,
      routeReason: ['trigger_rule:image_generation'],
    });

    const finalized = finalizeTrace(trace, {
      finalModel: 'openrouter,dall-e-3',
      completedAt: 180,
    });

    expect(finalized.finalModel).toBe('openrouter,dall-e-3');
    expect(finalized.completedAt).toBe(180);
    expect(finalized.latencyMs).toBe(80);
    expect(finalized.routeReason).toEqual(['trigger_rule:image_generation']);
  });

  it('persists traces to disk and reloads them on restart', () => {
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

  it('archives overflow traces and retains only the configured number of archive files', () => {
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

      const active = JSON.parse(readFileSync(persistFile, 'utf-8'));
      const archives = readdirSync(archiveDir).filter((file) => file.endsWith('.json'));

      expect(active).toHaveLength(2);
      expect(active[0].requestId).toBe('req-archive-5');
      expect(active[1].requestId).toBe('req-archive-4');
      expect(archives.length).toBeLessThanOrEqual(2);
      expect(store.list()).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
