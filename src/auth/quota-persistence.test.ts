import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tempDir: string | undefined;

async function loadPersistenceModule() {
  tempDir = await mkdtemp(join(tmpdir(), 'ctr-quota-'));
  vi.resetModules();
  vi.doMock('../constants', () => ({
    HOME_DIR: tempDir,
  }));
  return import('./quota-persistence');
}

describe('auth quota persistence', () => {
  afterEach(async () => {
    vi.doUnmock('../constants');
    vi.resetModules();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('serializes quota usage writes and leaves the latest snapshot readable', async () => {
    const { QUOTA_USAGE_FILE, loadPersistedAuthQuotaUsage, savePersistedAuthQuotaUsage } = await loadPersistenceModule();

    await Promise.all([
      savePersistedAuthQuotaUsage({
        key_a: {
          requests: 1,
          tokens: 10,
          window_started_at: '2026-04-28T00:00:00.000Z',
          updated_at: '2026-04-28T00:00:01.000Z',
        },
      }),
      savePersistedAuthQuotaUsage({
        key_a: {
          requests: 2,
          tokens: 20,
          window_started_at: '2026-04-28T00:00:00.000Z',
          updated_at: '2026-04-28T00:00:02.000Z',
        },
      }),
    ]);

    expect(JSON.parse(await readFile(QUOTA_USAGE_FILE, 'utf-8'))).toEqual({
      key_a: {
        requests: 2,
        tokens: 20,
        window_started_at: '2026-04-28T00:00:00.000Z',
        updated_at: '2026-04-28T00:00:02.000Z',
      },
    });
    expect(await loadPersistedAuthQuotaUsage()).toEqual({
      key_a: {
        requests: 2,
        tokens: 20,
        window_started_at: '2026-04-28T00:00:00.000Z',
        updated_at: '2026-04-28T00:00:02.000Z',
      },
    });
  });
});
