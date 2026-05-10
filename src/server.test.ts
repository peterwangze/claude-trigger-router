import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockReadConfigFile,
  mockWriteConfigFile,
  mockBackupConfigFile,
} = vi.hoisted(() => ({
  mockReadConfigFile: vi.fn(),
  mockWriteConfigFile: vi.fn(),
  mockBackupConfigFile: vi.fn(),
}));

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>();

  return {
    ...actual,
    readConfigFile: mockReadConfigFile,
    writeConfigFile: mockWriteConfigFile,
    backupConfigFile: mockBackupConfigFile,
  };
});

vi.mock('@musistudio/llms', () => {
  class MockServer {
    public app = {
      routes: new Map<string, any>(),
      get: vi.fn((path: string, handler: any) => {
        this.app.routes.set(`GET ${path}`, handler);
      }),
      post: vi.fn((path: string, handler: any) => {
        this.app.routes.set(`POST ${path}`, handler);
      }),
      _server: {
        transformerService: {
          getAllTransformers: () => new Map(),
        },
      },
    };
  }

  return {
    default: MockServer,
  };
});

import { createServer } from './server';
import { buildServerInitialConfig } from './index';
import { governanceMetricsExportStore, governanceTraceStore } from './governance';
import { normalizeAndValidateConfig } from './utils/config';
import { authAuditStore, authQuotaUsageStore, createManagedApiKey } from './auth/api-keys';
import { modelPoolHealthStore } from './models/pool-health';

describe('createServer /api/config', () => {

  it('exposes a dedicated health endpoint with service signature', async () => {
    const server = createServer({
      initialConfig: {
        PORT: 4567,
      },
    });
    const handler = server.app.routes.get('GET /api/health');

    const result = await handler({}, {});

    expect(result).toEqual({
      service: 'claude-trigger-router',
      ready: true,
      port: 4567,
    });
  });

  it('exposes service info with runtime mode and remote boundary metadata', async () => {
    const server = createServer({
      initialConfig: {
        HOST: '0.0.0.0',
        PORT: 4567,
        Runtime: {
          mode: 'server',
          remote_service: {
            enabled: false,
          },
        },
        Registration: {
          enabled: true,
          upstream_services: [
            {
              id: 'edge-router',
              base_url: 'https://edge.example.com',
            },
          ],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result).toEqual({
      service: 'claude-trigger-router',
      ready: true,
      host: '0.0.0.0',
      port: 4567,
      runtimeMode: 'server',
      serviceRole: 'router_service',
      listener: {
        host: '0.0.0.0',
        port: 4567,
        public: true,
        localUrl: 'http://127.0.0.1:4567',
        advertisedUrl: 'http://<server-host>:4567',
      },
      remoteEnabled: false,
      remoteService: {
        enabled: false,
        baseUrl: '',
        authTokenConfigured: false,
      },
      clientConnection: {
        role: 'remote_user',
        baseUrl: 'http://<server-host>:4567',
        authTokenConfigured: false,
        recommendedScopes: ['client', 'read-only'],
        guidance: 'Remote clients should set ANTHROPIC_BASE_URL to this service and use a managed client + read-only key.',
      },
      registration: {
        enabled: true,
        models: 0,
        upstreamServices: 1,
      },
      auth: {
        required: false,
        bootstrapConfigured: false,
        managedKeys: {
          total: 0,
          active: 0,
          revoked: 0,
          expired: 0,
        },
        audit: {
          total: 0,
          allowed: 0,
          denied: 0,
          skipped: 0,
          managed: 0,
          bootstrap: 0,
          byReason: {},
          latestAt: undefined,
        },
        quota: {
          trackedKeys: 0,
          requestsUsed: 0,
          tokensUsed: 0,
          keys: [],
        },
      },
      security: {
        status: 'critical',
        publicHost: true,
        issues: [
          expect.objectContaining({
            code: 'server_without_auth',
            severity: 'critical',
          }),
        ],
      },
    });
  });

  it('reports configured auth and security status without secrets', async () => {
    const created = createManagedApiKey({ label: 'remote client', scopes: ['client'] });
    const server = createServer({
      initialConfig: {
        HOST: '0.0.0.0',
        PORT: 4567,
        APIKEY: 'bootstrap-key',
        Runtime: {
          mode: 'server',
        },
        Auth: {
          managed_keys: [created.record],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result.auth).toEqual(expect.objectContaining({
      required: true,
      bootstrapConfigured: true,
      managedKeys: expect.objectContaining({
        total: 1,
        active: 1,
      }),
    }));
    expect(result.security).toEqual(expect.objectContaining({
      status: 'ok',
      publicHost: true,
      issues: [],
    }));
    expect(JSON.stringify(result)).not.toContain('bootstrap-key');
    expect(JSON.stringify(result)).not.toContain(created.secret);
    expect(JSON.stringify(result)).not.toContain(created.record.key_hash);
  });

  it('reports managed key quota details without exposing secrets', async () => {
    const created = createManagedApiKey({
      label: 'limited remote client',
      scopes: ['client'],
      quota: {
        request_limit: 2,
        token_limit: 100,
      },
    });
    authQuotaUsageStore.consume(created.record.id, created.record.quota, 12);
    const server = createServer({
      initialConfig: {
        APIKEY: 'bootstrap-key',
        Auth: {
          managed_keys: [created.record],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result.auth.quota).toEqual(expect.objectContaining({
      trackedKeys: 1,
      requestsUsed: 1,
      tokensUsed: 12,
      keys: [
        expect.objectContaining({
          id: created.record.id,
          label: 'limited remote client',
          scopes: ['client'],
          active: true,
          status: 'ok',
          quota: {
            request_limit: 2,
            token_limit: 100,
          },
          usage: expect.objectContaining({
            requestLimit: 2,
            requestsUsed: 1,
            tokenLimit: 100,
            tokensUsed: 12,
          }),
        }),
      ],
    }));
    expect(JSON.stringify(result)).not.toContain(created.secret);
    expect(JSON.stringify(result)).not.toContain(created.record.key_hash);
    expect(JSON.stringify(result)).not.toContain(created.record.key_prefix);
    expect(JSON.stringify(result)).not.toContain(created.record.key_suffix);
  });

  it('reports inactive managed key records as auth-required but degraded', async () => {
    const created = createManagedApiKey({ label: 'revoked client', scopes: ['client'] });
    const server = createServer({
      initialConfig: {
        HOST: '0.0.0.0',
        PORT: 4567,
        Runtime: {
          mode: 'server',
        },
        Auth: {
          managed_keys: [
            {
              ...created.record,
              revoked_at: '2026-04-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result.auth).toEqual(expect.objectContaining({
      required: true,
      bootstrapConfigured: false,
      managedKeys: expect.objectContaining({
        total: 1,
        active: 0,
        revoked: 1,
      }),
    }));
    expect(result.security).toEqual(expect.objectContaining({
      status: 'warning',
      publicHost: true,
      issues: [
        expect.objectContaining({
          code: 'managed_auth_without_active_key',
          severity: 'warning',
        }),
      ],
    }));
    expect(JSON.stringify(result)).not.toContain(created.secret);
    expect(JSON.stringify(result)).not.toContain(created.record.key_hash);
  });

  it('reports local service info when Runtime is not configured', async () => {
    const server = createServer({
      initialConfig: {
        PORT: 4567,
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result).toEqual(
      expect.objectContaining({
        service: 'claude-trigger-router',
        ready: true,
        port: 4567,
        runtimeMode: 'local',
        serviceRole: 'local_agent',
        remoteEnabled: false,
      })
    );
  });

  it('exposes normalized registration payloads without secrets', async () => {
    const server = createServer({
      initialConfig: {
        Router: { default: 'sonnet' },
        Models: [
          {
            id: 'sonnet',
            api: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            interface: 'openai',
            model: 'vendor/sonnet',
          },
        ],
        Registration: {
          enabled: true,
          models: [
            {
              id: ' edge-sonnet ',
              api: ' https://api.example.com/v1 ',
              key: ' sk-registration ',
              interface: 'anthropic',
              model: ' claude-sonnet-4-5 ',
            },
          ],
          upstream_services: [
            {
              id: ' edge-router ',
              base_url: ' https://edge.example.com/ ',
              auth_token: ' remote-token ',
            },
          ],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/registration');

    const result = await handler({}, {});

    expect(result).toEqual({
      enabled: true,
      summary: {
        models: 1,
        upstreamServices: 1,
      },
      models: [
        {
          id: 'edge-sonnet',
          model: 'claude-sonnet-4-5',
          interface: 'anthropic',
          apiConfigured: true,
          keyConfigured: true,
        },
      ],
      upstreamServices: [
        {
          id: 'edge-router',
          baseUrl: 'https://edge.example.com',
          authTokenConfigured: true,
        },
      ],
      issueReport: {
        issues: [],
        summary: {
          total: 0,
          error: 0,
          warning: 0,
          info: 0,
        },
      },
    });
  });

  it('exposes remote status with compiled model and governance alert summaries', async () => {
    const server = createServer({
      initialConfig: {
        PORT: 4567,
        Models: [
          {
            id: 'sonnet',
            api: 'https://router.example.com/v1/messages',
            key: 'sk-test',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              supports_tools: false,
            },
          },
        ],
        Router: {
          default: 'sonnet',
        },
        Runtime: {
          mode: 'local',
          remote_service: {
            enabled: false,
          },
        },
      },
    });
    const handler = server.app.routes.get('GET /api/remote-status');

    const result = await handler({ query: {} }, {});

    expect(result).toEqual(expect.objectContaining({
      service: 'claude-trigger-router',
      ready: true,
      runtimeMode: 'local',
      remote: {
        enabled: false,
        configured: false,
        reachable: false,
        ready: false,
        baseUrl: '',
      },
      remoteRegistration: {
        enabled: false,
        configured: false,
        reachable: false,
        available: false,
        baseUrl: '',
      },
      compiledModels: {
        providerCount: 1,
        modelCount: 1,
        modelPoolCount: 0,
        modelPoolEndpointCount: 0,
        capabilities: {
          reasoning: 1,
          tools: 0,
          images: 1,
          warningCount: 1,
          warnCount: 0,
          infoCount: 1,
        },
      },
      governance: {
        healthStatus: 'idle',
        totalTraces: 0,
        alertCount: 0,
        warnCount: 0,
        criticalCount: 0,
      },
    }));
    expect(result.issueReport.summary).toEqual({
      total: 1,
      error: 0,
      warning: 0,
      info: 1,
    });
  });

  it('probes enabled remote service from the remote status endpoint', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/registration')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            enabled: true,
            summary: {
              models: 2,
              upstreamServices: 1,
            },
            models: [
              {
                id: 'sonnet',
                keyConfigured: true,
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          service: 'claude-trigger-router',
          ready: true,
          runtimeMode: 'server',
          remoteEnabled: false,
        }),
      });
    });
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', fetchMock);

    try {
      const server = createServer({
        initialConfig: {
          Runtime: {
            mode: 'local',
            remote_service: {
              enabled: true,
              base_url: 'https://router.example.com/',
              auth_token: 'token-1',
            },
          },
          Router: {},
        },
      });
      const handler = server.app.routes.get('GET /api/remote-status');

      const result = await handler({ query: {} }, {});

      expect(fetchMock).toHaveBeenCalledWith('https://router.example.com/api/service-info', expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-1',
        },
      }));
      expect(fetchMock).toHaveBeenCalledWith('https://router.example.com/api/registration', expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-1',
        },
      }));
      expect(result.remote).toEqual({
        enabled: true,
        configured: true,
        reachable: true,
        ready: true,
        baseUrl: 'https://router.example.com',
        service: 'claude-trigger-router',
        runtimeMode: 'server',
        remoteEnabled: false,
      });
      expect(result.remoteRegistration).toEqual(expect.objectContaining({
        enabled: true,
        configured: true,
        reachable: true,
        available: true,
        baseUrl: 'https://router.example.com',
        registrationEnabled: true,
        summary: {
          models: 2,
          upstreamServices: 1,
        },
      }));
      expect(result.compiledModels).toEqual(expect.objectContaining({
        providerCount: 0,
        modelCount: 0,
      }));
      expect(result.issueReport.summary.error).toBe(0);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    governanceTraceStore.clear();
    governanceMetricsExportStore.clear();
    authAuditStore.clear();
    authQuotaUsageStore.clear();
    modelPoolHealthStore.clear();
    mockBackupConfigFile.mockResolvedValue(null);
    mockWriteConfigFile.mockResolvedValue(undefined);
    mockReadConfigFile.mockResolvedValue({});
  });

  it('creates managed API keys behind the bootstrap admin key without persisting the raw secret', async () => {
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
      ],
    });
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/auth/keys');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      headers: { authorization: 'Bearer bootstrap-key' },
      body: {
        label: 'remote client',
        scopes: ['client'],
        expiresAt: '2099-05-01T00:00:00.000Z',
      },
    }, reply);

    expect(result.success).toBe(true);
    expect(result.secret).toMatch(/^ctr_/);
    expect(result.key).toEqual(expect.objectContaining({
      label: 'remote client',
      scopes: ['client'],
      active: true,
    }));
    expect(mockWriteConfigFile).toHaveBeenCalledWith(expect.objectContaining({
      Auth: {
        managed_keys: [
          expect.objectContaining({
            label: 'remote client',
            key_hash: expect.any(String),
            key_prefix: expect.any(String),
            key_suffix: expect.any(String),
            scopes: ['client'],
          }),
        ],
      },
    }));
    expect(JSON.stringify(mockWriteConfigFile.mock.calls[0][0])).not.toContain(result.secret);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('refreshes service info auth status from the current config', async () => {
    const created = createManagedApiKey({ label: 'remote client', scopes: ['client'] });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
      Auth: {
        managed_keys: [created.record],
      },
    });
    const server = createServer({
      initialConfig: {
        HOST: '0.0.0.0',
        Runtime: {
          mode: 'server',
        },
      },
    });
    const handler = server.app.routes.get('GET /api/service-info');

    const result = await handler({}, {});

    expect(result.auth).toEqual(expect.objectContaining({
      required: true,
      bootstrapConfigured: true,
      managedKeys: expect.objectContaining({
        active: 1,
      }),
    }));
    expect(result.security.status).toBe('ok');
  });

  it('lists managed API keys without exposing hashes or secrets', async () => {
    const created = createManagedApiKey({ label: 'admin', scopes: ['admin'] });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
      ],
      Auth: {
        managed_keys: [created.record],
      },
    });
    const server = createServer({});
    const handler = server.app.routes.get('GET /api/auth/keys');

    const result = await handler({
      headers: { 'x-api-key': 'bootstrap-key' },
    }, {});

    expect(result).toEqual({
      keys: [
        expect.objectContaining({
          id: created.record.id,
          label: 'admin',
          keyPrefix: created.record.key_prefix,
          keySuffix: created.record.key_suffix,
          scopes: ['admin'],
          active: true,
        }),
      ],
      summary: {
        total: 1,
        active: 1,
        revoked: 0,
        expired: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain(created.record.key_hash);
    expect(JSON.stringify(result)).not.toContain(created.secret);
  });

  it('exposes auth audit events behind admin auth', async () => {
    authAuditStore.add({
      outcome: 'denied',
      required: 'client',
      reason: 'missing',
      path: '/v1/messages',
      statusCode: 401,
    });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
    });
    const server = createServer({});
    const handler = server.app.routes.get('GET /api/auth/audit');

    const result = await handler({
      headers: { authorization: 'Bearer bootstrap-key' },
      query: { limit: 5 },
    }, {});

    expect(result.summary).toEqual(expect.objectContaining({
      total: 2,
      denied: 1,
      allowed: 1,
      bootstrap: 1,
    }));
    expect(result.events).toEqual([
      expect.objectContaining({
        outcome: 'allowed',
        required: 'admin',
        source: 'bootstrap',
      }),
      expect.objectContaining({
        outcome: 'denied',
        reason: 'missing',
        path: '/v1/messages',
      }),
    ]);
  });

  it('rejects non-admin managed keys for auth key management', async () => {
    const created = createManagedApiKey({ label: 'operator', scopes: ['operator'] });
    mockReadConfigFile.mockResolvedValue({
      Auth: {
        managed_keys: [created.record],
      },
    });
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/auth/keys');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      headers: { authorization: `Bearer ${created.secret}` },
      body: { label: 'another', scopes: ['client'] },
    }, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(result).toEqual({
      success: false,
      message: 'Forbidden',
      reason: 'insufficient_scope',
    });
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('rejects invalid managed API key quota input', async () => {
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
    });
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/auth/keys');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      headers: { authorization: 'Bearer bootstrap-key' },
      body: {
        label: 'limited client',
        scopes: ['client'],
        quota: {
          request_limit: -1,
          token_limit: '100',
        },
      },
    }, reply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({
      success: false,
      message: 'Invalid managed API key input',
      errors: [
        'quota.request_limit must be a positive integer',
        'quota.token_limit must be a positive integer',
      ],
    });
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('revokes managed API keys and keeps the key secret hidden', async () => {
    const created = createManagedApiKey({ label: 'client', scopes: ['client'] });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'bootstrap-key',
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
      ],
      Auth: {
        managed_keys: [created.record],
      },
    });
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/auth/keys/:id/revoke');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      headers: { authorization: 'Bearer bootstrap-key' },
      params: { id: created.record.id },
    }, reply);

    expect(result.success).toBe(true);
    expect(result.key).toEqual(expect.objectContaining({
      id: created.record.id,
      active: false,
      revokedAt: expect.any(String),
    }));
    expect(mockWriteConfigFile).toHaveBeenCalledWith(expect.objectContaining({
      Auth: {
        managed_keys: [
          expect.objectContaining({
            id: created.record.id,
            revoked_at: expect.any(String),
          }),
        ],
      },
    }));
    expect(JSON.stringify(result)).not.toContain(created.secret);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('exposes governance trace list and detail endpoints', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      sessionKey: 'session-a',
      routeReason: ['trigger_rule:architecture'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 1,
      completedAt: 2,
      latencyMs: 1,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      sessionKey: 'session-b',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 3,
      completedAt: 4,
      latencyMs: 1,
    });

    const server = createServer({});
    const listHandler = server.app.routes.get('GET /api/governance/traces');
    const detailHandler = server.app.routes.get('GET /api/governance/traces/:requestId');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const listResult = await listHandler({ query: {} }, {});
    const filteredBySession = await listHandler({ query: { sessionKey: 'session-a' } }, {});
    const limited = await listHandler({ query: { limit: '1' } }, {});
    const filteredByRequest = await listHandler({ query: { requestId: 'trace-2' } }, {});
    const filteredByReason = await listHandler({ query: { routeReason: 'trigger_rule:architecture' } }, {});
    const filteredByCascade = await listHandler({ query: { cascadeTriggered: 'true' } }, {});
    const filteredByShadow = await listHandler({ query: { shadowChecked: 'true' } }, {});
    const detailResult = await detailHandler({ params: { requestId: 'trace-1' } }, reply);
    const missingResult = await detailHandler({ params: { requestId: 'missing' } }, reply);

    expect(listResult.traces).toHaveLength(2);
    expect(listResult.traces[0].requestId).toBe('trace-2');
    expect(filteredBySession.traces).toHaveLength(1);
    expect(filteredBySession.traces[0].requestId).toBe('trace-1');
    expect(limited.traces).toHaveLength(1);
    expect(limited.traces[0].requestId).toBe('trace-2');
    expect(filteredByRequest.traces).toHaveLength(1);
    expect(filteredByRequest.traces[0].requestId).toBe('trace-2');
    expect(filteredByReason.traces).toHaveLength(1);
    expect(filteredByReason.traces[0].requestId).toBe('trace-1');
    expect(filteredByCascade.traces).toHaveLength(1);
    expect(filteredByCascade.traces[0].requestId).toBe('trace-1');
    expect(filteredByShadow.traces).toHaveLength(1);
    expect(filteredByShadow.traces[0].requestId).toBe('trace-1');
    expect(detailResult.requestId).toBe('trace-1');
    expect(reply.code).toHaveBeenCalledWith(404);
    expect(missingResult).toEqual({
      success: false,
      message: 'Governance trace not found',
    });
  });

  it('exposes compiled Models registry debug endpoint', async () => {
    const server = createServer({
      initialConfig: {
        Providers: [],
        Models: [
          {
            id: 'sonnet',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
            thinking: {
              mode: 'auto',
            },
          },
        ],
      },
    });
    const handler = server.app.routes.get('GET /api/models/compiled');

    const result = await handler({}, {});

    expect(result.providers).toEqual([
      {
        name: 'model__sonnet',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['anthropic/claude-sonnet-4'],
        transformer: { use: ['openrouter'] },
        has_api_key: true,
      },
    ]);
    expect(result.modelMap.sonnet).toEqual({
      id: 'sonnet',
      providerName: 'model__sonnet',
      modelName: 'anthropic/claude-sonnet-4',
      interface: 'openai',
      protocol: 'openai',
      compatibilityProfile: 'openai-compatible-anthropic-dispatch',
      dispatchFormat: 'anthropic_messages',
      thinking: {
        mode: 'auto',
      },
      capabilities: {
        thinking: {
          supported: true,
          mode: 'auto',
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
      },
      source: 'models',
    });
    expect(result.capabilityWarnings.summary).toEqual({
      total: 0,
      warn: 0,
      info: 0,
    });
    expect(result.router).toEqual({ default: '' });
    expect(result.warnings).toEqual([]);
  });

  it('uses the current saved config for compiled Models after startup', async () => {
    mockReadConfigFile.mockResolvedValue({
      Router: { default: 'haiku' },
      Models: [
        {
          id: 'haiku',
          api: 'https://current.example.com/v1',
          key: 'sk-current',
          interface: 'openai',
          model: 'anthropic/claude-haiku-3-5',
        },
      ],
    });
    const server = createServer({
      initialConfig: {
        Router: { default: 'sonnet' },
        Models: [
          {
            id: 'sonnet',
            api: 'https://startup.example.com/v1',
            key: 'sk-startup',
            interface: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
        ],
      },
    });
    const handler = server.app.routes.get('GET /api/models/compiled');

    const result = await handler({}, {});

    expect(result.router).toEqual({ default: 'haiku' });
    expect(Object.keys(result.modelMap)).toEqual(['haiku']);
    expect(result.modelMap.haiku.providerName).toBe('model__haiku');
    expect(result.modelMap.sonnet).toBeUndefined();
  });

  it('explains SmartRouter runtime configuration from compiled Models endpoint', async () => {
    const server = createServer({
      initialConfig: {
        Router: { default: 'sonnet' },
        Models: [
          {
            id: 'sonnet',
            api: 'https://api.example.com/v1',
            key: 'sk-sonnet',
            interface: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
          {
            id: 'opus',
            api: 'https://api.example.com/v1',
            key: 'sk-opus',
            interface: 'openai',
            model: 'anthropic/claude-opus-4',
          },
        ],
        SmartRouter: {
          enabled: true,
          analysis_scope: 'last_message',
          router_model: 'sonnet',
          fallback: 'default',
          rules: [
            {
              name: 'coding',
              priority: 50,
              enabled: true,
              patterns: [{ type: 'exact', keywords: ['实现'] }],
              model: 'sonnet',
            },
            {
              name: 'architecture',
              priority: 90,
              enabled: true,
              patterns: [{ type: 'exact', keywords: ['架构设计'] }],
              model: 'opus',
            },
          ],
          candidates: [
            { model: 'sonnet', description: 'daily coding' },
            { model: 'opus', description: 'architecture' },
          ],
          semantic: {
            enabled: true,
            mode: 'embedding',
            threshold: 0.2,
          },
          sticky: {
            enabled: true,
            session_ttl_ms: 3600000,
            alignment: {
              enabled: false,
              summarizer_model: 'sonnet',
            },
          },
        },
      },
    });
    const handler = server.app.routes.get('GET /api/models/compiled');

    const result = await handler({}, {});

    expect(result.smartRouterExplanation).toEqual(
      expect.objectContaining({
        enabled: true,
        analysisScope: 'last_message',
        fallback: 'default',
        routerModel: expect.objectContaining({
          ref: 'sonnet',
          status: 'resolved',
          target: expect.objectContaining({
            providerName: 'model__sonnet',
          }),
        }),
        semantic: expect.objectContaining({
          enabled: true,
          mode: 'embedding',
        }),
        sticky: expect.objectContaining({
          enabled: true,
          alignment: expect.objectContaining({
            enabled: false,
          }),
        }),
        warnings: [],
      })
    );
    expect(result.smartRouterExplanation.rules.map((rule: any) => rule.name)).toEqual([
      'architecture',
      'coding',
    ]);
    expect(result.smartRouterExplanation.candidates.map((candidate: any) => candidate.model.ref)).toEqual([
      'sonnet',
      'opus',
    ]);
    expect(result.smartRouterExplanation.routeOrder).toContain('1. explicit rules by priority');
  });

  it('explains SmartRouter draft preview with legacy provider refs', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Providers: [
          {
            name: 'openrouter',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            models: [
              'anthropic/claude-sonnet-4',
              'anthropic/claude-opus-4',
            ],
            transformer: {
              use: ['openrouter'],
            },
          },
        ],
        Router: {
          default: 'openrouter,anthropic/claude-sonnet-4',
        },
        SmartRouter: {
          enabled: true,
          analysis_scope: 'last_message',
          router_model: 'openrouter,anthropic/claude-sonnet-4',
          fallback: 'default',
          rules: [
            {
              name: 'architecture',
              priority: 90,
              enabled: true,
              patterns: [{ type: 'exact', keywords: ['架构设计'] }],
              model: 'openrouter,anthropic/claude-opus-4',
            },
          ],
          candidates: [
            { model: 'openrouter,anthropic/claude-sonnet-4', description: 'daily coding' },
            { model: 'openrouter,anthropic/claude-opus-4', description: 'architecture' },
          ],
          sticky: {
            enabled: true,
            alignment: {
              enabled: true,
              summarizer_model: 'openrouter,anthropic/claude-sonnet-4',
            },
          },
        },
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.smartRouterExplanation.routerModel).toEqual(
      expect.objectContaining({
        ref: 'openrouter,anthropic/claude-sonnet-4',
        status: 'resolved',
        target: expect.objectContaining({
          providerName: 'openrouter',
          modelName: 'anthropic/claude-sonnet-4',
        }),
      })
    );
    expect(result.smartRouterExplanation.rules[0].model).toEqual(
      expect.objectContaining({
        status: 'resolved',
        target: expect.objectContaining({
          providerName: 'openrouter',
          modelName: 'anthropic/claude-opus-4',
        }),
      })
    );
    expect(result.smartRouterExplanation.candidates.map((candidate: any) => candidate.model.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    expect(result.smartRouterExplanation.sticky.alignment.summarizerModel).toEqual(
      expect.objectContaining({
        status: 'resolved',
        target: expect.objectContaining({
          providerName: 'openrouter',
          modelName: 'anthropic/claude-sonnet-4',
        }),
      })
    );
    expect(result.smartRouterExplanation.warnings).toEqual([]);
  });

  it('exposes registration model pools from compiled Models endpoint', async () => {
    const server = createServer({
      initialConfig: {
        Providers: [],
        Models: [
          {
            id: 'sonnet',
            api: 'https://primary.example.com/v1',
            key: 'sk-primary',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
        ],
        Router: {
          default: 'sonnet',
        },
        Registration: {
          enabled: true,
          upstream_services: [
            {
              id: 'edge-router',
              base_url: 'https://edge.example.com',
              auth_token: 'edge-token',
            },
          ],
          models: [
            {
              id: 'sonnet',
              api: 'https://edge.example.com/v1',
              key: 'sk-edge',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
              metadata: {
                pool_endpoint_id: 'edge-primary',
                pool_priority: 10,
                upstream_service_id: 'edge-router',
              },
            },
          ],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/models/compiled');

    const result = await handler({}, {});

    expect(result.modelMap.sonnet.providerName).toBe('model__sonnet');
    expect(result.modelPools.sonnet).toEqual(
      expect.objectContaining({
        modelId: 'sonnet',
        strategy: 'priority',
        activeEndpointId: 'edge-primary',
      })
    );
    expect(result.modelPools.sonnet.endpoints[0]).toEqual(
      expect.objectContaining({
        id: 'edge-primary',
        upstreamServiceId: 'edge-router',
        upstreamBaseUrl: 'https://edge.example.com',
        upstreamAuthConfigured: true,
        priority: 10,
      })
    );
  });

  it('exposes model pool health for maintainer operations', async () => {
    const now = Date.now();
    modelPoolHealthStore.recordFailure('sonnet', 'edge-primary', now);
    modelPoolHealthStore.recordSuccess('sonnet', 'edge-backup', now + 500, 180);
    const server = createServer({
      initialConfig: {
        Providers: [],
        Router: {
          default: 'sonnet',
        },
        Registration: {
          enabled: true,
          strategy: 'least-latency',
          upstream_services: [
            {
              id: 'edge-router',
              base_url: 'https://edge.example.com',
              auth_token: 'edge-token',
            },
          ],
          models: [
            {
              id: 'sonnet',
              api: 'https://edge.example.com/v1',
              key: 'sk-edge',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
              metadata: {
                pool_endpoint_id: 'edge-primary',
                pool_priority: 10,
                upstream_service_id: 'edge-router',
              },
            },
            {
              id: 'sonnet',
              api: 'https://backup.example.com/v1',
              key: 'sk-backup',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
              metadata: {
                pool_endpoint_id: 'edge-backup',
                pool_priority: 20,
              },
            },
          ],
        },
      },
    });
    const handler = server.app.routes.get('GET /api/models/pool-health');

    const result = await handler({}, {});

    expect(result.summary).toEqual(
      expect.objectContaining({
        pools: 1,
        endpoints: 2,
        healthy: 1,
        cooldown: 1,
        open: 0,
        averageLatencyMs: 180,
      })
    );
    expect(result.persistedState.endpoints).toBeGreaterThanOrEqual(2);
    expect(result.pools[0]).toEqual(
      expect.objectContaining({
        modelId: 'sonnet',
        strategy: 'least-latency',
        activeEndpointId: 'edge-backup',
      })
    );
    expect(result.pools[0].endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-primary',
          status: 'cooldown',
          failureCount: 1,
        }),
        expect.objectContaining({
          id: 'edge-backup',
          active: true,
          status: 'healthy',
          latency: expect.objectContaining({
            averageMs: 180,
          }),
        }),
      ])
    );
  });

  it('previews compiled Models registry for a draft config without saving', async () => {
    const server = createServer({
      initialConfig: {
        Models: [
          {
            id: 'sonnet',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-live',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
            thinking: {
              mode: 'auto',
            },
          },
        ],
      },
    });
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Models: [
          {
            id: 'haiku',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            protocol: 'openai',
            model: 'anthropic/claude-3.5-haiku',
            thinking: {
              mode: 'off',
            },
          },
        ],
        Router: {
          default: 'haiku',
        },
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.providers).toEqual([
      {
        name: 'model__haiku',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['anthropic/claude-3.5-haiku'],
        transformer: { use: ['openrouter'] },
        has_api_key: true,
      },
    ]);
    expect(result.modelMap.haiku).toEqual({
      id: 'haiku',
      providerName: 'model__haiku',
      modelName: 'anthropic/claude-3.5-haiku',
      interface: 'openai',
      protocol: 'openai',
      compatibilityProfile: 'openai-compatible-anthropic-dispatch',
      dispatchFormat: 'anthropic_messages',
      thinking: {
        mode: 'off',
      },
      capabilities: {
        thinking: {
          supported: true,
          mode: 'off',
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
      },
      source: 'models',
    });
    expect(result.normalizedConfig.Router?.default).toBe('haiku');
    expect(result.normalizedConfig.Models[0]).toEqual({
      id: 'haiku',
      api: 'https://openrouter.ai/api/v1/chat/completions',
      key: 'sk-preview',
      interface: 'openai',
      model: 'anthropic/claude-3.5-haiku',
      thinking: 'off',
      metadata: undefined,
    });
    expect(result.normalizedConfig.Models[0]).not.toHaveProperty('api_base_url');
    expect(result.normalizedConfig.Models[0]).not.toHaveProperty('api_key');
    expect(result.normalizedConfig.Models[0]).not.toHaveProperty('protocol');
    expect(result.normalizedConfig.TriggerRouter).toBeUndefined();
    expect(result.diff.summary).toEqual({
      addedProviders: 1,
      removedProviders: 1,
      changedProviders: 0,
      addedModels: 1,
      removedModels: 1,
      changedModels: 0,
    });
    expect(result.diff.providerChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'removed',
          name: 'model__sonnet',
        }),
        expect.objectContaining({
          type: 'added',
          name: 'model__haiku',
        }),
      ])
    );
    expect(result.diff.modelChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'removed',
          modelId: 'sonnet',
        }),
        expect.objectContaining({
          type: 'added',
          modelId: 'haiku',
        }),
      ])
    );
    expect(result.referenceImpact.summary).toEqual({
      total: 1,
      modelIdRefs: 1,
      legacyRefs: 0,
      validModelIds: 1,
      missingModelIds: 0,
    });
    expect(result.referenceImpact.entries).toEqual([
      expect.objectContaining({
        path: 'Router.default',
        value: 'haiku',
        referenceType: 'modelId',
        status: 'valid',
        suggestions: [],
        resolvedTarget: expect.objectContaining({
          providerName: 'model__haiku',
          modelName: 'anthropic/claude-3.5-haiku',
        }),
      }),
    ]);
    expect(result.capabilityWarnings.summary).toEqual({
      total: 0,
      warn: 0,
      info: 0,
    });
    expect(result.warnings).toEqual([]);
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
    expect(mockBackupConfigFile).not.toHaveBeenCalled();
  });

  it('returns a SmartRouter-centered draft view from GET /api/config', async () => {
    const loadedConfig = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      TriggerRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'sonnet',
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
      },
      Governance: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'sonnet',
          },
        },
      },
    }).config;
    mockReadConfigFile.mockResolvedValue(loadedConfig);

    const server = createServer({});
    const handler = server.app.routes.get('GET /api/config');

    const result = await handler({}, {});

    expect(result.TriggerRouter).toBeUndefined();
    expect(result.Models[0]).toEqual({
      id: 'sonnet',
      api: 'https://openrouter.ai/api/v1/chat/completions',
      key: 'sk-test',
      interface: 'openai',
      model: 'anthropic/claude-sonnet-4',
      thinking: undefined,
      metadata: undefined,
    });
    expect(result.Models[0]).not.toHaveProperty('api_base_url');
    expect(result.Models[0]).not.toHaveProperty('api_key');
    expect(result.Models[0]).not.toHaveProperty('protocol');
    expect(result.SmartRouter).toEqual(
      expect.objectContaining({
        enabled: true,
        analysis_scope: 'last_message',
        rules: [
          expect.objectContaining({
            name: 'architecture',
            model: 'opus',
          }),
        ],
        semantic: expect.objectContaining({
          enabled: true,
          mode: 'classifier',
          classifier_model: 'sonnet',
        }),
        sticky: expect.objectContaining({
          enabled: true,
          alignment: expect.objectContaining({
            enabled: true,
            summarizer_model: 'sonnet',
          }),
        }),
      })
    );
  });

  it('projects legacy Models aliases to user-facing fields from GET /api/config', async () => {
    mockReadConfigFile.mockResolvedValue({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          protocol: 'openai',
          model: 'anthropic/claude-sonnet-4',
          thinking: {
            mode: 'on',
            effort: 'high',
          },
        },
      ],
    });

    const server = createServer({});
    const handler = server.app.routes.get('GET /api/config');

    const result = await handler({}, {});

    expect(result.Models[0]).toEqual({
      id: 'sonnet',
      api: 'https://openrouter.ai/api/v1/chat/completions',
      key: 'sk-test',
      interface: 'openai',
      model: 'anthropic/claude-sonnet-4',
      thinking: 'high',
      metadata: undefined,
    });
    expect(result.Models[0]).not.toHaveProperty('api_base_url');
    expect(result.Models[0]).not.toHaveProperty('api_key');
    expect(result.Models[0]).not.toHaveProperty('protocol');
  });

  it('reports capability warnings in compiled preview results', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Models: [
          {
            id: 'restricted',
            api: 'https://api.example.com/v1/chat/completions',
            key: 'sk-preview',
            interface: 'openai',
            model: 'vendor/text-only',
            thinking: 'high',
            metadata: {
              supports_reasoning: false,
              supports_tools: false,
              supports_images: false,
            },
          },
        ],
        Router: {
          default: 'restricted',
        },
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.capabilityWarnings.summary).toEqual({
      total: 3,
      warn: 1,
      info: 2,
    });
    expect(result.issueReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          path: 'Models[0].thinking',
          action: expect.stringContaining('Remove the thinking setting'),
        }),
        expect.objectContaining({
          severity: 'info',
          path: 'Models[0].metadata.supports_tools',
          action: expect.stringContaining('Accept text fallback behavior'),
        }),
      ])
    );
    expect(result.capabilityWarnings.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'Models[0].thinking',
          modelId: 'restricted',
          level: 'warn',
          code: 'thinking_ignored',
        }),
        expect.objectContaining({
          path: 'Models[0].metadata.supports_tools',
          modelId: 'restricted',
          level: 'info',
          code: 'tools_text_fallback',
        }),
        expect.objectContaining({
          path: 'Models[0].metadata.supports_images',
          modelId: 'restricted',
          level: 'info',
          code: 'images_text_fallback',
        }),
      ])
    );
    expect(result.warnings).toEqual([
      'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
      'Models[0].metadata.supports_tools disables tools for model "restricted". Tool definitions and tool call/result blocks will fall back to plain text.',
      'Models[0].metadata.supports_images disables image input for model "restricted". Image blocks will fall back to plain text descriptions.',
    ]);
  });

  it('rejects invalid compiled Models draft preview', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Models: [
          {
            id: 'broken',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            protocol: 'openai',
          },
        ],
      },
    }, reply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid configuration preview');
    expect(result.errors).toContain('Models[0].model is required');
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('reports missing modelId references in preview impact analysis when draft is invalid', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Models: [
          {
            id: 'haiku',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            protocol: 'openai',
            model: 'anthropic/claude-3.5-haiku',
          },
        ],
        Router: {
          default: 'missing-model-id',
        },
        Governance: {
          enabled: true,
          sticky: {
            enabled: true,
            alignment: {
              enabled: true,
              summarizer_model: 'missing-model-id',
            },
          },
        },
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.referenceImpact.summary).toEqual({
      total: 2,
      modelIdRefs: 2,
      legacyRefs: 0,
      validModelIds: 0,
      missingModelIds: 2,
    });
    expect(result.referenceImpact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'Router.default',
          value: 'missing-model-id',
          status: 'missing',
          suggestions: [],
        }),
        expect.objectContaining({
          path: 'SmartRouter.sticky.alignment.summarizer_model',
          value: 'missing-model-id',
          status: 'missing',
          suggestions: [],
        }),
      ])
    );
  });

  it('suggests replacement modelIds for missing references when preview can infer close matches', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/models/compiled/preview');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Models: [
          {
            id: 'sonnet',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
          {
            id: 'haiku',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-preview',
            protocol: 'openai',
            model: 'anthropic/claude-3.5-haiku',
          },
        ],
        Router: {
          default: 'sonnet-v2',
        },
        Governance: {
          enabled: true,
          sticky: {
            enabled: true,
            alignment: {
              enabled: true,
              summarizer_model: 'haiku-lite',
            },
          },
        },
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.referenceImpact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'Router.default',
          status: 'missing',
          suggestions: expect.arrayContaining([
            expect.objectContaining({
              modelId: 'sonnet',
              modelName: 'anthropic/claude-sonnet-4',
            }),
          ]),
        }),
        expect.objectContaining({
          path: 'SmartRouter.sticky.alignment.summarizer_model',
          status: 'missing',
          suggestions: expect.arrayContaining([
            expect.objectContaining({
              modelId: 'haiku',
              modelName: 'anthropic/claude-3.5-haiku',
            }),
          ]),
        }),
      ])
    );
  });

  it('exposes governance archive list, detail, and delete endpoints', async () => {
    const originalListArchives = governanceTraceStore.listArchives.bind(governanceTraceStore);
    const originalGetArchivedTraces = governanceTraceStore.getArchivedTraces.bind(governanceTraceStore);
    const originalDeleteArchive = governanceTraceStore.deleteArchive.bind(governanceTraceStore);

    governanceTraceStore.listArchives = vi.fn().mockReturnValue([
      {
        file: 'governance-traces-1.json.gz',
        filePath: '/tmp/governance-traces-1.json.gz',
        traceCount: 2,
        startedAt: 1,
        endedAt: 2,
        compressed: true,
      },
    ]) as any;
    governanceTraceStore.getArchivedTraces = vi.fn().mockReturnValue([
      {
        requestId: 'archive-trace-1',
        routeReason: ['sticky'],
        stickyHit: true,
        alignmentUsed: false,
        cascadeTriggered: false,
        cascadeEvidence: [],
        shadowChecked: false,
        startedAt: 1,
      },
    ]) as any;
    governanceTraceStore.deleteArchive = vi.fn().mockReturnValue(true) as any;

    try {
      const server = createServer({});
      const listHandler = server.app.routes.get('GET /api/governance/archives');
      const detailHandler = server.app.routes.get('GET /api/governance/archives/:file');
      const deleteHandler = server.app.routes.get('POST /api/governance/archives/:file/delete');
      const reply = {
        code: vi.fn().mockReturnThis(),
      };

      const listResult = await listHandler({ query: { date: '2026-04-01', page: '1', pageSize: '10' } }, {});
      const detailResult = await detailHandler({ params: { file: 'governance-traces-1.json.gz' } }, reply);
      const deleteResult = await deleteHandler({ params: { file: 'governance-traces-1.json.gz' } }, reply);

      expect(listResult.archives).toHaveLength(1);
      expect(listResult.archives[0].compressed).toBe(true);
      expect(detailResult.file).toBe('governance-traces-1.json.gz');
      expect(detailResult.traces).toHaveLength(1);
      expect(deleteResult).toEqual({
        success: true,
        file: 'governance-traces-1.json.gz',
      });
    } finally {
      governanceTraceStore.listArchives = originalListArchives as any;
      governanceTraceStore.getArchivedTraces = originalGetArchivedTraces as any;
      governanceTraceStore.deleteArchive = originalDeleteArchive as any;
    }
  });

  it('exposes governance metrics endpoint with matching filters', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      sessionKey: 'session-a',
      finalModel: 'model-a',
      routeReason: ['sticky', 'semantic:intent:code_review'],
      stickyHit: true,
      alignmentUsed: true,
      semanticIntent: 'code_review',
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      latencyMs: 120,
      estimatedCost: 0.2,
      startedAt: Date.now() - 1000,
      completedAt: 2,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      sessionKey: 'session-b',
      finalModel: 'model-b',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      latencyMs: 60,
      estimatedCost: 0.1,
      startedAt: Date.now() - 500,
      completedAt: 4,
    });

    const server = createServer({});
    const metricsHandler = server.app.routes.get('GET /api/governance/metrics');

    const allMetrics = await metricsHandler({ query: {} }, {});
    const sessionMetrics = await metricsHandler({ query: { sessionKey: 'session-a' } }, {});
    const cascadeMetrics = await metricsHandler({ query: { cascadeTriggered: 'true' } }, {});

    expect(allMetrics.metrics.totalTraces).toBe(2);
    expect(allMetrics.metrics.stickyHitRate).toBe(0.5);
    expect(allMetrics.metrics.cascadeTriggeredRate).toBe(0.5);
    expect(allMetrics.metrics.shadowCheckedRate).toBe(0.5);
    expect(allMetrics.metrics.averageLatencyMs).toBe(90);
    expect(allMetrics.metrics.routeReasonDistribution).toEqual({
      sticky: 1,
      'semantic:intent:code_review': 1,
      smart_router: 1,
    });
    expect(allMetrics.metrics.finalModelDistribution).toEqual({
      'model-a': 1,
      'model-b': 1,
    });
    expect(allMetrics.bucketCount).toBe(6);
    expect(allMetrics.topRouteReasons).toEqual([
      { key: 'semantic:intent:code_review', count: 1, rate: 0.5 },
      { key: 'smart_router', count: 1, rate: 0.5 },
      { key: 'sticky', count: 1, rate: 0.5 },
    ]);
    expect(allMetrics.qualityEvidence).toEqual(expect.objectContaining({
      totalSamples: 1,
      failureSamples: 1,
    }));
    expect(allMetrics.qualityEvidence.samples).toEqual([
      expect.objectContaining({
        requestId: 'trace-1',
        type: 'cascade_failure',
      }),
    ]);
    expect(allMetrics.taskComparison).toEqual(expect.objectContaining({
      totalComparedTasks: 0,
      totalComparedTraces: 0,
      comparisons: [],
    }));
    expect(sessionMetrics.metrics.totalTraces).toBe(1);
    expect(sessionMetrics.metrics.alignmentUsedRate).toBe(1);
    expect(sessionMetrics.metrics.semanticIntentDistribution).toEqual({
      code_review: 1,
    });
    expect(cascadeMetrics.metrics.totalTraces).toBe(1);
    expect(cascadeMetrics.metrics.cascadeTriggeredRate).toBe(1);
  });

  it('supports windowed governance metrics buckets', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['sticky'],
      stickyHit: true,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 20,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 5_000,
      latencyMs: 30,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      routeReason: ['semantic:intent:delivery'],
      stickyHit: false,
      alignmentUsed: true,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 9_000,
      latencyMs: 40,
    });

    const server = createServer({});
    const metricsHandler = server.app.routes.get('GET /api/governance/metrics');
    const result = await metricsHandler({
      query: {
        windowMs: '8000',
        bucketCount: '4',
        now: '9000',
      },
    }, {});

    expect(result.windowMs).toBe(8000);
    expect(result.bucketCount).toBe(4);
    expect(result.windowStart).toBe(1000);
    expect(result.windowEnd).toBe(9000);
    expect(result.metrics.totalTraces).toBe(3);
    expect(result.buckets).toHaveLength(4);
    expect(result.buckets[0].metrics.totalTraces).toBe(1);
    expect(result.buckets[2].metrics.cascadeTriggeredRate).toBe(1);
    expect(result.buckets[3].metrics.alignmentUsedRate).toBe(1);
    expect(result.topRouteReasons[0]).toEqual({
      key: 'semantic:intent:delivery',
      count: 1,
      rate: 0.3333,
    });
  });

  it('returns anomaly alerts in governance metrics response', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 800,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 7_000,
      latencyMs: 3200,
    });
    governanceTraceStore.add({
      requestId: 'trace-3',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 8_000,
      latencyMs: 3600,
    });

    const server = createServer({});
    const metricsHandler = server.app.routes.get('GET /api/governance/metrics');
    const result = await metricsHandler({
      query: {
        windowMs: '8000',
        bucketCount: '4',
        now: '8000',
        minSampleSize: '2',
      },
    }, {});

    expect(result.anomalies.map((item: any) => item.type)).toContain('cascade_rate_high');
    expect(result.anomalies.map((item: any) => item.type)).toContain('shadow_rate_high');
    expect(result.anomalies.map((item: any) => item.type)).toContain('latency_high');
    expect(result.health).toEqual(expect.objectContaining({
      status: 'critical',
      message: '5 governance alerts need attention (1 critical / 4 warnings).',
      sampleSize: 3,
      alertCount: 5,
      warnCount: 4,
      criticalCount: 1,
    }));
  });

  it('exposes a governance health endpoint for maintainer status checks', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      initialModel: 'sonnet',
      routeReason: ['smart_router'],
      finalModel: 'sonnet',
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 100,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      initialModel: 'haiku',
      routeReason: ['smart_router'],
      finalModel: 'sonnet',
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 2_000,
      latencyMs: 120,
    });

    const server = createServer({});
    const healthHandler = server.app.routes.get('GET /api/governance/health');
    const result = await healthHandler({
      query: {
        minSampleSize: '2',
        cascadeWarnRate: '0.4',
        shadowWarnRate: '0.4',
      },
    }, {});

    expect(result.health).toEqual(expect.objectContaining({
      status: 'watch',
      message: '4 governance alerts need attention (0 critical / 4 warnings).',
      sampleSize: 2,
      alertCount: 4,
      warnCount: 4,
      criticalCount: 0,
    }));
    expect(result.health.signals.topFinalModel).toEqual({
      key: 'sonnet',
      count: 2,
      rate: 1,
    });
    expect(result.health.signals).toEqual(expect.objectContaining({
      modelSwitchRate: 0.5,
      alignmentOnSwitchRate: 0,
    }));
    expect(result.metrics.totalTraces).toBe(2);
    expect(result.outcome).toEqual(expect.objectContaining({
      routedRate: 1,
      modelSwitchCount: 1,
      modelSwitchRate: 0.5,
    }));
    expect(result.outcome.topModelSwitches).toEqual([
      { key: 'haiku -> sonnet', from: 'haiku', to: 'sonnet', count: 1, rate: 1 },
    ]);
    expect(result.outcome.byRouteReason).toEqual([
      expect.objectContaining({
        key: 'smart_router',
        totalTraces: 2,
        modelSwitchRate: 0.5,
        alignmentOnSwitchRate: 0,
        cascadeAfterSwitchRate: 1,
        averageLatencyMs: 110,
      }),
    ]);
    expect(result.anomalies.map((item: any) => item.type)).toEqual([
      'cascade_rate_high',
      'shadow_rate_high',
      'cascade_spike',
      'shadow_spike',
    ]);
  });

  it('exports governance metrics as csv download response', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['sticky'],
      stickyHit: true,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 50,
    });

    const server = createServer({});
    const exportHandler = server.app.routes.get('GET /api/governance/metrics/export');
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn((body: string) => body),
    };

    const result = await exportHandler({
      query: {
        format: 'csv',
        windowMs: '8000',
        bucketCount: '2',
        now: '8000',
      },
    }, reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(reply.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="governance-metrics.csv"'
    );
    expect(result).toContain('section,key,value');
    expect(result).toContain('summary,totalTraces,1');
  });

  it('records manual governance metric snapshots and exposes export history', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['sticky'],
      stickyHit: true,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
    });

    const server = createServer({});
    const createSnapshotHandler = server.app.routes.get('POST /api/governance/metrics/snapshots');
    const listExportsHandler = server.app.routes.get('GET /api/governance/metrics/exports');

    const snapshotResult = await createSnapshotHandler({
      body: {
        format: 'json',
        windowMs: 8_000,
        now: 8_000,
      },
    }, {});
    const exportsResult = await listExportsHandler({}, {});

    expect(snapshotResult.success).toBe(true);
    expect(snapshotResult.export.kind).toBe('manual');
    expect(exportsResult.exports).toHaveLength(1);
  });

  it('registers scheduled governance metric snapshots', async () => {
    const server = createServer({});
    const scheduleHandler = server.app.routes.get('POST /api/governance/metrics/schedules');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await scheduleHandler({
      body: {
        intervalMs: 1000,
        format: 'csv',
        windowMs: 3_600_000,
      },
    }, reply);

    expect(result.success).toBe(true);
    expect(result.schedule.intervalMs).toBe(1000);
    expect(result.schedule.format).toBe('csv');
  });

  it('accepts custom anomaly threshold query parameters', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 900,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: true,
      startedAt: 8_000,
      latencyMs: 1600,
    });

    const server = createServer({});
    const metricsHandler = server.app.routes.get('GET /api/governance/metrics');
    const result = await metricsHandler({
      query: {
        windowMs: '8000',
        bucketCount: '4',
        now: '8000',
        minSampleSize: '2',
        latencyWarnMs: '1000',
        spikeWarnRate: '0.4',
        spikeDeltaRate: '0.2',
      },
    }, {});

    expect(result.anomalies.map((item: any) => item.type)).toContain('latency_high');
  });

  it('uses configured anomaly thresholds as default metrics query thresholds', async () => {
    governanceTraceStore.add({
      requestId: 'trace-1',
      routeReason: ['smart_router'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: false,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 1_000,
      latencyMs: 1200,
    });
    governanceTraceStore.add({
      requestId: 'trace-2',
      routeReason: ['cascade_gate'],
      stickyHit: false,
      alignmentUsed: false,
      cascadeTriggered: true,
      cascadeEvidence: [],
      shadowChecked: false,
      startedAt: 8_000,
      latencyMs: 1600,
    });

    const server = createServer({
      initialConfig: {
        Governance: {
          enabled: true,
          observability: {
            anomaly_thresholds: {
              min_sample_size: 2,
              latency_warn_ms: 1000,
            },
          },
        },
      },
    });
    const metricsHandler = server.app.routes.get('GET /api/governance/metrics');
    const result = await metricsHandler({
      query: {
        windowMs: '8000',
        bucketCount: '4',
        now: '8000',
      },
    }, {});

    expect(result.anomalies.map((item: any) => item.type)).toContain('latency_high');
  });

  it('persists anomaly thresholds through the dedicated governance endpoint', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/governance/observability/anomaly-thresholds');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    mockReadConfigFile.mockResolvedValue({
      HOST: '127.0.0.1',
      PORT: 5678,
      LOG: true,
      LOG_LEVEL: 'debug',
      API_TIMEOUT_MS: 600000,
      NON_INTERACTIVE_MODE: false,
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      Governance: {
        enabled: true,
      },
    });

    const result = await handler({
      body: {
        min_sample_size: 4,
        cascade_warn_rate: 0.45,
        shadow_warn_rate: 0.55,
        latency_warn_ms: 1800,
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        Governance: expect.objectContaining({
          observability: expect.objectContaining({
            anomaly_thresholds: expect.objectContaining({
              min_sample_size: 4,
              cascade_warn_rate: 0.45,
              shadow_warn_rate: 0.55,
              latency_warn_ms: 1800,
            }),
          }),
        }),
      })
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe('Anomaly thresholds saved successfully');
  });

  it('renders a configuration and status workspace at /ui', async () => {
    const server = createServer({
      initialConfig: {
        PORT: 6789,
        Models: [
          {
            id: 'sonnet',
            api: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            interface: 'openai',
            model: 'vendor/sonnet',
          },
        ],
        Router: {
          default: 'sonnet',
        },
      },
    });
    const handler = server.app.routes.get('GET /ui');
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn((html: string) => html),
    };

    const html = await handler({}, reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(html).toContain('配置与状态工作台');
    expect(html).toContain('serviceReadyStatus');
    expect(html).toContain('servicePortStatus');
    expect(html).toContain('modelCountStatus');
    expect(html).toContain('routerDefaultStatus');
    expect(html).toContain('6789');
    expect(html).toContain('sonnet');
    expect(html).toContain('loadConfigDraftHeroBtn');
    expect(html).toContain('previewConfigDraftHeroBtn');
    expect(html).toContain('refreshStatusHeroBtn');
    expect(html).toContain('loadServiceStatus');
    expect(html).toContain('listenerStatusSummary');
    expect(html).toContain('roleConnectionGuide');
    expect(html).toContain('Role & connection guide');
    expect(html).toContain('本地 ctr 代理把模型请求转发到远程服务');
    expect(html).toContain('client + read-only');
    expect(html).toContain('authQuotaTable');
    expect(html).toContain('authScopeGuide');
    expect(html).toContain('Auth scope guide');
    expect(html).toContain('operator');
    expect(html).toContain('日常运维使用');
    expect(html).toContain('client + read-only');
    expect(html).toContain('远程 token 同时需要 ready/status 探测与模型调用');
    expect(html).toContain('POST /api/auth/keys');
    expect(html).toContain('POST /api/auth/keys/:id/revoke');
    expect(html).toContain('secret 只返回一次');
    expect(html).toContain('userSurfaceTab');
    expect(html).toContain('maintainerSurfaceTab');
    expect(html).toContain('id="userSurface"');
    expect(html).toContain('id="maintainerSurface"');
    expect(html).toContain('data-surface-target="user"');
    expect(html).toContain('data-surface-target="maintainer"');
    expect(html).toContain('使用者工作台');
    expect(html).toContain('维护者工作台');
    expect(html).toContain('setActiveSurface');
    expect(html).toContain('setActiveSurface(\'user\')');
    expect(html).toContain('<section id="maintainerSurface" class="surface-panel" data-surface="maintainer" hidden>');
    expect(html.indexOf('Draft Config Preview')).toBeLessThan(html.indexOf('维护者观测'));
    expect(html).toContain('维护者观测');
    expect(html).toContain('Governance Trace');
    expect(html).toContain('/api/models/compiled');
    expect(html).toContain('/api/models/compiled/preview');
    expect(html).toContain('Draft Config Preview');
    expect(html).toContain('draftSummaryGrid');
    expect(html).toContain('draftPresetList');
    expect(html).toContain('draftPreviewMeta');
    expect(html).toContain('Preset guide');
    expect(html).toContain('Draft preview mode');
    expect(html).toContain('实际预览命中区域');
    expect(html).toContain('Validation Summary');
    expect(html).toContain('draftValidationList');
    expect(html).toContain('data-validation-path');
    expect(html).toContain('No validation issues');
    expect(html).toContain('错误与 warning，并区分修复优先级');
    expect(html).toContain('repair first');
    expect(html).toContain('review before save');
    expect(html).toContain('Capability Warnings');
    expect(html).toContain('capabilityWarningsList');
    expect(html).toContain('No capability warnings');
    expect(html).toContain('renderCapabilityWarnings');
    expect(html).toContain('Current Router slots');
    expect(html).toContain('routerSlotSummary');
    expect(html).toContain('routerSlotTable');
    expect(html).toContain('renderRouterSlotExplanation');
    expect(html).toContain('longContext');
    expect(html).toContain('缺少上下文窗口元数据');
    expect(html).toContain('Context window guide');
    expect(html).toContain('contextWindowGuide');
    expect(html).toContain('renderContextWindowGuide');
    expect(html).toContain('applyContextWindowAction');
    expect(html).toContain('data-context-action');
    expect(html).toContain('SmartRouter explanation');
    expect(html).toContain('smartRouterExplanationSummary');
    expect(html).toContain('smartRouterRouteOrder');
    expect(html).toContain('smartRouterRulesTable');
    expect(html).toContain('smartRouterCandidatesTable');
    expect(html).toContain('renderSmartRouterExplanation');
    expect(html).toContain("readModelMetadataNumber(model,'context_window_tokens') || caps.contextWindowTokens");
    expect(html).toContain("modelName:model?.model || compiled?.modelName || '-'");
    expect(html).toContain('getCapabilityWarningActionLabel');
    expect(html).toContain('applyCapabilityWarningSuggestion');
    expect(html).toContain('data-apply-warning-path');
    expect(html).toContain('data-apply-warning-code');
    expect(html).toContain('移除 thinking');
    expect(html).toContain('恢复默认 capability');
    expect(html).toContain('Routing rules');
    expect(html).toContain('SmartRouter');
    expect(html).toContain('Governance');
    expect(html).toContain('Routing rules');
    expect(html).toContain('Patterns');
    expect(html).toContain('Smart candidates');
    expect(html).toContain('Cascade levels');
    expect(html).toContain('Model refs');
    expect(html).toContain('applyBalancedPresetBtn');
    expect(html).toContain('previewBalancedPresetBtn');
    expect(html).toContain('applyFastPresetBtn');
    expect(html).toContain('previewFastPresetBtn');
    expect(html).toContain('applyGovernancePresetBtn');
    expect(html).toContain('previewGovernancePresetBtn');
    expect(html).toContain('draftPresetMode');
    expect(html).toContain('draftPresetModeHint');
    expect(html).toContain('append / merge');
    expect(html).toContain('overwrite');
    expect(html).toContain('SmartRouter / Governance');
    expect(html).toContain('平衡预设');
    expect(html).toContain('快速预设');
    expect(html).toContain('治理预设');
    expect(html).toContain('Routing Controls');
    expect(html).toContain('Routing rules');
    expect(html).toContain('SmartRouter');
    expect(html).toContain('Governance');
    expect(html).toContain('triggerEnabled');
    expect(html).toContain('triggerIntentModel');
    expect(html).toContain('topLevelTriggerIntentSuggestions');
    expect(html).toContain('triggerRulesList');
    expect(html).toContain('addTriggerRuleBtn');
    expect(html).toContain('data-add-trigger-pattern');
    expect(html).toContain('data-remove-trigger-pattern');
    expect(html).toContain('data-trigger-pattern');
    expect(html).toContain('data-trigger-pattern-field');
    expect(html).toContain('data-add-trigger-keyword');
    expect(html).toContain('data-remove-trigger-keyword');
    expect(html).toContain('data-trigger-keyword');
    expect(html).toContain('regex 模式下忽略 keywords');
    expect(html).toContain('exact 模式下忽略 regex pattern');
    expect(html).toContain('regex 模式需要填写 pattern');
    expect(html).toContain('exact 模式至少需要一个 keyword');
    expect(html).toContain('smartEnabled');
    expect(html).toContain('smartRouterModel');
    expect(html).toContain('topLevelSmartRouterSuggestions');
    expect(html).toContain('smartCandidatesList');
    expect(html).toContain('addSmartCandidateBtn');
    expect(html).toContain('governanceEnabled');
    expect(html).toContain('governanceSummarizerModel');
    expect(html).toContain('topLevelGovernanceSummarizerSuggestions');
    expect(html).toContain('governanceClassifierModel');
    expect(html).toContain('topLevelGovernanceClassifierSuggestions');
    expect(html).toContain('governanceVerifierModel');
    expect(html).toContain('topLevelGovernanceVerifierSuggestions');
    expect(html).toContain('governanceCascadeLevelsList');
    expect(html).toContain('addCascadeLevelBtn');
    expect(html).toContain('Preview Diff');
    expect(html).toContain('Reference Impact');
    expect(html).toContain('compiledDiffSummary');
    expect(html).toContain('compiledDiffTable');
    expect(html).toContain('referenceImpactSummary');
    expect(html).toContain('referenceImpactTable');
    expect(html).toContain('Suggestions');
    expect(html).toContain('Resolved target');
    expect(html).toContain('应用建议');
    expect(html).toContain('data-apply-reference-path');
    expect(html).toContain('data-apply-reference-model');
    expect(html).toContain('modelsFormGrid');
    expect(html).toContain('draftRouterDefault');
    expect(html).toContain('draftModelsCount');
    expect(html).toContain('addModelDraftBtn');
    expect(html).toContain('syncDraftJsonBtn');
    expect(html).toContain('Models field guide');
    expect(html).toContain('id / api / key / interface / model / thinking / metadata');
    expect(html).toContain('api_key / api_base_url / protocol 仅作为旧配置兼容读取');
    expect(html).toContain('JSON 草稿同样建议只写入口字段');
    expect(html).toContain('旧字段别名无需手动补充');
    expect(html).toContain('Router.default 和路由规则引用这个 model id');
    expect(html).toContain('新配置使用 api');
    expect(html).toContain('新配置使用 key');
    expect(html).toContain('新配置使用 interface');
    expect(html).toContain('Provider template');
    expect(html).toContain('modelProviderTemplates');
    expect(html).toContain('data-apply-template');
    expect(html).toContain('applyProviderTemplate');
    expect(html).toContain('inferProviderTemplateKey');
    expect(html).toContain('getProviderTemplateContext');
    expect(html).toContain('createDraftModelFromTemplate');
    expect(html).toContain('defaultProviderTemplateKey');
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Anthropic');
    expect(html).toContain('OpenAI-compatible');
    expect(html).toContain('SiliconFlow');
    expect(html).toContain('default_model');
    expect(html).toContain('model_examples');
    expect(html).toContain('suggested_id');
    expect(html).toContain('key_placeholder');
    expect(html).toContain('default_thinking');
    expect(html).toContain('modelSuggestions');
    expect(html).toContain('gpt-5');
    expect(html).toContain('claude-sonnet-4-5');
    expect(html).toContain('deepseek-chat');
    expect(html).toContain('sk-ant-...');
    expect(html).toContain('siliconflow');
    expect(html).toContain('建议模板：');
    expect(html).toContain('例如：');
    expect(html).toContain('configDraftEditor');
    expect(html).toContain('loadConfigDraftBtn');
    expect(html).toContain('previewConfigDraftBtn');
    expect(html).toContain('saveConfigDraftBtn');
    expect(html).toContain('draftPreviewStatus');
    expect(html).toContain('loadConfigDraft');
    expect(html).toContain('previewConfigDraft');
    expect(html).toContain('saveConfigDraft');
    expect(html).toContain('renderModelsForm');
    expect(html).toContain('thinking_profile');
    expect(html).toContain('vendor_hint');
    expect(html).toContain('supports_reasoning');
    expect(html).toContain('supports_tools');
    expect(html).toContain('supports_images');
    expect(html).toContain('Reasoning support');
    expect(html).toContain('Tool support');
    expect(html).toContain('Image support');
    expect(html).toContain('Metadata (advanced JSON)');
    expect(html).toContain('renderDraftSummary');
    expect(html).toContain('renderDraftValidation');
    expect(html).toContain('issueReport');
    expect(html).toContain('Action:');
    expect(html).toContain("text.startsWith('Models')");
    expect(html).toContain("text.startsWith('TriggerRouter') ? 'SmartRouter'");
    expect(html).toContain('extractPath');
    expect(html).toContain('issues</span>');
    expect(html).toContain('findValidationTarget');
    expect(html).toContain('jumpToValidationPath');
    expect(html).toContain('scrollIntoView');
    expect(html).toContain('jump-highlight');
    expect(html).toContain('activeValidationHighlight');
    expect(html).toContain('draftPresets');
    expect(html).toContain('applyDraftPreset');
    expect(html).toContain('buildPresetPayload');
    expect(html).toContain('previewDraftPreset');
    expect(html).toContain('renderDraftPreviewMeta');
    expect(html).toContain('deriveActualAffectedAreas');
    expect(html).toContain('renderDraftPresetGuide');
    expect(html).toContain('renderDraftPresetModeHint');
    expect(html).toContain('resolvePresetModelId');
    expect(html).toContain("draftPresetMode.value === 'replace'");
    expect(html).toContain('extractModelsFromForm');
    expect(html).toContain('buildDraftPayloadFromForm');
    expect(html).toContain('renderConfigControlForms');
    expect(html).toContain('renderTriggerRulesList');
    expect(html).toContain('extractTriggerRulesFromForm');
    expect(html).toContain('addTriggerPattern');
    expect(html).toContain('addTriggerKeyword');
    expect(html).toContain('renderSmartCandidatesList');
    expect(html).toContain('extractSmartCandidatesFromForm');
    expect(html).toContain('renderCascadeLevelsList');
    expect(html).toContain('extractCascadeLevelsFromForm');
    expect(html).toContain('knownModelIds');
    expect(html).toContain('getModelIdSuggestionsMarkup');
    expect(html).toContain('getTriggerPatternValidationHint');
    expect(html).toContain('updateTopLevelModelSuggestionLists');
    expect(html).toContain('triggerModelSuggestions');
    expect(html).toContain('smartModelSuggestions');
    expect(html).toContain('cascadeFromSuggestions');
    expect(html).toContain('cascadeToSuggestions');
    expect(html).toContain('syncDraftEditorFromForm');
    expect(html).toContain('applyReferenceSuggestion');
    expect(html).toContain('addDraftModel');
    expect(html).toContain('addTriggerRule');
    expect(html).toContain('addSmartCandidate');
    expect(html).toContain('addCascadeLevel');
    expect(html).toContain('renderCompiledDiff');
    expect(html).toContain('renderReferenceImpact');
    expect(html).toContain('Compiled Models');
    expect(html).toContain('compiledModelsStatus');
    expect(html).toContain('compiledProvidersTable');
    expect(html).toContain('compiledModelMapTable');
    expect(html).toContain('compiledModelPoolsTable');
    expect(html).toContain('Model pool health');
    expect(html).toContain('modelPoolHealthSummary');
    expect(html).toContain('modelPoolHealthTable');
    expect(html).toContain('/api/models/pool-health');
    expect(html).toContain('loadModelPoolHealth');
    expect(html).toContain('Compatibility profile');
    expect(html).toContain('Dispatch format');
    expect(html).toContain('loadCompiledModels');
    expect(html).toContain('/api/governance/traces');
    expect(html).toContain('/api/governance/archives');
    expect(html).toContain('/api/governance/metrics');
    expect(html).toContain('/api/governance/health');
    expect(html).toContain('/api/governance/metrics/export');
    expect(html).toContain('/api/governance/metrics/exports');
    expect(html).toContain('createSnapshotBtn');
    expect(html).toContain('snapshotFormat');
    expect(html).toContain('exportTable');
    expect(html).toContain('scheduleTable');
    expect(html).toContain('archiveTable');
    expect(html).toContain('loadArchivesBtn');
    expect(html).toContain('archivePageSize');
    expect(html).toContain('metricsGrid');
    expect(html).toContain('Health');
    expect(html).toContain('Model switch rate');
    expect(html).toContain('Alignment on switch');
    expect(html).toContain('Outcome by route');
    expect(html).toContain('routeOutcomeRanking');
    expect(html).toContain('renderOutcomeGroups');
    expect(html).toContain('Routing tuning');
    expect(html).toContain('routingTuningList');
    expect(html).toContain('renderRoutingTuning');
    expect(html).toContain('Quality evidence');
    expect(html).toContain('qualityEvidenceSummary');
    expect(html).toContain('qualityEvidenceList');
    expect(html).toContain('renderQualityEvidence');
    expect(html).toContain('Task comparison');
    expect(html).toContain('taskComparisonList');
    expect(html).toContain('renderTaskComparison');
    expect(html).toContain('switch ');
    expect(html).toContain('align ');
    expect(html).toContain('cascade ');
    expect(html).toContain('healthSummary');
    expect(html).toContain('Health pending');
    expect(html).toContain("fetch('/api/governance/health'+query)");
    expect(html).toContain("const health=healthData.health || metricsData.health");
    expect(html).toContain('metricsData.outcome || {}');
    expect(html).toContain("renderAnomalies(metricsData.anomalies || [],health)");
    expect(html).toContain('data-health-action');
    expect(html).toContain('applyHealthAction');
    expect(html).toContain("cascadeSelect.value='true'");
    expect(html).toContain("shadowSelect.value='true'");
    expect(html).toContain("healthSummary.addEventListener('click'");
    expect(html).toContain('查看治理健康摘要');
    expect(html).toContain('anomalyList');
    expect(html).toContain('minSampleSize');
    expect(html).toContain('cascadeWarnRate');
    expect(html).toContain('shadowWarnRate');
    expect(html).toContain('latencyWarnMs');
    expect(html).toContain('saveThresholdsBtn');
    expect(html).toContain('/api/governance/observability/anomaly-thresholds');
    expect(html).toContain('bucketGrid');
    expect(html).toContain('routeRanking');
    expect(html).toContain('modelRanking');
    expect(html).toContain('intentRanking');
    expect(html).toContain('trendTable');
    expect(html).toContain('windowMs');
    expect(html).toContain('refreshBtn');
    expect(html).toContain('traceDetail');
    expect(html).toContain('routeReason');
    expect(html).toContain('cascadeTriggered');
    expect(html).toContain('shadowChecked');
  });

  it('keeps full runtime config in server initialConfig for the /ui first screen', () => {
    const runtimeConfig = {
      HOST: '0.0.0.0',
      PORT: 3456,
      Providers: [],
      Models: [
        {
          id: 'sonnet',
          api: 'https://api.example.com/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'vendor/sonnet',
        },
      ],
      Router: {
        default: 'sonnet',
      },
    };
    const registry = {
      providers: [
        {
          name: 'model__sonnet',
          api_base_url: 'https://api.example.com/v1/chat/completions',
          models: ['vendor/sonnet'],
        },
      ],
    };

    const initialConfig = buildServerInitialConfig(runtimeConfig, registry, '127.0.0.1', 6789);

    expect(initialConfig.Models).toBe(runtimeConfig.Models);
    expect(initialConfig.Router).toEqual({ default: 'sonnet' });
    expect(initialConfig.providers).toBe(registry.providers);
    expect(initialConfig.HOST).toBe('127.0.0.1');
    expect(initialConfig.PORT).toBe(6789);
    expect(initialConfig.LOG_FILE).toContain('claude-trigger-router.log');
  });

  it('escapes server-rendered /ui status values from config', async () => {
    const server = createServer({
      initialConfig: {
        PORT: '<img src=x onerror=alert(1)>',
        Models: [],
        Router: {
          default: '<script>alert(1)</script>',
        },
      },
    });
    const handler = server.app.routes.get('GET /ui');
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn((html: string) => html),
    };

    const html = await handler({}, reply);

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('renders service context and remote status summary at /ui', async () => {
    const server = createServer({
      initialConfig: {
        PORT: 6789,
        Runtime: {
          mode: 'local',
          remote_service: {
            enabled: true,
            base_url: 'https://router.example.com/',
            auth_token: 'remote-token',
          },
        },
        Registration: {
          enabled: true,
          upstream_services: [
            {
              id: 'edge-router',
              base_url: 'https://edge.example.com',
            },
          ],
        },
        Router: {},
      },
    });
    const handler = server.app.routes.get('GET /ui');
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn((html: string) => html),
    };

    const html = await handler({}, reply);

    expect(html).toContain('serviceModeStatus');
    expect(html).toContain('serviceRoleStatus');
    expect(html).toContain('listenerConnectionSummary');
    expect(html).toContain('clientConnectionSummary');
    expect(html).toContain('remoteStatusSummary');
    expect(html).toContain('remoteRegistrationStatusSummary');
    expect(html).toContain('registrationStatusSummary');
    expect(html).toContain('https://router.example.com');
    expect(html).toContain('local_agent');
    expect(html).toContain('/api/service-info');
    expect(html).toContain('/api/remote-status');
  });

  it('rejects invalid config before writing', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({ body: {} }, reply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid configuration');
    expect(result.errors).toContain('Providers is required and must be a non-empty array');
    expect(result.warnings).toEqual([]);
    expect(result.issueReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          path: 'Providers',
          action: expect.stringContaining('Add at least one model'),
        }),
      ])
    );
    expect(mockBackupConfigFile).not.toHaveBeenCalled();
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('writes normalized valid config', async () => {
    mockBackupConfigFile.mockResolvedValue('/tmp/config.backup.yaml');

    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    };

    const result = await handler({ body: requestBody }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(mockBackupConfigFile).toHaveBeenCalledOnce();
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        HOST: '127.0.0.1',
        PORT: 5678,
        LOG: true,
        LOG_LEVEL: 'debug',
        API_TIMEOUT_MS: 600000,
        NON_INTERACTIVE_MODE: false,
        Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        Providers: requestBody.Providers,
      })
    );
    const persisted = mockWriteConfigFile.mock.calls.at(-1)?.[0] as any;
    expect(persisted.Runtime).toBeUndefined();
    expect(persisted.Registration).toBeUndefined();
    expect(result).toEqual({
      success: true,
      message: 'Config saved successfully',
      warnings: [],
      issueReport: {
        issues: [],
        summary: {
          total: 0,
          error: 0,
          warning: 0,
          info: 0,
        },
      },
    });
  });

  it('persists configured Runtime and Registration blocks after normalization', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };
    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      Runtime: {
        mode: 'server',
        remote_service: {
          enabled: true,
          base_url: 'https://router.example.com',
        },
      },
      Registration: {
        enabled: true,
        models: [
          {
            id: ' edge-sonnet ',
            api: ' https://api.example.com/v1 ',
            key: ' sk-registration ',
            interface: 'anthropic',
            model: ' claude-sonnet-4-5 ',
          },
        ],
        upstream_services: [
          {
            id: ' edge-router ',
            base_url: ' https://edge.example.com/ ',
            auth_token: ' remote-token ',
          },
        ],
      },
    };

    const result = await handler({ body: requestBody }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        Runtime: {
          mode: 'server',
          remote_service: {
            enabled: true,
            base_url: 'https://router.example.com',
          },
        },
        Registration: {
          enabled: true,
          models: [
            expect.objectContaining({
              id: 'edge-sonnet',
              api: 'https://api.example.com/v1/messages',
              key: 'sk-registration',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
            }),
          ],
          upstream_services: [
            {
              id: 'edge-router',
              base_url: 'https://edge.example.com',
              auth_token: 'remote-token',
            },
          ],
        },
      })
    );
  });

  it('returns warnings when saving a config with capability downgrade hints', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'restricted' },
      Models: [
        {
          id: 'restricted',
          api: 'https://api.example.com/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'vendor/text-only',
          thinking: 'high',
          metadata: {
            supports_reasoning: false,
          },
        },
      ],
    };

    const result = await handler({ body: requestBody }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([
      'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
    ]);
    expect(result.issueReport.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: 'Models[0].thinking',
        action: expect.stringContaining('Remove the thinking setting'),
      }),
    ]);
  });

  it('keeps info severity for non-blocking capability hints when saving config', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const result = await handler({
      body: {
        Router: { default: 'restricted' },
        Models: [
          {
            id: 'restricted',
            api: 'https://api.example.com/v1/chat/completions',
            key: 'sk-test',
            interface: 'openai',
            model: 'vendor/text-only',
            metadata: {
              supports_tools: false,
              supports_images: false,
            },
          },
        ],
      },
    }, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(result.issueReport.summary).toEqual({
      total: 2,
      error: 0,
      warning: 0,
      info: 2,
    });
    expect(result.issueReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'info',
          path: 'Models[0].metadata.supports_tools',
        }),
        expect.objectContaining({
          severity: 'info',
          path: 'Models[0].metadata.supports_images',
        }),
      ])
    );
  });

  it('does not persist TriggerRouter when user did not configure it', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        TriggerRouter: expect.anything(),
      })
    );
  });

  it('rejects invalid TriggerRouter intent_model reference before writing', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      TriggerRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'openrouter,anthropic/claude-opus-4',
        rules: [
          {
            name: 'architecture',
            priority: 10,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'openrouter,anthropic/claude-sonnet-4',
          },
        ],
      },
    };

    const result = await handler({ body: requestBody }, reply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      'SmartRouter.semantic.classifier_model 引用的模型 "anthropic/claude-opus-4" 不在提供商 "openrouter" 的 models 列表中'
    );
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('does not persist default TriggerRouter after a GET-to-POST round trip', async () => {
    const loadedConfig = normalizeAndValidateConfig({
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    }).config;
    mockReadConfigFile.mockResolvedValue(loadedConfig);

    const server = createServer({});
    const getHandler = server.app.routes.get('GET /api/config');
    const postHandler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const fetchedConfig = await getHandler({}, {});
    await postHandler({ body: fetchedConfig }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        TriggerRouter: expect.anything(),
      })
    );
  });

  it('does not persist Governance when user did not configure it', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        Governance: expect.anything(),
      })
    );
  });

  it('canonicalizes explicit TriggerRouter config into SmartRouter on save', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      TriggerRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'sonnet',
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
      },
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        SmartRouter: expect.objectContaining({
          enabled: true,
          analysis_scope: 'last_message',
          rules: [
            expect.objectContaining({
              name: 'architecture',
              model: 'opus',
            }),
          ],
          semantic: expect.objectContaining({
            enabled: true,
            mode: 'classifier',
            classifier_model: 'sonnet',
          }),
        }),
      })
    );

    const persisted = mockWriteConfigFile.mock.calls.at(-1)?.[0] as any;
    expect(persisted.TriggerRouter).toBeUndefined();
  });

  it('does not persist derived SmartRouter defaults when user did not configure SmartRouter', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        SmartRouter: expect.anything(),
      })
    );
  });

  it('persists only explicitly configured SmartRouter branches without writing derived default enhancements', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
      },
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        SmartRouter: expect.objectContaining({
          enabled: true,
          rules: [
            expect.objectContaining({
              name: 'architecture',
              model: 'opus',
            }),
          ],
        }),
      })
    );

    const persisted = mockWriteConfigFile.mock.calls.at(-1)?.[0] as any;
    expect(persisted.SmartRouter.semantic).toBeUndefined();
    expect(persisted.SmartRouter.sticky).toBeUndefined();
  });

  it('persists configured Governance blocks after normalization', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('POST /api/config');
    const reply = {
      code: vi.fn().mockReturnThis(),
    };

    const requestBody = {
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4'],
        },
      ],
      Governance: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'openrouter,anthropic/claude-sonnet-4',
          },
        },
        cascade: {
          enabled: true,
          levels: [
            {
              from: 'openrouter,anthropic/claude-sonnet-4',
              to: 'openrouter,anthropic/claude-opus-4',
            },
          ],
        },
        observability: {
          anomaly_thresholds: {
            min_sample_size: 5,
            latency_warn_ms: 1200,
          },
        },
      },
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        SmartRouter: expect.objectContaining({
          sticky: expect.objectContaining({
            enabled: true,
            alignment: expect.objectContaining({
              enabled: true,
              summarizer_model: 'openrouter,anthropic/claude-sonnet-4',
            }),
          }),
        }),
        Governance: expect.objectContaining({
          enabled: true,
          cascade: expect.objectContaining({
            enabled: true,
          }),
          observability: expect.objectContaining({
            anomaly_thresholds: expect.objectContaining({
              min_sample_size: 5,
              latency_warn_ms: 1200,
            }),
          }),
        }),
      })
    );

    const persisted = mockWriteConfigFile.mock.calls.at(-1)?.[0] as any;
    expect(persisted.Governance?.sticky).toBeUndefined();
    expect(persisted.Governance?.semantic).toBeUndefined();
  });
});
