import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
  once: vi.fn(),
  unref: vi.fn(),
}));
const mockSpawnSync = vi.fn();
const mockInitializeClaudeConfig = vi.fn();
const mockIsServiceRunning = vi.fn();
const mockWaitForService = vi.fn();
const mockIsTcpPortOccupied = vi.fn();
const mockRunSetupCli = vi.fn();
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
  readServiceInfo: vi.fn(),
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

describe('runClaudeCode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CTR_SKIP_MAIN = '1';
    process.argv = [...originalArgv];
    global.fetch = mockFetch as typeof fetch;
    mockInitializeClaudeConfig.mockResolvedValue(undefined);
    mockSpawn.mockReturnValue({ on: vi.fn() });
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
    mockIsServiceRunning.mockReturnValue(true);
    mockIsTcpPortOccupied.mockResolvedValue(false);
    mockRunSetupCli.mockResolvedValue(undefined);
    mockRun.mockResolvedValue(undefined);
    mockFetch.mockRejectedValue(new Error('network error'));
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((filePath: string, ...args: unknown[]) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.0.3',
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
    expect(output).toContain('version     查看当前安装版本与包信息');
    expect(output).toContain('upgrade     查看升级到最新 npm 版本的指引');
    expect(output).toContain('  ctr setup                # 复用当前配置 / 迁移旧配置 / 新建最小配置');
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
      json: vi.fn().mockResolvedValue({ version: '1.0.4' }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('@peterwangze/claude-trigger-router');
    expect(output).toContain('Version: 1.0.3');
    expect(output).toContain('Latest: 1.0.4');
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
    expect(output).toContain('Version: 1.0.3');
    expect(output).toContain('Latest: unavailable');
    expect(output).not.toContain('Upgrade: npm install -g @peterwangze/claude-trigger-router@latest');
    expect(output).toContain('https://www.npmjs.com/package/@peterwangze/claude-trigger-router');

    logSpy.mockRestore();
  });

  it('falls back to npm view when registry fetch fails', async () => {
    process.argv = ['node', 'cli.ts', 'version'];
    mockFetch.mockRejectedValue(new Error('network error'));
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '1.0.4\n' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('Version: 1.0.3');
    expect(output).toContain('Latest: 1.0.4');
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
    mockExistsSync.mockImplementation((filePath: string) => String(filePath).includes('trigger.example.yaml'));
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith('package.json')) {
        return JSON.stringify({
          name: '@peterwangze/claude-trigger-router',
          version: '1.0.3',
        });
      }
      if (String(filePath).includes('trigger.example.yaml')) {
        return 'HOST: "127.0.0.1"\nPORT: 5678\n';
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

    logSpy.mockRestore();
  });

  it('dispatches setup command to setup module entry', async () => {
    process.argv = ['node', 'cli.ts', 'setup'];

    const { main } = await import('./cli');
    await main();

    expect(mockRunSetupCli).toHaveBeenCalledTimes(1);
    expect(mockRunSetupCli).toHaveBeenCalledWith();
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
        }),
      })
    );
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
