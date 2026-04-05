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
import { governanceMetricsExportStore, governanceTraceStore } from './governance';
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
    governanceMetricsExportStore.clear();
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
      protocol: 'openai',
      thinking: {
        mode: 'auto',
      },
      source: 'models',
    });
  });

  it('previews compiled Models registry for a draft config without saving', async () => {
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
      protocol: 'openai',
      thinking: {
        mode: 'off',
      },
      source: 'models',
    });
    expect(result.normalizedConfig.Router?.default).toBe('haiku');
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
    expect(mockBackupConfigFile).not.toHaveBeenCalled();
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
      PORT: 3456,
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
    expect(html).toContain('/api/models/compiled');
    expect(html).toContain('/api/models/compiled/preview');
    expect(html).toContain('Draft Config Preview');
    expect(html).toContain('configDraftEditor');
    expect(html).toContain('loadConfigDraftBtn');
    expect(html).toContain('previewConfigDraftBtn');
    expect(html).toContain('draftPreviewStatus');
    expect(html).toContain('loadConfigDraft');
    expect(html).toContain('previewConfigDraft');
    expect(html).toContain('Compiled Models');
    expect(html).toContain('compiledModelsStatus');
    expect(html).toContain('compiledProvidersTable');
    expect(html).toContain('compiledModelMapTable');
    expect(html).toContain('loadCompiledModels');
    expect(html).toContain('/api/governance/traces');
    expect(html).toContain('/api/governance/archives');
    expect(html).toContain('/api/governance/metrics');
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
          observability: expect.objectContaining({
            anomaly_thresholds: expect.objectContaining({
              min_sample_size: 5,
              latency_warn_ms: 1200,
              cascade_warn_rate: 0.4,
            }),
          }),
        }),
      })
    );
  });
});
