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
});
