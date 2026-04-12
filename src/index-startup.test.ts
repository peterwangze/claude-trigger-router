import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateServer = vi.fn();
const mockCreateStream = vi.fn();
const mockInitDir = vi.fn();
const mockInitConfig = vi.fn();
const mockConfigureLogging = vi.fn();
const mockSavePid = vi.fn();
const mockTriggerInit = vi.fn();
const mockTriggerIsEnabled = vi.fn().mockReturnValue(true);

vi.mock('./server', () => ({
  createServer: mockCreateServer,
}));

vi.mock('rotating-file-stream', () => ({
  createStream: mockCreateStream,
}));

vi.mock('./utils', () => ({
  initDir: mockInitDir,
  initConfig: mockInitConfig,
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
  },
}));

vi.mock('./router', () => ({
  router: vi.fn(),
}));

vi.mock('./middleware/auth', () => ({
  apiKeyAuth: vi.fn().mockReturnValue((_req: unknown, _reply: unknown, done: (err?: Error) => void) => done()),
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
  governStreamingResponse: vi.fn((payload: unknown) => payload),
  sessionStateStore: {
    get: vi.fn(),
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
      Providers: [],
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
  });

  it('creates the server without jsonPath and writes log files directly under HOME_DIR', async () => {
    const { run } = await import('./index');
    const { HOME_DIR } = await import('./constants');

    await run({ port: 6789 });

    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
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
});
