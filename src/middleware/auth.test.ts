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

  it('persists quota usage after successful metered model calls', async () => {
    const created = createManagedApiKey({
      label: 'persistent client',
      scopes: ['client'],
      quota: {
        request_limit: 2,
      },
    });
    const persistQuotaUsage = vi.fn();
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    }, {
      persistQuotaUsage,
    });

    const result = await runAuth(middleware, {
      authorization: `Bearer ${created.secret}`,
    }, { messages: [{ role: 'user', content: 'persist me' }] });

    expect(result.error).toBeUndefined();
    expect(persistQuotaUsage).toHaveBeenCalledWith(expect.objectContaining({
      [created.record.id]: expect.objectContaining({
        requests: 1,
        tokens: expect.any(Number),
        window_started_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    }));
  });

  it('does not fail model calls when quota persistence fails', async () => {
    const created = createManagedApiKey({
      label: 'persistent client',
      scopes: ['client'],
      quota: {
        request_limit: 2,
      },
    });
    const persistQuotaUsage = vi.fn(() => {
      throw new Error('disk full');
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [created.record],
      },
    }, {
      persistQuotaUsage,
    });

    const result = await runAuth(middleware, {
      authorization: `Bearer ${created.secret}`,
    }, { messages: [{ role: 'user', content: 'do not block' }] });
    await Promise.resolve();

    expect(result.error).toBeUndefined();
    expect(result.reply.code).not.toHaveBeenCalled();
    expect(persistQuotaUsage).toHaveBeenCalled();
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
      label: 'limited remote client',
      scopes: ['client', 'read-only'],
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

  it('enforces admin, operator, client, and read-only boundaries for management APIs', async () => {
    const readOnlyKey = createManagedApiKey({
      label: 'status viewer',
      scopes: ['read-only'],
    });
    const clientKey = createManagedApiKey({
      label: 'model client',
      scopes: ['client'],
    });
    const operatorKey = createManagedApiKey({
      label: 'service operator',
      scopes: ['operator'],
    });
    const adminKey = createManagedApiKey({
      label: 'service admin',
      scopes: ['admin'],
    });
    const middleware = apiKeyAuth({
      Auth: {
        managed_keys: [readOnlyKey.record, clientKey.record, operatorKey.record, adminKey.record],
      },
    });

    const readOnlyHeaders = { authorization: `Bearer ${readOnlyKey.secret}` };
    const clientHeaders = { authorization: `Bearer ${clientKey.secret}` };
    const operatorHeaders = { authorization: `Bearer ${operatorKey.secret}` };
    const adminHeaders = { authorization: `Bearer ${adminKey.secret}` };

    await expect(runAuth(middleware, readOnlyHeaders, undefined, {
      method: 'GET',
      url: '/api/governance/health',
    })).resolves.toEqual(expect.objectContaining({
      error: undefined,
    }));
    await expect(runAuth(middleware, readOnlyHeaders, undefined, {
      method: 'GET',
      url: '/api/governance/traces/trace-1',
    })).resolves.toEqual(expect.objectContaining({
      error: undefined,
    }));

    const readOnlyConfig = await runAuth(middleware, readOnlyHeaders, undefined, {
      method: 'GET',
      url: '/api/config',
    });
    const clientConfig = await runAuth(middleware, clientHeaders, undefined, {
      method: 'POST',
      url: '/api/config',
    });
    const clientRestart = await runAuth(middleware, clientHeaders, undefined, {
      method: 'POST',
      url: '/api/restart',
    });
    const operatorHealth = await runAuth(middleware, operatorHeaders, undefined, {
      method: 'GET',
      url: '/api/governance/health',
    });
    const operatorSnapshot = await runAuth(middleware, operatorHeaders, { format: 'json' }, {
      method: 'POST',
      url: '/api/governance/metrics/snapshots',
    });
    const operatorPoolProbe = await runAuth(middleware, operatorHeaders, {}, {
      method: 'POST',
      url: '/api/models/pool-health/probe',
    });
    const operatorArchiveDelete = await runAuth(middleware, operatorHeaders, undefined, {
      method: 'POST',
      url: '/api/governance/archives/archive.json/delete',
    });
    const operatorConfig = await runAuth(middleware, operatorHeaders, undefined, {
      method: 'POST',
      url: '/api/config',
    });
    const operatorAuthManagement = await runAuth(middleware, operatorHeaders, {
      label: 'another',
      scopes: ['client'],
    }, {
      method: 'POST',
      url: '/api/auth/keys',
    });
    const operatorUi = await runAuth(middleware, operatorHeaders, undefined, {
      method: 'GET',
      url: '/ui',
    });
    const adminConfig = await runAuth(middleware, adminHeaders, undefined, {
      method: 'GET',
      url: '/api/config',
    });
    const clientStatus = await runAuth(middleware, clientHeaders, undefined, {
      method: 'GET',
      url: '/api/service-info',
    });
    const clientModelCall = await runAuth(middleware, clientHeaders, {
      messages: [{ role: 'user', content: 'hello' }],
    }, {
      method: 'POST',
      url: '/v1/messages',
    });

    expect(readOnlyConfig.error).toBeInstanceOf(Error);
    expect(readOnlyConfig.reply.code).toHaveBeenCalledWith(403);
    expect(clientConfig.error).toBeInstanceOf(Error);
    expect(clientConfig.reply.code).toHaveBeenCalledWith(403);
    expect(clientRestart.error).toBeInstanceOf(Error);
    expect(clientRestart.reply.code).toHaveBeenCalledWith(403);
    expect(operatorHealth.error).toBeUndefined();
    expect(operatorSnapshot.error).toBeUndefined();
    expect(operatorPoolProbe.error).toBeUndefined();
    expect(operatorArchiveDelete.error).toBeUndefined();
    expect(operatorConfig.error).toBeInstanceOf(Error);
    expect(operatorConfig.reply.code).toHaveBeenCalledWith(403);
    expect(operatorAuthManagement.error).toBeInstanceOf(Error);
    expect(operatorAuthManagement.reply.code).toHaveBeenCalledWith(403);
    expect(operatorUi.error).toBeInstanceOf(Error);
    expect(operatorUi.reply.code).toHaveBeenCalledWith(403);
    expect(adminConfig.error).toBeUndefined();
    expect(clientStatus.error).toBeInstanceOf(Error);
    expect(clientStatus.reply.code).toHaveBeenCalledWith(403);
    expect(clientModelCall.error).toBeUndefined();
    expect(authAuditStore.list(13)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        outcome: 'denied',
        required: 'admin',
        path: '/api/config',
        reason: 'insufficient_scope',
      }),
      expect.objectContaining({
        outcome: 'allowed',
        required: 'read-only',
        path: '/api/governance/health',
      }),
      expect.objectContaining({
        outcome: 'allowed',
        required: 'operator',
        path: '/api/governance/metrics/snapshots',
      }),
      expect.objectContaining({
        outcome: 'denied',
        required: 'admin',
        path: '/api/auth/keys',
        reason: 'insufficient_scope',
      }),
      expect.objectContaining({
        outcome: 'allowed',
        required: 'client',
        path: '/v1/messages',
      }),
    ]));
  });
});
