import { describe, expect, it, vi } from 'vitest';

import { CONFIG_FILE } from '../constants';
import { ISetupConfigDraft } from './types';

function createDraft(): ISetupConfigDraft {
  return {
    Providers: [
      {
        name: 'openrouter',
        api_key: 'sk-test',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['anthropic/claude-sonnet-4'],
        transformer: { use: ['openrouter'] },
      },
    ],
    Router: {
      default: 'openrouter,anthropic/claude-sonnet-4',
    },
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const draft = createDraft();
  const deps = {
    detectSetupEnvironment: vi.fn().mockResolvedValue({
      currentConfig: { kind: 'missing' },
      legacyConfig: { kind: 'missing' },
      detectedService: { kind: 'none' },
    }),
    chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
    chooseLegacyConfigAction: vi.fn().mockResolvedValue('skip'),
    buildFreshConfig: vi.fn().mockResolvedValue(draft),
    buildRepairConfig: vi.fn().mockImplementation(async ({ currentConfig }) => currentConfig),
    completeDraft: vi.fn().mockImplementation(async ({ draft: inputDraft }) => inputDraft),
    migrateLegacyConfig: vi.fn().mockReturnValue({
      draft,
      skippedFields: [],
      needsCompletion: false,
      missingFields: [],
    }),
    mapConfigErrorsToRepairFields: vi.fn().mockReturnValue({
      mode: 'repair',
      fields: [],
    }),
    persistConfig: vi.fn().mockResolvedValue({
      configChanged: true,
      configPath: '/tmp/config.yaml',
      backupPath: undefined,
    }),
    ensureServiceReady: vi.fn().mockResolvedValue({
      action: 'start',
      healthChecked: true,
    }),
    enterClaudeCode: vi.fn().mockResolvedValue(undefined),
    io: {
      info: vi.fn(),
    },
    reloadSupported: false,
  };

  return {
    draft,
    deps: {
      ...deps,
      ...overrides,
    },
  };
}

describe('runSetup', () => {
  it('persists a fresh minimal config, starts the service, then enters Claude Code', async () => {
    const calls: string[] = [];
    const expectedDraft = createDraft();
    const { deps } = createDeps({
      buildFreshConfig: vi.fn().mockResolvedValue(expectedDraft),
      chooseCurrentConfigAction: vi.fn().mockImplementation(async () => {
        calls.push('chooseCurrent');
        return 'create';
      }),
      buildFreshConfig: vi.fn().mockImplementation(async () => {
        calls.push('buildFresh');
        return expectedDraft;
      }),
      persistConfig: vi.fn().mockImplementation(async () => {
        calls.push('persist');
        return {
          configChanged: true,
          configPath: '/tmp/config.yaml',
          backupPath: undefined,
        };
      }),
      ensureServiceReady: vi.fn().mockImplementation(async () => {
        calls.push('service');
        return {
          action: 'start',
          healthChecked: true,
        };
      }),
      enterClaudeCode: vi.fn().mockImplementation(async () => {
        calls.push('enter');
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.detectSetupEnvironment).toHaveBeenCalledTimes(1);
    expect(deps.chooseCurrentConfigAction).toHaveBeenCalledWith({
      currentConfig: { kind: 'missing' },
      legacyConfig: { kind: 'missing' },
    });
    expect(deps.buildFreshConfig).toHaveBeenCalledTimes(1);
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: expectedDraft,
      currentConfigPath: CONFIG_FILE,
      hasExistingConfig: false,
    });
    expect(deps.ensureServiceReady).toHaveBeenCalledWith({
      configChanged: true,
      detectedService: { kind: 'none' },
      reloadSupported: false,
    });
    expect(deps.enterClaudeCode).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['chooseCurrent', 'buildFresh', 'persist', 'service', 'enter']);
  });

  it('does not map repair fields for parse errors', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'parse_error',
          path: '/tmp/config.yaml',
          format: 'yaml',
          error: 'bad yaml',
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('rebuild'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.mapConfigErrorsToRepairFields).not.toHaveBeenCalled();
  });

  it('does not persist when reusing a valid current config', async () => {
    const existingConfig = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_healthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('reuse'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).not.toHaveBeenCalled();
  });

  it('does not enter Claude Code when another service occupies the target port', async () => {
    const ensureServiceReady = vi.fn().mockRejectedValue(new Error('target port is occupied by another service'));
    const { deps } = createDeps({
      ensureServiceReady,
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'non_self_occupied', port: 5678 },
      }),
    });

    const { runSetup } = await import('./setup');

    await expect(runSetup(deps as any)).rejects.toThrow('target port is occupied by another service');
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
  });

  it('rebuilds config when user abandons a valid current config', async () => {
    const existingConfig = createDraft();
    const rebuiltDraft = createDraft();
    rebuiltDraft.Models = [
      {
        id: 'sonnet',
        key: 'sk-new',
        api: 'https://openrouter.ai/api/v1/chat/completions',
        interface: 'openai',
        model: 'anthropic/claude-sonnet-4',
      },
    ];
    rebuiltDraft.Router = { default: 'sonnet' };

    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_healthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('fresh'),
      buildFreshConfig: vi.fn().mockResolvedValue(rebuiltDraft),
      ensureServiceReady: vi.fn().mockResolvedValue({
        action: 'reload',
        healthChecked: true,
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.buildFreshConfig).toHaveBeenCalledTimes(1);
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: rebuiltDraft,
      currentConfigPath: '/tmp/config.yaml',
      hasExistingConfig: true,
    });
    expect(deps.enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('migrates legacy config when user abandons a valid current config and legacy config exists', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'gpt90_gpt_5_4',
          api: 'https://example.com/openai/v1/chat/completions',
          api_key: 'sk-test',
          interface: 'openai',
          model: 'gpt-5.4',
        },
      ],
      Router: { default: 'gpt90_gpt_5_4' },
    } satisfies ISetupConfigDraft;

    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/current.yaml',
          format: 'yaml',
          config: createDraft(),
          errors: [],
          warnings: [],
        },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/.claude-code-router/config.json',
          config: {
            Providers: [{ name: 'gpt90', api_key: 'sk-test', models: ['gpt-5.4'] }],
            Router: { default: 'gpt90,gpt-5.4' },
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('fresh'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: false,
        missingFields: [],
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.chooseLegacyConfigAction).toHaveBeenCalledWith({
      legacyConfig: {
        kind: 'found',
        path: '/legacy/.claude-code-router/config.json',
        config: {
          Providers: [{ name: 'gpt90', api_key: 'sk-test', models: ['gpt-5.4'] }],
          Router: { default: 'gpt90,gpt-5.4' },
        },
      },
    });
    expect(deps.migrateLegacyConfig).toHaveBeenCalledTimes(1);
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: migratedDraft,
      currentConfigPath: '/tmp/current.yaml',
      hasExistingConfig: true,
    });
  });

  it('does not persist or enter Claude Code when user cancels setup', async () => {
    const existingConfig = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_healthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('cancel'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).not.toHaveBeenCalled();
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
  });

  it('reuses a valid current config and enters Claude Code without rewriting config', async () => {
    const existingConfig = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_healthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('reuse'),
      ensureServiceReady: vi.fn().mockResolvedValue({
        action: 'reuse',
        healthChecked: true,
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).not.toHaveBeenCalled();
    expect(deps.ensureServiceReady).toHaveBeenCalledWith({
      configChanged: false,
      detectedService: { kind: 'self_healthy', port: 5678 },
      reloadSupported: false,
    });
    expect(deps.enterClaudeCode).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid current server config without auto-starting or entering Claude Code', async () => {
    const existingConfig = {
      ...createDraft(),
      HOST: '0.0.0.0',
      Runtime: {
        mode: 'server',
      },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('reuse'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).not.toHaveBeenCalled();
    expect(deps.ensureServiceReady).not.toHaveBeenCalled();
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
    expect(deps.io.info).toHaveBeenCalledWith('当前配置是 server 部署配置；setup 不会自动启动远程服务。');
    expect(deps.io.info).toHaveBeenCalledWith('下一步：确认 Models[].id/api/key/interface/model，按需补 thinking/metadata；然后运行 ctr doctor && ctr start --daemon。');
  });

  it('reuses a valid current cloud config without treating it as a local Claude Code setup', async () => {
    const existingConfig = {
      ...createDraft(),
      HOST: '0.0.0.0',
      Runtime: {
        mode: 'cloud',
      },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: existingConfig,
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('reuse'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).not.toHaveBeenCalled();
    expect(deps.ensureServiceReady).not.toHaveBeenCalled();
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
    expect(deps.io.info).toHaveBeenCalledWith('当前配置是 cloud 部署配置；setup 不会自动启动远程服务。');
    expect(deps.io.info).toHaveBeenCalledWith('下一步：确认 Models[].id/api/key/interface/model，按需补 thinking/metadata；然后运行 ctr doctor && ctr start --daemon。');
  });

  it('repairs an invalid current config by mapping missing fields and persisting the completed draft', async () => {
    const repairedDraft = createDraft();
    const invalidConfig = {
      Providers: [],
      Router: {},
    } as unknown as ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'invalid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: invalidConfig,
          errors: ['Router.default is required', 'Providers[0].api_key is required'],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_unhealthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('repair'),
      mapConfigErrorsToRepairFields: vi.fn().mockReturnValue({
        mode: 'repair',
        fields: ['defaultModel', 'apiKey'],
      }),
      buildRepairConfig: vi.fn().mockResolvedValue(invalidConfig),
      completeDraft: vi.fn().mockResolvedValue(repairedDraft),
      ensureServiceReady: vi.fn().mockResolvedValue({
        action: 'restart',
        healthChecked: true,
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.mapConfigErrorsToRepairFields).toHaveBeenCalledWith([
      'Router.default is required',
      'Providers[0].api_key is required',
    ]);
    expect(deps.buildRepairConfig).toHaveBeenCalledWith({
      currentConfig: invalidConfig,
      fields: ['defaultModel', 'apiKey'],
    });
    expect(deps.completeDraft).toHaveBeenCalledWith({
      draft: invalidConfig,
      fields: ['defaultModel', 'apiKey'],
    });
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: repairedDraft,
      currentConfigPath: '/tmp/config.yaml',
      hasExistingConfig: true,
    });
    expect(deps.ensureServiceReady).toHaveBeenCalledWith({
      configChanged: true,
      detectedService: { kind: 'self_unhealthy', port: 5678 },
      reloadSupported: false,
    });
  });

  it('includes capability warnings when deriving repair fields for invalid config', async () => {
    const repairedDraft = createDraft();
    const invalidConfig = {
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
    } as unknown as ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'invalid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: invalidConfig,
          errors: ['Router.default is required'],
          warnings: ['Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.'],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_unhealthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('repair'),
      mapConfigErrorsToRepairFields: vi.fn().mockReturnValue({
        mode: 'repair',
        fields: ['defaultModel', 'capabilityHints'],
      }),
      buildRepairConfig: vi.fn().mockResolvedValue(invalidConfig),
      completeDraft: vi.fn().mockResolvedValue(repairedDraft),
      ensureServiceReady: vi.fn().mockResolvedValue({
        action: 'restart',
        healthChecked: true,
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.mapConfigErrorsToRepairFields).toHaveBeenCalledWith([
      'Router.default is required',
      'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
    ]);
  });

  it('rebuilds from parse error without entering repair-field mapping', async () => {
    const rebuiltDraft = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'parse_error',
          path: '/tmp/config.yml',
          format: 'yml',
          error: 'bad yaml',
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('rebuild'),
      buildFreshConfig: vi.fn().mockResolvedValue(rebuiltDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.mapConfigErrorsToRepairFields).not.toHaveBeenCalled();
    expect(deps.completeDraft).not.toHaveBeenCalled();
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: rebuiltDraft,
      currentConfigPath: '/tmp/config.yml',
      hasExistingConfig: true,
    });
    expect(deps.ensureServiceReady).toHaveBeenCalledWith({
      configChanged: true,
      detectedService: { kind: 'none' },
      reloadSupported: false,
    });
  });

  it('preserves the broken config path when rebuilding from parse error', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'parse_error',
          path: '/tmp/config.json',
          format: 'json',
          error: 'bad json',
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('rebuild'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe('/tmp/config.json');
  });

  it('uses CONFIG_FILE when creating a brand new config', async () => {
    const { deps } = createDeps();

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe(CONFIG_FILE);
  });

  it('uses CONFIG_FILE when migrating legacy config without a current config', async () => {
    const completedDraft = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: {
          Providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
          Router: {},
        },
        skippedFields: [],
        needsCompletion: true,
        missingFields: ['defaultModel', 'apiKey'],
      }),
      completeDraft: vi.fn().mockResolvedValue(completedDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe(CONFIG_FILE);
  });

  it('uses the existing config path when migrating legacy config over a current config', async () => {
    const completedDraft = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/current.json',
          format: 'json',
          config: createDraft(),
          errors: [],
          warnings: [],
        },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('overwrite'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: {
          Providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
          Router: {},
        },
        skippedFields: [],
        needsCompletion: true,
        missingFields: ['defaultModel', 'apiKey'],
      }),
      completeDraft: vi.fn().mockResolvedValue(completedDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe('/tmp/current.json');
  });

  it('uses the existing config path when creating fresh config over a current config', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'valid',
          path: '/tmp/current.yml',
          format: 'yml',
          config: createDraft(),
          errors: [],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('overwrite'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe('/tmp/current.yml');
  });

  it('uses CONFIG_FILE when current config is missing and legacy migration is skipped', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            providers: [{ name: 'openrouter', api_key: 'sk-test', models: ['anthropic/claude-sonnet-4'] }],
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('skip'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe(CONFIG_FILE);
  });

  it('uses the existing broken path when rebuilding from parse error even if extension is not yaml', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'parse_error',
          path: '/tmp/custom-config.json',
          format: 'json',
          error: 'bad json',
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('rebuild'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).toBe('/tmp/custom-config.json');
  });

  it('does not rewrite broken parse-error paths to CONFIG_FILE', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'parse_error',
          path: '/tmp/broken.yml',
          format: 'yml',
          error: 'bad yaml',
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('rebuild'),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig.mock.calls[0][0].currentConfigPath).not.toBe(CONFIG_FILE);
  });

  it('stops guided repair when repair mapping requires manual review', async () => {
    const invalidConfig = {
      Providers: [],
      Router: {},
    } as unknown as ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: {
          kind: 'invalid',
          path: '/tmp/config.yaml',
          format: 'yaml',
          config: invalidConfig,
          errors: ['SmartRouter.router_model is required when SmartRouter is enabled'],
          warnings: [],
        },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'self_unhealthy', port: 5678 },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('repair'),
      mapConfigErrorsToRepairFields: vi.fn().mockReturnValue({
        mode: 'manualReview',
        fields: ['manualReview'],
      }),
    });

    const { runSetup } = await import('./setup');

    await expect(runSetup(deps as any)).rejects.toThrow('manual review is required for current config');
    expect(deps.buildRepairConfig).not.toHaveBeenCalled();
    expect(deps.completeDraft).not.toHaveBeenCalled();
    expect(deps.persistConfig).not.toHaveBeenCalled();
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
  });

  it('passes through only actually missing legacy fields during completion', async () => {
    const migratedDraft = {
      Providers: [
        {
          name: 'openrouter',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      Router: {},
    } satisfies ISetupConfigDraft;
    const completedDraft = createDraft();
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            providers: [{ name: 'openrouter', api_key: 'sk-test', models: ['anthropic/claude-sonnet-4'] }],
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: true,
        missingFields: ['defaultModel'],
      }),
      completeDraft: vi.fn().mockResolvedValue(completedDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.completeDraft).toHaveBeenCalledWith({
      draft: migratedDraft,
      fields: ['defaultModel'],
    });
  });

  it('asks for apiBaseUrl when migrated legacy config is missing endpoint data', async () => {
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            Providers: [{ name: 'openrouter', api_key: 'sk-test', models: ['anthropic/claude-sonnet-4'] }],
            Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
          },
        },
        detectedService: { kind: 'none', port: 5678 },
      }),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: {
          Providers: [],
          Models: [{
            id: 'openrouter_anthropic_claude_sonnet_4',
            key: 'sk-test',
            model: 'anthropic/claude-sonnet-4',
            interface: 'openai',
          }],
          Router: { default: 'openrouter_anthropic_claude_sonnet_4' },
        },
        skippedFields: [],
        needsCompletion: true,
        missingFields: ['apiBaseUrl'],
      }),
    });

    deps.completeDraft.mockResolvedValue({
      Providers: [],
      Models: [{
        id: 'openrouter_anthropic_claude_sonnet_4',
        key: 'sk-test',
        api: 'https://openrouter.ai/api/v1/chat/completions',
        interface: 'openai',
        model: 'anthropic/claude-sonnet-4',
      }],
      Router: { default: 'openrouter_anthropic_claude_sonnet_4' },
    });

    const { runSetup } = await import('./setup');
    await runSetup(deps as any);

    expect(deps.completeDraft).toHaveBeenCalledWith({
      draft: expect.objectContaining({
        Models: [expect.objectContaining({
          id: 'openrouter_anthropic_claude_sonnet_4',
        })],
      }),
      fields: ['apiBaseUrl'],
    });
    expect(deps.persistConfig.mock.calls[0][0].config.Models?.[0].api).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('forwards non-self-occupied service state into ensureServiceReady before failing', async () => {
    const ensureServiceReady = vi.fn().mockImplementation(async (input) => {
      expect(input.detectedService).toEqual({ kind: 'non_self_occupied', port: 5678 });
      throw new Error('target port is occupied by another service');
    });
    const { deps } = createDeps({
      ensureServiceReady,
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: { kind: 'missing' },
        detectedService: { kind: 'non_self_occupied', port: 5678 },
      }),
    });

    const { runSetup } = await import('./setup');

    await expect(runSetup(deps as any)).rejects.toThrow('target port is occupied by another service');
    expect(ensureServiceReady).toHaveBeenCalledTimes(1);
    expect(deps.enterClaudeCode).not.toHaveBeenCalled();
  });

  it('migrates legacy config and reports migration summary before persisting', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'openrouter_anthropic_claude_sonnet_4',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: '',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
      ],
      Router: {},
    } satisfies ISetupConfigDraft;
    const completedDraft = {
      ...migratedDraft,
      Router: { default: 'openrouter_anthropic_claude_sonnet_4' },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: {
            providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: ['trigger_router', 'Providers[0].transformer'],
        needsCompletion: true,
        missingFields: ['defaultModel', 'apiKey'],
      }),
      completeDraft: vi.fn().mockResolvedValue(completedDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.chooseLegacyConfigAction).toHaveBeenCalledWith({
      legacyConfig: {
        kind: 'found',
        path: '/legacy/ccr.yaml',
        config: {
          providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
        },
      },
    });
    expect(deps.migrateLegacyConfig).toHaveBeenCalledWith({
      providers: [{ name: 'openrouter', api_key: '', models: ['anthropic/claude-sonnet-4'] }],
    });
    expect(deps.io.info).toHaveBeenCalledWith('已识别旧配置中的 1 个 provider。');
    expect(deps.io.info).toHaveBeenCalledWith('已从旧配置迁移 1 个模型。');
    expect(deps.io.info).toHaveBeenCalledWith('迁移后的默认模型仍需补全。');
    expect(deps.io.info).toHaveBeenCalledWith('以下旧字段未自动迁移：trigger_router, Providers[0].transformer');
    expect(deps.completeDraft).toHaveBeenCalledWith({
      draft: migratedDraft,
      fields: ['defaultModel', 'apiKey'],
    });
    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: completedDraft,
      currentConfigPath: CONFIG_FILE,
      hasExistingConfig: false,
    });
  });

  it('reports migrated default model id when legacy migration is already complete', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'gpt90_gpt_5_4',
          api: 'https://example.com/v1/chat/completions',
          api_key: 'sk-test',
          interface: 'openai',
          model: 'gpt-5.4',
        },
      ],
      Router: { default: 'gpt90_gpt_5_4' },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.json',
          config: {
            Providers: [{ name: 'gpt90', api_key: 'sk-test', models: ['gpt-5.4'] }],
            Router: { default: 'gpt90,gpt-5.4' },
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: false,
        missingFields: [],
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.io.info).toHaveBeenCalledWith('已从旧配置迁移 1 个模型。');
    expect(deps.io.info).toHaveBeenCalledWith('迁移后的默认模型：gpt90_gpt_5_4');
    expect(deps.completeDraft).not.toHaveBeenCalled();
  });

  it('reports zero skipped fields without extra warning text when migration consumed everything needed', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'openrouter_anthropic_claude_sonnet_4',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
      ],
      Router: { default: 'openrouter_anthropic_claude_sonnet_4' },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.json',
          config: {
            providers: [{ name: 'openrouter', api_key: 'sk-test', models: ['anthropic/claude-sonnet-4'] }],
            default: 'openrouter,anthropic/claude-sonnet-4',
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: false,
        missingFields: [],
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.io.info).toHaveBeenCalledWith('已识别旧配置中的 1 个 provider。');
    expect(deps.io.info).toHaveBeenCalledTimes(3);
    expect(deps.io.info).not.toHaveBeenCalledWith(expect.stringContaining('以下旧字段未自动迁移'));
  });

  it('preserves module-id router default when persisting migrated legacy config', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'gpt90_gpt_5_4',
          api: 'https://example.com/v1/chat/completions',
          api_key: 'sk-test',
          interface: 'openai',
          model: 'gpt-5.4',
        },
      ],
      Router: { default: 'gpt90_gpt_5_4' },
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.json',
          config: {
            Providers: [{ name: 'gpt90', api_key: 'sk-test', models: ['gpt-5.4'] }],
            Router: { default: 'gpt90,gpt-5.4' },
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: false,
        missingFields: [],
      }),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.persistConfig).toHaveBeenCalledWith({
      config: migratedDraft,
      currentConfigPath: CONFIG_FILE,
      hasExistingConfig: false,
    });
    expect(deps.persistConfig.mock.calls[0][0].config.Router.default).toBe('gpt90_gpt_5_4');
  });

  it('does not rewrite migrated router default back to legacy provider-model syntax during completion', async () => {
    const migratedDraft = {
      Models: [
        {
          id: 'gpt90_gpt_5_4',
          api: 'https://example.com/v1/chat/completions',
          api_key: '',
          interface: 'openai',
          model: 'gpt-5.4',
        },
      ],
      Router: { default: 'gpt90_gpt_5_4' },
    } satisfies ISetupConfigDraft;
    const completedDraft = {
      ...migratedDraft,
      Models: [
        {
          ...migratedDraft.Models![0],
          api_key: 'sk-filled',
        },
      ],
    } satisfies ISetupConfigDraft;
    const { deps } = createDeps({
      detectSetupEnvironment: vi.fn().mockResolvedValue({
        currentConfig: { kind: 'missing' },
        legacyConfig: {
          kind: 'found',
          path: '/legacy/ccr.json',
          config: {
            Providers: [{ name: 'gpt90', api_key: '', models: ['gpt-5.4'] }],
            Router: { default: 'gpt90,gpt-5.4' },
          },
        },
        detectedService: { kind: 'none' },
      }),
      chooseCurrentConfigAction: vi.fn().mockResolvedValue('create'),
      chooseLegacyConfigAction: vi.fn().mockResolvedValue('migrate'),
      migrateLegacyConfig: vi.fn().mockReturnValue({
        draft: migratedDraft,
        skippedFields: [],
        needsCompletion: true,
        missingFields: ['apiKey'],
      }),
      completeDraft: vi.fn().mockResolvedValue(completedDraft),
    });

    const { runSetup } = await import('./setup');

    await runSetup(deps as any);

    expect(deps.completeDraft).toHaveBeenCalledWith({
      draft: migratedDraft,
      fields: ['apiKey'],
    });
    expect(deps.persistConfig.mock.calls[0][0].config.Router.default).toBe('gpt90_gpt_5_4');
    expect(deps.persistConfig.mock.calls[0][0].config.Router.default).not.toBe('gpt90,gpt-5.4');
  });

  it('does not roll back config or service when entering Claude Code fails', async () => {
    const enterClaudeCode = vi.fn().mockRejectedValue(new Error('claude failed'));
    const { deps } = createDeps({
      enterClaudeCode,
    });

    const { runSetup } = await import('./setup');

    await expect(runSetup(deps as any)).rejects.toThrow('claude failed');
    expect(deps.persistConfig).toHaveBeenCalledTimes(1);
    expect(deps.ensureServiceReady).toHaveBeenCalledTimes(1);
  });
});
