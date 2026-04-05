import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  GOVERNANCE_EXPORT_HISTORY_FILE,
  GOVERNANCE_SCHEDULE_FILE,
  GOVERNANCE_SNAPSHOT_DIR,
} from '../constants';
import {
  exportGovernanceMetricsReport,
  getGovernanceMetricsReport,
  IGovernanceMetricsReport,
  IGovernanceMetricsWindowOptions,
  TGovernanceMetricsExportFormat,
} from './metrics';

export interface IGovernanceMetricsExportRecord {
  id: string;
  createdAt: number;
  format: TGovernanceMetricsExportFormat;
  kind: 'manual' | 'scheduled';
  filePath: string;
  windowMs?: number;
  bucketCount: number;
}

export interface IGovernanceSnapshotSchedule {
  id: string;
  intervalMs: number;
  format: TGovernanceMetricsExportFormat;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  options: IGovernanceMetricsWindowOptions;
}

interface IGovernanceMetricsExportStoreOptions {
  historyFile?: string;
  snapshotDir?: string;
  scheduleFile?: string;
  persistEnabled?: boolean;
  retainHistory?: number;
}

export class GovernanceMetricsExportStore {
  private historyFile: string;
  private snapshotDir: string;
  private scheduleFile: string;
  private persistEnabled: boolean;
  private retainHistory: number;
  private history: IGovernanceMetricsExportRecord[] = [];
  private schedules = new Map<string, { meta: IGovernanceSnapshotSchedule; timer?: NodeJS.Timeout }>();

  constructor(options: IGovernanceMetricsExportStoreOptions = {}) {
    this.historyFile = options.historyFile ?? GOVERNANCE_EXPORT_HISTORY_FILE;
    this.snapshotDir = options.snapshotDir ?? GOVERNANCE_SNAPSHOT_DIR;
    this.scheduleFile = options.scheduleFile ?? GOVERNANCE_SCHEDULE_FILE;
    this.persistEnabled = options.persistEnabled ?? process.env.NODE_ENV !== 'test';
    this.retainHistory = options.retainHistory ?? 50;
    this.loadHistory();
    this.loadSchedules();
  }

  listHistory(): IGovernanceMetricsExportRecord[] {
    return [...this.history];
  }

  listSchedules(): IGovernanceSnapshotSchedule[] {
    return Array.from(this.schedules.values())
      .map((item) => ({ ...item.meta }))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  createSnapshot(
    options: IGovernanceMetricsWindowOptions = {},
    format: TGovernanceMetricsExportFormat = 'json',
    kind: 'manual' | 'scheduled' = 'manual'
  ): { record: IGovernanceMetricsExportRecord; report: IGovernanceMetricsReport; content: string } {
    const report = getGovernanceMetricsReport(options);
    const content = exportGovernanceMetricsReport(report, format);
    const timestamp = Date.now();
    const id = `export-${timestamp}-${Math.random().toString(16).slice(2, 8)}`;
    const filePath = join(this.snapshotDir, `${id}.${format}`);

    if (this.persistEnabled) {
      mkdirSync(this.snapshotDir, { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
    }

    const record: IGovernanceMetricsExportRecord = {
      id,
      createdAt: timestamp,
      format,
      kind,
      filePath,
      windowMs: options.windowMs,
      bucketCount: report.bucketCount,
    };

    this.history = [record, ...this.history].slice(0, this.retainHistory);
    this.persistHistory();
    return { record, report, content };
  }

  startSchedule(
    intervalMs: number,
    options: IGovernanceMetricsWindowOptions = {},
    format: TGovernanceMetricsExportFormat = 'json'
  ): IGovernanceSnapshotSchedule {
    const id = `schedule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const meta: IGovernanceSnapshotSchedule = {
      id,
      intervalMs,
      format,
      enabled: true,
      createdAt: Date.now(),
      options,
    };

    const timer = setInterval(() => {
      const result = this.createSnapshot(options, format, 'scheduled');
      const current = this.schedules.get(id);
      if (current) {
        current.meta.lastRunAt = result.record.createdAt;
        this.persistSchedules();
      }
    }, intervalMs);
    timer.unref?.();

    this.schedules.set(id, { meta, timer });
    this.persistSchedules();
    return { ...meta };
  }

  stopSchedule(id: string): boolean {
    const current = this.schedules.get(id);
    if (!current) {
      return false;
    }

    if (current.timer) {
      clearInterval(current.timer);
    }
    current.meta.enabled = false;
    this.schedules.delete(id);
    this.persistSchedules();
    return true;
  }

  clear(): void {
    for (const current of this.schedules.values()) {
      if (current.timer) {
        clearInterval(current.timer);
      }
    }
    this.schedules.clear();
    this.history = [];
    this.persistHistory();
    this.persistSchedules();
  }

  private loadHistory(): void {
    if (!this.persistEnabled || !existsSync(this.historyFile)) {
      return;
    }

    try {
      this.history = JSON.parse(readFileSync(this.historyFile, 'utf-8')) as IGovernanceMetricsExportRecord[];
    } catch {
      this.history = [];
    }
  }

  private persistHistory(): void {
    if (!this.persistEnabled) {
      return;
    }

    mkdirSync(dirname(this.historyFile), { recursive: true });
    writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2), 'utf-8');
  }

  private loadSchedules(): void {
    if (!this.persistEnabled || !existsSync(this.scheduleFile)) {
      return;
    }

    try {
      const schedules = JSON.parse(readFileSync(this.scheduleFile, 'utf-8')) as IGovernanceSnapshotSchedule[];
      for (const schedule of schedules.filter((item) => item.enabled)) {
        this.restoreSchedule(schedule);
      }
    } catch {
      this.schedules.clear();
    }
  }

  private persistSchedules(): void {
    if (!this.persistEnabled) {
      return;
    }

    mkdirSync(dirname(this.scheduleFile), { recursive: true });
    const schedules = Array.from(this.schedules.values()).map((item) => item.meta);
    writeFileSync(this.scheduleFile, JSON.stringify(schedules, null, 2), 'utf-8');
  }

  private restoreSchedule(schedule: IGovernanceSnapshotSchedule): void {
    const timer = setInterval(() => {
      const result = this.createSnapshot(schedule.options, schedule.format, 'scheduled');
      const current = this.schedules.get(schedule.id);
      if (current) {
        current.meta.lastRunAt = result.record.createdAt;
        this.persistSchedules();
      }
    }, schedule.intervalMs);
    timer.unref?.();

    this.schedules.set(schedule.id, {
      meta: { ...schedule, enabled: true },
      timer,
    });
  }
}

export const governanceMetricsExportStore = new GovernanceMetricsExportStore();
