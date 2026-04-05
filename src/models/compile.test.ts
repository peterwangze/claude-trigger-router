import { describe, expect, it } from 'vitest';
import { buildModelRegistry, compileModelsToProviders } from './compile';

describe('model compile', () => {
  it('compiles simplified Models config into internal providers', () => {
    const providers = compileModelsToProviders([
      {
        id: 'sonnet',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        protocol: 'openai',
        model: 'anthropic/claude-sonnet-4',
      },
      {
        id: 'opus',
        api_base_url: 'https://api.anthropic.com/v1/messages',
        api_key: 'sk-ant',
        protocol: 'anthropic',
        model: 'claude-opus-4-1',
      },
    ]);

    expect(providers).toEqual([
      {
        name: 'model__sonnet',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        models: ['anthropic/claude-sonnet-4'],
        transformer: { use: ['openrouter'] },
      },
      {
        name: 'model__opus',
        api_base_url: 'https://api.anthropic.com/v1/messages',
        api_key: 'sk-ant',
        models: ['claude-opus-4-1'],
        transformer: undefined,
      },
    ]);
  });

  it('builds model registry from Models config', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          protocol: 'openai',
          model: 'anthropic/claude-sonnet-4',
          thinking: {
            mode: 'auto',
          },
        },
      ],
    } as any);

    expect(registry.providers[0].name).toBe('model__sonnet');
    expect(registry.modelMap.sonnet).toEqual({
      id: 'sonnet',
      providerName: 'model__sonnet',
      modelName: 'anthropic/claude-sonnet-4',
      protocol: 'openai',
      thinking: {
        mode: 'auto',
      },
      source: 'models',
    });
  });

  it('falls back to legacy Providers config when Models is absent', () => {
    const registry = buildModelRegistry({
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4'],
        },
      ],
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
    } as any);

    expect(registry.providers).toHaveLength(1);
    expect(registry.modelMap['openrouter,anthropic/claude-sonnet-4']).toEqual({
      id: 'openrouter,anthropic/claude-sonnet-4',
      providerName: 'openrouter',
      modelName: 'anthropic/claude-sonnet-4',
      protocol: 'openai',
      source: 'providers',
    });
  });
});
