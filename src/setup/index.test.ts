import { describe, expect, it, vi } from 'vitest';

import { runSetupCli } from './index';

describe('runSetupCli', () => {
  it('creates a minimal config and enters Claude Code on first use', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi.fn().mockResolvedValueOnce('openrouter').mockResolvedValueOnce('保持默认'),
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

  it('supports guided capability hints during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('配置 capability 提示')
        .mockResolvedValueOnce('编辑 capability')
        .mockResolvedValueOnce('禁用')
        .mockResolvedValueOnce('禁用')
        .mockResolvedValueOnce('支持'),
      input: vi
        .fn()
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-test')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4')
        .mockResolvedValueOnce('openrouter'),
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
            metadata: {
              vendor_hint: 'openrouter',
              supports_reasoning: false,
              supports_tools: false,
              supports_images: true,
            },
          }),
        ],
      })
    );
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

  it('surfaces current config warnings during setup reuse flow', async () => {
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi.fn().mockResolvedValue('reuse'),
      input: vi.fn(),
      info: vi.fn(),
    };

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/config.yaml',
        format: 'yaml',
        config: {
          Models: [
            {
              id: 'restricted',
              api: 'https://api.example.com/v1/chat/completions',
              key: 'sk-test',
              interface: 'openai',
              model: 'vendor/text-only',
              thinking: 'high',
              metadata: {
                supports_reasoning: false,
              },
            },
          ],
          Router: {
            default: 'restricted',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 3456 }),
      backupCurrentConfig: vi.fn().mockResolvedValue(null),
      writeConfig: vi.fn(),
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io,
    });

    expect(io.info).toHaveBeenCalledWith('检测到现有可用配置。');
    expect(io.info).toHaveBeenCalledWith(
      '当前配置提示：Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.'
    );
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('supports capability repair prompts across draft models during setup repair flow', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('repair')
        .mockResolvedValueOnce('编辑 capability')
        .mockResolvedValueOnce('禁用')
        .mockResolvedValueOnce('支持')
        .mockResolvedValueOnce('默认')
        .mockResolvedValueOnce('保持当前值'),
      input: vi
        .fn()
        .mockResolvedValueOnce('vendor/restricted')
        .mockResolvedValueOnce('openrouter'),
      info: vi.fn(),
    };

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/config.yaml',
        format: 'yaml',
        config: {
          Models: [
            {
              id: 'restricted',
              api: 'https://api.example.com/v1/chat/completions',
              key: 'sk-test',
              interface: 'openai',
              model: 'vendor/restricted',
              thinking: 'high',
              metadata: {
                supports_reasoning: false,
              },
            },
            {
              id: 'balanced',
              api: 'https://api.openai.com/v1/chat/completions',
              key: 'sk-test',
              interface: 'openai',
              model: 'gpt-5-mini',
            },
          ],
          Router: {},
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/config.backup.yaml'),
      writeConfig,
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io,
    });

    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Router: {
          default: 'restricted',
        },
        Models: [
          expect.objectContaining({
            id: 'restricted',
            model: 'vendor/restricted',
            metadata: {
              vendor_hint: 'openrouter',
              supports_reasoning: false,
              supports_tools: true,
            },
          }),
          expect.objectContaining({
            id: 'balanced',
            model: 'gpt-5-mini',
          }),
        ],
      })
    );
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });
});
