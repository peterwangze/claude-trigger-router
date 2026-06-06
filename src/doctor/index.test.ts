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
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.argv = [...originalArgv];
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
    expect(writeConfig.mock.calls[0][0].Models?.[0]).not.toHaveProperty('api_base_url');
    expect(writeConfig.mock.calls[0][0].Models?.[0]).not.toHaveProperty('api_key');
    expect(writeConfig.mock.calls[0][0].Models?.[0]).not.toHaveProperty('protocol');
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

  it('uses bootstrap APIKEY when verifying an authenticated server profile service', async () => {
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
              'HOST: "0.0.0.0"',
              'PORT: 5678',
              'APIKEY: "bootstrap-key"',
              'Runtime:',
              '  mode: "server"',
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

    const probeServiceHealth = vi.fn().mockResolvedValue(false);
    const waitForService = vi.fn().mockResolvedValue(true);
    const startDaemon = vi.fn().mockResolvedValue(undefined);

    const { runDoctorCli } = await import('./index');
    await runDoctorCli({
      io: io as any,
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig: vi.fn().mockResolvedValue(undefined),
      isServiceRunning: vi.fn().mockReturnValue(false),
      readServiceInfo: vi.fn().mockReturnValue(null),
      killProcess: vi.fn(),
      probeServiceHealth,
      isTcpPortOccupied: vi.fn().mockResolvedValue(false),
      waitForService,
      startDaemon,
    });

    expect(probeServiceHealth).toHaveBeenCalledWith(5678, 500, { apiKey: 'bootstrap-key' });
    expect(waitForService).toHaveBeenCalledWith(5678, 5000, { apiKey: 'bootstrap-key' });
    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('监听地址：0.0.0.0:5678'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程客户端接入：ANTHROPIC_BASE_URL=http://<server-host>:5678'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_AUTH_TOKEN 使用 managed client + read-only key'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('managed client + read-only key'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('维护入口：http://127.0.0.1:5678/ui'));
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

  it('explains runtime compatibility fallbacks using user-readable diagnostics', async () => {
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
              'HOST: "127.0.0.1"',
              'PORT: 5678',
              'LOG: true',
              'LOG_LEVEL: "debug"',
              'Models:',
              '  - id: limited_model',
              '    api: "https://example.com/v1/chat/completions"',
              '    key: "sk-test"',
              '    interface: "openai"',
              '    model: "anthropic/claude-sonnet-4"',
              '    metadata:',
              '      supports_reasoning: false',
              '      supports_tools: false',
              '      supports_images: false',
              'Router:',
              '  default: "limited_model"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('运行时兼容提示：thinking 已忽略'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('运行时兼容提示：图片已降级为文本'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('运行时兼容提示：工具调用已降级为文本'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('运行时建议：如需保留工具调用'));
  });

  it('reports router slot summary and context window guidance', async () => {
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
              'HOST: "127.0.0.1"',
              'PORT: 5678',
              'Models:',
              '  - id: sonnet',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-sonnet-4-5"',
              '    metadata:',
              '      context_window_tokens: 200000',
              '      safe_input_tokens: 180000',
              '  - id: reasoner',
              '    api: "https://api.example.com/v1/chat/completions"',
              '    key: "sk-test"',
              '    interface: "openai"',
              '    model: "reasoner-small"',
              '    metadata:',
              '      supports_reasoning: false',
              '      context_window_tokens: 64000',
              '      safe_input_tokens: 48000',
              '  - id: long',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-long-context"',
              '  - id: haiku',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-haiku"',
              'Router:',
              '  default: "sonnet"',
              '  think: "reasoner"',
              '  longContext: "long"',
              '  background: "haiku"',
              '  webSearch: "sonnet"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('基础路由体检'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('基础路由顺序：显式上游模型 -> longContext -> background -> think -> webSearch -> default'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('验证入口：运行 ctr doctor --route-preview --route-text "你的请求"'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('路由槽位：Router.default（默认）-> sonnet'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('路由槽位：Router.think（思考）-> reasoner'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('思考路由提示：Router.think 指向 reasoner'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('上下文窗口提示：Router.longContext -> long 未声明 metadata.context_window_tokens'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('上下文保护提示：Router.longContext -> long 未声明 metadata.safe_input_tokens'));
  });

  it('previews route decisions without probing upstream models', async () => {
    process.argv = ['node', 'ctr', 'doctor', '--route-preview', '--route-text', '请做架构设计', '--route-model', 'claude-3-5-sonnet'];
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
              'HOST: "127.0.0.1"',
              'PORT: 5678',
              'Models:',
              '  - id: sonnet',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-sonnet-4-5"',
              '  - id: architect',
              '    api: "https://api.example.com/v1/chat/completions"',
              '    key: "sk-test"',
              '    interface: "openai"',
              '    model: "deepseek-reasoner"',
              'Router:',
              '  default: "sonnet"',
              'SmartRouter:',
              '  enabled: true',
              '  analysis_scope: "last_message"',
              '  rules:',
              '    - name: "architecture"',
              '      priority: 90',
              '      enabled: true',
              '      patterns:',
              '        - type: exact',
              '          keywords: ["架构设计"]',
              '      model: "architect"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('路由预演：根据当前配置预估请求会命中哪个模型'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('预计来源：smart_rule (architecture)'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('预计模型：architect -> model__architect,deepseek-reasoner'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('SmartRouter.rules'));
    expect(io.confirm).toHaveBeenCalledWith(expect.stringContaining('是否继续探测 2 个模型的可用性'), false);
  });

  it('reports unresolved router slot references', async () => {
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
              '  - id: sonnet',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-sonnet-4-5"',
              'Router:',
              '  default: "sonnet"',
              '  think: "missing_reasoner"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('路由槽位异常：Router.think 引用 "missing_reasoner"'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('路由槽位：Router.longContext 未配置'));
  });

  it('infers anthropic interface from a bare anthropic host when repairing config', async () => {
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
              '  - api: "https://api.anthropic.com"',
              '    key: "sk-ant-test"',
              '    model: "claude-sonnet-4-5"',
              'Router: {}',
            ].join('\n');
          }
          return '';
        }),
      };
    });

    const writeConfig = vi.fn().mockResolvedValue(undefined);

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
      startDaemon: vi.fn().mockResolvedValue(undefined),
    });

    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            api: 'https://api.anthropic.com/v1/messages',
            interface: 'anthropic',
          }),
        ],
      })
    );
    expect(writeConfig.mock.calls[0][0].Models?.[0]).not.toHaveProperty('protocol');
  });

  it('reports remote service context separately from local config checks', async () => {
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
              'Runtime:',
              '  mode: "local"',
              '  remote_service:',
              '    enabled: true',
              '    base_url: "https://router.example.com/"',
              '    auth_token: "remote-token"',
              'Router: {}',
            ].join('\n');
          }
          return '';
        }),
      };
    });

    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/registration')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            enabled: true,
            summary: {
              models: 2,
              upstreamServices: 1,
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          service: 'claude-trigger-router',
          ready: true,
          runtimeMode: 'server',
          serviceRole: 'router_service',
          remoteEnabled: false,
        }),
      });
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as any;

    try {
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

      expect(fetchMock).toHaveBeenCalledWith('https://router.example.com/api/service-info', expect.objectContaining({
        headers: {
          Authorization: 'Bearer remote-token',
        },
      }));
      expect(fetchMock).toHaveBeenCalledWith('https://router.example.com/api/registration', expect.objectContaining({
        headers: {
          Authorization: 'Bearer remote-token',
        },
      }));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('服务上下文：local'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('Scope 指引：admin'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('Key 操作指引'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('POST /api/auth/keys'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程服务检查：https://router.example.com'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程 token 指引'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('client + read-only'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程服务状态：ready'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程发现边界：router_service / service scope'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程注册摘要：2 models / 1 upstream'));
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('如果预期模型缺失，请联系服务维护者检查 Registration.models 或 upstream model pool'));
      expect(io.confirm).not.toHaveBeenCalled();
      expect(io.info).toHaveBeenCalledWith(expect.stringContaining('已跳过模型探测：当前配置没有本地模型'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('warns when server mode is configured without auth', async () => {
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
              'HOST: "0.0.0.0"',
              'Runtime:',
              '  mode: "server"',
              'Models:',
              '  - id: "sonnet"',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-sonnet-4-5"',
              'Router:',
              '  default: "sonnet"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('鉴权状态：disabled'));
    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('安全风险'));
  });

  it('warns when managed auth exists but no key is active', async () => {
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
              'HOST: "0.0.0.0"',
              'Runtime:',
              '  mode: "server"',
              'Auth:',
              '  managed_keys:',
              '    - id: "key_revoked"',
              '      label: "revoked client"',
              '      key_hash: "hash"',
              '      key_prefix: "ctr_test"',
              '      key_suffix: "secret"',
              '      scopes: ["client"]',
              '      created_at: "2026-04-01T00:00:00.000Z"',
              '      revoked_at: "2026-04-02T00:00:00.000Z"',
              'Models:',
              '  - id: "sonnet"',
              '    api: "https://api.example.com/v1/messages"',
              '    key: "sk-test"',
              '    interface: "anthropic"',
              '    model: "claude-sonnet-4-5"',
              'Router:',
              '  default: "sonnet"',
            ].join('\n');
          }
          return '';
        }),
      };
    });

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

    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('鉴权状态：enabled'));
    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('没有 active key'));
  });
});
