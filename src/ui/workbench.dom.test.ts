import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { renderWorkbenchHtml } from './workbench';
import { extractWorkbenchInlineScript } from './workbench-document';
import { WORKBENCH_FRAGMENT_CONTRACTS, renderSurfaceTabs, toInlineScriptJson } from './workbench-fragments';

const baseConfig = {
  HOST: '127.0.0.1',
  PORT: 5678,
  Models: [
    {
      id: 'sonnet',
      api: 'https://example.com/v1/chat/completions',
      key: 'sk-test',
      interface: 'openai',
      model: 'anthropic/claude-sonnet-4',
      thinking: 'auto',
      metadata: {
        context_window_tokens: 200000,
        safe_input_tokens: 180000,
      },
    },
  ],
  Router: {
    default: 'sonnet',
  },
};

function compiledModelsResponse(config = baseConfig, diff?: any) {
  return {
    providers: [
      {
        name: 'model__sonnet',
        api_base_url: 'https://example.com/v1/chat/completions',
        models: ['anthropic/claude-sonnet-4'],
        transformer: { use: ['openrouter'] },
        has_api_key: true,
      },
    ],
    modelMap: {
      sonnet: {
        id: 'sonnet',
        providerName: 'model__sonnet',
        modelName: 'anthropic/claude-sonnet-4',
        protocol: 'openai',
        compatibilityProfile: 'openai-compatible-anthropic-dispatch',
        dispatchFormat: 'anthropic_messages',
        thinking: { mode: 'auto' },
        capabilities: {
          thinking: { supported: true, mode: 'auto' },
          tools: true,
          images: true,
          contextWindowTokens: 200000,
          safeInputTokens: 180000,
        },
        source: 'models',
      },
    },
    modelPools: {},
    router: config.Router,
    normalizedConfig: config,
    warnings: [],
    capabilityWarnings: {
      summary: { total: 0, warn: 0, info: 0 },
      entries: [],
    },
    smartRouterExplanation: {
      enabled: false,
      rules: [],
      candidates: [],
      warnings: [],
      routeOrder: ['Router.default'],
      semantic: { enabled: false },
      sticky: { enabled: false },
      fallback: 'default',
    },
    diff,
    referenceImpact: {
      summary: {
        total: 1,
        modelIdRefs: 1,
        legacyRefs: 0,
        validModelIds: 1,
        missingModelIds: 0,
      },
      entries: [],
    },
  };
}

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function waitFor(assertion: () => void | boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = assertion();
      if (result !== false) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Timed out waiting for assertion');
}

async function createWorkbenchDom(options: {
  previewStatus?: number;
  previewBody?: any;
  saveStatus?: number;
  saveBody?: any;
} = {}) {
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  let lastTraceUrl = '';
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    throw error;
  });

  const html = renderWorkbenchHtml(baseConfig);
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://127.0.0.1:5678/ui',
    virtualConsole,
    beforeParse(window) {
      window.Element.prototype.scrollIntoView = () => undefined;
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });

        if (url.startsWith('/api/governance/traces')) {
          lastTraceUrl = url;
          return jsonResponse({
            traces: [],
            routeDecisions: [
              {
                requestId: 'route-1',
                headline: 'SmartRouter candidate selection selected sonnet with 86% confidence.',
                sourceLabel: 'SmartRouter candidate selection',
                routingMode: 'speed',
                collaborationMode: 'verify_only',
                confidenceLabel: '86%',
                routingEvidence: ['latency budget guard: deep avg 900ms > 300ms; using sonnet avg 100ms'],
              },
            ],
            switchContinuity: [],
            routeHandoffs: [],
          }) as any;
        }
        if (url.startsWith('/api/governance/metrics?') || url === '/api/governance/metrics') {
          return jsonResponse({
            metrics: { totalTraces: 0 },
            buckets: [],
            anomalies: [],
            outcome: {},
            topRouteReasons: [],
            topFinalModels: [],
            topSemanticIntents: [],
            qualityEvidence: {},
            taskComparison: {},
          }) as any;
        }
        if (url.startsWith('/api/governance/health')) {
          return jsonResponse({
            health: {
              status: 'watch',
              message: '1 cascade warning',
              actions: ['Inspect cascade traces'],
              routingTuning: [],
            },
          }) as any;
        }
        if (url === '/api/models/compiled') {
          return jsonResponse(compiledModelsResponse()) as any;
        }
        if (url === '/api/models/compiled/preview') {
          const requestBody = init?.body ? JSON.parse(String(init.body)) : baseConfig;
          return jsonResponse(
            options.previewBody ?? compiledModelsResponse(requestBody, {
              summary: {
                addedProviders: 0,
                removedProviders: 0,
                changedProviders: 0,
                addedModels: 1,
                removedModels: 0,
                changedModels: 0,
              },
              providerChanges: [],
              modelChanges: [{ type: 'added', modelId: 'sonnet', after: { providerName: 'model__sonnet' } }],
            }),
            options.previewStatus ?? 200
          ) as any;
        }
        if (url === '/api/config' && init?.method === 'POST') {
          return jsonResponse(
            options.saveBody ?? {
              success: false,
              message: 'Invalid configuration',
              errors: ['Router.default is required'],
              warnings: [],
              issueReport: {
                issues: [
                  {
                    severity: 'error',
                    path: 'Router.default',
                    message: 'Router.default is required',
                    action: 'Pick a default model',
                  },
                ],
              },
            },
            options.saveStatus ?? 400
          ) as any;
        }
        if (url === '/api/config') {
          return jsonResponse(baseConfig) as any;
        }
        if (url === '/api/service-info') {
          return jsonResponse({
            ready: true,
            port: 5678,
            runtimeMode: 'local',
            serviceRole: 'local_agent',
            listener: { host: '127.0.0.1', port: 5678, public: false },
            clientConnection: { baseUrl: 'http://127.0.0.1:5678', recommendedScopes: ['client', 'read-only'] },
            auth: { required: false, managedKeys: { active: 0 }, quota: { keys: [] } },
            security: { status: 'ok', issues: [] },
            registration: { enabled: false, models: 0, upstreamServices: 0 },
          }) as any;
        }
        if (url === '/api/remote-status') {
          return jsonResponse({
            remote: { enabled: false },
            compiledModels: { modelCount: 1 },
            remoteRegistration: { enabled: false },
          }) as any;
        }
        if (url === '/api/models/pool-health') {
          return jsonResponse({
            summary: { pools: 0, endpoints: 0, healthy: 0, cooldown: 0, open: 0 },
            pools: [],
            persistedState: { endpoints: 0 },
          }) as any;
        }
        if (url === '/api/benchmark/history') {
          return jsonResponse({
            historyFile: '/tmp/benchmark-history.json',
            summary: {
              totalEntries: 1,
              latest: {
                id: 'bench_1',
                createdAt: '2026-05-22T00:00:00.000Z',
                source: 'input',
                label: 'baseline',
                totalTasks: 7,
                totalRuns: 7,
                evaluatedRuns: 7,
                passRate: 0.8,
                averageQualityScore: 0.82,
                averageSpeedScore: 0.9,
                averageLatencyMs: 430,
                calibratedRuns: 1,
                averageCalibrationScore: 0.88,
                averageRubricDelta: 0.06,
                models: [{ model: 'sonnet', totalRuns: 7, passRate: 0.8, averageQualityScore: 0.82, averageSpeedScore: 0.9, averageLatencyMs: 430 }],
                bestRunsByTask: [],
              },
              previous: undefined,
              trends: { passRateDelta: 0, qualityDelta: 0, speedDelta: 0, latencyDeltaMs: 0, calibrationDelta: 0 },
              topModels: [{ model: 'sonnet', totalRuns: 7, passRate: 0.8, averageQualityScore: 0.82, averageSpeedScore: 0.9, averageLatencyMs: 430 }],
              entries: [],
            },
            traceAlignment: {
              taskComparison: { totalComparedTasks: 2, totalComparedTraces: 8 },
              qualityEvidence: { totalSamples: 3 },
            },
          }) as any;
        }
        if (url === '/api/benchmark/calibration') {
          return jsonResponse({
            success: true,
            historyFile: '/tmp/benchmark-history.json',
            entry: { id: 'bench_ui', label: 'ui-calibration' },
            summary: {
              totalEntries: 2,
              latest: {
                id: 'bench_ui',
                createdAt: '2026-05-22T00:01:00.000Z',
                source: 'input',
                label: 'ui-calibration',
                totalTasks: 7,
                totalRuns: 1,
                evaluatedRuns: 1,
                passRate: 1,
                averageQualityScore: 0.9,
                averageSpeedScore: 1,
                averageLatencyMs: 300,
                calibratedRuns: 1,
                averageCalibrationScore: 0.9,
                averageRubricDelta: 0,
                models: [],
                bestRunsByTask: [],
              },
              trends: { passRateDelta: 0.2, qualityDelta: 0.08, speedDelta: 0.1, latencyDeltaMs: -130, calibrationDelta: 0.02 },
              topModels: [],
              entries: [],
            },
          }) as any;
        }
        if (url === '/api/governance/metrics/exports') {
          return jsonResponse({ exports: [], schedules: [] }) as any;
        }
        if (url.startsWith('/api/governance/archives')) {
          return jsonResponse({ archives: [] }) as any;
        }

        throw new Error(`Unhandled fetch in workbench DOM smoke: ${url}`);
      }) as any;
    },
  });

  await waitFor(() => {
    expect(dom.window.document.getElementById('draftPreviewStatus')?.textContent).toContain('已载入当前配置');
    expect(dom.window.document.getElementById('compiledModelsStatus')?.textContent).toContain('已加载');
    expect(dom.window.document.getElementById('healthSummary')?.textContent).toContain('Health: watch');
    expect(dom.window.document.getElementById('benchmarkHistorySummary')?.textContent).toContain('Entries');
  });

  return {
    dom,
    fetchCalls,
    get lastTraceUrl() {
      return lastTraceUrl;
    },
  };
}

describe('workbench DOM smoke', () => {
  it('emits syntactically valid inline script', () => {
    const html = renderWorkbenchHtml(baseConfig);
    const script = extractWorkbenchInlineScript(html);

    expect(script.length).toBeGreaterThan(1000);
    expect(() => new Function(script)).not.toThrow();
  });

  it('keeps surface tabs and fragment anchors under a shared contract', () => {
    const html = renderWorkbenchHtml(baseConfig);
    const dom = new JSDOM(html);

    expect(renderSurfaceTabs()).toContain('userSurfaceTab');
    expect(renderSurfaceTabs()).toContain('maintainerSurfaceTab');
    expect(toInlineScriptJson({ text: '</script>' })).not.toContain('</script>');
    expect(html).toContain('Authorization: Bearer &lt;admin-key&gt;');
    expect(html).toContain('不要把 admin key 放进 URL');

    for (const fragment of WORKBENCH_FRAGMENT_CONTRACTS) {
      expect(dom.window.document.getElementById(fragment.rootId), `${fragment.name} root`).not.toBeNull();
      for (const anchor of fragment.requiredAnchors) {
        expect(dom.window.document.getElementById(anchor), `${fragment.name}:${anchor}`).not.toBeNull();
      }
    }

    dom.window.close();
  });

  it('loads current config and compiled models into the usable workspace', async () => {
    const { dom } = await createWorkbenchDom();
    const document = dom.window.document;

    expect(document.getElementById('routerDefaultStatus')?.textContent).toBe('sonnet');
    expect(document.getElementById('configDraftEditor')?.textContent || (document.getElementById('configDraftEditor') as HTMLTextAreaElement).value).toContain('claude-sonnet-4');
    expect(document.querySelector('#compiledModelMapTable tbody')?.textContent).toContain('model__sonnet');
    expect(document.getElementById('contextWindowGuide')?.textContent).toContain('Context window guide');

    dom.window.close();
  });

  it('submits human calibration from the workbench', async () => {
    const { dom, fetchCalls } = await createWorkbenchDom();
    const document = dom.window.document;

    (document.getElementById('calibrationModel') as HTMLInputElement).value = 'sonnet';
    (document.getElementById('calibrationHumanScore') as HTMLInputElement).value = '0.9';
    (document.getElementById('calibrationLatencyMs') as HTMLInputElement).value = '300';
    (document.getElementById('calibrationOutput') as HTMLTextAreaElement).value = 'Status is ready. Next action is to keep monitoring.';
    document.getElementById('saveCalibrationBtn')?.click();

    await waitFor(() => {
      expect(document.getElementById('benchmarkCalibrationStatus')?.textContent).toContain('已保存校准');
    });
    const call = fetchCalls.find((item) => item.url === '/api/benchmark/calibration');
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.init?.body))).toEqual(expect.objectContaining({
      taskId: 'quick_status',
      model: 'sonnet',
      humanScore: 0.9,
      latencyMs: 300,
    }));

    dom.window.close();
  });

  it('previews compiled models from a draft without saving', async () => {
    const { dom, fetchCalls } = await createWorkbenchDom();
    const document = dom.window.document;

    document.getElementById('previewConfigDraftBtn')?.click();

    await waitFor(() => {
      expect(document.getElementById('draftPreviewStatus')?.textContent).toContain('预览完成');
      expect(document.getElementById('compiledDiffSummary')?.textContent).toContain('Added models');
    });
    expect(fetchCalls.some((call) => call.url === '/api/models/compiled/preview')).toBe(true);

    dom.window.close();
  });

  it('shows save failures with validation issue actions', async () => {
    const { dom } = await createWorkbenchDom();
    const document = dom.window.document;

    document.getElementById('saveConfigDraftBtn')?.click();

    await waitFor(() => {
      expect(document.getElementById('draftPreviewStatus')?.textContent).toContain('保存失败');
      expect(document.getElementById('draftValidationList')?.textContent).toContain('Router.default');
      expect(document.getElementById('draftValidationList')?.textContent).toContain('Pick a default model');
    });

    dom.window.close();
  });

  it('applies Health actions to trace filters', async () => {
    const smoke = await createWorkbenchDom();
    const document = smoke.dom.window.document;

    document.querySelector<HTMLButtonElement>('[data-health-action]')?.click();

    await waitFor(() => {
      expect(document.getElementById('cascadeTriggered')).toHaveProperty('value', 'true');
      expect(document.getElementById('detailHint')?.textContent).toContain('filtered cascade traces');
      expect(smoke.lastTraceUrl).toContain('cascadeTriggered=true');
    });

    smoke.dom.window.close();
  });

  it('shows SmartRouter collaboration evidence in route decisions', async () => {
    const { dom } = await createWorkbenchDom();
    const document = dom.window.document;

    await waitFor(() => {
      const text = document.getElementById('routeDecisionSummaryList')?.textContent ?? '';
      expect(text).toContain('mode speed');
      expect(text).toContain('collab verify_only');
      expect(text).toContain('latency budget guard');
    });

    dom.window.close();
  });
});
