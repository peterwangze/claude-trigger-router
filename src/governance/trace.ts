/**
 * Governance Trace Utilities
 *
 * 治理层链路追踪工具
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { LRUCache } from 'lru-cache';
import { dirname, join } from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { GOVERNANCE_TRACE_ARCHIVE_DIR, GOVERNANCE_TRACE_FILE } from '../constants';
import { IGovernanceTrace } from './types';

export interface IGovernanceTraceStoreOptions {
  max?: number;
  ttlMs?: number;
  persistFile?: string;
  persistEnabled?: boolean;
  activePersistLimit?: number;
  archiveDir?: string;
  retainArchiveFiles?: number;
  compressArchives?: boolean;
  persistDebounceMs?: number;
}

export interface IGovernanceTraceArchiveRecord {
  file: string;
  filePath: string;
  traceCount: number;
  startedAt?: number;
  endedAt?: number;
  compressed: boolean;
}

export class GovernanceTraceStore {
  private cache: LRUCache<string, IGovernanceTrace>;
  private persistFile?: string;
  private persistEnabled: boolean;
  private activePersistLimit: number;
  private archiveDir?: string;
  private retainArchiveFiles: number;
  private compressArchives: boolean;
  private persistDebounceMs: number;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: IGovernanceTraceStoreOptions = {}) {
    const max = options.max ?? 500;
    const ttlMs = options.ttlMs ?? 1000 * 60 * 60;
    this.cache = new LRUCache<string, IGovernanceTrace>({
      max,
      ttl: ttlMs,
    });
    this.persistFile = options.persistFile ?? GOVERNANCE_TRACE_FILE;
    this.persistEnabled = options.persistEnabled ?? process.env.NODE_ENV !== 'test';
    this.activePersistLimit = options.activePersistLimit ?? 200;
    this.archiveDir = options.archiveDir ?? GOVERNANCE_TRACE_ARCHIVE_DIR;
    this.retainArchiveFiles = options.retainArchiveFiles ?? 5;
    this.compressArchives = options.compressArchives ?? true;
    this.persistDebounceMs = options.persistDebounceMs ?? 25;
    this.loadFromDisk();
  }

  add(trace: IGovernanceTrace): void {
    this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
    this.schedulePersistToDisk();
  }

  get(requestId: string): IGovernanceTrace | undefined {
    return this.cache.get(requestId);
  }

  list(filters?: {
    requestId?: string;
    sessionKey?: string;
    routeReason?: string;
    cascadeTriggered?: boolean;
    shadowChecked?: boolean;
    limit?: number;
  }): IGovernanceTrace[] {
    let traces = Array.from(this.cache.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

    if (filters?.requestId) {
      traces = traces.filter((trace) => trace.requestId === filters.requestId);
    }

    if (filters?.sessionKey) {
      traces = traces.filter((trace) => trace.sessionKey === filters.sessionKey);
    }

    if (filters?.routeReason) {
      traces = traces.filter((trace) => trace.routeReason.includes(filters.routeReason!));
    }

    if (filters?.cascadeTriggered !== undefined) {
      traces = traces.filter((trace) => trace.cascadeTriggered === filters.cascadeTriggered);
    }

    if (filters?.shadowChecked !== undefined) {
      traces = traces.filter((trace) => trace.shadowChecked === filters.shadowChecked);
    }

    if (filters?.limit !== undefined && Number.isFinite(filters.limit) && filters.limit > 0) {
      traces = traces.slice(0, filters.limit);
    }

    return traces;
  }

  clear(): void {
    this.cache.clear();
    this.schedulePersistToDisk();
    this.clearArchives();
  }

  hydrate(traces: IGovernanceTrace[]): void {
    this.cache.clear();
    for (const trace of traces) {
      this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
    }
    this.schedulePersistToDisk();
  }

  async flushPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
      this.enqueuePersistToDisk();
    }
    await this.persistQueue;
  }

  listArchives(filters?: {
    date?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
  }): IGovernanceTraceArchiveRecord[] {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return [];
    }

    let records = readdirSync(this.archiveDir)
      .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
      .sort()
      .reverse()
      .map((file) => this.readArchiveRecord(file))
      .filter((record): record is IGovernanceTraceArchiveRecord => Boolean(record));

    if (filters?.date) {
      records = records.filter((record) => {
        const started = record.startedAt ? new Date(record.startedAt).toISOString().slice(0, 10) : '';
        const ended = record.endedAt ? new Date(record.endedAt).toISOString().slice(0, 10) : '';
        return started === filters.date || ended === filters.date;
      });
    }

    const pageSize = filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : undefined;
    const page = filters?.page && filters.page > 0 ? filters.page : 1;

    if (pageSize) {
      const start = (page - 1) * pageSize;
      records = records.slice(start, start + pageSize);
    } else if (filters?.limit && filters.limit > 0) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  getArchivedTraces(file: string): IGovernanceTrace[] {
    if (!this.archiveDir) {
      return [];
    }

    const filePath = join(this.archiveDir, file);
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      return this.readArchiveFile(filePath);
    } catch {
      return [];
    }
  }

  deleteArchive(file: string): boolean {
    if (!this.archiveDir) {
      return false;
    }

    const filePath = join(this.archiveDir, file);
    if (!existsSync(filePath)) {
      return false;
    }

    rmSync(filePath, { force: true });
    return true;
  }

  private loadFromDisk(): void {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    try {
      const traces: IGovernanceTrace[] = [];

      if (existsSync(this.persistFile)) {
        const content = readFileSync(this.persistFile, 'utf-8');
        traces.push(...(JSON.parse(content) as IGovernanceTrace[]));
      }

      if (this.archiveDir && existsSync(this.archiveDir)) {
        const archiveFiles = readdirSync(this.archiveDir)
          .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
          .sort()
          .reverse();

        for (const file of archiveFiles) {
          traces.push(...this.readArchiveFile(join(this.archiveDir, file)));
        }
      }

      const deduped = new Map<string, IGovernanceTrace>();
      for (const trace of traces.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))) {
        if (!deduped.has(trace.requestId)) {
          deduped.set(trace.requestId, trace);
        }
      }

      for (const trace of Array.from(deduped.values()).slice(0, this.cache.max)) {
        this.cache.set(trace.requestId, { ...trace, routeReason: [...(trace.routeReason ?? [])] });
      }
    } catch {
      // Ignore persistence corruption and continue with in-memory mode.
    }
  }

  private schedulePersistToDisk(): void {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    if (this.persistTimer) {
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.enqueuePersistToDisk();
    }, this.persistDebounceMs);
    this.persistTimer.unref?.();
  }

  private enqueuePersistToDisk(): void {
    this.persistQueue = this.persistQueue
      .then(() => this.persistToDisk())
      .catch(() => undefined);
  }

  private async persistToDisk(): Promise<void> {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    try {
      await mkdir(dirname(this.persistFile), { recursive: true });
      const traces = Array.from(this.cache.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      const activeTraces = traces.slice(0, this.activePersistLimit);
      const archivedTraces = traces.slice(this.activePersistLimit);

      if (archivedTraces.length > 0 && this.archiveDir) {
        await this.writeArchive(archivedTraces);
        this.pruneArchives();
        this.cache.clear();
        for (const trace of activeTraces) {
          this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
        }
      }

      await writeFile(this.persistFile, JSON.stringify(activeTraces, null, 2), 'utf-8');
    } catch {
      // Keep runtime resilient even if local persistence fails.
    }
  }

  private async writeArchive(traces: IGovernanceTrace[]): Promise<void> {
    if (!this.archiveDir || traces.length === 0) {
      return;
    }

    await mkdir(this.archiveDir, { recursive: true });
    const filename = this.compressArchives
      ? `governance-traces-${Date.now()}.json.gz`
      : `governance-traces-${Date.now()}.json`;
    const filePath = join(this.archiveDir, filename);
    const content = JSON.stringify(traces, null, 2);
    if (this.compressArchives) {
      await writeFile(filePath, gzipSync(Buffer.from(content, 'utf-8')));
      return;
    }
    await writeFile(filePath, content, 'utf-8');
  }

  private readArchiveRecord(file: string): IGovernanceTraceArchiveRecord | null {
    if (!this.archiveDir) {
      return null;
    }

    const filePath = join(this.archiveDir, file);
    try {
      const traces = this.readArchiveFile(filePath);
      const startedAtValues = traces.map((trace) => trace.startedAt).filter((value) => typeof value === 'number');
      return {
        file,
        filePath,
        traceCount: traces.length,
        startedAt: startedAtValues.length ? Math.min(...startedAtValues) : undefined,
        endedAt: startedAtValues.length ? Math.max(...startedAtValues) : undefined,
        compressed: file.endsWith('.gz'),
      };
    } catch {
      return null;
    }
  }

  private pruneArchives(): void {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return;
    }

    const archiveFiles = readdirSync(this.archiveDir)
      .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
      .sort()
      .reverse();

    for (const file of archiveFiles.slice(this.retainArchiveFiles)) {
      rmSync(join(this.archiveDir, file), { force: true });
    }
  }

  private clearArchives(): void {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return;
    }

    for (const file of readdirSync(this.archiveDir).filter((item) => item.endsWith('.json') || item.endsWith('.json.gz'))) {
      rmSync(join(this.archiveDir, file), { force: true });
    }
  }

  private readArchiveFile(filePath: string): IGovernanceTrace[] {
    if (filePath.endsWith('.gz')) {
      const content = gunzipSync(readFileSync(filePath)).toString('utf-8');
      return JSON.parse(content) as IGovernanceTrace[];
    }
    return JSON.parse(readFileSync(filePath, 'utf-8')) as IGovernanceTrace[];
  }
}

export const governanceTraceStore = new GovernanceTraceStore();

export function createGovernanceTrace(
  input: Partial<IGovernanceTrace> = {}
): IGovernanceTrace {
  return {
    requestId: input.requestId ?? randomUUID(),
    sessionKey: input.sessionKey,
    initialModel: input.initialModel,
    finalModel: input.finalModel,
    routeReason: input.routeReason ? [...input.routeReason] : [],
    stickyHit: input.stickyHit ?? false,
    alignmentUsed: input.alignmentUsed ?? false,
    semanticIntent: input.semanticIntent,
    cascadeTriggered: input.cascadeTriggered ?? false,
    cascadeEvidence: input.cascadeEvidence ? [...input.cascadeEvidence] : [],
    cascadeNextModel: input.cascadeNextModel,
    shadowChecked: input.shadowChecked ?? false,
    verificationResult: input.verificationResult,
    latencyMs: input.latencyMs,
    estimatedCost: input.estimatedCost,
    startedAt: input.startedAt ?? Date.now(),
    completedAt: input.completedAt,
  };
}

export function appendTraceReason(trace: IGovernanceTrace, reason: string): IGovernanceTrace {
  if (!trace.routeReason.includes(reason)) {
    trace.routeReason.push(reason);
  }
  return trace;
}

export function finalizeTrace(
  trace: IGovernanceTrace,
  overrides: Partial<IGovernanceTrace> = {}
): IGovernanceTrace {
  const completedAt = overrides.completedAt ?? Date.now();
  return {
    ...trace,
    ...overrides,
    routeReason: overrides.routeReason ? [...overrides.routeReason] : [...trace.routeReason],
    completedAt,
    latencyMs: overrides.latencyMs ?? Math.max(0, completedAt - trace.startedAt),
  };
}

export function recordGovernanceTrace(trace: IGovernanceTrace): IGovernanceTrace {
  governanceTraceStore.add(trace);
  return trace;
}
