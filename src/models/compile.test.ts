import { beforeEach, describe, expect, it } from 'vitest';
import { buildModelRegistry, compileModelsToProviders, describeCompatibilityProfile, describeDispatchFormat, getCompiledModelRef, getDispatchFormatForProfile, getModelPoolFallbackCandidate, resolveModelReference } from './compile';
import { modelPoolHealthStore } from './pool-health';

describe('model compile', () => {
  beforeEach(() => {
    modelPoolHealthStore.clear();
  });

  it('compiles simplified Models config into internal providers', () => {
    const providers = compileModelsToProviders([
      {
        id: 'sonnet',
        api: 'https://openrouter.ai/api/v1/chat/completions',
        key: 'sk-test',
        interface: 'openai',
        model: 'anthropic/claude-sonnet-4',
      },
      {
        id: 'opus',
        api: 'https://api.anthropic.com/v1/messages',
        key: 'sk-ant',
        interface: 'anthropic',
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
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
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
      interface: 'openai',
      protocol: 'openai',
      compatibilityProfile: 'openai-compatible-anthropic-dispatch',
      dispatchFormat: 'anthropic_messages',
      thinking: {
        mode: 'auto',
      },
      capabilities: {
        thinking: {
          supported: true,
          mode: 'auto',
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
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
      interface: 'openai',
      protocol: 'openai',
      compatibilityProfile: 'openai-compatible-anthropic-dispatch',
      dispatchFormat: 'anthropic_messages',
      capabilities: {
        thinking: {
          supported: true,
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
      },
      source: 'providers',
    });
  });

  it('derives compatibility profiles from endpoint hints and exposes dispatch format', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'gpt90' },
      Models: [
        {
          id: 'gpt90',
          api: 'https://apikey.soxio.me/openai/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'gpt-5.4',
        },
        {
          id: 'qianfan',
          api: 'https://qianfan.baidubce.com/v2/coding/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'glm-5',
        },
        {
          id: 'minimax',
          api: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
          key: 'sk-test',
          interface: 'openai',
          model: 'MiniMax-M2.7-highspeed',
        },
      ],
    } as any);

    expect(registry.modelMap.gpt90?.compatibilityProfile).toBe('openai-compatible-anthropic-dispatch');
    expect(registry.modelMap.gpt90?.dispatchFormat).toBe('anthropic_messages');
    expect(registry.modelMap.qianfan?.compatibilityProfile).toBe('openai-compatible-anthropic-dispatch');
    expect(registry.modelMap.minimax?.compatibilityProfile).toBe('openai-compatible-anthropic-dispatch');
    expect(getDispatchFormatForProfile('openai', 'openai-compatible-anthropic-dispatch')).toBe('anthropic_messages');
  });

  it('describes compatibility profiles and dispatch formats for user-visible explanation layers', () => {
    expect(describeCompatibilityProfile('openai-compatible-anthropic-dispatch')).toEqual(
      expect.objectContaining({
        label: 'OpenAI-compatible / Anthropic dispatch',
      })
    );
    expect(describeDispatchFormat('anthropic_messages')).toEqual(
      expect.objectContaining({
        label: 'Anthropic-style messages',
      })
    );
  });

  it('accepts legacy model field names via alias normalization', () => {
    const providers = compileModelsToProviders([
      {
        id: 'legacy-sonnet',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-legacy',
        protocol: 'openai',
        model: 'anthropic/claude-sonnet-4',
      },
    ]);

    expect(providers[0]).toEqual({
      name: 'model__legacy-sonnet',
      api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
      api_key: 'sk-legacy',
      models: ['anthropic/claude-sonnet-4'],
      transformer: { use: ['openrouter'] },
    });
  });

  it('normalizes thinking aliases before building compiled registry', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'reasoner' },
      Models: [
        {
          id: 'reasoner',
          api: 'https://api.deepseek.com/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'deepseek-reasoner',
          thinking: 'high',
        },
      ],
    } as any);

    expect(registry.modelMap.reasoner?.thinking).toEqual({
      mode: 'on',
      effort: 'high',
    });
    expect(registry.modelMap.reasoner?.capabilities).toEqual({
      thinking: {
        supported: true,
        mode: 'on',
        effort: 'high',
      },
      tools: true,
      images: true,
      systemMessageStyle: 'openai',
    });
  });

  it('builds capability hints from metadata overrides', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'restricted' },
      Models: [
        {
          id: 'restricted',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'vendor/restricted',
          thinking: 'high',
          metadata: {
            supports_reasoning: false,
            supports_tools: false,
            supports_images: false,
          },
        },
      ],
    } as any);

    expect(registry.modelMap.restricted?.capabilities).toEqual({
      thinking: {
        supported: false,
      },
      tools: false,
      images: false,
      systemMessageStyle: 'anthropic',
    });
  });

  it('builds context window capability hints from model metadata', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'long_context' },
      Models: [
        {
          id: 'long_context',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'vendor/long-context',
          metadata: {
            context_window_tokens: 200000,
            safe_input_tokens: 180000,
          },
        },
      ],
    } as any);

    expect(registry.modelMap.long_context?.capabilities).toEqual(
      expect.objectContaining({
        contextWindowTokens: 200000,
        safeInputTokens: 180000,
      })
    );
  });

  it('compiles registration models into priority model pools without changing primary model ids', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://primary.example.com/v1',
          key: 'sk-primary',
          interface: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
      ],
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
    } as any);

    expect(registry.modelMap.sonnet.providerName).toBe('model__sonnet');
    expect(registry.modelMap.sonnet.modelName).toBe('claude-sonnet-4-5');
    expect(registry.modelPools.sonnet).toEqual(
      expect.objectContaining({
        modelId: 'sonnet',
        strategy: 'priority',
        activeEndpointId: 'edge-a',
      })
    );
    expect(registry.modelPools.sonnet.endpoints.map((endpoint) => endpoint.id)).toEqual([
      'edge-a',
      'edge-b',
    ]);
    expect(registry.modelPools.sonnet.endpoints[0]).toEqual(
      expect.objectContaining({
        api: 'https://edge-a.example.com/v1/messages',
        providerName: 'registration__edge-a',
        legacyRef: 'registration__edge-a,claude-sonnet-4-5',
        keyConfigured: true,
        priority: 10,
        enabled: true,
        health: expect.objectContaining({
          status: 'healthy',
          failureCount: 0,
        }),
        source: 'registration',
      })
    );
    expect(registry.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'registration__edge-a',
          api_base_url: 'https://edge-a.example.com/v1/messages',
          models: ['claude-sonnet-4-5'],
        }),
      ])
    );
  });

  it('keeps upstream service linkage and disabled endpoints in compiled model pools', () => {
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
      Registration: {
        enabled: true,
        upstream_services: [
          {
            id: 'edge-a',
            base_url: 'https://edge-a.example.com',
            auth_token: 'router-token',
          },
        ],
        models: [
          {
            id: 'haiku',
            api: 'https://edge-a.example.com/v1',
            key: 'sk-haiku',
            interface: 'openai',
            model: 'anthropic/claude-haiku',
            metadata: {
              upstream_service_id: 'edge-a',
              pool_enabled: false,
            },
          },
          {
            id: 'haiku',
            api: 'https://edge-b.example.com/v1',
            key: 'sk-haiku-b',
            interface: 'openai',
            model: 'anthropic/claude-haiku',
            metadata: {
              upstream_service_id: 'missing-edge',
            },
          },
        ],
      },
    } as any);

    expect(registry.modelPools.haiku.activeEndpointId).toBe('haiku@missing-edge');
    expect(registry.modelPools.haiku.endpoints[0]).toEqual(
      expect.objectContaining({
        id: 'haiku@edge-a',
        upstreamServiceId: 'edge-a',
        upstreamBaseUrl: 'https://edge-a.example.com',
        upstreamAuthConfigured: true,
        enabled: false,
      })
    );
    expect(registry.modelPools.haiku.warnings).toContain(
      'Registration.models[1].metadata.upstream_service_id references missing upstream service "missing-edge".'
    );
  });

  it('exposes cost and rate metadata on registration pool endpoints', () => {
    const registry = buildModelRegistry({
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        models: [
          {
            id: 'sonnet',
            api: 'https://edge-a.example.com/v1',
            key: 'sk-edge-a',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-a',
              cost_per_1m_input_tokens: 3,
              cost_per_1m_output_tokens: 15,
              cost_currency: 'USD',
              rate_limit_rpm: 120,
              rate_limit_tpm: 240000,
            },
          },
        ],
      },
    } as any);

    expect(registry.modelPools.sonnet.endpoints[0]).toEqual(expect.objectContaining({
      cost: {
        inputPer1MTokens: 3,
        outputPer1MTokens: 15,
        currency: 'USD',
      },
      rateLimit: {
        requestsPerMinute: 120,
        tokensPerMinute: 240000,
      },
    }));
  });

  it('resolves registration logical model ids to the active pool endpoint when no primary model exists', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
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
    } as any;

    expect(resolveModelReference(config, 'sonnet')).toBe('registration__edge-a,claude-sonnet-4-5');
    expect(getCompiledModelRef(config, 'sonnet')).toEqual(
      expect.objectContaining({
        providerName: 'registration__edge-a',
        source: 'registration',
        modelPool: {
          modelId: 'sonnet',
          endpointId: 'edge-a',
          strategy: 'priority',
        },
      })
    );
    expect(getCompiledModelRef(config, 'registration__edge-a,claude-sonnet-4-5')).toEqual(
      expect.objectContaining({
        id: 'sonnet',
        source: 'registration',
      })
    );
  });

  it('selects the next enabled model pool endpoint as fallback candidate', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        models: [
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
          {
            id: 'sonnet',
            api: 'https://edge-disabled.example.com/v1',
            key: 'sk-disabled',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-disabled',
              pool_priority: 15,
              pool_enabled: false,
            },
          },
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
        ],
      },
    } as any;

    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'edge-a',
      strategy: 'priority',
    })).toEqual({
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'priority',
      legacyRef: 'registration__edge-b,claude-sonnet-4-5',
      providerName: 'registration__edge-b',
      modelName: 'claude-sonnet-4-5',
    });

    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'priority',
    })).toBeUndefined();
  });

  it('skips cooling endpoints when resolving active pool endpoint and fallback candidate', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        models: [
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
        ],
      },
    } as any;

    modelPoolHealthStore.recordFailure('sonnet', 'edge-a');

    const registry = buildModelRegistry(config);
    expect(registry.modelPools.sonnet.activeEndpointId).toBe('edge-b');
    expect(registry.modelPools.sonnet.endpoints[0].health).toEqual(
      expect.objectContaining({
        status: 'cooldown',
        failureCount: 1,
      })
    );
    expect(resolveModelReference(config, 'sonnet')).toBe('registration__edge-b,claude-sonnet-4-5');
    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'edge-a',
      strategy: 'priority',
    })).toEqual(expect.objectContaining({
      endpointId: 'edge-b',
      legacyRef: 'registration__edge-b,claude-sonnet-4-5',
    }));
  });

  it('uses least-latency registration strategy when endpoints have latency samples', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        strategy: 'least-latency',
        models: [
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
            api: 'https://edge-c.example.com/v1',
            key: 'sk-edge-c',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-c',
              pool_priority: 30,
            },
          },
        ],
      },
    } as any;

    modelPoolHealthStore.recordSuccess('sonnet', 'edge-a', 10_000, 900);
    modelPoolHealthStore.recordSuccess('sonnet', 'edge-b', 10_000, 200);

    const registry = buildModelRegistry(config);
    expect(registry.modelPools.sonnet).toEqual(
      expect.objectContaining({
        strategy: 'least-latency',
        activeEndpointId: 'edge-b',
      })
    );
    expect(resolveModelReference(config, 'sonnet')).toBe('registration__edge-b,claude-sonnet-4-5');
    expect(getCompiledModelRef(config, 'sonnet')?.modelPool).toEqual({
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'least-latency',
    });
    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'least-latency',
    })).toEqual(expect.objectContaining({
      endpointId: 'edge-a',
      legacyRef: 'registration__edge-a,claude-sonnet-4-5',
    }));
  });

  it('falls back to priority order for least-latency pools without latency samples', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        strategy: 'least-latency',
        models: [
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
        ],
      },
    } as any;

    const registry = buildModelRegistry(config);
    expect(registry.modelPools.sonnet.activeEndpointId).toBe('edge-a');
    expect(resolveModelReference(config, 'sonnet')).toBe('registration__edge-a,claude-sonnet-4-5');
  });

  it('uses round-robin strategy by selecting the least used healthy endpoint', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        strategy: 'round-robin',
        models: [
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
        ],
      },
    } as any;

    modelPoolHealthStore.recordSuccess('sonnet', 'edge-a');
    modelPoolHealthStore.recordSuccess('sonnet', 'edge-a');

    expect(buildModelRegistry(config).modelPools.sonnet.activeEndpointId).toBe('edge-b');
    expect(getCompiledModelRef(config, 'sonnet')?.modelPool).toEqual({
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'round-robin',
    });
  });

  it('uses health-aware strategy by preferring lower latency among healthy endpoints', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        strategy: 'health-aware',
        models: [
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
        ],
      },
    } as any;

    modelPoolHealthStore.recordSuccess('sonnet', 'edge-a', 10_000, 800);
    modelPoolHealthStore.recordSuccess('sonnet', 'edge-b', 10_000, 150);

    expect(buildModelRegistry(config).modelPools.sonnet.activeEndpointId).toBe('edge-b');
    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'health-aware',
    })).toEqual(expect.objectContaining({
      endpointId: 'edge-a',
      strategy: 'health-aware',
    }));
  });

  it('uses cost-aware strategy by selecting the lowest declared token cost', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        strategy: 'cost-aware',
        models: [
          {
            id: 'sonnet',
            api: 'https://edge-premium.example.com/v1',
            key: 'sk-premium',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'premium',
              pool_priority: 10,
              cost_per_1m_input_tokens: 3,
              cost_per_1m_output_tokens: 15,
            },
          },
          {
            id: 'sonnet',
            api: 'https://edge-economy.example.com/v1',
            key: 'sk-economy',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'economy',
              pool_priority: 20,
              cost_per_1m_input_tokens: 1,
              cost_per_1m_output_tokens: 5,
            },
          },
        ],
      },
    } as any;

    expect(buildModelRegistry(config).modelPools.sonnet.activeEndpointId).toBe('economy');
    expect(resolveModelReference(config, 'sonnet')).toBe('registration__economy,claude-sonnet-4-5');
    expect(getModelPoolFallbackCandidate(config, {
      modelId: 'sonnet',
      endpointId: 'economy',
      strategy: 'cost-aware',
    })).toEqual(expect.objectContaining({
      endpointId: 'premium',
      strategy: 'cost-aware',
    }));
  });

  it('opens the model pool endpoint circuit after repeated failures', () => {
    const config = {
      Providers: [],
      Router: { default: 'sonnet' },
      Registration: {
        enabled: true,
        models: [
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
        ],
      },
    } as any;

    const now = Date.now();
    modelPoolHealthStore.recordFailure('sonnet', 'edge-a', now);
    modelPoolHealthStore.recordFailure('sonnet', 'edge-a', now + 1_000);
    modelPoolHealthStore.recordFailure('sonnet', 'edge-a', now + 2_000);

    const registry = buildModelRegistry(config);
    expect(registry.modelPools.sonnet.activeEndpointId).toBe('edge-b');
    expect(registry.modelPools.sonnet.endpoints[0].health).toEqual(
      expect.objectContaining({
        status: 'open',
        failureCount: 3,
        circuitOpenUntil: now + 302_000,
      })
    );
    expect(resolveModelReference(config, 'sonnet')).toBe('registration__edge-b,claude-sonnet-4-5');
    expect(modelPoolHealthStore.isEndpointAvailable('sonnet', 'edge-a', now + 3_000)).toBe(false);

    modelPoolHealthStore.recordSuccess('sonnet', 'edge-a', now + 4_000);
    expect(modelPoolHealthStore.getSnapshot('sonnet', 'edge-a', now + 4_000)).toEqual(
      expect.objectContaining({
        status: 'healthy',
        failureCount: 0,
        successCount: 1,
      })
    );
  });
});
