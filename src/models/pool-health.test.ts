import { describe, expect, it } from 'vitest';
import { ModelPoolHealthStore } from './pool-health';

describe('ModelPoolHealthStore', () => {
  it('keeps an endpoint cooling before opening its circuit after repeated failures', () => {
    const store = new ModelPoolHealthStore(1_000, 3, 5_000);

    expect(store.recordFailure('sonnet', 'edge-a', 10_000)).toEqual(
      expect.objectContaining({
        status: 'cooldown',
        failureCount: 1,
        cooldownUntil: 11_000,
      })
    );
    expect(store.recordFailure('sonnet', 'edge-a', 10_500)).toEqual(
      expect.objectContaining({
        status: 'cooldown',
        failureCount: 2,
        cooldownUntil: 11_500,
      })
    );

    const openSnapshot = store.recordFailure('sonnet', 'edge-a', 11_000);
    expect(openSnapshot).toEqual(
      expect.objectContaining({
        status: 'open',
        failureCount: 3,
        cooldownUntil: 12_000,
        circuitOpenUntil: 16_000,
      })
    );
    expect(store.isEndpointAvailable('sonnet', 'edge-a', 12_000)).toBe(false);
    expect(store.getSnapshot('sonnet', 'edge-a', 16_001)).toEqual(
      expect.objectContaining({
        status: 'healthy',
        failureCount: 3,
      })
    );
  });

  it('clears cooldown and circuit state after a successful endpoint response', () => {
    const store = new ModelPoolHealthStore(1_000, 2, 5_000);

    store.recordFailure('sonnet', 'edge-a', 10_000);
    store.recordFailure('sonnet', 'edge-a', 10_500);

    expect(store.recordSuccess('sonnet', 'edge-a', 11_000)).toEqual(
      expect.objectContaining({
        status: 'healthy',
        failureCount: 0,
        successCount: 1,
        lastSuccessAt: 11_000,
      })
    );
    expect(store.getSnapshot('sonnet', 'edge-a', 11_001)).not.toHaveProperty('cooldownUntil');
    expect(store.getSnapshot('sonnet', 'edge-a', 11_001)).not.toHaveProperty('circuitOpenUntil');
  });

  it('keeps a bounded successful latency window for endpoint operations', () => {
    const store = new ModelPoolHealthStore(1_000, 3, 5_000, 2);

    store.recordSuccess('sonnet', 'edge-a', 10_000, 120);
    store.recordSuccess('sonnet', 'edge-a', 11_000, 180);
    const snapshot = store.recordSuccess('sonnet', 'edge-a', 12_000, 300);

    expect(snapshot.latency).toEqual({
      sampleCount: 2,
      averageMs: 240,
      lastMs: 300,
      windowStartedAt: 11_000,
      windowEndedAt: 12_000,
    });
  });

  it('exports and hydrates endpoint health for restart continuity', () => {
    const store = new ModelPoolHealthStore(1_000, 2, 5_000, 3);

    store.recordFailure('sonnet', 'edge-a', 10_000);
    store.recordFailure('sonnet', 'edge-a', 10_500);
    store.recordSuccess('sonnet', 'edge-b', 11_000, 240);

    const restarted = new ModelPoolHealthStore(1_000, 2, 5_000, 3);
    restarted.hydrate(store.exportForPersistence(new Date('2026-05-01T00:00:00.000Z')));

    expect(restarted.getSnapshot('sonnet', 'edge-a', 11_000)).toEqual(
      expect.objectContaining({
        status: 'open',
        failureCount: 2,
        circuitOpenUntil: 15_500,
      })
    );
    expect(restarted.getSnapshot('sonnet', 'edge-b', 11_001).latency).toEqual(
      expect.objectContaining({
        sampleCount: 1,
        averageMs: 240,
      })
    );
  });

  it('notifies persistence listeners after health changes', () => {
    const store = new ModelPoolHealthStore();
    const changes: unknown[] = [];

    store.setChangeListener((payload) => changes.push(payload));
    store.recordSuccess('sonnet', 'edge-a', 10_000, 120);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(
      expect.objectContaining({
        version: 1,
        endpoints: [
          expect.objectContaining({
            modelId: 'sonnet',
            endpointId: 'edge-a',
            successCount: 1,
          }),
        ],
      })
    );
  });
});
