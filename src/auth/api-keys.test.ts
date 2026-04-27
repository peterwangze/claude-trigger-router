import { beforeEach, describe, expect, it } from 'vitest';
import { authAuditStore, authQuotaUsageStore, createManagedApiKey, validateManagedApiKeyQuota, verifyApiKey } from './api-keys';

describe('managed API keys', () => {
  beforeEach(() => {
    authAuditStore.clear();
    authQuotaUsageStore.clear();
  });

  it('allows bootstrap APIKEY as admin scope', () => {
    expect(verifyApiKey({ APIKEY: 'bootstrap' }, 'bootstrap', 'admin')).toMatchObject({
      ok: true,
      source: 'bootstrap',
      scopes: ['admin'],
    });
  });

  it('allows managed client keys for client calls but not admin actions', () => {
    const created = createManagedApiKey({ label: 'client', scopes: ['client'] });
    const config = {
      Auth: {
        managed_keys: [created.record],
      },
    };

    expect(verifyApiKey(config, created.secret, 'client')).toMatchObject({
      ok: true,
      source: 'managed',
      keyId: created.record.id,
    });
    expect(verifyApiKey(config, created.secret, 'admin')).toMatchObject({
      ok: false,
      reason: 'insufficient_scope',
    });
  });

  it('rejects revoked managed keys', () => {
    const created = createManagedApiKey({ scopes: ['admin'] });

    expect(verifyApiKey({
      Auth: {
        managed_keys: [
          {
            ...created.record,
            revoked_at: '2026-04-28T00:00:00.000Z',
          },
        ],
      },
    }, created.secret, 'admin')).toMatchObject({
      ok: false,
      reason: 'revoked',
    });
  });

  it('enforces managed key request quota in the runtime store', () => {
    const created = createManagedApiKey({
      scopes: ['client'],
      quota: {
        request_limit: 1,
      },
    });
    const verification = verifyApiKey({
      Auth: {
        managed_keys: [created.record],
      },
    }, created.secret, 'client');

    expect(verification).toMatchObject({
      ok: true,
      quota: {
        request_limit: 1,
      },
    });
    expect(authQuotaUsageStore.consume(verification.keyId, verification.quota, 10)).toEqual({
      ok: true,
      usage: expect.objectContaining({
        requestLimit: 1,
        requestsUsed: 1,
      }),
    });
    expect(authQuotaUsageStore.consume(verification.keyId, verification.quota, 10)).toEqual({
      ok: false,
      reason: 'request_quota_exceeded',
      usage: expect.objectContaining({
        requestLimit: 1,
        requestsUsed: 1,
      }),
    });
  });

  it('validates managed key quota input', () => {
    expect(validateManagedApiKeyQuota({
      request_limit: 10,
      token_limit: 1000,
    })).toEqual([]);
    expect(validateManagedApiKeyQuota({
      request_limit: 0,
      token_limit: '100',
    })).toEqual([
      'quota.request_limit must be a positive integer',
      'quota.token_limit must be a positive integer',
    ]);
  });

  it('summarizes auth audit events without storing secrets', () => {
    authAuditStore.add({
      outcome: 'allowed',
      required: 'client',
      source: 'managed',
      keyId: 'key_1',
      path: '/v1/messages',
      scopes: ['client'],
      statusCode: 200,
    });
    authAuditStore.add({
      outcome: 'denied',
      required: 'admin',
      source: 'managed',
      keyId: 'key_1',
      reason: 'insufficient_scope',
      path: '/api/auth/keys',
      statusCode: 403,
    });

    expect(authAuditStore.summary()).toEqual(expect.objectContaining({
      total: 2,
      allowed: 1,
      denied: 1,
      managed: 2,
      byReason: {
        allowed: 1,
        insufficient_scope: 1,
      },
    }));
    expect(JSON.stringify(authAuditStore.list())).not.toContain('ctr_');
  });
});
