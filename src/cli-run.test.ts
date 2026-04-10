import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
}));
const mockInitializeClaudeConfig = vi.fn();
const mockIsServiceRunning = vi.fn();
const mockWaitForService = vi.fn();
const mockRunSetupCli = vi.fn();
const mockProcessExit = vi.fn(() => {
  throw new Error('process.exit called');
});
const originalArgv = process.argv.slice();

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('./index', () => ({
  run: vi.fn(),
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
    mockInitializeClaudeConfig.mockResolvedValue(undefined);
    mockSpawn.mockReturnValue({ on: vi.fn() });
    mockIsServiceRunning.mockReturnValue(true);
    mockRunSetupCli.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
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
    expect(output.indexOf('  ctr setup                # 复用当前配置 / 迁移旧配置 / 新建最小配置')).toBeLessThan(
      output.indexOf('  ctr init                 # 初始化最小配置模板')
    );

    logSpy.mockRestore();
  });

  it('prints current package version and npm package page', async () => {
    process.argv = ['node', 'cli.ts', 'version'];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { main } = await import('./cli');
    await main();

    const output = logSpy.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('@peterwangze/claude-trigger-router');
    expect(output).toContain('1.0.2');
    expect(output).toContain('https://www.npmjs.com/package/@peterwangze/claude-trigger-router');

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
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:3456',
        }),
      })
    );
  });
});
