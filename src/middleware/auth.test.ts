import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authAuditStore, authQuotaUsageStore, createManagedApiKey } from '../auth/api-keys';
import { apiKeyAuth } from './auth';

function runAuth(
  middleware: ReturnType<typeof apiKeyAuth>,
  headers: Record<string, string>,
  body?: unknown,
  options: { method?: string; url?: string } = {}
) {
  const reply = {
    code: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };

  return new Promise<{ error?: Error; reply: typeof reply }>((resolve) => {
    middleware({
      id: 'req-1',
      method: options.method ?? 'POST',
      url: options.url ?? '/v1/messages',
      headers,
      body,
    } as any, reply as any, (error?: Error) => {
      resolve({ error, reply });
    });
  });
}

describe('apiKeyAuth', () => {
  beforeEach(() => {
    authAuditStore.clear();
    authQuotaUsageStore.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('rejects managed client calls after request quota is exhausted', async () => {
    const created = createManagedApiKey({
      label: 'limited client',
      scopes: ['client'],
      quota: {
        request_limit: 1,
      },
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    });
    const headers = {
      authorization: `Bearer ${created.secret}`,
    };

    const accepted = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'one' }] });
    const rejected = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'two' }] });

    expect(accepted.error).toBeUndefined();
    expect(rejected.error).toBeInstanceOf(Error);
    expect(rejected.reply.code).toHaveBeenCalledWith(429);
    expect(rejected.reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Too Many Requests',
      reason: 'request_quota_exceeded',
      quota: expect.objectContaining({
        requestLimit: 1,
        requestsUsed: 1,
      }),
    }));
    expect(rejected.reply.header).not.toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(authAuditStore.summary()).toEqual(expect.objectContaining({
      total: 2,
      allowed: 1,
      denied: 1,
      byReason: {
        allowed: 1,
        request_quota_exceeded: 1,
      },
    }));
    expect(authAuditStore.list(1)[0]).toEqual(expect.objectContaining({
      outcome: 'denied',
      reason: 'request_quota_exceeded',
      statusCode: 429,
      quota: expect.objectContaining({
        requestLimit: 1,
        requestsUsed: 1,
      }),
    }));
  });

  it('returns window reset details when windowed quota is exhausted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T00:00:00.000Z'));
    const created = createManagedApiKey({
      label: 'windowed client',
      scopes: ['client'],
      quota: {
        request_limit: 1,
        window_seconds: 60,
      },
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    });
    const headers = {
      authorization: `Bearer ${created.secret}`,
    };

    const accepted = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'one' }] });
    const rejected = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'two' }] });

    expect(accepted.error).toBeUndefined();
    expect(rejected.error).toBeInstanceOf(Error);
    expect(rejected.reply.code).toHaveBeenCalledWith(429);
    expect(rejected.reply.header).toHaveBeenCalledWith('Retry-After', '60');
    expect(rejected.reply.send).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Too Many Requests',
      reason: 'request_quota_exceeded',
      quota: expect.objectContaining({
        requestLimit: 1,
        requestsUsed: 1,
        windowSeconds: 60,
        windowResetAt: '2026-04-28T00:01:00.000Z',
      }),
    }));
  });

  it('does not consume model-call quota for status endpoints', async () => {
    const created = createManagedApiKey({
      label: 'limited client',
      scopes: ['client'],
      quota: {
        request_limit: 1,
      },
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    });
    const headers = {
      authorization: `Bearer ${created.secret}`,
    };

    const statusA = await runAuth(middleware, headers, undefined, {
      method: 'GET',
      url: '/api/service-info',
    });
    const statusB = await runAuth(middleware, headers, undefined, {
      method: 'GET',
      url: '/api/remote-status',
    });
    const firstModelCall = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'one' }] });
    const secondModelCall = await runAuth(middleware, headers, { messages: [{ role: 'user', content: 'two' }] });

    expect(statusA.error).toBeUndefined();
    expect(statusB.error).toBeUndefined();
    expect(firstModelCall.error).toBeUndefined();
    expect(secondModelCall.error).toBeInstanceOf(Error);
    expect(secondModelCall.reply.code).toHaveBeenCalledWith(429);
    expect(authQuotaUsageStore.summary()).toEqual({
      trackedKeys: 1,
      requestsUsed: 1,
      tokensUsed: expect.any(Number),
    });
  });

  it('allows read-only keys for status endpoints but not model calls', async () => {
    const created = createManagedApiKey({
      label: 'status viewer',
      scopes: ['read-only'],
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    });
    const headers = {
      authorization: `Bearer ${created.secret}`,
    };

    const statusResult = await runAuth(middleware, headers, undefined, {
      method: 'GET',
      url: '/api/service-info',
    });
    const modelCallResult = await runAuth(middleware, headers);

    expect(statusResult.error).toBeUndefined();
    expect(modelCallResult.error).toBeInstanceOf(Error);
    expect(modelCallResult.reply.code).toHaveBeenCalledWith(403);
    expect(modelCallResult.reply.send).toHaveBeenCalledWith({
      error: 'Forbidden',
      reason: 'insufficient_scope',
    });
    expect(authAuditStore.list(2)).toEqual([
      expect.objectContaining({
        outcome: 'denied',
        required: 'client',
        reason: 'insufficient_scope',
      }),
      expect.objectContaining({
        outcome: 'allowed',
        required: 'read-only',
        path: '/api/service-info',
      }),
    ]);
  });
});
