import { describe, expect, it, vi } from 'vitest';
import { dirname } from 'path';
import { createModelPoolHealthPersistenceScheduler, MODEL_POOL_HEALTH_FILE } from './pool-health-persistence';

describe('model pool health persistence', () => {
  it('stores model pool health under the config directory rather than the logs directory', async () => {
    const { CONFIG_DIR, HOME_DIR } = await import('../constants');

    expect(dirname(MODEL_POOL_HEALTH_FILE)).toBe(CONFIG_DIR);
    expect(dirname(MODEL_POOL_HEALTH_FILE)).not.toBe(HOME_DIR);
  });

  it('debounces rapid health changes into the latest persistence write', async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn().mockResolvedValue(undefined);
      const scheduler = createModelPoolHealthPersistenceScheduler({
        debounceMs: 50,
        save,
      });

      scheduler.schedule({
        version: 1,
        updatedAt: '2026-05-01T00:00:00.000Z',
        endpoints: [{ modelId: 'sonnet', endpointId: 'edge-a', successCount: 1 }],
      });
      scheduler.schedule({
        version: 1,
        updatedAt: '2026-05-01T00:00:01.000Z',
        endpoints: [{ modelId: 'sonnet', endpointId: 'edge-a', successCount: 2 }],
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(save).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await scheduler.flush();

      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: '2026-05-01T00:00:01.000Z',
          endpoints: [
            expect.objectContaining({
              successCount: 2,
            }),
          ],
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes the latest pending health state immediately on shutdown', async () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn().mockResolvedValue(undefined);
      const scheduler = createModelPoolHealthPersistenceScheduler({
        debounceMs: 1_000,
        save,
      });

      scheduler.schedule({
        version: 1,
        updatedAt: '2026-05-01T00:00:00.000Z',
        endpoints: [{ modelId: 'sonnet', endpointId: 'edge-a', failureCount: 1 }],
      });
      await scheduler.flush({
        version: 1,
        updatedAt: '2026-05-01T00:00:02.000Z',
        endpoints: [{ modelId: 'sonnet', endpointId: 'edge-a', failureCount: 2 }],
      });

      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: '2026-05-01T00:00:02.000Z',
          endpoints: [
            expect.objectContaining({
              failureCount: 2,
            }),
          ],
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
