import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateServer = vi.fn();
const mockCreateStream = vi.fn();
const mockInitDir = vi.fn();
const mockInitConfig = vi.fn();
const mockReadConfigFile = vi.fn();
const mockConfigureLogging = vi.fn();
const mockSavePid = vi.fn();
const mockTriggerInit = vi.fn();
const mockTriggerIsEnabled = vi.fn().mockReturnValue(true);
const mockTriggerRoute = vi.fn();
const mockTriggerGetSmartRouterConfig = vi.fn();
const mockSessionStateGet = vi.fn();
const mockApiKeyAuth = vi.fn().mockReturnValue((_req: unknown, _reply: unknown, done: (err?: Error) => void) => done());
const mockFinalizeTrace = vi.fn((trace: unknown) => trace);
const mockRecordGovernanceTrace = vi.fn();

vi.mock('./server', () => ({
  createServer: mockCreateServer,
}));

vi.mock('rotating-file-stream', () => ({
  createStream: mockCreateStream,
}));

vi.mock('./utils', () => ({
  initDir: mockInitDir,
  initConfig: mockInitConfig,
  readConfigFile: mockReadConfigFile,
}));

vi.mock('./utils/processCheck', () => ({
  cleanupPidFile: vi.fn(),
  isServiceRunning: vi.fn().mockReturnValue(false),
  savePid: mockSavePid,
}));

vi.mock('./utils/log', () => ({
  configureLogging: mockConfigureLogging,
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock('./trigger', () => ({
  triggerRouter: {
    init: mockTriggerInit,
    isEnabled: mockTriggerIsEnabled,
    route: mockTriggerRoute,
    getSmartRouterConfig: mockTriggerGetSmartRouterConfig,
  },
}));

vi.mock('./router', () => ({
  router: vi.fn(),
}));

vi.mock('./middleware/auth', () => ({
  apiKeyAuth: mockApiKeyAuth,
}));

vi.mock('./router/cache', () => ({
  sessionUsageCache: {
    put: vi.fn(),
  },
}));

vi.mock('./utils/SSEParser.transform', () => ({
  SSEParserTransform: vi.fn(),
}));

vi.mock('./utils/SSESerializer.transform', () => ({
  SSESerializerTransform: vi.fn(),
}));

vi.mock('./utils/rewriteStream', () => ({
  rewriteStream: vi.fn(),
}));

vi.mock('./agents', () => ({
  default: {
    getAllAgents: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('./governance', () => ({
  appendTraceReason: vi.fn(),
  applyResponseGovernance: vi.fn(),
  contextAlignmentService: {
    summarizeTransition: vi.fn(),
    injectAlignmentContext: vi.fn(),
  },
  createGovernanceTrace: vi.fn().mockReturnValue({}),
  finalizeTrace: mockFinalizeTrace,
  governanceTraceStore: {
    flushPersistence: vi.fn().mockResolvedValue(undefined),
  },
  governStreamingResponse: vi.fn((payload: unknown) => payload),
  recordGovernanceTrace: mockRecordGovernanceTrace,
  sessionStateStore: {
    get: mockSessionStateGet,
  },
}));

vi.mock('./models/compile', () => ({
  buildModelRegistry: vi.fn().mockReturnValue({
    providers: [
      {
        name: 'model__sonnet',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        models: ['anthropic/claude-sonnet-4'],
      },
    ],
    modelMap: {},
  }),
  getCompiledModelRef: vi.fn(),
  resolveModelReference: vi.fn(),
}));

vi.mock('./protocols', () => ({
  buildUpstreamRequest: vi.fn(),
}));

describe('run startup wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockInitDir.mockResolvedValue(undefined);
    mockInitConfig.mockResolvedValue({
      HOST: '127.0.0.1',
      PORT: 5678,
      LOG: true,
      LOG_LEVEL: 'debug',
      APIKEY: 'startup-key',
      Providers: [],
    });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: 'startup-key',
      Auth: undefined,
    });
    mockCreateStream.mockReturnValue({ on: vi.fn() });
    mockCreateServer.mockReturnValue({
      addHook: vi.fn(),
      start: vi.fn(),
      app: {
        _server: {
          transformerService: {
            getAllTransformers: vi.fn().mockReturnValue(new Map()),
          },
        },
        get: vi.fn(),
        post: vi.fn(),
      },
    });
    mockTriggerIsEnabled.mockReturnValue(true);
    mockTriggerRoute.mockResolvedValue({
      matched: false,
      confidence: 0,
      analysisTime: 0,
    });
    mockTriggerGetSmartRouterConfig.mockReturnValue({
      enabled: true,
      sticky: {
        enabled: true,
        alignment: {
          enabled: false,
          summarizer_model: 'sonnet',
        },
      },
    });
    mockSessionStateGet.mockReturnValue(undefined);
  });

  it('creates the server without jsonPath and writes log files directly under HOME_DIR', async () => {
    const { run } = await import('./index');
    const { HOME_DIR } = await import('./constants');

    await run({ port: 6789 });

    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
        useJsonFile: false,
        initialConfig: expect.objectContaining({
          providers: [
            expect.objectContaining({
              name: 'model__sonnet',
              models: ['anthropic/claude-sonnet-4'],
            }),
          ],
        }),
      })
    );

    expect(mockCreateStream).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        path: HOME_DIR,
      })
    );

    const generator = mockCreateStream.mock.calls[0][0] as (time: Date, index?: number) => string;
    const generated = generator(new Date('2026-04-12T12:34:56.000Z'));

    expect(generated).toMatch(/^ctr-20260412\d{6}\.log$/);
    expect(generated).not.toContain('logs/');
  });

  it('coalesces concurrent auth config refreshes behind a short cache', async () => {
    const { run } = await import('./index');

    await run({ port: 6789 });

    const configInput = mockApiKeyAuth.mock.calls[0][0] as () => Promise<unknown>;
    await Promise.all([
      configInput(),
      configInput(),
      configInput(),
    ]);
    await configInput();

    expect(mockReadConfigFile).toHaveBeenCalledTimes(1);
  });

  it('refreshes auth config again after the short cache expires', async () => {
    vi.useFakeTimers();
    try {
      const { run } = await import('./index');

      await run({ port: 6789 });

      const configInput = mockApiKeyAuth.mock.calls[0][0] as () => Promise<unknown>;
      await configInput();
      await vi.advanceTimersByTimeAsync(1001);
      await configInput();

      expect(mockReadConfigFile).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps public host when an active managed key secures startup auth', async () => {
    mockInitConfig.mockResolvedValue({
      HOST: '0.0.0.0',
      PORT: 5678,
      LOG: true,
      LOG_LEVEL: 'debug',
      Providers: [],
      Auth: {
        managed_keys: [
          {
            id: 'key_active',
            label: 'managed client',
            key_hash: 'hash',
            key_prefix: 'ctr_test',
            key_suffix: 'secret',
            scopes: ['client'],
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ],
      },
    });
    mockReadConfigFile.mockResolvedValue({
      APIKEY: undefined,
      Auth: {
        managed_keys: [
          {
            id: 'key_active',
            label: 'managed client',
            key_hash: 'hash',
            key_prefix: 'ctr_test',
            key_suffix: 'secret',
            scopes: ['client'],
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ],
      },
    });
    const { run } = await import('./index');
    const { logWarn } = await import('./utils/log');

    await run({ port: 6789 });

    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialConfig: expect.objectContaining({
          HOST: '0.0.0.0',
        }),
      })
    );
    expect(vi.mocked(logWarn)).not.toHaveBeenCalledWith(expect.stringContaining('forced to 127.0.0.1'));
  });

  it('wires auth middleware with a current config resolver', async () => {
    const { run } = await import('./index');
    const { apiKeyAuth } = await import('./middleware/auth');

    await run({ port: 6789 });

    const resolver = vi.mocked(apiKeyAuth).mock.calls[0][0] as () => Promise<any>;
    mockReadConfigFile.mockResolvedValueOnce({
      APIKEY: 'rotated-key',
      Auth: {
        managed_keys: [],
      },
    });

    await expect(resolver()).resolves.toEqual(expect.objectContaining({
      APIKEY: 'rotated-key',
      Auth: {
        managed_keys: [],
      },
    }));
  });

  it('does not run context alignment summarizer when alignment is default-disabled', async () => {
    mockTriggerRoute.mockResolvedValueOnce({
      matched: true,
      model: 'opus',
      rule: { name: 'complex-task' },
      analyzedText: '继续修复 API timeout',
      confidence: 0.9,
      analysisTime: 1,
    });
    mockSessionStateGet.mockReturnValue({
      lastSuccessfulModel: 'sonnet',
    });

    const { run } = await import('./index');
    const { contextAlignmentService } = await import('./governance');

    await run({ port: 6789 });

    const addHook = mockCreateServer.mock.results[0].value.addHook;
    const smartRouterHook = addHook.mock.calls.filter(([name]: [string]) => name === 'preHandler').at(-1)?.[1];
    expect(smartRouterHook).toBeTypeOf('function');

    const req: any = {
      id: 'req-1',
      url: '/v1/messages',
      headers: {},
      body: {
        model: 'sonnet',
        metadata: {
          user_id: 'user_session_sticky-session',
        },
        messages: [
          {
            role: 'user',
            content: 'hi',
          },
        ],
      },
    };

    await smartRouterHook(req, {});

    expect(req.body.model).toBe('opus');
    expect(contextAlignmentService.summarizeTransition).not.toHaveBeenCalled();
    expect(contextAlignmentService.injectAlignmentContext).not.toHaveBeenCalled();
  });

  it('returns 413 before upstream dispatch when router marks context window overflow', async () => {
    const { run } = await import('./index');
    const { router } = await import('./router');

    vi.mocked(router).mockImplementationOnce(async (req: any) => {
      req.contextWindowExceeded = {
        code: 'safe_input_exceeded',
        model: 'small',
        inputTokens: 50000,
        estimatedTotalTokens: 54096,
        limit: 32000,
      };
    });

    await run({ port: 6789 });

    const addHook = mockCreateServer.mock.results[0].value.addHook;
    const smartRouterHook = addHook.mock.calls.filter(([name]: [string]) => name === 'preHandler').at(-1)?.[1];
    const firstOnSendHook = addHook.mock.calls.filter(([name]: [string]) => name === 'onSend')[0]?.[1];
    const done = vi.fn();
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const req: any = {
      id: 'req-context',
      url: '/v1/messages',
      headers: {},
      body: {
        model: 'sonnet',
        messages: [{ role: 'user', content: 'hello' }],
      },
    };

    await smartRouterHook(req, reply);

    expect(reply.code).toHaveBeenCalledWith(413);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        type: 'context_window_exceeded',
        message: 'Selected model cannot safely handle the current request context.',
        details: expect.objectContaining({
          code: 'safe_input_exceeded',
          model: 'small',
        }),
      },
    });
    expect(req.responseGovernanceApplied).toBe(true);
    expect(req.localStructuredError).toBe(true);
    expect(mockFinalizeTrace).toHaveBeenCalledWith(expect.any(Object), {
      finalModel: 'sonnet',
    });
    expect(mockRecordGovernanceTrace).toHaveBeenCalledWith(expect.any(Object));

    const payload = vi.mocked(reply.send).mock.calls[0][0];
    firstOnSendHook(req, reply, payload, done);
    expect(done).toHaveBeenCalledWith(null, payload);
  });
});
