import { describe, expect, it } from 'vitest';
import { appendTraceReason, createGovernanceTrace, finalizeTrace } from './trace';

describe('governance trace', () => {
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
});
