import { beforeEach, describe, expect, it, vi } from 'vitest';

function createIo(overrides: Record<string, unknown> = {}) {
  return {
    info: vi.fn(),
    error: vi.fn(),
    choose: vi.fn().mockResolvedValue('openai'),
    input: vi.fn().mockResolvedValue('filled-value'),
    confirm: vi.fn().mockResolvedValue(false),
    close: vi.fn(),
    ...overrides,
  };
}

describe('runDoctorCli', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('repairs deterministic config issues, writes config, and skips model probe when user declines', async () => {
    const io = createIo({
      confirm: vi.fn().mockResolvedValue(false),
    });

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((filePath: string) => String(filePath).endsWith('config.yaml')),
        readFileSync: vi.fn((filePath: string) => {
          if (String(filePath).endsWith('config.yaml')) {
            return [
              'Models:',
              '  - api_base_url: "https://openrouter.ai/api/v1/chat/completions"',
              '    api_key: "sk-test"',
              '    protocol: "openai"',
              '    model: "anthropic/claude-sonnet-4"',
              'Router: {}',
            ].join('\n');
          }
          return '';
        }),
      };
    });

    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const startDaemon = vi.fn().mockResolvedValue(undefined);

    const { runDoctorCli } = await import('./index');
    await runDoctorCli({
      io: io as any,
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/backup.yaml'),
      writeConfig,
      isServiceRunning: vi.fn().mockReturnValue(false),
      readServiceInfo: vi.fn().mockReturnValue(null),
      killProcess: vi.fn(),
      probeServiceHealth: vi.fn().mockResolvedValue(false),
      isTcpPortOccupied: vi.fn().mockResolvedValue(false),
      waitForService: vi.fn().mockResolvedValue(true),
      startDaemon,
    });

    expect(writeConfig).toHaveBeenCalledTimes(1);
    expect(writeConfig.mock.calls[0][0].Models?.[0]).toEqual(expect.objectContaining({
      id: 'anthropic_claude_sonnet_4',
      api: 'https://openrouter.ai/api/v1/chat/completions',
      key: 'sk-test',
      interface: 'openai',
    }));
    expect(writeConfig.mock.calls[0][0].Router.default).toBe('anthropic_claude_sonnet_4');
    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(io.confirm).toHaveBeenCalled();
    expect(io.info).toHaveBeenCalledWith(
      expect.stringContaining('模型兼容策略：anthropic_claude_sonnet_4 -> OpenAI-compatible / Anthropic dispatch')
    );
    expect(io.info).toHaveBeenCalledWith(
      expect.stringContaining('请求编译：Anthropic-style messages')
    );
  });

  it('prompts to probe models and reports probe failures with exact category', async () => {
    const io = createIo({
      confirm: vi.fn().mockResolvedValue(true),
    });

    vi.doMock('fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs')>();
      return {
        ...actual,
        existsSync: vi.fn((filePath: string) => String(filePath).endsWith('config.yaml')),
        readFileSync: vi.fn((filePath: string) => {
          if (String(filePath).endsWith('config.yaml')) {
            return [
              'HOST: "127.0.0.1"',
              'PORT: 5678',
              'LOG: true',
              'LOG_LEVEL: "debug"',
              'Models:',
              '  - id: sonnet',
              '    api: "https://example.com/v1/chat/completions"',
              '    key: "sk-test"',
              '    interface: "openai"',
              '    model: "anthropic/claude-sonnet-4"',
              'Router:',
              '  default: "sonnet"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('bad key'),
    }) as any;
    global.fetch = fetchMock;

    const { runDoctorCli } = await import('./index');
    await runDoctorCli({
      io: io as any,
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig: vi.fn().mockResolvedValue(undefined),
      isServiceRunning: vi.fn().mockReturnValue(true),
      readServiceInfo: vi.fn().mockReturnValue({ pid: 123, port: 5678, startTime: '' }),
      killProcess: vi.fn(),
      probeServiceHealth: vi.fn().mockResolvedValue(true),
      isTcpPortOccupied: vi.fn().mockResolvedValue(true),
      waitForService: vi.fn().mockResolvedValue(true),
      startDaemon: vi.fn().mockResolvedValue(undefined),
    });

    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('鉴权失败'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('失败说明：上游接口拒绝了当前 API Key'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远端原始信息：401 bad key'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('模型探测完成：成功 0，失败 1。'));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({
        stream: true,
      })
    );
    global.fetch = originalFetch;
  });
});
