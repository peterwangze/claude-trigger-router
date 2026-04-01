import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSpawn = vi.fn(() => ({
  on: vi.fn(),
}));
const mockInitializeClaudeConfig = vi.fn();
const mockIsServiceRunning = vi.fn();
const mockWaitForService = vi.fn();
const mockProcessExit = vi.fn(() => {
  throw new Error('process.exit called');
});

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

describe('runClaudeCode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CTR_SKIP_MAIN = '1';
    mockInitializeClaudeConfig.mockResolvedValue(undefined);
    mockSpawn.mockReturnValue({ on: vi.fn() });
    mockIsServiceRunning.mockReturnValue(true);
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
