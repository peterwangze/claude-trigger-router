import { beforeEach, describe, expect, it } from 'vitest';
import { governanceTraceStore } from './trace';
import { buildRoutingAdvisorSummary, formatRoutingAdvisorPromptSection, orderCandidatesByRoutingAdvisor } from './routing-advisor';
import type { IGovernanceTrace } from './types';

function trace(input: Partial<IGovernanceTrace> & Pick<IGovernanceTrace, 'requestId' | 'finalModel' | 'semanticIntent'>): IGovernanceTrace {
  return {
    requestId: input.requestId,
    routeReason: input.routeReason ?? ['smart_router'],
    stickyHit: false,
    alignmentUsed: input.alignmentUsed ?? false,
    semanticIntent: input.semanticIntent,
    cascadeTriggered: input.cascadeTriggered ?? false,
    shadowChecked: input.shadowChecked ?? false,
    latencyMs: input.latencyMs,
    finalModel: input.finalModel,
    startedAt: input.startedAt ?? Date.now(),
    completedAt: input.completedAt,
  };
}

describe('routing advisor', () => {
  beforeEach(() => {
    governanceTraceStore.clear();
  });

  it('builds candidate profiles from comparable routing outcomes', () => {
    governanceTraceStore.hydrate([
      trace({ requestId: 'fast-1', semanticIntent: 'coding', finalModel: 'provider,fast', latencyMs: 120 }),
      trace({ requestId: 'deep-1', semanticIntent: 'coding', finalModel: 'provider,deep', latencyMs: 600, cascadeTriggered: true }),
      trace({ requestId: 'fast-2', semanticIntent: 'review', finalModel: 'provider,fast', latencyMs: 140 }),
      trace({ requestId: 'deep-2', semanticIntent: 'review', finalModel: 'provider,deep', latencyMs: 500 }),
    ]);

    const summary = buildRoutingAdvisorSummary({
      candidates: [
        { model: 'provider,fast', description: 'fast model' },
        { model: 'provider,deep', description: 'deep model' },
      ],
    });

    expect(summary).toEqual(expect.objectContaining({
      totalComparedTasks: 2,
      preferredModel: 'provider,fast',
    }));
    expect(summary?.candidateProfiles[0]).toEqual(expect.objectContaining({
      model: 'provider,fast',
      profileSource: 'history',
      fastestCount: 2,
    }));
    expect(summary?.evidence.join('\n')).toContain('preferred candidate provider,fast');
  });

  it('orders candidates by historical advisor score and formats prompt evidence', () => {
    governanceTraceStore.hydrate([
      trace({ requestId: 'a', semanticIntent: 'coding', finalModel: 'provider,fast', latencyMs: 90 }),
      trace({ requestId: 'b', semanticIntent: 'coding', finalModel: 'provider,deep', latencyMs: 900, cascadeTriggered: true }),
    ]);
    const candidates = [
      { model: 'provider,deep', description: 'deep model' },
      { model: 'provider,fast', description: 'fast model' },
    ];
    const summary = buildRoutingAdvisorSummary({ candidates });

    expect(orderCandidatesByRoutingAdvisor(candidates, summary).map((candidate) => candidate.model)).toEqual([
      'provider,fast',
      'provider,deep',
    ]);
    expect(formatRoutingAdvisorPromptSection(summary!)).toContain('Preferred model from recent evidence: provider,fast');
  });
});
