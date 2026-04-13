import { describe, expect, it } from 'vitest';

import { migrateLegacyConfig } from './migrate';

const realBaselineLegacyConfig = {
  LOG: false,
  LOG_LEVEL: 'debug',
  CLAUDE_PATH: '',
  HOST: '127.0.0.1',
  PORT: 3456,
  APIKEY: '',
  API_TIMEOUT_MS: '600000',
  PROXY_URL: '',
  transformers: [],
  Providers: [
    {
      name: 'qianfan_coding',
      api_base_url: 'https://example.com/v2/coding/chat/completions',
      api_key: 'sk-fake-1',
      models: ['glm-5', 'kimi-k2.5'],
      transformer: { use: ['enhancetool', 'openai'] },
      headers: {
        Authorization: 'Bearer fake',
      },
    },
    {
      name: 'gpt90',
      api_base_url: 'https://example.com/openai/v1/chat/completions',
      api_key: 'sk-fake-2',
      models: ['gpt-5.4'],
    },
  ],
  StatusLine: {
    enabled: false,
    currentStyle: 'default',
  },
  Router: {
    default: 'gpt90,gpt-5.4',
    background: 'gpt90,gpt-5.4',
    think: 'gpt90,gpt-5.4',
    longContext: 'qianfan_coding,kimi-k2.5',
    longContextThreshold: 60000,
  },
  CUSTOM_ROUTER_PATH: '',
};

describe('migrateLegacyConfig', () => {
  it('migrates a minimal legacy config into a setup draft', () => {
    const result = migrateLegacyConfig({
      providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      default: 'openrouter,anthropic/claude-sonnet-4',
    });

    expect(result).toEqual({
      draft: {
        Providers: [],
        Models: [
          {
            id: 'openrouter_anthropic_claude_sonnet_4',
            api: 'https://openrouter.ai/api/v1/chat/completions',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            key: 'sk-test',
            api_key: 'sk-test',
            interface: 'openai',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
        ],
        Router: {
          default: 'openrouter_anthropic_claude_sonnet_4',
        },
      },
      skippedFields: [],
      needsCompletion: false,
      missingFields: [],
    });
  });

  it('records skipped legacy fields outside the minimal setup draft', () => {
    const result = migrateLegacyConfig({
      providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
          transformer: { use: ['openrouter'] },
        },
      ],
      default: 'openrouter,anthropic/claude-sonnet-4',
      trigger_router: { enabled: true },
    });

    expect(result.skippedFields).toEqual(['providers[0].transformer', 'trigger_router']);
  });

  it('marks migration as incomplete when api_key is missing', () => {
    const result = migrateLegacyConfig({
      providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      default: 'openrouter,anthropic/claude-sonnet-4',
    });

    expect(result.draft.Models?.[0]?.key).toBe('');
    expect(result.draft.Models?.[0]?.api_key).toBe('');
    expect(result.needsCompletion).toBe(true);
    expect(result.missingFields).toEqual(['apiKey']);
  });

  it('marks migration as incomplete when api_base_url is missing', () => {
    const result = migrateLegacyConfig({
      providers: [
        {
          name: 'openrouter',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      default: 'openrouter,anthropic/claude-sonnet-4',
    });

    expect(result.draft.Models?.[0]?.api).toBeUndefined();
    expect(result.draft.Models?.[0]?.api_base_url).toBeUndefined();
    expect(result.needsCompletion).toBe(true);
    expect(result.missingFields).toEqual(['apiBaseUrl']);
  });

  it('marks migration as incomplete when default model is missing', () => {
    const result = migrateLegacyConfig({
      providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
    });

    expect(result.draft.Router).toEqual({});
    expect(result.needsCompletion).toBe(true);
    expect(result.missingFields).toEqual(['defaultModel']);
  });

  it('returns an empty draft instead of throwing when legacy input is not migratable', () => {
    const result = migrateLegacyConfig({
      providers: 'invalid',
      default: 123,
    });

    expect(result).toEqual({
      draft: {
        Providers: [],
        Models: [],
        Router: {},
      },
      skippedFields: [],
      needsCompletion: true,
      missingFields: ['defaultModel', 'apiKey', 'apiBaseUrl'],
    });
  });

  it('returns an empty draft when provider entries are not migratable objects', () => {
    const result = migrateLegacyConfig({
      providers: [null, 'invalid'],
      default: 'openrouter,anthropic/claude-sonnet-4',
    } as any);

    expect(result).toEqual({
      draft: {
        Providers: [],
        Models: [],
        Router: {},
      },
      skippedFields: [],
      needsCompletion: true,
      missingFields: ['defaultModel', 'apiKey', 'apiBaseUrl'],
    });
  });

  it('migrates a sanitized claude-code-router config baseline into module-id-first draft', () => {
    const result = migrateLegacyConfig(realBaselineLegacyConfig as any);

    expect(result.draft.Models).toEqual([
      expect.objectContaining({ id: 'qianfan_coding_glm_5', model: 'glm-5' }),
      expect.objectContaining({ id: 'qianfan_coding_kimi_k2_5', model: 'kimi-k2.5' }),
      expect.objectContaining({ id: 'gpt90_gpt_5_4', model: 'gpt-5.4' }),
    ]);
    expect(result.draft.Router.default).toBe('gpt90_gpt_5_4');
  });

  it('reports unsupported fields from the sanitized claude-code-router baseline', () => {
    const result = migrateLegacyConfig(realBaselineLegacyConfig as any);

    expect(result.skippedFields).toEqual(expect.arrayContaining([
      'Providers[0].transformer',
      'Providers[0].headers',
      'StatusLine',
      'LOG',
      'LOG_LEVEL',
      'CLAUDE_PATH',
      'HOST',
      'PORT',
      'APIKEY',
      'API_TIMEOUT_MS',
      'PROXY_URL',
      'transformers',
      'CUSTOM_ROUTER_PATH',
    ]));
  });

  it('reports unknown top-level legacy fields instead of silently dropping them', () => {
    const result = migrateLegacyConfig({
      ...realBaselineLegacyConfig,
      EXPERIMENTAL_FLAG: true,
    } as any);

    expect(result.skippedFields).toContain('EXPERIMENTAL_FLAG');
  });

  it('reports recognized-but-unconsumed top-level legacy fields instead of silently dropping them', () => {
    const result = migrateLegacyConfig({
      ...realBaselineLegacyConfig,
      providers: [],
      default: 'fallback-provider,fallback-model',
    } as any);

    expect(result.skippedFields).toEqual(expect.arrayContaining(['providers', 'default']));
  });

  it('reports unsupported legacy route extensions when the setup draft has no stable destination', () => {
    const result = migrateLegacyConfig(realBaselineLegacyConfig as any);

    expect(result.skippedFields).toEqual(expect.arrayContaining([
      'Router.background',
      'Router.think',
      'Router.longContext',
      'Router.longContextThreshold',
    ]));
  });

  it('marks defaultModel as missing when legacy default route does not match any migrated model', () => {
    const result = migrateLegacyConfig({
      Providers: [
        {
          name: 'gpt90',
          api_base_url: 'https://example.com/v1/chat/completions',
          api_key: 'sk-fake',
          models: ['gpt-5.4'],
        },
      ],
      Router: {
        default: 'gpt90,gpt-5.5',
      },
    } as any);

    expect(result.draft.Router.default).toBeUndefined();
    expect(result.needsCompletion).toBe(true);
    expect(result.missingFields).toContain('defaultModel');
  });

  it('prefers the usable Providers and Router shape when lowercase providers is present but empty', () => {
    const result = migrateLegacyConfig({
      providers: [],
      default: 'fallback-provider,fallback-model',
      Providers: [
        {
          name: 'gpt90',
          api_base_url: 'https://example.com/v1/chat/completions',
          api_key: 'sk-fake',
          models: ['gpt-5.4'],
        },
      ],
      Router: {
        default: 'gpt90,gpt-5.4',
      },
    } as any);

    expect(result.draft.Models).toEqual([
      expect.objectContaining({ id: 'gpt90_gpt_5_4', model: 'gpt-5.4' }),
    ]);
    expect(result.draft.Router.default).toBe('gpt90_gpt_5_4');
    expect(result.needsCompletion).toBe(false);
    expect(result.skippedFields).toContain('providers');
    expect(result.skippedFields).toContain('default');
  });

  it('maps legacy default routes with surrounding whitespace to the migrated module id', () => {
    const result = migrateLegacyConfig({
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://example.com/v1/chat/completions',
          api_key: 'sk-fake',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      Router: {
        default: ' openrouter , anthropic/claude-sonnet-4 ',
      },
    } as any);

    expect(result.draft.Router.default).toBe('openrouter_anthropic_claude_sonnet_4');
    expect(result.needsCompletion).toBe(false);
    expect(result.missingFields).toEqual([]);
  });
  it("assigns stable suffixes when normalized module ids collide", () => {
    const result = migrateLegacyConfig({
      Providers: [
        { name: 'foo-bar', api_base_url: 'https://example.com/v1/chat/completions', api_key: 'sk-a', models: ['baz/qux'] },
        { name: 'foo_bar', api_base_url: 'https://example.com/v1/chat/completions', api_key: 'sk-b', models: ['baz_qux'] },
      ],
      Router: { default: 'foo_bar,baz_qux' },
    } as any);
    expect(result.draft.Models?.map((item) => item.id)).toEqual(['foo_bar_baz_qux', 'foo_bar_baz_qux_2']);
    expect(result.draft.Router.default).toBe('foo_bar_baz_qux_2');
  });

});
