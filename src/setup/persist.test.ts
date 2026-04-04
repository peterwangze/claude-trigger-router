import { describe, expect, it, vi } from 'vitest';

import { buildBackupPath, persistSetupConfig } from './persist';

describe('buildBackupPath', () => {
  it('uses UTC timestamp and preserves the original yaml extension', () => {
    const backupPath = buildBackupPath('/tmp/config.yaml', new Date('2026-04-03T00:00:00.123Z'));

    expect(backupPath).toBe('/tmp/config.backup.20260403T000000123.yaml');
  });

  it('preserves the original yml or json extension', () => {
    expect(buildBackupPath('/tmp/config.yml', new Date('2026-04-03T00:00:00.123Z'))).toBe(
      '/tmp/config.backup.20260403T000000123.yml'
    );
    expect(buildBackupPath('/tmp/config.json', new Date('2026-04-03T00:00:00.123Z'))).toBe(
      '/tmp/config.backup.20260403T000000123.json'
    );
  });

  it('adds a short suffix when the same timestamp collides', () => {
    const backupPath = buildBackupPath('/tmp/config.yaml', new Date('2026-04-03T00:00:00.123Z'), 'a1b2c3');

    expect(backupPath).toBe('/tmp/config.backup.20260403T000000123-a1b2c3.yaml');
  });
});

describe('persistSetupConfig', () => {
  const validConfig = {
    Providers: [
      {
        name: 'openrouter',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        models: ['anthropic/claude-sonnet-4'],
      },
    ],
    Router: {
      default: 'openrouter,anthropic/claude-sonnet-4',
    },
  };

  it('backs up the existing config before overwriting it', async () => {
    const calls: string[] = [];

    const result = await persistSetupConfig({
      config: validConfig,
      currentConfigPath: '/tmp/config.yaml',
      hasExistingConfig: true,
      validateConfig: vi.fn().mockReturnValue([]),
      backupCurrentConfig: vi.fn().mockImplementation(async () => {
        calls.push('backup');
        return '/tmp/config.backup.20260403T000000000.yaml';
      }),
      writeConfig: vi.fn().mockImplementation(async () => {
        calls.push('write');
      }),
    });

    expect(calls).toEqual(['backup', 'write']);
    expect(result).toEqual({
      configChanged: true,
      configPath: '/tmp/config.yaml',
      backupPath: '/tmp/config.backup.20260403T000000000.yaml',
    });
  });

  it('writes without backup when there is no existing config', async () => {
    const calls: string[] = [];

    const result = await persistSetupConfig({
      config: validConfig,
      currentConfigPath: '/tmp/config.yaml',
      hasExistingConfig: false,
      validateConfig: vi.fn().mockReturnValue([]),
      backupCurrentConfig: vi.fn().mockImplementation(async () => {
        calls.push('backup');
        return '/tmp/config.backup.20260403T000000000.yaml';
      }),
      writeConfig: vi.fn().mockImplementation(async () => {
        calls.push('write');
      }),
    });

    expect(calls).toEqual(['write']);
    expect(result).toEqual({
      configChanged: true,
      configPath: '/tmp/config.yaml',
    });
  });

  it('does not write when backup fails for an existing config', async () => {
    await expect(
      persistSetupConfig({
        config: validConfig,
        currentConfigPath: '/tmp/config.yaml',
        hasExistingConfig: true,
        validateConfig: vi.fn().mockReturnValue([]),
        backupCurrentConfig: vi.fn().mockResolvedValue(null),
        writeConfig: vi.fn(),
      })
    ).rejects.toThrow('failed to back up existing config');
  });

  it('does not write invalid config', async () => {
    const writeConfig = vi.fn();

    await expect(
      persistSetupConfig({
        config: {
          Providers: [],
          Router: {},
        },
        currentConfigPath: '/tmp/config.yaml',
        hasExistingConfig: false,
        validateConfig: vi.fn().mockReturnValue(['Providers is required and must be a non-empty array']),
        backupCurrentConfig: vi.fn(),
        writeConfig,
      })
    ).rejects.toThrow('config validation failed');

    expect(writeConfig).not.toHaveBeenCalled();
  });
});
