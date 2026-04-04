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
import { governanceTraceStore } from './governance';
import { normalizeAndValidateConfig } from './utils/config';

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

  beforeEach(() => {
    vi.clearAllMocks();
    governanceTraceStore.clear();
    mockBackupConfigFile.mockResolvedValue(null);
    mockWriteConfigFile.mockResolvedValue(undefined);
    mockReadConfigFile.mockResolvedValue({});
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
      },
    }, {});

    expect(result.anomalies.map((item: any) => item.type)).toContain('cascade_rate_high');
    expect(result.anomalies.map((item: any) => item.type)).toContain('shadow_rate_high');
    expect(result.anomalies.map((item: any) => item.type)).toContain('latency_high');
  });

  it('renders a governance trace debug page at /ui', async () => {
    const server = createServer({});
    const handler = server.app.routes.get('GET /ui');
    const reply = {
      header: vi.fn().mockReturnThis(),
      send: vi.fn((html: string) => html),
    };

    const html = await handler({}, reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(html).toContain('Governance Trace');
    expect(html).toContain('/api/governance/traces');
    expect(html).toContain('/api/governance/metrics');
    expect(html).toContain('metricsGrid');
    expect(html).toContain('anomalyList');
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
        PORT: 3456,
        LOG: true,
        LOG_LEVEL: 'debug',
        API_TIMEOUT_MS: 600000,
        NON_INTERACTIVE_MODE: false,
        Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        Providers: requestBody.Providers,
      })
    );
    expect(result).toEqual({ success: true, message: 'Config saved successfully' });
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
      'TriggerRouter.intent_model 引用的模型 "anthropic/claude-opus-4" 不在提供商 "openrouter" 的 models 列表中'
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
      },
    };

    await handler({ body: requestBody }, reply);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        Governance: expect.objectContaining({
          enabled: true,
          sticky: expect.objectContaining({
            enabled: true,
            session_ttl_ms: 3600000,
            alignment: expect.objectContaining({
              enabled: true,
              summarizer_model: 'openrouter,anthropic/claude-sonnet-4',
              max_summary_tokens: 256,
            }),
          }),
          cascade: expect.objectContaining({
            enabled: true,
            max_attempts: 2,
          }),
        }),
      })
    );
  });
});
