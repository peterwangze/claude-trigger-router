/**
 * Governance Trace Utilities
 *
 * 治理层链路追踪工具
 */

import { randomUUID } from 'crypto';
import { IGovernanceTrace } from './types';

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
