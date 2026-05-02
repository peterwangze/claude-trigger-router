import { describe, expect, it } from 'vitest';
import { buildGovernanceHealthSummary, exportGovernanceMetricsReport, getGovernanceMetricsReport, summarizeGovernanceMetrics, summarizeRoutingOutcomes } from './metrics';
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

  it('summarizes routing outcomes and model switching continuity signals', () => {
    const outcome = summarizeRoutingOutcomes([
      {
        requestId: 'trace-1',
        initialModel: 'sonnet',
        finalModel: 'reasoner',
        routeReason: ['request_received', 'smart_router'],
        stickyHit: false,
        alignmentUsed: true,
        semanticIntent: 'reasoning',
        cascadeTriggered: false,
        shadowChecked: false,
        latencyMs: 120,
        startedAt: 1,
      },
      {
        requestId: 'trace-2',
        initialModel: 'sonnet',
        finalModel: 'sonnet',
        routeReason: ['request_received', 'sticky_correction'],
        stickyHit: true,
        alignmentUsed: false,
        semanticIntent: 'coding',
        cascadeTriggered: false,
        shadowChecked: false,
        latencyMs: 80,
        startedAt: 2,
      },
      {
        requestId: 'trace-3',
        initialModel: 'sonnet',
        finalModel: 'opus',
        routeReason: ['request_received', 'cascade_gate'],
        stickyHit: false,
        alignmentUsed: false,
        semanticIntent: 'coding',
        cascadeTriggered: true,
        shadowChecked: false,
        latencyMs: 220,
        startedAt: 3,
      },
    ]);

    expect(outcome).toEqual(expect.objectContaining({
      totalTraces: 3,
      routedTraces: 3,
      routedRate: 1,
      modelSwitchCount: 2,
      modelSwitchRate: 0.6667,
      stableModelCount: 1,
      stableModelRate: 0.3333,
      alignmentOnSwitchCount: 1,
      alignmentOnSwitchRate: 0.5,
      cascadeAfterSwitchCount: 1,
      cascadeAfterSwitchRate: 0.5,
      contextWindowFallbackCount: 0,
      contextWindowFallbackRate: 0,
      contextWindowExceededCount: 0,
      contextWindowExceededRate: 0,
      averageLatencyByRouteReason: {
        cascade_gate: 220,
        smart_router: 120,
        sticky_correction: 80,
      },
    }));
    expect(outcome.topModelSwitches).toEqual([
      { key: 'sonnet -> opus', from: 'sonnet', to: 'opus', count: 1, rate: 0.5 },
      { key: 'sonnet -> reasoner', from: 'sonnet', to: 'reasoner', count: 1, rate: 0.5 },
    ]);
    expect(outcome.byRouteReason).toEqual([
      expect.objectContaining({ key: 'cascade_gate', totalTraces: 1, modelSwitchRate: 1, cascadeAfterSwitchRate: 1, averageLatencyMs: 220 }),
      expect.objectContaining({ key: 'smart_router', totalTraces: 1, modelSwitchRate: 1, alignmentOnSwitchRate: 1, averageLatencyMs: 120 }),
      expect.objectContaining({ key: 'sticky_correction', totalTraces: 1, modelSwitchRate: 0, averageLatencyMs: 80 }),
    ]);
    expect(outcome.byFinalModel).toEqual([
      expect.objectContaining({ key: 'opus', totalTraces: 1, modelSwitchRate: 1, averageLatencyMs: 220 }),
      expect.objectContaining({ key: 'reasoner', totalTraces: 1, modelSwitchRate: 1, averageLatencyMs: 120 }),
      expect.objectContaining({ key: 'sonnet', totalTraces: 1, modelSwitchRate: 0, averageLatencyMs: 80 }),
    ]);
    expect(outcome.bySemanticIntent).toEqual([
      expect.objectContaining({ key: 'coding', totalTraces: 2, modelSwitchRate: 0.5, averageLatencyMs: 150 }),
      expect.objectContaining({ key: 'reasoning', totalTraces: 1, modelSwitchRate: 1, averageLatencyMs: 120 }),
    ]);
  });

  it('summarizes context window fallback and exceeded routing outcomes', () => {
    const outcome = summarizeRoutingOutcomes([
      {
        requestId: 'trace-context-fallback',
        initialModel: 'sonnet',
        finalModel: 'opus',
        routeReason: ['request_received', 'context_window_fallback:sonnet->opus'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        latencyMs: 180,
        startedAt: 1,
      },
      {
        requestId: 'trace-context-exceeded',
        initialModel: 'sonnet',
        finalModel: 'sonnet',
        routeReason: ['request_received', 'context_window_exceeded:sonnet'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        latencyMs: 12,
        startedAt: 2,
      },
    ]);

    expect(outcome).toEqual(expect.objectContaining({
      totalTraces: 2,
      contextWindowFallbackCount: 1,
      contextWindowFallbackRate: 0.5,
      contextWindowExceededCount: 1,
      contextWindowExceededRate: 0.5,
    }));
    expect(outcome.byRouteReason).toEqual([
      expect.objectContaining({ key: 'context_window_exceeded:sonnet', totalTraces: 1, modelSwitchRate: 0 }),
      expect.objectContaining({ key: 'context_window_fallback:sonnet->opus', totalTraces: 1, modelSwitchRate: 1 }),
    ]);
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
    expect(report.topRouteReasons).toEqual([
      { key: 'smart_router', count: 2, rate: 0.6667 },
      { key: 'sticky', count: 1, rate: 0.3333 },
    ]);
    expect(report.outcome).toEqual(expect.objectContaining({
      totalTraces: 3,
      routedTraces: 3,
      modelSwitchCount: 0,
      modelSwitchRate: 0,
    }));
  });

  it('builds ranked distributions for models and intents', () => {
    governanceTraceStore.clear();

    governanceTraceStore.add({
      requestId: 'trace-1',
      finalModel: 'model-z',
      routeReason: ['semantic:intent:ops'],
      stickyHit: false,
      alignmentUsed: false,
      semanticIntent: 'ops',
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 10,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      finalModel: 'model-a',
      routeReason: ['semantic:intent:ops'],
      stickyHit: false,
      alignmentUsed: false,
      semanticIntent: 'ops',
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 11,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      finalModel: 'model-a',
      routeReason: ['semantic:intent:delivery'],
      stickyHit: false,
      alignmentUsed: false,
      semanticIntent: 'delivery',
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 12,
    });

    const report = getGovernanceMetricsReport();

    expect(report.topFinalModels).toEqual([
      { key: 'model-a', count: 2, rate: 0.6667 },
      { key: 'model-z', count: 1, rate: 0.3333 },
    ]);
    expect(report.topSemanticIntents).toEqual([
      { key: 'ops', count: 2, rate: 0.6667 },
      { key: 'delivery', count: 1, rate: 0.3333 },
    ]);
  });

  it('detects elevated governance anomalies from rates and latest bucket spike', () => {
    governanceTraceStore.clear();

    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 1000,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 2_000,
      latencyMs: 1200,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 7_000,
      latencyMs: 4000,
    });
    governanceTraceStore.add({
      requestId: 'trace-4',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 8_000,
      latencyMs: 4500,
    });

    const report = getGovernanceMetricsReport({
      windowMs: 8_000,
      bucketCount: 4,
      now: 8_000,
    });

    expect(report.anomalies.map((item) => item.type)).toEqual([
      'cascade_rate_high',
      'shadow_rate_high',
      'latency_high',
      'cascade_spike',
      'shadow_spike',
    ]);
    expect(report.anomalies[0].severity).toBe('warn');
    expect(report.health).toEqual(expect.objectContaining({
      status: 'watch',
      message: '5 governance alerts need attention (0 critical / 5 warnings).',
      sampleSize: 4,
      alertCount: 5,
      warnCount: 5,
      criticalCount: 0,
    }));
    expect(report.health?.signals.topRouteReason).toEqual({
      key: 'cascade_gate',
      count: 2,
      rate: 0.5,
    });
    expect(report.health?.actions).toContain('Review cascade triggers and recent failure evidence.');
  });

  it('builds idle and healthy governance health summaries', () => {
    expect(buildGovernanceHealthSummary({
      metrics: summarizeGovernanceMetrics([]),
      anomalies: [],
    })).toEqual(expect.objectContaining({
      status: 'idle',
      message: 'No governance traces yet.',
      sampleSize: 0,
      actions: ['Send requests through the router to collect governance traces.'],
    }));

    const metrics = summarizeGovernanceMetrics([
      {
        requestId: 'trace-1',
        routeReason: ['smart_router'],
        finalModel: 'sonnet',
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 1,
        latencyMs: 80,
      },
    ]);

    expect(buildGovernanceHealthSummary({
      metrics,
      anomalies: [],
      topRouteReasons: [{ key: 'smart_router', count: 1, rate: 1 }],
      topFinalModels: [{ key: 'sonnet', count: 1, rate: 1 }],
    })).toEqual(expect.objectContaining({
      status: 'healthy',
      message: 'Healthy over 1 traces.',
      sampleSize: 1,
      alertCount: 0,
      signals: expect.objectContaining({
        averageLatencyMs: 80,
        topRouteReason: { key: 'smart_router', count: 1, rate: 1 },
        topFinalModel: { key: 'sonnet', count: 1, rate: 1 },
      }),
    }));
  });

  it('adds health actions for context window routing outcomes', () => {
    const traces = [
      {
        requestId: 'trace-context-exceeded',
        routeReason: ['request_received', 'context_window_exceeded:sonnet'],
        finalModel: 'sonnet',
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 1,
      },
    ];

    const metrics = summarizeGovernanceMetrics(traces);
    const outcome = summarizeRoutingOutcomes(traces);

    expect(buildGovernanceHealthSummary({
      metrics,
      outcome,
      anomalies: [],
    }).actions).toContain('Review model context window metadata and Router.longContext coverage.');
  });

  it('builds routing tuning recommendations from outcome evidence', () => {
    const traces = [
      {
        requestId: 'trace-switch-1',
        initialModel: 'haiku',
        finalModel: 'sonnet',
        routeReason: ['smart_router'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: true,
        shadowChecked: false,
        startedAt: 1,
        latencyMs: 1800,
      },
      {
        requestId: 'trace-switch-2',
        initialModel: 'haiku',
        finalModel: 'sonnet',
        routeReason: ['smart_router'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: true,
        shadowChecked: false,
        startedAt: 2,
        latencyMs: 1600,
      },
      {
        requestId: 'trace-context',
        initialModel: 'haiku',
        finalModel: 'haiku',
        routeReason: ['context_window_exceeded:haiku'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 3,
        latencyMs: 120,
      },
      {
        requestId: 'trace-switch-3',
        initialModel: 'haiku',
        finalModel: 'opus',
        routeReason: ['semantic_match'],
        stickyHit: false,
        alignmentUsed: true,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 4,
        latencyMs: 100,
      },
      {
        requestId: 'trace-switch-4',
        initialModel: 'haiku',
        finalModel: 'opus',
        routeReason: ['semantic_match'],
        stickyHit: false,
        alignmentUsed: true,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 5,
        latencyMs: 100,
      },
      {
        requestId: 'trace-slowest',
        initialModel: 'opus',
        finalModel: 'opus',
        routeReason: ['tool_use'],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: 6,
        latencyMs: 3200,
      },
    ];
    const metrics = summarizeGovernanceMetrics(traces);
    const outcome = summarizeRoutingOutcomes(traces);
    const health = buildGovernanceHealthSummary({
      metrics,
      outcome,
      anomalies: [],
    });

    expect(health.routingTuning).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'context_window_exceeded',
        severity: 'critical',
      }),
      expect.objectContaining({
        code: 'switch_without_alignment',
        severity: 'warn',
      }),
      expect.objectContaining({
        code: 'switch_cascade_risk',
        severity: 'critical',
      }),
      expect.objectContaining({
        code: 'slow_route_group',
        severity: 'critical',
        evidence: 'tool_use:averageLatencyMs=3200',
      }),
    ]));
    expect(health.actions).toContain('Enable or tune SmartRouter sticky alignment for high-switch routes.');
    expect(health.actions).toContain('Review high-cascade route groups before widening SmartRouter candidates.');
  });

  it('exports governance metrics reports as csv', () => {
    const csv = exportGovernanceMetricsReport({
      bucketCount: 1,
      metrics: {
        totalTraces: 2,
        stickyHitCount: 1,
        stickyHitRate: 0.5,
        alignmentUsedCount: 1,
        alignmentUsedRate: 0.5,
        cascadeTriggeredCount: 1,
        cascadeTriggeredRate: 0.5,
        shadowCheckedCount: 1,
        shadowCheckedRate: 0.5,
        averageLatencyMs: 120,
        averageEstimatedCost: 0.2,
        routeReasonDistribution: { sticky: 1 },
        finalModelDistribution: { 'model-a': 2 },
        semanticIntentDistribution: { review: 1 },
      },
      outcome: {
        totalTraces: 2,
        routedTraces: 2,
        routedRate: 1,
        modelSwitchCount: 1,
        modelSwitchRate: 0.5,
        stableModelCount: 1,
        stableModelRate: 0.5,
        alignmentOnSwitchCount: 1,
        alignmentOnSwitchRate: 1,
        cascadeAfterSwitchCount: 0,
        cascadeAfterSwitchRate: 0,
        contextWindowFallbackCount: 1,
        contextWindowFallbackRate: 0.5,
        contextWindowExceededCount: 0,
        contextWindowExceededRate: 0,
        averageLatencyByRouteReason: { sticky: 120 },
        topModelSwitches: [
          { key: 'model-a -> model-b', from: 'model-a', to: 'model-b', count: 1, rate: 1 },
        ],
        byRouteReason: [
          {
            key: 'sticky',
            totalTraces: 2,
            rate: 1,
            modelSwitchCount: 1,
            modelSwitchRate: 0.5,
            alignmentOnSwitchCount: 1,
            alignmentOnSwitchRate: 1,
            cascadeAfterSwitchCount: 0,
            cascadeAfterSwitchRate: 0,
            averageLatencyMs: 120,
          },
        ],
        byFinalModel: [
          {
            key: 'model-a',
            totalTraces: 2,
            rate: 1,
            modelSwitchCount: 1,
            modelSwitchRate: 0.5,
            alignmentOnSwitchCount: 1,
            alignmentOnSwitchRate: 1,
            cascadeAfterSwitchCount: 0,
            cascadeAfterSwitchRate: 0,
            averageLatencyMs: 120,
          },
        ],
        bySemanticIntent: [
          {
            key: 'review',
            totalTraces: 1,
            rate: 0.5,
            modelSwitchCount: 1,
            modelSwitchRate: 1,
            alignmentOnSwitchCount: 1,
            alignmentOnSwitchRate: 1,
            cascadeAfterSwitchCount: 0,
            cascadeAfterSwitchRate: 0,
            averageLatencyMs: 120,
          },
        ],
      },
      buckets: [
        {
          bucketStart: 1,
          bucketEnd: 2,
          label: 'bucket-1',
          metrics: {
            totalTraces: 2,
            stickyHitCount: 1,
            stickyHitRate: 0.5,
            alignmentUsedCount: 1,
            alignmentUsedRate: 0.5,
            cascadeTriggeredCount: 1,
            cascadeTriggeredRate: 0.5,
            shadowCheckedCount: 1,
            shadowCheckedRate: 0.5,
            averageLatencyMs: 120,
            averageEstimatedCost: 0.2,
            routeReasonDistribution: {},
            finalModelDistribution: {},
            semanticIntentDistribution: {},
          },
        },
      ],
      topRouteReasons: [{ key: 'sticky', count: 1, rate: 0.5 }],
      topFinalModels: [{ key: 'model-a', count: 2, rate: 1 }],
      topSemanticIntents: [{ key: 'review', count: 1, rate: 0.5 }],
      anomalies: [{ type: 'cascade_rate_high', severity: 'warn', message: 'x', metric: 'cascadeTriggeredRate', value: 0.5 }],
      health: {
        status: 'watch',
        message: '1 governance alert needs attention (0 critical / 1 warning).',
        sampleSize: 2,
        alertCount: 1,
        warnCount: 1,
        criticalCount: 0,
        signals: {
          stickyHitRate: 0.5,
          cascadeTriggeredRate: 0.5,
          shadowCheckedRate: 0.5,
          alignmentUsedRate: 0.5,
          modelSwitchRate: 0.5,
          alignmentOnSwitchRate: 1,
          contextWindowFallbackRate: 0.5,
          contextWindowExceededRate: 0,
          averageLatencyMs: 120,
        },
        actions: ['Continue monitoring route and model distributions.'],
        routingTuning: [
          {
            code: 'context_window_fallback_high',
            severity: 'info',
            message: 'Long-context fallback is frequent enough to affect latency planning.',
            evidence: 'contextWindowFallbackRate=50%',
            action: 'Monitor context window fallback rate and long-context model latency.',
          },
        ],
      },
    }, 'csv');

    expect(csv).toContain('section,key,value');
    expect(csv).toContain('summary,totalTraces,2');
    expect(csv).toContain('outcome,modelSwitchRate,0.5');
    expect(csv).toContain('outcome,contextWindowFallbackRate,0.5');
    expect(csv).toContain('outcome,contextWindowExceededRate,0');
    expect(csv).toContain('anomaly,cascade_rate_high,warn:0.5');
    expect(csv).toContain('routingTuning,context_window_fallback_high,info:contextWindowFallbackRate=50%');
    expect(csv).toContain('topFinalModel,model-a,2:1');
    expect(csv).toContain('topModelSwitch,model-a -> model-b,1:1');
    expect(csv).toContain('outcomeByRouteReason,sticky,2:0.5:120');
    expect(csv).toContain('outcomeByFinalModel,model-a,2:0.5:120');
    expect(csv).toContain('outcomeBySemanticIntent,review,1:1:120');
    expect(csv).toContain('bucket,bucket-1,2:0.5:0.5:0.5:0.5');
  });

  it('supports custom anomaly thresholds and dynamic baselines', () => {
    governanceTraceStore.clear();

    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 900,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 2_000,
      latencyMs: 1200,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 8_000,
      latencyMs: 1600,
    });

    const defaultReport = getGovernanceMetricsReport({
      windowMs: 8_000,
      bucketCount: 4,
      now: 8_000,
    });
    const customReport = getGovernanceMetricsReport({
      windowMs: 8_000,
      bucketCount: 4,
      now: 8_000,
      anomalyThresholds: {
        minSampleSize: 2,
        cascadeWarnRate: 0.6,
        shadowWarnRate: 0.6,
        latencyWarnMs: 1000,
        spikeWarnRate: 0.4,
        spikeDeltaRate: 0.2,
      },
    });

    expect(defaultReport.anomalies.map((item) => item.type)).not.toContain('latency_high');
    expect(customReport.anomalies.map((item) => item.type)).toContain('latency_high');
    expect(customReport.anomalies.map((item) => item.type)).toContain('cascade_spike');
    expect(customReport.anomalies.map((item) => item.type)).toContain('shadow_spike');
  });
});
