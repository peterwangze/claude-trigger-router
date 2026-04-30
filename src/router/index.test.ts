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

  it('routes registration logical model ids to the active pool endpoint and marks trace reason', async () => {
    const req = {
      ...baseRequest(),
      governanceTrace: {
        requestId: 'req-1',
        routeReason: [],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: Date.now(),
      },
    };

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Registration: {
          enabled: true,
          models: [
            {
              id: 'sonnet',
              api: 'https://edge-b.example.com/v1',
              key: 'sk-edge-b',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
              metadata: {
                pool_endpoint_id: 'edge-b',
                pool_priority: 20,
              },
            },
            {
              id: 'sonnet',
              api: 'https://edge-a.example.com/v1',
              key: 'sk-edge-a',
              interface: 'anthropic',
              model: 'claude-sonnet-4-5',
              metadata: {
                pool_endpoint_id: 'edge-a',
                pool_priority: 10,
              },
            },
          ],
        },
        Router: {
          default: 'sonnet',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('registration__edge-a,claude-sonnet-4-5');
    expect(req.modelPoolSelection).toEqual({
      modelId: 'sonnet',
      endpointId: 'edge-a',
      strategy: 'priority',
    });
    expect(req.governanceTrace.finalModel).toBe('registration__edge-a,claude-sonnet-4-5');
    expect(req.governanceTrace.routeReason).toContain('model_pool:sonnet:edge-a');
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

  it('falls back to Router.longContext when the selected model cannot fit the request context', async () => {
    const req = {
      body: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hello hello hello hello hello' }],
        system: [],
        tools: [],
        max_tokens: 8,
      },
      governanceTrace: {
        requestId: 'req-context-1',
        routeReason: [],
        stickyHit: false,
        alignmentUsed: false,
        cascadeTriggered: false,
        shadowChecked: false,
        startedAt: Date.now(),
      },
    };

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'small',
            api: 'https://api.example.com/v1/messages',
            key: 'sk-small',
            interface: 'anthropic',
            model: 'vendor/small',
            metadata: {
              safe_input_tokens: 1,
              context_window_tokens: 16,
            },
          },
          {
            id: 'long',
            api: 'https://api.example.com/v1/messages',
            key: 'sk-long',
            interface: 'anthropic',
            model: 'vendor/long',
            metadata: {
              safe_input_tokens: 1000,
              context_window_tokens: 2000,
            },
          },
        ],
        Router: {
          default: 'small',
          longContext: 'long',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__long,vendor/long');
    expect(req.contextWindowExceeded).toBeUndefined();
    expect(req.governanceTrace.routeReason).toContain('context_window_fallback:small->long');
  });

  it('marks context overflow when no configured model can safely handle the request', async () => {
    const req = {
      body: {
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'hello hello hello hello hello' }],
        system: [],
        tools: [],
        max_tokens: 8,
      },
    };

    await router(req as any, {} as any, {
      config: {
        Providers: [],
        Models: [
          {
            id: 'small',
            api: 'https://api.example.com/v1/messages',
            key: 'sk-small',
            interface: 'anthropic',
            model: 'vendor/small',
            metadata: {
              safe_input_tokens: 1,
              context_window_tokens: 16,
            },
          },
        ],
        Router: {
          default: 'small',
        },
      },
      event: undefined,
    });

    expect(req.body.model).toBe('model__small,vendor/small');
    expect(req.contextWindowExceeded).toEqual(
      expect.objectContaining({
        code: 'safe_input_exceeded',
        model: 'small',
        limit: 1,
      })
    );
  });
});
