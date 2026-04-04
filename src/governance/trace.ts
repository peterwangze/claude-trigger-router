/**
 * Governance Trace Utilities
 *
 * 治理层链路追踪工具
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { LRUCache } from 'lru-cache';
import { dirname } from 'path';
import { GOVERNANCE_TRACE_FILE } from '../constants';
import { IGovernanceTrace } from './types';

export interface IGovernanceTraceStoreOptions {
  max?: number;
  ttlMs?: number;
  persistFile?: string;
  persistEnabled?: boolean;
}

export class GovernanceTraceStore {
  private cache: LRUCache<string, IGovernanceTrace>;
  private persistFile?: string;
  private persistEnabled: boolean;

  constructor(options: IGovernanceTraceStoreOptions = {}) {
    const max = options.max ?? 500;
    const ttlMs = options.ttlMs ?? 1000 * 60 * 60;
    this.cache = new LRUCache<string, IGovernanceTrace>({
      max,
      ttl: ttlMs,
    });
    this.persistFile = options.persistFile ?? GOVERNANCE_TRACE_FILE;
    this.persistEnabled = options.persistEnabled ?? process.env.NODE_ENV !== 'test';
    this.loadFromDisk();
  }

  add(trace: IGovernanceTrace): void {
    this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
    this.persistToDisk();
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
    this.persistToDisk();
  }

  hydrate(traces: IGovernanceTrace[]): void {
    this.cache.clear();
    for (const trace of traces) {
      this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
    }
    this.persistToDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistEnabled || !this.persistFile || !existsSync(this.persistFile)) {
      return;
    }

    try {
      const content = readFileSync(this.persistFile, 'utf-8');
      const traces = JSON.parse(content) as IGovernanceTrace[];
      for (const trace of traces) {
        this.cache.set(trace.requestId, { ...trace, routeReason: [...(trace.routeReason ?? [])] });
      }
    } catch {
      // Ignore persistence corruption and continue with in-memory mode.
    }
  }

  private persistToDisk(): void {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    try {
      mkdirSync(dirname(this.persistFile), { recursive: true });
      const traces = Array.from(this.cache.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      writeFileSync(this.persistFile, JSON.stringify(traces, null, 2), 'utf-8');
    } catch {
      // Keep runtime resilient even if local persistence fails.
    }
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
