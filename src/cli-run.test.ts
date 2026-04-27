import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
  once: vi.fn(),
  unref: vi.fn(),
}));
const mockSpawnSync = vi.fn();
const mockInitializeClaudeConfig = vi.fn();
const mockIsServiceRunning = vi.fn();
const mockReadServiceInfo = vi.fn();
const mockWaitForService = vi.fn();
const mockIsTcpPortOccupied = vi.fn();
const mockRunSetupCli = vi.fn();
const mockRunDoctorCli = vi.fn();
const mockRun = vi.fn();
const mockProcessExit = vi.fn(() => {
  throw new Error('process.exit called');
});
const originalArgv = process.argv.slice();
const originalFetch = global.fetch;
const mockFetch = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();

  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  };
});

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
}));

vi.mock('./index', () => ({
  run: mockRun,
  initializeClaudeConfig: mockInitializeClaudeConfig,
}));

vi.mock('./utils/processCheck', () => ({
  isServiceRunning: mockIsServiceRunning,
  killProcess: vi.fn(),
  readServiceInfo: mockReadServiceInfo,
}));

vi.mock('./service-health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service-health')>();

  return {
    ...actual,
    waitForService: mockWaitForService,
    isTcpPortOccupied: mockIsTcpPortOccupied,
  };
});

vi.mock('./setup', () => ({
  runSetupCli: mockRunSetupCli,
}));

vi.mock('./doctor', () => ({
  runDoctorCli: mockRunDoctorCli,
}));

describe('runClaudeCode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CTR_SKIP_MAIN = '1';
    process.argv = [...originalArgv];
    global.fetch = mockFetch as typeof fetch;
    mockInitializeClaudeConfig.mockResolvedValue(undefined);
    mockSpawn.mockReturnValue({ on: vi.fn(), once: vi.fn(), unref: vi.fn() });
    mockSpawnSync.mockImplementation((command: string) => {
      if (command === 'claude') {
        return { status: 0, stdout: '' };
      }
      return { status: 1, stdout: '' };
    });
    mockIsServiceRunning.mockReturnValue(true);
    mockReadServiceInfo.mockReturnValue(null);
    mockIsTcpPortOccupied.mockResolvedValue(false);
    mockRunSetupCli.mockResolvedValue(undefined);
    mockRunDoctorCli.mockResolvedValue(undefined);
    mockRun.mockResolvedValue(undefined);
    mockFetch.mockRejectedValue(new Error('network error'));
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((filePath: string, ...args: unknown[]) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.1.0',
        });
      }
      throw new Error(`unexpected readFileSync call: ${String(filePath)} ${args.join(' ')}`);
    });
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    global.fetch = originalFetch;
    delete process.env.CTR_AUTO_START;
    delete process.env.CTR_UI_SKIP_OPEN;
  });

  it('prints setup in help and lists ctr setup first in examples', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { printHelp } = await import('./cli');

    printHelp();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('setup       检测并复用已有配置，必要时迁移旧配置或新建最小配置');
    expect(output).toContain('doctor      诊断并修复当前配置，按需探测模型可用性');
    expect(output).toContain('deploy      生成部署入口配置');
    expect(output).toContain('--force       强制覆盖已有配置（配合 init/deploy init 使用）');
    expect(output).toContain('version     查看当前安装版本与包信息');
    expect(output).toContain('upgrade     查看升级到最新 npm 版本的指引');
    expect(output).toContain('  ctr setup                # 复用当前配置 / 迁移旧配置 / 新建最小配置');
    expect(output).toContain('  ctr doctor               # 诊断配置 / 修复格式问题 / 按需探测模型可用性');
    expect(output).toContain('  ctr deploy init --target server  # 生成安全默认的 server 部署配置');
    expect(output).toContain('  ctr version              # 查看当前安装版本');
    expect(output).toContain('  ctr upgrade              # 查看升级到最新版本的命令');
    expect(output).toContain('ctr restart 当前默认按后台模式重启');
    expect(output.indexOf('  ctr setup                # 复用当前配置 / 迁移旧配置 / 新建最小配置')).toBeLessThan(
      output.indexOf('  ctr init                 # 初始化最小配置模板')
    );

    logSpy.mockRestore();
  });

  it('prints current and latest package version when npm registry lookup succeeds', async () => {
    process.argv = ['node', 'cli.ts', 'version'];
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ version: '1.1.1' }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('@peterwangze/claude-trigger-router');
    expect(output).toContain('Version: 1.1.0');
    expect(output).toContain('Latest: 1.1.1');
    expect(output).toContain('Upgrade: npm install -g @peterwangze/claude-trigger-router@latest');
    expect(output).toContain('https://www.npmjs.com/package/@peterwangze/claude-trigger-router');

    logSpy.mockRestore();
  });

  it('keeps local version output when npm registry lookup fails', async () => {
    process.argv = ['node', 'cli.ts', 'version'];
    mockFetch.mockRejectedValue(new Error('network error'));
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('@peterwangze/claude-trigger-router');
    expect(output).toContain('Version: 1.1.0');
    expect(output).toContain('Latest: unavailable');
    expect(output).not.toContain('Upgrade: npm install -g @peterwangze/claude-trigger-router@latest');
    expect(output).toContain('https://www.npmjs.com/package/@peterwangze/claude-trigger-router');

    logSpy.mockRestore();
  });

  it('falls back to npm view when registry fetch fails', async () => {
    process.argv = ['node', 'cli.ts', 'version'];
    mockFetch.mockRejectedValue(new Error('network error'));
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '1.1.1\n' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('Version: 1.1.0');
    expect(output).toContain('Latest: 1.1.1');
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      ['view', '@peterwangze/claude-trigger-router', 'version', '--registry', 'https://registry.npmjs.org/'],
      expect.objectContaining({
        encoding: 'utf-8',
      })
    );

    logSpy.mockRestore();
  });

  it('prints upgrade guidance without running npm install', async () => {
    process.argv = ['node', 'cli.ts', 'upgrade'];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('npm install -g @peterwangze/claude-trigger-router@latest');
    expect(output).toContain('请在当前 ctr 进程外执行升级命令');
    expect(output).toContain('如果你最初是通过 GitHub 源安装');
    expect(output).toContain('管理员');
    expect(mockSpawn).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('prints init next steps with Models-first guidance', async () => {
    process.argv = ['node', 'cli.ts', 'init', '--force'];
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.1.0',
        });
      }
      throw new Error(`unexpected readFileSync call: ${String(filePath)}`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain("  2. 在 'Models' 下补全你的模型接入信息");
    expect(output).toContain("  3. 将 'Router.default' 设置为默认模型 ID");
    expect(output).toContain("  4. 如需高级路由，再继续配置规则或智能路由");
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-trigger-router'),
      expect.stringContaining('Models:'),
      'utf-8'
    );
    expect(mockWriteFileSync.mock.calls[0]?.[1]).toContain('anthropic/claude-sonnet-4');
    expect(mockWriteFileSync.mock.calls[0]?.[1]).toContain('default: sonnet');

    logSpy.mockRestore();
  });

  it('generates a safe server deployment config from deploy init', async () => {
    process.argv = ['node', 'cli.ts', 'deploy', 'init', '--target', 'server', '--force'];
    mockExistsSync.mockReturnValue(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    const written = String(mockWriteFileSync.mock.calls[0]?.[1]);
    expect(output).toContain('Server 部署配置已覆盖');
    expect(output).toContain('bootstrap admin APIKEY');
    expect(output).toContain('POST /api/auth/keys');
    expect(written).toContain('HOST: 0.0.0.0');
    expect(written).toContain('mode: server');
    expect(written).toContain('default: sonnet');
    expect(written).toMatch(/APIKEY: ctr_bootstrap_[a-f0-9]{48}/);

    logSpy.mockRestore();
  });

  it('does not overwrite an existing config during deploy init without --force', async () => {
    process.argv = ['node', 'cli.ts', 'deploy', 'init', '--target', 'server'];
    mockExistsSync.mockImplementation((filePath: string) => String(filePath).endsWith('config.yaml'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('配置文件已存在');
    expect(output).toContain('如需覆盖部署模板，请使用 --force 参数');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('dispatches setup command to setup module entry', async () => {
    process.argv = ['node', 'cli.ts', 'setup'];

    const { main } = await import('./cli');
    await main();

    expect(mockRunSetupCli).toHaveBeenCalledTimes(1);
    expect(mockRunSetupCli).toHaveBeenCalledWith();
  });

  it('dispatches doctor command to doctor module entry', async () => {
    process.argv = ['node', 'cli.ts', 'doctor'];

    const { main } = await import('./cli');
    await main();

    expect(mockRunDoctorCli).toHaveBeenCalledTimes(1);
    expect(mockRunDoctorCli).toHaveBeenCalledWith();
  });

  it('still requires health check even when PID metadata says running', async () => {
    mockWaitForService.mockResolvedValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as never);

    const { runClaudeCode } = await import('./cli');

    await expect(runClaudeCode()).rejects.toThrow('process.exit called');
    expect(mockWaitForService).toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('still exits when CTR_AUTO_START is set but router service is unavailable', async () => {
    process.env.CTR_AUTO_START = '1';
    mockWaitForService.mockResolvedValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as never);

    const { runClaudeCode } = await import('./cli');

    await expect(runClaudeCode()).rejects.toThrow('process.exit called');
    expect(mockSpawn).not.toHaveBeenCalled();

    delete process.env.CTR_AUTO_START;
    exitSpy.mockRestore();
  });

  it('starts Claude when health check succeeds', async () => {
    mockWaitForService.mockResolvedValue(true);

    const { runClaudeCode } = await import('./cli');

    await expect(runClaudeCode()).resolves.toBeUndefined();
    expect(mockWaitForService).toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      [],
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:5678',
          ANTHROPIC_API_KEY: 'ctr-local-proxy',
        }),
      })
    );
  });

  it('fails clearly when Claude Code CLI is not installed', async () => {
    mockWaitForService.mockResolvedValue(true);
    mockSpawnSync.mockImplementation((command: string) => {
      if (command === 'claude') {
        return { status: 1, stdout: '' };
      }
      return { status: 1, stdout: '' };
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as never);

    const { runClaudeCode } = await import('./cli');

    await expect(runClaudeCode()).rejects.toThrow('process.exit called');
    expect(errorSpy.mock.calls.map(([line]) => String(line)).join('\n')).toContain('未检测到 Claude Code CLI');
    expect(logSpy.mock.calls.map(([line]) => String(line)).join('\n')).toContain('npm install -g @anthropic-ai/claude-code');
    expect(mockSpawn).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('warns when ui is opened before the local service becomes healthy', async () => {
    process.argv = ['node', 'cli.ts', 'ui'];
    mockWaitForService.mockResolvedValue(false);
    process.env.CTR_UI_SKIP_OPEN = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('Opening UI at http://127.0.0.1:5678/ui');
    expect(output).toContain('当前 UI 服务未就绪');

    logSpy.mockRestore();
  });

  it('prints restart guidance before restarting the background service', async () => {
    process.argv = ['node', 'cli.ts', 'restart'];
    mockIsServiceRunning
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    mockWaitForService.mockResolvedValue(false);
    const child = {
      on: vi.fn(),
      once: vi.fn(),
      unref: vi.fn(),
    };
    mockSpawn.mockReturnValue(child);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('`ctr restart` 当前默认按后台模式重启服务');
    expect(output).toContain('未发现运行中的服务');
    expect(output).toContain('Service started in background');

    logSpy.mockRestore();
  }, 10000);

  it('does not start a second foreground service when the router is already running', async () => {
    process.argv = ['node', 'cli.ts', 'start'];
    mockWaitForService.mockResolvedValue(true);
    mockIsTcpPortOccupied.mockResolvedValue(true);
    mockIsServiceRunning.mockReturnValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('Service is already running on port 5678');
    expect(output).toContain("Use 'ctr status' to inspect it or 'ctr stop' before starting again.");
    expect(mockRun).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('prints server role, listener, auth and remote client guidance in status', async () => {
    process.argv = ['node', 'cli.ts', 'status'];
    mockIsServiceRunning.mockReturnValue(true);
    mockReadServiceInfo.mockReturnValue({ pid: 123, port: 5678, startTime: '2026-04-28T00:00:00.000Z' });
    mockExistsSync.mockImplementation((filePath: string) => String(filePath).endsWith('config.yaml'));
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.1.0',
        });
      }
      if (String(filePath).endsWith('config.yaml')) {
        return [
          'HOST: "0.0.0.0"',
          'PORT: 5678',
          'APIKEY: "bootstrap-key"',
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
      throw new Error(`unexpected readFileSync call: ${String(filePath)}`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('服务运行中');
    expect(output).toContain('模式：server（router_service）');
    expect(output).toContain('监听：0.0.0.0:5678（对外监听）');
    expect(output).toContain('鉴权：enabled（bootstrap=true, managed_active=0）');
    expect(output).toContain('远程客户端接入：ANTHROPIC_BASE_URL=http://<server-host>:5678');
    expect(output).toContain('managed client + read-only');
    expect(output).toContain('维护入口：http://127.0.0.1:5678/ui');

    logSpy.mockRestore();
  });

  it('uses live service-info for status when runtime config differs from the local file', async () => {
    process.argv = ['node', 'cli.ts', 'status'];
    mockIsServiceRunning.mockReturnValue(true);
    mockReadServiceInfo.mockReturnValue({ pid: 321, port: 5678, startTime: '2026-04-28T00:00:00.000Z' });
    mockExistsSync.mockImplementation((filePath: string) => String(filePath).endsWith('config.yaml'));
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.1.0',
        });
      }
      if (String(filePath).endsWith('config.yaml')) {
        return [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'APIKEY: "bootstrap-key"',
          'Runtime:',
          '  mode: "local"',
        ].join('\n');
      }
      throw new Error(`unexpected readFileSync call: ${String(filePath)}`);
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        service: 'claude-trigger-router',
        ready: true,
        runtimeMode: 'cloud',
        serviceRole: 'router_service',
        listener: {
          host: '0.0.0.0',
          port: 5678,
          public: true,
          localUrl: 'http://127.0.0.1:5678',
          advertisedUrl: 'https://router.example.com',
        },
        clientConnection: {
          role: 'remote_user',
          baseUrl: 'https://router.example.com',
          recommendedScopes: ['client', 'read-only'],
        },
        auth: {
          required: true,
          bootstrapConfigured: false,
          managedKeys: { active: 2 },
        },
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:5678/api/service-info',
      expect.objectContaining({
        headers: { Authorization: 'Bearer bootstrap-key' },
      })
    );
    expect(output).toContain('模式：cloud（router_service）');
    expect(output).toContain('监听：0.0.0.0:5678（对外监听）');
    expect(output).toContain('鉴权：enabled（bootstrap=false, managed_active=2）');
    expect(output).toContain('远程客户端接入：ANTHROPIC_BASE_URL=https://router.example.com');

    logSpy.mockRestore();
  });

  it('reports status as running when health is ready but pid metadata is missing', async () => {
    process.argv = ['node', 'cli.ts', 'status'];
    mockReadServiceInfo.mockReturnValue(null);
    mockWaitForService.mockResolvedValue(true);
    mockIsTcpPortOccupied.mockResolvedValue(true);
    mockExistsSync.mockImplementation((filePath: string) => String(filePath).endsWith('config.yaml'));
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.1.0',
        });
      }
      if (String(filePath).endsWith('config.yaml')) {
        return [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'Runtime:',
          '  mode: "local"',
        ].join('\n');
      }
      throw new Error(`unexpected readFileSync call: ${String(filePath)}`);
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        service: 'claude-trigger-router',
        ready: true,
        runtimeMode: 'local',
        serviceRole: 'local_agent',
        listener: {
          host: '127.0.0.1',
          port: 5678,
          public: false,
          localUrl: 'http://127.0.0.1:5678',
          advertisedUrl: 'http://127.0.0.1:5678',
        },
        clientConnection: {
          role: 'local_user',
          baseUrl: 'http://127.0.0.1:5678',
          recommendedScopes: [],
        },
        auth: {
          required: false,
          bootstrapConfigured: false,
          managedKeys: { active: 0 },
        },
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('服务运行中');
    expect(output).toContain('端口：5678');
    expect(output).toContain('模式：local（local_agent）');
    expect(output).not.toContain('服务未运行');

    logSpy.mockRestore();
  });

  it('fails clearly when --port is not a valid integer', async () => {
    process.argv = ['node', 'cli.ts', 'start', '--port', 'abc'];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { main } = await import('./cli');

    await expect(main()).rejects.toThrow('命令行端口参数 不是合法端口：abc');

    const output = errorSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toBe('');
    expect(mockRun).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('fails daemon start instead of printing a misleading success message when service never becomes healthy', async () => {
    process.argv = ['node', 'cli.ts', 'start', '--daemon', '--port', '5678'];
    mockIsServiceRunning.mockReturnValue(false);
    const child = {
      on: vi.fn(),
      once: vi.fn(),
      unref: vi.fn(),
    };
    mockSpawn.mockReturnValue(child);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as never);

    const { main } = await import('./cli');

    await expect(main()).rejects.toThrow('process.exit called');

    const errorOutput = errorSpy.mock.calls.map(([line]) => String(line)).join('\n');
    const logOutput = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(errorOutput).toContain('Service failed to start in background');
    expect(logOutput).not.toContain('Service launched in background');
    expect(logOutput).not.toContain('Service started in background');

    errorSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  }, 10000);
});
