import { describe, expect, it } from 'vitest';
import { createManagedApiKey, verifyApiKey } from './api-keys';

describe('managed API keys', () => {
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
});
