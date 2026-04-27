import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authAuditStore, createManagedApiKey } from '../auth/api-keys';
import { apiKeyAuth } from './auth';

function runAuth(middleware: ReturnType<typeof apiKeyAuth>, headers: Record<string, string>) {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };

  return new Promise<{ error?: Error; reply: typeof reply }>((resolve) => {
    middleware({
      id: 'req-1',
      method: 'POST',
      url: '/v1/messages',
      headers,
    } as any, reply as any, (error?: Error) => {
      resolve({ error, reply });
    });
  });
}

describe('apiKeyAuth', () => {
  beforeEach(() => {
    authAuditStore.clear();
  });

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
    expect(authAuditStore.summary()).toEqual(expect.objectContaining({
      total: 2,
      allowed: 1,
      denied: 1,
      managed: 2,
    }));
    expect(authAuditStore.list(1)[0]).toEqual(expect.objectContaining({
      outcome: 'denied',
      path: '/v1/messages',
      reason: 'revoked',
      keyId: created.record.id,
    }));
  });
});
