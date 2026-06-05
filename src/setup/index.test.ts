import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it, vi } from 'vitest';

import { readLegacyConfig, runSetupCli } from './index';

describe('readLegacyConfig', () => {
  it('detects legacy config from the claude-code-router path when ccr config is absent', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    const tempHomeDir = mkdtempSync(join(tmpdir(), 'ctr-legacy-yaml-'));
    const legacyDir = join(tempHomeDir, '.claude-code-router');
    const legacyYamlPath = join(legacyDir, 'config.yaml');

    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      legacyYamlPath,
      [
        'providers:',
        '  - name: openrouter',
        '    api_key: sk-test',
        '    api_base_url: https://openrouter.ai/api/v1/chat/completions',
        '    models:',
        '      - anthropic/claude-sonnet-4',
        'default: openrouter,anthropic/claude-sonnet-4',
      ].join('\n'),
      'utf-8'
    );

    try {
      const result = await readLegacyConfig({
        homeDir: tempHomeDir,
      });

      expect(result.kind).toBe('found');
      if (result.kind !== 'found') {
        throw new Error('expected legacy config to be found');
      }

      expect(result.path).toBe(legacyYamlPath);
      expect(result.config).toMatchObject({
        providers: [
          expect.objectContaining({
            name: 'openrouter',
            api_key: 'sk-test',
          }),
        ],
        default: 'openrouter,anthropic/claude-sonnet-4',
      });
    } finally {
      rmSync(tempHomeDir, { recursive: true, force: true });
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });

  it('prefers yaml over json when both legacy claude-code-router configs exist', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    const tempHomeDir = mkdtempSync(join(tmpdir(), 'ctr-legacy-priority-'));
    const legacyDir = join(tempHomeDir, '.claude-code-router');
    const legacyYamlPath = join(legacyDir, 'config.yaml');
    const legacyJsonPath = join(legacyDir, 'config.json');

    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      legacyYamlPath,
      [
        'providers:',
        '  - name: yaml-provider',
        '    api_key: sk-yaml',
        '    api_base_url: https://yaml.example/v1/chat/completions',
        '    models:',
        '      - yaml-model',
        'default: yaml-provider,yaml-model',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      legacyJsonPath,
      JSON.stringify({
        Providers: [
          {
            name: 'json-provider',
            api_key: 'sk-json',
            api_base_url: 'https://json.example/v1/chat/completions',
            models: ['json-model'],
          },
        ],
        Router: {
          default: 'json-provider,json-model',
        },
      }),
      'utf-8'
    );

    try {
      const result = await readLegacyConfig({
        homeDir: tempHomeDir,
      });

      expect(result.kind).toBe('found');
      if (result.kind !== 'found') {
        throw new Error('expected yaml legacy config to be found');
      }

      expect(result.path).toBe(legacyYamlPath);
      expect(result.path).not.toBe(legacyJsonPath);
      expect(result.config).toMatchObject({
        providers: [expect.objectContaining({ name: 'yaml-provider' })],
        default: 'yaml-provider,yaml-model',
      });
    } finally {
      rmSync(tempHomeDir, { recursive: true, force: true });
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });

  it('returns read_error with json path and message when legacy json cannot be parsed', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    const tempHomeDir = mkdtempSync(join(tmpdir(), 'ctr-legacy-json-read-error-'));
    const legacyDir = join(tempHomeDir, '.claude-code-router');
    const legacyJsonPath = join(legacyDir, 'config.json');

    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(legacyJsonPath, '{ invalid json,,,', 'utf-8');

    try {
      const result = await readLegacyConfig({
        homeDir: tempHomeDir,
      });

      expect(result).toEqual({
        kind: 'read_error',
        path: legacyJsonPath,
        error: expect.any(String),
      });
      if (result.kind !== 'read_error') {
        throw new Error('expected legacy config read error');
      }

      expect(result.error.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempHomeDir, { recursive: true, force: true });
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });

  it('discovers the default claude-code-router json path and parses trailing commas through the production parser path', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    const tempHomeDir = mkdtempSync(join(tmpdir(), 'ctr-legacy-json-'));
    const legacyDir = join(tempHomeDir, '.claude-code-router');
    const legacyJsonPath = join(legacyDir, 'config.json');

    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      legacyJsonPath,
      `{
  "LOG": false,
  "HOST": "127.0.0.1",
  "PORT": 3456,
  "API_TIMEOUT_MS": 300000,
  "Providers": [
    {
      "name": "fake-openrouter",
      "api_base_url": "https://example.invalid/v1/chat/completions",
      "api_key": "sk-fake-openrouter",
      "models": [
        "anthropic/claude-sonnet-4",
      ],
    },
  ],
  "Router": {
    "default": "fake-openrouter,anthropic/claude-sonnet-4",
    "background": "fake-openrouter,anthropic/claude-sonnet-4",
    "think": "fake-openrouter,anthropic/claude-sonnet-4",
    "longContext": "fake-openrouter,anthropic/claude-sonnet-4",
    "webSearch": "fake-openrouter,anthropic/claude-sonnet-4",
  },
}`,
      'utf-8'
    );

    try {
      const result = await readLegacyConfig({
        homeDir: tempHomeDir,
      });

      expect(result.kind).toBe('found');
      if (result.kind !== 'found') {
        throw new Error('expected legacy config to be found');
      }

      expect(result.path).toBe(legacyJsonPath);
      expect(result.config).toMatchObject({
        LOG: false,
        HOST: '127.0.0.1',
        PORT: 3456,
        Providers: [
          expect.objectContaining({
            name: 'fake-openrouter',
            api_key: 'sk-fake-openrouter',
            models: ['anthropic/claude-sonnet-4'],
          }),
        ],
        Router: expect.objectContaining({
          default: 'fake-openrouter,anthropic/claude-sonnet-4',
        }),
      });
    } finally {
      rmSync(tempHomeDir, { recursive: true, force: true });
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });
});

describe('runSetupCli', () => {
  it('creates a minimal config and prints next steps without auto-entering Claude Code on first use', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('sonnet')
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
    expect(io.input).toHaveBeenNthCalledWith(1, '默认模型的 model id（Router.default 会引用它）', 'sonnet');
    expect(io.choose).toHaveBeenNthCalledWith(1, '当前要本地使用、连接远程服务，还是部署为远程服务端？', ['本地使用（推荐）', '连接远程服务', '部署为远程服务端']);
    expect(io.choose).toHaveBeenNthCalledWith(2, '这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
    expect(io.choose).toHaveBeenNthCalledWith(3, '选择接入预设', expect.any(Array));
    expect(io.choose).toHaveBeenNthCalledWith(4, '现在要不要继续添加一个“复杂任务专用模型”？', ['先不添加', '添加一个复杂任务专用模型']);
    expect(io.input).toHaveBeenNthCalledWith(2, '接入名称（用于预设识别，不是 Models[].id）', 'openrouter');
    expect(io.input).toHaveBeenNthCalledWith(3, 'API URL（留空使用预设，写入 Models[].api）', '');
    expect(io.input).toHaveBeenNthCalledWith(4, 'API Key（写入 Models[].key）');
    expect(io.input).toHaveBeenNthCalledWith(5, '上游模型名（写入 Models[].model）', 'anthropic/claude-sonnet-4');
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('本地使用者：先跑通 Models + Router.default'));
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).not.toHaveBeenCalled();
    expect(io.info).toHaveBeenCalledWith('本地代理已启动并通过健康检查。日常使用运行：ctr code');
    expect(io.info).toHaveBeenCalledWith('你可以按需继续配置路由能力：');
    expect(io.info).toHaveBeenCalledWith(
      '  - 先运行 ctr doctor --route-preview --route-text "你的请求"，确认本次会命中哪个槽位或 SmartRouter 路径'
    );
    expect(io.info).toHaveBeenCalledWith(
      '  - 基础路由顺序：显式上游模型 -> longContext -> background -> think -> webSearch -> default'
    );
    expect(io.info).toHaveBeenCalledWith(
      '  - 基础路由模板：复制 config/trigger.routing.yaml 中的 Router.default/think/longContext/background/webSearch，再把值改成你的 Models[].id'
    );
    expect(io.info).toHaveBeenCalledWith(
      '  - 槽位验证：用 --route-thinking、--route-web-search、--route-tokens 和 --route-model 分别预演 think、webSearch、longContext 和 background'
    );
    expect(io.info).toHaveBeenCalledWith(
      '  - SmartRouter.rules：适合高确定性任务，把架构设计、代码审查等请求固定切到指定模型'
    );
    expect(io.info).toHaveBeenCalledWith(
      '  - SmartRouter candidates：适合模糊任务，在候选模型之间自动选择更合适的模型'
    );
    expect(io.info).toHaveBeenCalledWith('  - SmartRouter 起步模板：config/trigger.smart-router.yaml；多候选高级模板：config/trigger.smart-router.advanced.yaml');
    expect(io.info).toHaveBeenCalledWith('为避免 setup 结束后接管当前终端，请手动运行：ctr code');
    expect(io.info).toHaveBeenCalledWith(
      '如果你明确需要 setup 结束后自动进入 Claude Code，可设置环境变量 CTR_SETUP_AUTO_ENTER_CODE=1'
    );
  });

  it('creates a remote-service client draft before asking provider questions', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('连接远程服务'),
      input: vi
        .fn()
        .mockResolvedValueOnce('https://router.example.com/')
        .mockResolvedValueOnce('remote-token'),
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

    expect(io.choose).toHaveBeenNthCalledWith(1, '当前要本地使用、连接远程服务，还是部署为远程服务端？', ['本地使用（推荐）', '连接远程服务', '部署为远程服务端']);
    expect(io.input).toHaveBeenNthCalledWith(1, '远程服务 URL');
    expect(io.input).toHaveBeenNthCalledWith(2, '远程服务 Auth Token（可选）', '${CTR_REMOTE_AUTH_TOKEN}');
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('远程使用者：拿到服务地址和 managed client + read-only key'));
    expect(io.info).toHaveBeenCalledWith('如果你其实要把本机部署成服务端，请重新运行 setup 选择“部署为远程服务端”，或运行：ctr deploy init --target server');
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('服务维护者：用 ctr deploy init --target server 生成 server 配置'));
    expect(io.input).not.toHaveBeenCalledWith('默认模型的 model id（Router.default 会引用它）', 'sonnet');
    expect(io.choose).not.toHaveBeenCalledWith('这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Runtime: expect.objectContaining({
          mode: 'local',
          remote_service: {
            enabled: true,
            base_url: 'https://router.example.com',
            auth_token: 'remote-token',
          },
          security: expect.objectContaining({
            public_host_requires_auth: true,
            recommended_client_scopes: ['client', 'read-only'],
          }),
        }),
        Providers: [],
        Router: {
          default: '',
        },
      })
    );
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).not.toHaveBeenCalled();
    expect(io.info).toHaveBeenCalledWith('本地代理已启动并通过健康检查。远程服务连接配置已保存，可用于本地代理转发和检查远端 ready/status。');
    expect(io.info).toHaveBeenCalledWith('下一步：运行 ctr doctor 或 ctr status 查看本地代理与远程服务 ready 状态。');
    expect(io.info).toHaveBeenCalledWith('日常使用：运行 ctr code，Claude Code 会连接本地 ctr，并由本地 ctr 转发模型调用到远端服务。');
    expect(io.info).toHaveBeenCalledWith('可选直连远端服务时，再按服务维护者提供的 ANTHROPIC_BASE_URL 和 ANTHROPIC_AUTH_TOKEN 配置 Claude Code。');
    expect(io.info).toHaveBeenCalledWith('如果远端不可用，请确认 Runtime.remote_service.base_url 和 managed client + read-only key。');
    expect(io.info).not.toHaveBeenCalledWith('你可以按需继续配置路由能力：');
    expect(io.info).not.toHaveBeenCalledWith('为避免 setup 结束后接管当前终端，请手动运行：ctr code');
  });

  it('creates a server deployment profile without auto-starting from fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('部署为远程服务端'),
      input: vi.fn(),
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

    expect(io.choose).toHaveBeenNthCalledWith(1, '当前要本地使用、连接远程服务，还是部署为远程服务端？', ['本地使用（推荐）', '连接远程服务', '部署为远程服务端']);
    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        HOST: '0.0.0.0',
        APIKEY: expect.stringMatching(/^ctr_bootstrap_/),
        Runtime: expect.objectContaining({
          mode: 'server',
        }),
        Models: [
          expect.objectContaining({
            id: 'sonnet',
            key: 'sk-xxx',
          }),
        ],
        Router: {
          default: 'sonnet',
        },
      })
    );
    expect(io.input).not.toHaveBeenCalled();
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('服务维护者：用 ctr deploy init --target server 生成 server 配置'));
    expect(io.info).toHaveBeenCalledWith('setup 将生成 server profile 和 bootstrap admin APIKEY，但不会自动启动服务。');
    expect(io.info).toHaveBeenCalledWith('已生成 server 部署配置；setup 不会自动启动远程服务。');
    expect(io.info).toHaveBeenCalledWith('下一步：确认 Models[].id/api/key/interface/model，按需补 thinking/metadata；然后运行 ctr doctor && ctr start --daemon。');
    expect(executeStart).not.toHaveBeenCalled();
    expect(verifyHealth).not.toHaveBeenCalled();
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('does not silently fall back to json when higher-priority yaml exists but cannot be parsed', async () => {
    const previousOverride = process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    const tempHomeDir = mkdtempSync(join(tmpdir(), 'ctr-legacy-yaml-read-error-priority-'));
    const legacyDir = join(tempHomeDir, '.claude-code-router');
    const legacyYamlPath = join(legacyDir, 'config.yaml');
    const legacyJsonPath = join(legacyDir, 'config.json');

    delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(legacyYamlPath, 'providers:\n\t- bad: yaml\n', 'utf-8');
    writeFileSync(
      legacyJsonPath,
      JSON.stringify({
        Providers: [
          {
            name: 'json-provider',
            api_key: 'sk-json',
            api_base_url: 'https://json.example/v1/chat/completions',
            models: ['json-model'],
          },
        ],
        Router: {
          default: 'json-provider,json-model',
        },
      }),
      'utf-8'
    );

    try {
      const result = await readLegacyConfig({
        homeDir: tempHomeDir,
      });

      expect(result).toEqual({
        kind: 'read_error',
        path: legacyYamlPath,
        error: expect.any(String),
      });
      if (result.kind !== 'read_error') {
        throw new Error('expected yaml legacy config read error');
      }
      expect(result.path).not.toBe(legacyJsonPath);
    } finally {
      rmSync(tempHomeDir, { recursive: true, force: true });
      if (previousOverride) {
        process.env.CTR_SETUP_LEGACY_CONFIG_PATH = previousOverride;
      } else {
        delete process.env.CTR_SETUP_LEGACY_CONFIG_PATH;
      }
    }
  });

  it('supports guided capability hints during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('配置 capability 提示')
        .mockResolvedValueOnce('编辑 capability')
        .mockResolvedValueOnce('禁用')
        .mockResolvedValueOnce('禁用')
        .mockResolvedValueOnce('支持'),
      input: vi
        .fn()
        .mockResolvedValueOnce('sonnet')
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

  it('can scaffold a complex-task SmartRouter profile during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('添加一个复杂任务专用模型')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('deepseek')
        .mockResolvedValueOnce('开启复杂任务规则 + 智能兜底')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('sonnet')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-main')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4')
        .mockResolvedValueOnce('reasoner')
        .mockResolvedValueOnce('deepseek')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-reasoner')
        .mockResolvedValueOnce('deepseek-reasoner'),
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
          expect.objectContaining({ id: 'sonnet', model: 'anthropic/claude-sonnet-4' }),
          expect.objectContaining({ id: 'reasoner', model: 'deepseek-reasoner' }),
        ],
        Router: {
          default: 'sonnet',
        },
        SmartRouter: expect.objectContaining({
          enabled: true,
          router_model: 'sonnet',
          candidates: [
            expect.objectContaining({ model: 'sonnet' }),
            expect.objectContaining({ model: 'reasoner' }),
          ],
          rules: expect.arrayContaining([
            expect.objectContaining({ name: 'architecture', model: 'reasoner' }),
            expect.objectContaining({ name: 'code_review', model: 'reasoner' }),
            expect.objectContaining({ name: 'deep_reasoning', model: 'reasoner' }),
          ]),
        }),
      })
    );
    expect(io.info).toHaveBeenCalledWith(
      '已为你生成 SmartRouter 路由模板，默认模型仍是 sonnet，复杂任务会优先使用 reasoner。'
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
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('anthropic')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('sonnet')
        .mockResolvedValueOnce('anthropic')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-ant')
        .mockResolvedValueOnce('claude-sonnet-4-5'),
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
    expect(io.choose).toHaveBeenNthCalledWith(1, '当前要本地使用、连接远程服务，还是部署为远程服务端？', ['本地使用（推荐）', '连接远程服务', '部署为远程服务端']);
    expect(io.choose).toHaveBeenNthCalledWith(2, '这个模型接到哪里？', ['使用常见接入模板', '手动填写接口']);
    expect(io.choose).toHaveBeenNthCalledWith(3, '选择接入预设', expect.any(Array));
    expect(io.input).toHaveBeenNthCalledWith(1, '默认模型的 model id（Router.default 会引用它）', 'sonnet');
    expect(io.input).toHaveBeenNthCalledWith(2, '接入名称（用于预设识别，不是 Models[].id）', 'anthropic');
    expect(io.input).toHaveBeenNthCalledWith(3, 'API URL（留空使用预设，写入 Models[].api）', '');
    expect(io.input).toHaveBeenNthCalledWith(4, 'API Key（写入 Models[].key）');
    expect(io.input).toHaveBeenNthCalledWith(5, '上游模型名（写入 Models[].model）', 'claude-sonnet-4-5');
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(verifyHealth).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('normalizes bare openai-compatible base urls during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('手动填写接口')
        .mockResolvedValueOnce('openai')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('local_model')
        .mockResolvedValueOnce('local-openai')
        .mockResolvedValueOnce('http://127.0.0.1:11434/v1')
        .mockResolvedValueOnce('sk-local')
        .mockResolvedValueOnce('gpt-4.1'),
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
            id: 'local_model',
            api: 'http://127.0.0.1:11434/v1/chat/completions',
            api_base_url: 'http://127.0.0.1:11434/v1/chat/completions',
            interface: 'openai',
            model: 'gpt-4.1',
          }),
        ],
      })
    );
    expect(io.choose).toHaveBeenNthCalledWith(3, '接口类型（写入 Models[].interface）', ['openai', 'anthropic']);
    expect(io.input).toHaveBeenNthCalledWith(1, '默认模型的 model id（Router.default 会引用它）', 'sonnet');
    expect(io.input).toHaveBeenNthCalledWith(2, '接入名称（用于预设识别，不是 Models[].id）', 'provider');
    expect(io.input).toHaveBeenNthCalledWith(3, 'API URL（写入 Models[].api）');
    expect(io.input).toHaveBeenNthCalledWith(4, 'API Key（写入 Models[].key）');
    expect(io.input).toHaveBeenNthCalledWith(5, '上游模型名（写入 Models[].model）', '');
  });

  it('normalizes bare anthropic base urls during fresh setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('手动填写接口')
        .mockResolvedValueOnce('anthropic')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('claude_local')
        .mockResolvedValueOnce('anthropic-local')
        .mockResolvedValueOnce('https://api.anthropic.com')
        .mockResolvedValueOnce('sk-ant-local')
        .mockResolvedValueOnce('claude-sonnet-4-5'),
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
            id: 'claude_local',
            api: 'https://api.anthropic.com/v1/messages',
            api_base_url: 'https://api.anthropic.com/v1/messages',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
          }),
        ],
      })
    );
    expect(io.choose).toHaveBeenNthCalledWith(3, '接口类型（写入 Models[].interface）', ['openai', 'anthropic']);
    expect(io.input).toHaveBeenNthCalledWith(1, '默认模型的 model id（Router.default 会引用它）', 'sonnet');
    expect(io.input).toHaveBeenNthCalledWith(2, '接入名称（用于预设识别，不是 Models[].id）', 'provider');
    expect(io.input).toHaveBeenNthCalledWith(3, 'API URL（写入 Models[].api）');
    expect(io.input).toHaveBeenNthCalledWith(4, 'API Key（写入 Models[].key）');
    expect(io.input).toHaveBeenNthCalledWith(5, '上游模型名（写入 Models[].model）', '');
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
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
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
    expect(enterClaudeCode).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce('本地使用（推荐）')
        .mockResolvedValueOnce('使用常见接入模板')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('先不添加')
        .mockResolvedValueOnce('保持默认'),
      input: vi
        .fn()
        .mockResolvedValueOnce('sonnet')
        .mockResolvedValueOnce('openrouter')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('sk-test')
        .mockResolvedValueOnce('anthropic/claude-sonnet-4'),
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
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
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
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('offers legacy migration after abandoning a valid current config when claude-code-router config exists', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const executeStart = vi.fn().mockResolvedValue(undefined);
    const verifyHealth = vi.fn().mockResolvedValue(true);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('放弃当前配置，重新开始')
        .mockResolvedValueOnce('迁移旧配置（推荐）'),
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
      readLegacyConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/tmp/.claude-code-router/config.json',
        config: {
          Providers: [
            {
              name: 'gpt90',
              api_key: 'sk-test',
              api_base_url: 'https://example.com/openai/v1/chat/completions',
              models: ['gpt-5.4'],
            },
          ],
          Router: {
            default: 'gpt90,gpt-5.4',
          },
        },
      }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/config.backup.yaml'),
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
    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            id: 'gpt90_gpt_5_4',
            api_key: 'sk-test',
            api_base_url: 'https://example.com/openai/v1/chat/completions',
            model: 'gpt-5.4',
          }),
        ],
        Router: {
          default: 'gpt90_gpt_5_4',
        },
      })
    );
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('persists supported legacy top-level fields and router slots during claude-code-router migration', async () => {
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
        path: '/tmp/.claude-code-router/config.json',
        config: {
          LOG: false,
          LOG_LEVEL: 'debug',
          HOST: '127.0.0.1',
          PORT: 3456,
          API_TIMEOUT_MS: '600000',
          Providers: [
            {
              name: 'gpt90',
              api_key: 'sk-test',
              api_base_url: 'https://example.com/openai/v1/chat/completions',
              models: ['gpt-5.4'],
            },
            {
              name: 'qianfan_coding',
              api_key: 'sk-qianfan',
              api_base_url: 'https://example.com/qianfan/v1/chat/completions',
              models: ['glm-5'],
            },
          ],
          Router: {
            default: 'gpt90,gpt-5.4',
            background: 'gpt90,gpt-5.4',
            think: 'gpt90,gpt-5.4',
            longContext: 'qianfan_coding,glm-5',
            longContextThreshold: 60000,
            webSearch: 'qianfan_coding,glm-5',
          },
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

    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        LOG: false,
        LOG_LEVEL: 'debug',
        HOST: '127.0.0.1',
        PORT: 3456,
        API_TIMEOUT_MS: 600000,
        Router: {
          default: 'gpt90_gpt_5_4',
          background: 'gpt90_gpt_5_4',
          think: 'gpt90_gpt_5_4',
          longContext: 'qianfan_coding_glm_5',
          longContextThreshold: 60000,
          webSearch: 'qianfan_coding_glm_5',
        },
      })
    );
    expect(executeStart).toHaveBeenCalledTimes(1);
    expect(enterClaudeCode).not.toHaveBeenCalled();
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
    expect(enterClaudeCode).not.toHaveBeenCalled();
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
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
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
    expect(enterClaudeCode).not.toHaveBeenCalled();
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
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
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
      '当前配置提示：[warning] Models[0].thinking: Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking. Action: Remove the thinking setting for this model, or change metadata.supports_reasoning to true only if the endpoint supports reasoning.'
    );
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('supports capability repair prompts across draft models during setup repair flow', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);

    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('repair')
        .mockResolvedValueOnce('移除 thinking（推荐）'),
      input: vi
        .fn()
        .mockResolvedValueOnce('vendor/restricted'),
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
            thinking: undefined,
            metadata: {
              supports_reasoning: false,
            },
          }),
          expect.objectContaining({
            id: 'balanced',
            model: 'gpt-5-mini',
          }),
        ],
      })
    );
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('supports quick fixes for warning-only current configs during setup', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('快速修正配置提示')
        .mockResolvedValueOnce('移除 thinking（推荐）')
        .mockResolvedValueOnce('恢复默认工具支持（推荐）')
        .mockResolvedValueOnce('恢复默认图片支持（推荐）'),
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
                supports_tools: false,
                supports_images: false,
              },
            },
          ],
          Router: {
            default: 'restricted',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/config.backup.yaml'),
      writeConfig,
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io,
    });

    expect(io.choose).toHaveBeenCalledWith(
      '你想直接使用它，还是重新调整？',
      ['直接使用当前配置（推荐）', '快速修正配置提示', '检查并调整当前配置', '放弃当前配置，重新开始']
    );
    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            id: 'restricted',
            thinking: undefined,
            metadata: {
              supports_reasoning: false,
            },
          }),
        ],
      })
    );
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('clears existing capability flags when quick-fix edit chooses defaults', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const enterClaudeCode = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi
        .fn()
        .mockResolvedValueOnce('快速修正配置提示')
        .mockResolvedValueOnce('编辑 capability')
        .mockResolvedValueOnce('默认')
        .mockResolvedValueOnce('默认')
        .mockResolvedValueOnce('默认'),
      input: vi.fn().mockResolvedValueOnce(''),
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
              metadata: {
                supports_tools: false,
                supports_images: false,
              },
            },
          ],
          Router: {
            default: 'restricted',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 5678 }),
      backupCurrentConfig: vi.fn().mockResolvedValue('/tmp/config.backup.yaml'),
      writeConfig,
      executeStart: vi.fn().mockResolvedValue(undefined),
      executeReload: vi.fn().mockResolvedValue(undefined),
      executeRestart: vi.fn().mockResolvedValue(undefined),
      verifyHealth: vi.fn().mockResolvedValue(true),
      enterClaudeCode,
      io,
    });

    expect(io.choose).not.toHaveBeenCalledWith(
      '如何处理模型 restricted 的 image fallback？',
      ['恢复默认图片支持（推荐）', '接受文本降级', '编辑 capability']
    );
    expect(writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        Models: [
          expect.objectContaining({
            id: 'restricted',
            metadata: undefined,
          }),
        ],
      })
    );
    expect(enterClaudeCode).not.toHaveBeenCalled();
  });

  it('surfaces a friendlier message when setup restart health check still fails', async () => {
    const writeConfig = vi.fn().mockResolvedValue(undefined);
    const io = {
      choose: vi.fn().mockResolvedValueOnce('迁移旧配置（推荐）'),
      input: vi.fn(),
      info: vi.fn(),
    };

    await expect(
      runSetupCli({
        readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
        readLegacyConfig: vi.fn().mockResolvedValue({
          kind: 'found',
          path: '/tmp/.claude-code-router/config.json',
          config: {
            Providers: [
              {
                name: 'gpt90',
                api_key: 'sk-test',
                api_base_url: 'https://example.com/openai/v1/chat/completions',
                models: ['gpt-5.4'],
              },
            ],
            Router: {
              default: 'gpt90,gpt-5.4',
            },
          },
        }),
        probeService: vi
          .fn()
          .mockResolvedValueOnce({ kind: 'self_healthy', port: 5678 })
          .mockResolvedValueOnce({ kind: 'self_healthy', port: 5678 }),
        backupCurrentConfig: vi.fn().mockResolvedValue(null),
        writeConfig,
        executeStart: vi.fn().mockResolvedValue(undefined),
        executeReload: vi.fn().mockResolvedValue(undefined),
        executeRestart: vi.fn().mockResolvedValue(undefined),
        verifyHealth: vi.fn().mockResolvedValue(false),
        enterClaudeCode: vi.fn().mockResolvedValue(undefined),
        io,
      })
    ).rejects.toThrow('service health check failed after restart');
  });
});

