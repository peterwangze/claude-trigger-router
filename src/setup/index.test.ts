import { describe, expect, it, vi } from 'vitest';

import { runSetupCli } from './index';

describe('runSetupCli', () => {
  it('creates a minimal config and enters Claude Code on first use', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi.fn().mockResolvedValueOnce('openrouter'),
      input: vi
        .fn()
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-test')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4'),
      info: vi.fn(),
    };

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig,
      executeStart,
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth,
      enterClaudeCode,
      io,
    });

    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            id: 'openrouter',
            api_key: 'sk-test',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'anthropic/claude-sonnet-4',
            protocol: 'openai',
          }),
        ],
        Router: {
          default: 'openrouter',
        },
      })
    );
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid current config without rewriting it', async () => {
    const writeConfig = vi.fn();
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/config.yaml',
        format: 'yaml',
        config: {
          Models: [
            {
              id: 'openrouter_anthropic_claude_sonnet_4',
              api_key: 'sk-test',
              api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
              protocol: 'openai',
              model: 'anthropic/claude-sonnet-4',
            },
          ],
          Router: {
            default: 'openrouter_anthropic_claude_sonnet_4',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 3456 }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig,
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io: {
        choose: vi.fn().mockResolvedValue('reuse'),
        input: vi.fn(),
        info: vi.fn(),
      },
    });

    expect(writeConfig).not.toHaveBeenCalled();
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('preserves string thinking aliases when reusing current Models config', async () => {
    const writeConfig = vi.fn();
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/config.yaml',
        format: 'yaml',
        config: {
          Models: [
            {
              id: 'sonnet',
              key: 'sk-test',
              api: 'https://openrouter.ai/api/v1/chat/completions',
              interface: 'openai',
              model: 'anthropic/claude-sonnet-4',
              thinking: 'auto',
            },
          ],
          Router: {
            default: 'sonnet',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 3456 }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig,
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io: {
        choose: vi.fn().mockResolvedValue('reuse'),
        input: vi.fn(),
        info: vi.fn(),
      },
    });

    expect(writeConfig).not.toHaveBeenCalled();
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });
});
