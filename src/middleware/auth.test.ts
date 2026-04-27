import { describe, expect, it, vi } from 'vitest';
import { createManagedApiKey } from '../auth/api-keys';
import { apiKeyAuth } from './auth';

function runAuth(middleware: ReturnType<typeof apiKeyAuth>, headers: Record<string, string>) {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };

  return new Promise<{ error?: Error; reply: typeof reply }>((resolve) => {
    middleware({ headers } as any, reply as any, (error?: Error) => {
      resolve({ error, reply });
    });
  });
}

describe('apiKeyAuth', () => {
  it('uses the latest resolved managed key config for accept and revoke decisions', async () => {
    const created = createManagedApiKey({ label: 'client', scopes: ['client'] });
    let currentConfig = {
      Auth: {
        managed_keys: [created.record],
      },
    };
    const middleware = apiKeyAuth(async () => currentConfig);

    const accepted = await runAuth(middleware, {
      authorization: `Bearer ${created.secret}`,
    });

    expect(accepted.error).toBeUndefined();
    expect(accepted.reply.code).not.toHaveBeenCalled();

    currentConfig = {
      Auth: {
        managed_keys: [
          {
            ...created.record,
            revoked_at: '2026-04-28T00:00:00.000Z',
          },
        ],
      },
    };

    const rejected = await runAuth(middleware, {
      authorization: `Bearer ${created.secret}`,
    });

    expect(rejected.error).toBeInstanceOf(Error);
    expect(rejected.reply.code).toHaveBeenCalledWith(401);
    expect(rejected.reply.send).toHaveBeenCalledWith({
      error: 'Unauthorized',
      reason: 'revoked',
    });
  });
});
