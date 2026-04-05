import { describe, expect, it } from 'vitest';
import { router } from './index';

describe('router model registry integration', () => {
  const baseRequest = () => ({
    body: {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'hello' }],
      system: [],
      tools: [],
    },
  });

  it('resolves Router.default modelId through compiled Models abstraction', async () => {
    const req = baseRequest();

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'sonnet',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
        ],
        Router: {
          default: 'sonnet',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__sonnet,anthropic/claude-sonnet-4');
  });

  it('resolves think and background routes from modelId', async () => {
    const req = {
      body: {
        model: 'claude-3-5-haiku',
        messages: [{ role: 'user', content: 'hello' }],
        system: [],
        tools: [],
        thinking: { type: 'enabled' },
      },
    };

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'reasoner',
            api_base_url: 'https://api.deepseek.com/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'deepseek-reasoner',
          },
        ],
        Router: {
          default: 'reasoner',
          background: 'reasoner',
          think: 'reasoner',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__reasoner,deepseek-reasoner');
  });

  it('keeps legacy provider,model references working', async () => {
    const req = baseRequest();

    await router(req as any, {} as any, {
      config: {
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
      },
      event: undefined,
    });

    expect(req.body.model).toBe('openrouter,anthropic/claude-sonnet-4');
  });

  it('applies model-level thinking config when selected model enables thinking', async () => {
    const req = baseRequest();

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'reasoner',
            api_base_url: 'https://api.deepseek.com/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'deepseek-reasoner',
            thinking: {
              mode: 'on',
              effort: 'high',
              budget_tokens: 2048,
            },
          },
        ],
        Router: {
          default: 'reasoner',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__reasoner,deepseek-reasoner');
    expect(req.body.thinking).toEqual({
      type: 'enabled',
      effort: 'high',
      budget_tokens: 2048,
    });
  });

  it('removes request thinking when selected model disables thinking', async () => {
    const req = {
      body: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hello' }],
        system: [],
        tools: [],
        thinking: { type: 'enabled', effort: 'high' },
      },
    };

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'fast_model',
            api_base_url: 'https://api.openai.com/v1/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'gpt-4o-mini',
            thinking: {
              mode: 'off',
            },
          },
        ],
        Router: {
          default: 'fast_model',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__fast_model,gpt-4o-mini');
    expect(req.body.thinking).toBeUndefined();
  });
});
