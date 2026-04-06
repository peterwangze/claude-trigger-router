import { describe, expect, it } from 'vitest';

import { migrateLegacyConfig } from './migrate';

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
      missingFields: ['defaultModel', 'apiKey'],
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
      missingFields: ['defaultModel', 'apiKey'],
    });
  });
});
