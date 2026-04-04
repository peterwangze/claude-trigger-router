import { describe, expect, it } from 'vitest';
import { getGovernanceMetricsReport, summarizeGovernanceMetrics } from './metrics';
import { governanceTraceStore } from './trace';

describe('summarizeGovernanceMetrics', () => {
  it('aggregates rates, distributions, and averages from traces', () => {
    const metrics = summarizeGovernanceMetrics([
      {
        requestId: 'trace-1',
        sessionKey: 'session-a',
        finalModel: 'model-a',
        routeReason: ['sticky', 'semantic:intent:code_review'],
        stickyHit: true,
        alignmentUsed: true,
        semanticIntent: 'code_review',
        cascadeTriggered: false,
        cascadeEvidence: [],
        shadowChecked: true,
        latencyMs: 120,
        estimatedCost: 0.12,
        startedAt: 1,
      },
      {
        requestId: 'trace-2',
        sessionKey: 'session-b',
        finalModel: 'model-b',
        routeReason: ['smart_router'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: true,
        cascadeEvidence: ['compile_failure'],
        shadowChecked: false,
        latencyMs: 80,
        estimatedCost: 0.08,
        startedAt: 2,
      },
    ]);

    expect(metrics.totalTraces).toBe(2);
    expect(metrics.stickyHitCount).toBe(1);
    expect(metrics.stickyHitRate).toBe(0.5);
    expect(metrics.alignmentUsedRate).toBe(0.5);
    expect(metrics.cascadeTriggeredRate).toBe(0.5);
    expect(metrics.shadowCheckedRate).toBe(0.5);
    expect(metrics.averageLatencyMs).toBe(100);
    expect(metrics.averageEstimatedCost).toBe(0.1);
    expect(metrics.routeReasonDistribution).toEqual({
      sticky: 1,
      'semantic:intent:code_review': 1,
      smart_router: 1,
    });
    expect(metrics.finalModelDistribution).toEqual({
      'model-a': 1,
      'model-b': 1,
    });
    expect(metrics.semanticIntentDistribution).toEqual({
      code_review: 1,
    });
  });

  it('returns zero-safe metrics when traces are empty', () => {
    expect(summarizeGovernanceMetrics([])).toEqual({
      totalTraces: 0,
      stickyHitCount: 0,
      stickyHitRate: 0,
      alignmentUsedCount: 0,
      alignmentUsedRate: 0,
      cascadeTriggeredCount: 0,
      cascadeTriggeredRate: 0,
      shadowCheckedCount: 0,
      shadowCheckedRate: 0,
      averageLatencyMs: 0,
      averageEstimatedCost: 0,
      routeReasonDistribution: {},
      finalModelDistribution: {},
      semanticIntentDistribution: {},
    });
  });

  it('builds time-window buckets for recent traces', () => {
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
      latencyMs: 10,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: true,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 4_000,
      latencyMs: 20,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 8_000,
      latencyMs: 30,
    });

    const report = getGovernanceMetricsReport({
      windowMs: 8_000,
      bucketCount: 4,
      now: 8_000,
    });

    expect(report.windowStart).toBe(0);
    expect(report.windowEnd).toBe(8_000);
    expect(report.metrics.totalTraces).toBe(3);
    expect(report.buckets).toHaveLength(4);
    expect(report.buckets[0].metrics.totalTraces).toBe(1);
    expect(report.buckets[0].metrics.stickyHitRate).toBe(1);
    expect(report.buckets[1].metrics.totalTraces).toBe(0);
    expect(report.buckets[2].metrics.totalTraces).toBe(1);
    expect(report.buckets[2].metrics.cascadeTriggeredRate).toBe(1);
    expect(report.buckets[3].metrics.totalTraces).toBe(1);
  });
});
