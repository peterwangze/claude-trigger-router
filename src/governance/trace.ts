/**
 * Governance Trace Utilities
 *
 * 治理层链路追踪工具
 */

import { randomUUID } from 'crypto';
import { LRUCache } from 'lru-cache';
import { IGovernanceTrace } from './types';

class GovernanceTraceStore {
  private cache: LRUCache<string, IGovernanceTrace>;

  constructor() {
    this.cache = new LRUCache<string, IGovernanceTrace>({
      max: 500,
      ttl: 1000 * 60 * 60,
    });
  }

  add(trace: IGovernanceTrace): void {
    this.cache.set(trace.requestId, { ...trace, routeReason: [...trace.routeReason] });
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
