import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { GovernanceMetricsExportStore } from './metrics-export';
import { governanceTraceStore } from './trace';

describe('GovernanceMetricsExportStore', () => {
  it('records snapshot history and writes snapshot files', () => {
    governanceTraceStore.clear();
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['sticky'],
      stickyHit: true,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
    });

    const dir = mkdtempSync(join(tmpdir(), 'ctr-metrics-export-'));
    try {
      const store = new GovernanceMetricsExportStore({
        historyFile: join(dir, 'history.json'),
        snapshotDir: join(dir, 'snapshots'),
        persistEnabled: true,
      });

      const result = store.createSnapshot({ windowMs: 8_000, now: 8_000 }, 'json');
      const files = readdirSync(join(dir, 'snapshots'));

      expect(result.record.kind).toBe('manual');
      expect(store.listHistory()).toHaveLength(1);
      expect(files.some((file) => file.endsWith('.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers schedules and exposes schedule metadata', () => {
    const store = new GovernanceMetricsExportStore({
      persistEnabled: false,
    });

    try {
      const schedule = store.startSchedule(1000, { windowMs: 3_600_000 }, 'csv');
      const schedules = store.listSchedules();

      expect(schedule.intervalMs).toBe(1000);
      expect(schedules).toHaveLength(1);
      expect(schedules[0].format).toBe('csv');
      expect(store.stopSchedule(schedule.id)).toBe(true);
      expect(store.listSchedules()).toHaveLength(0);
    } finally {
      store.clear();
    }
  });

  it('persists schedules and restores them on restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-metrics-schedule-'));
    try {
      const historyFile = join(dir, 'history.json');
      const snapshotDir = join(dir, 'snapshots');
      const scheduleFile = join(dir, 'schedules.json');

      const store = new GovernanceMetricsExportStore({
        historyFile,
        snapshotDir,
        scheduleFile,
        persistEnabled: true,
      });

      const schedule = store.startSchedule(1000, { windowMs: 60_000 }, 'csv');

      const reloadedStore = new GovernanceMetricsExportStore({
        historyFile,
        snapshotDir,
        scheduleFile,
        persistEnabled: true,
      });

      expect(reloadedStore.listSchedules().length).toBeGreaterThan(0);
      expect(reloadedStore.listSchedules()[0].intervalMs).toBe(1000);
      expect(reloadedStore.listSchedules()[0].format).toBe('csv');
      reloadedStore.stopSchedule(reloadedStore.listSchedules()[0].id);
      store.stopSchedule(schedule.id);
      store.clear();
      reloadedStore.clear();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
