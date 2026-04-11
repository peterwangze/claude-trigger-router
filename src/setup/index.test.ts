import { describe, expect, it, vi } from 'vitest';

import { readLegacyConfig, runSetupCli } from './index';

describe('readLegacyConfig', () => {
  it('detects legacy config from the claude-code-router path when ccr config is absent', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;

    try {
      const result = await readLegacyConfig({
        homeDir: '/Users/tester',
        exists: (filePath) => filePath.endsWith('.claude-code-router/config.yaml') || filePath.endsWith('.claude-code-router\\config.yaml'),
        readConfig: (filePath) => ({ filePath }),
      });

      expect(result.kind).toBe('found');
      if (result.kind !== 'found') {
        throw new Error('expected legacy config to be found');
      }

      expect(result.path).toMatch(/[\\/]\.claude-code-router[\\/]config\.yaml$/);
      expect(result.config).toEqual({
        filePath: result.path,
      });
    } finally {
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });
});

describe('runSetupCli', () => {
  it('creates a minimal config and enters Claude Code on first use', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-test')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4')
        .mockResolvedValueOnce('sonnet'),
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
            id: 'sonnet',
            api_key: 'sk-test',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'anthropic/claude-sonnet-4',
            protocol: 'openai',
          }),
        ],
        Router: {
          default: 'sonnet',
        },
      })
    );
    expect(io.choose).toHaveBeenNthCalledWith(1, '这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
    expect(io.choose).toHaveBeenNthCalledWith(2, '选择 provider 预设', expect.any(Array));
    expect(io.input).toHaveBeenNthCalledWith(1, 'Provider 名称', 'openrouter');
    expect(io.input).toHaveBeenNthCalledWith(4, '上游模型名', 'anthropic/claude-sonnet-4');
    expect(io.input).toHaveBeenNthCalledWith(5, '默认模型 ID', 'sonnet');
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
        .mockResolvedValueOnce('使用常见接入模板')
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
        .mockResolvedValueOnce('sonnet')
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

  it('supports the anthropic preset during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('anthropic')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('anthropic')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-ant')
        .mockResolvedValueOnce('claude-sonnet-4-5')
        .mockResolvedValueOnce('sonnet'),
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
            id: 'sonnet',
            api_key: 'sk-ant',
            api_base_url: 'https://api.anthropic.com/v1/messages',
            model: 'claude-sonnet-4-5',
            protocol: 'anthropic',
            interface: 'anthropic',
          }),
        ],
        Router: {
          default: 'sonnet',
        },
      })
    );
    expect(io.choose).toHaveBeenNthCalledWith(1, '这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
    expect(io.choose).toHaveBeenNthCalledWith(2, '选择 provider 预设', expect.any(Array));
    expect(io.input).toHaveBeenNthCalledWith(1, 'Provider 名称', 'anthropic');
    expect(io.input).toHaveBeenNthCalledWith(4, '上游模型名', 'claude-sonnet-4-5');
    expect(io.input).toHaveBeenNthCalledWith(5, '默认模型 ID', 'claude');
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('offers direct reuse before reconfiguration when current config is valid', async () => {
    const writeConfig = vi.fn();
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi.fn().mockResolvedValue('直接使用当前配置（推荐）'),
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
      io,
    });

    expect(io.info).toHaveBeenCalledWith('检测到当前 claude-trigger-router 配置已可用。');
    expect(io.choose).toHaveBeenCalledWith(
      '你想直接使用它，还是重新调整？',
      ['直接使用当前配置（推荐）', '检查并调整当前配置', '放弃当前配置，重新开始']
    );
    expect(writeConfig).not.toHaveBeenCalled();
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('restarts setup flow when user abandons a valid current config', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const executeReload = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('放弃当前配置，重新开始')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-test')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4')
        .mockResolvedValueOnce('sonnet'),
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
              id: 'existing',
              api_key: 'sk-old',
              api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
              protocol: 'openai',
              model: 'anthropic/claude-sonnet-4',
            },
          ],
          Router: {
            default: 'existing',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 3456 }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/config.backup.yaml'),
      writeConfig,
      executeStart,
      executeReload,
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth,
      enterClaudeCode,
      io,
    });

    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            id: 'sonnet',
            api_key: 'sk-test',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'anthropic/claude-sonnet-4',
          }),
        ],
        Router: {
          default: 'sonnet',
        },
      })
    );
    expect(executeStart).not.toHaveBeenCalled();
    expect(executeReload).not.toHaveBeenCalled();
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('offers migration as the recommended legacy action', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi.fn().mockResolvedValueOnce('迁移旧配置（推荐）'),
      input: vi.fn(),
      info: vi.fn(),
    };

    await runSetupCli({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/.ccr/config.yaml',
        config: {
          providers: [
            {
              name: 'openrouter',
              api_key: 'sk-test',
              api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
              models: ['anthropic/claude-sonnet-4'],
            },
          ],
          default: 'openrouter,anthropic/claude-sonnet-4',
        },
      }),
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

    expect(io.choose).toHaveBeenCalledWith(
      '检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？',
      ['迁移旧配置（推荐）', '跳过迁移，手动新建']
    );
    expect(writeConfig).toHaveBeenCalled();
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
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
      choose: vi.fn().mockResolvedValue('直接使用当前配置（推荐）'),
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

    expect(io.info).toHaveBeenCalledWith('检测到当前 claude-trigger-router 配置已可用。');
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
