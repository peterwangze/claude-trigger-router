import { describe, expect, it } from 'vitest';
import { normalizeAndValidateConfig } from './config';

describe('normalizeAndValidateConfig governance', () => {
  const baseConfig = {
    Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
    Providers: [
      {
        name: 'openrouter',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        models: [
          'anthropic/claude-sonnet-4',
          'anthropic/claude-opus-4',
        ],
      },
      {
        name: 'glm',
        api_base_url: 'https://example.com/glm',
        api_key: 'glm-key',
        models: ['glm-5-mini', 'glm-5-air'],
      },
    ],
  };

  it('does not persist Governance defaults when not configured', () => {
    const result = normalizeAndValidateConfig(baseConfig);

    expect(result.errors).toEqual([]);
    expect(result.config).not.toHaveProperty('Governance');
  });

  it('keeps local Runtime defaults implicit when Runtime is not configured', () => {
    const result = normalizeAndValidateConfig(baseConfig);

    expect(result.errors).toEqual([]);
    expect(result.config).not.toHaveProperty('Runtime');
    expect(result.config).not.toHaveProperty('Registration');
  });

  it('accepts Runtime mode as local, server, or cloud', () => {
    (['local', 'server', 'cloud'] as const).forEach((mode) => {
      const result = normalizeAndValidateConfig({
        ...baseConfig,
        Runtime: { mode },
      });

      expect(result.errors).toEqual([]);
      expect(result.config.Runtime?.mode).toBe(mode);
    });
  });

  it('normalizes remote service and registration config without breaking local defaults', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Runtime: {
        mode: 'server',
        remote_service: {
          enabled: true,
          base_url: 'https://router.example.com',
        },
      },
      Registration: {
        enabled: true,
        upstream_services: [
          {
            id: 'edge-router',
            base_url: 'https://edge.example.com',
          },
        ],
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Runtime).toEqual(expect.objectContaining({
      mode: 'server',
      remote_service: {
        enabled: true,
        base_url: 'https://router.example.com',
        auth_token: '',
      },
      security: expect.objectContaining({
        public_host_requires_auth: true,
        recommended_client_scopes: ['client', 'read-only'],
      }),
    }));
    expect(result.config.Registration).toEqual({
      enabled: true,
      strategy: 'priority',
      models: [],
      upstream_services: [
        {
          id: 'edge-router',
          base_url: 'https://edge.example.com',
        },
      ],
    });
  });

  it('normalizes minimal registration model and upstream service payloads', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        models: [
          {
            id: ' edge-sonnet ',
            api: ' https://api.example.com/v1 ',
            key: ' sk-registration ',
            interface: 'anthropic',
            model: ' claude-sonnet-4-5 ',
          },
        ],
        upstream_services: [
          {
            id: ' edge-router ',
            base_url: ' https://edge.example.com/ ',
            auth_token: ' remote-token ',
          },
        ],
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Registration?.models?.[0]).toEqual(
      expect.objectContaining({
        id: 'edge-sonnet',
        api: 'https://api.example.com/v1/messages',
        api_base_url: 'https://api.example.com/v1/messages',
        key: 'sk-registration',
        api_key: 'sk-registration',
        interface: 'anthropic',
        protocol: 'anthropic',
        model: 'claude-sonnet-4-5',
      })
    );
    expect(result.config.Registration?.upstream_services).toEqual([
      {
        id: 'edge-router',
        base_url: 'https://edge.example.com',
        auth_token: 'remote-token',
      },
    ]);
  });

  it('accepts explicit registration pool strategy and rejects unsupported values', () => {
    const valid = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        strategy: 'least-latency',
      },
    });
    expect(valid.errors).toEqual([]);
    expect(valid.config.Registration?.strategy).toBe('least-latency');

    const invalid = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        strategy: 'round-robin',
      },
    } as any);
    expect(invalid.errors).toContain('Registration.strategy must be one of "priority", "least-latency"');
  });

  it('allows duplicate Registration model ids for logical model pools', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
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
              pool_endpoint_id: 'sonnet-edge-a',
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
              pool_endpoint_id: 'sonnet-edge-b',
              pool_priority: 20,
            },
          },
        ],
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Registration?.models?.map((item) => item.id)).toEqual([
      'sonnet',
      'sonnet',
    ]);
  });

  it('validates registration model entries with the same minimal model contract', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        models: [
          {
            id: '',
            api: '',
            key: '',
            interface: 'invalid' as any,
            model: '',
          },
        ],
      },
    });

    expect(result.errors).toContain('Registration.models[0].id is required');
    expect(result.errors).toContain('Registration.models[0].api is required');
    expect(result.errors).toContain('Registration.models[0].key is required');
    expect(result.errors).toContain('Registration.models[0].interface must be either "openai" or "anthropic"');
    expect(result.errors).toContain('Registration.models[0].model is required');
  });

  it('reports malformed registration payload fields instead of throwing', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        models: [
          {
            id: 123,
            api: 456,
            key: 789,
            interface: 123,
            model: false,
          },
        ],
        upstream_services: [
          {
            id: 123,
            base_url: 456,
            auth_token: 789,
          },
        ],
      } as any,
    });

    expect(result.errors).toContain('Registration.models[0].id is required');
    expect(result.errors).toContain('Registration.models[0].api is required');
    expect(result.errors).toContain('Registration.models[0].key is required');
    expect(result.errors).toContain('Registration.models[0].interface is required');
    expect(result.errors).toContain('Registration.models[0].model is required');
    expect(result.errors).toContain('Registration.upstream_services[0].id is required');
    expect(result.errors).toContain('Registration.upstream_services[0].base_url is required');
    expect(result.errors).toContain('Registration.upstream_services[0].auth_token must be a string when provided');
  });

  it('rejects node-only registration fields until orchestration semantics exist', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Registration: {
        enabled: true,
        nodes: [
          {
            id: 'node-a',
          },
        ],
      } as any,
    });

    expect(result.errors).toContain(
      'Registration.nodes is not supported yet; use Registration.models or Registration.upstream_services'
    );
  });

  it('accepts a remote-service client draft without local models or providers', () => {
    const result = normalizeAndValidateConfig({
      Runtime: {
        mode: 'local',
        remote_service: {
          enabled: true,
          base_url: 'https://router.example.com',
          auth_token: '${CTR_REMOTE_AUTH_TOKEN}',
        },
      },
      Router: {},
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Runtime).toEqual(expect.objectContaining({
      mode: 'local',
      remote_service: {
        enabled: true,
        base_url: 'https://router.example.com',
        auth_token: '${CTR_REMOTE_AUTH_TOKEN}',
      },
      security: expect.objectContaining({
        public_host_requires_auth: true,
        recommended_operator_scopes: ['operator'],
      }),
    }));
    expect(result.config.Providers).toEqual([]);
    expect(result.config.Router.default).toBe('');
  });

  it('reports invalid Runtime and remote service status config', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Runtime: {
        mode: 'edge' as any,
        remote_service: {
          enabled: true,
        },
      },
      Registration: {
        upstream_services: [
          {
            id: '',
            base_url: '',
          },
        ],
      },
    });

    expect(result.errors).toContain('Runtime.mode must be one of "local", "server", or "cloud"');
    expect(result.errors).toContain('Runtime.remote_service.base_url is required when remote_service is enabled');
    expect(result.errors).toContain('Registration.upstream_services[0].id is required');
    expect(result.errors).toContain('Registration.upstream_services[0].base_url is required');
  });

  it('merges Governance defaults when configured', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'glm,glm-5-mini',
          },
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Governance?.sticky?.session_ttl_ms).toBe(3600000);
    expect(result.config.Governance?.sticky?.alignment?.max_summary_tokens).toBe(256);
  });

  it('validates SmartRouter sticky alignment model references', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      SmartRouter: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'glm,missing-model',
          },
        },
      },
    });

    expect(result.errors).toContain(
      'SmartRouter.sticky.alignment.summarizer_model 引用的模型 "missing-model" 不在提供商 "glm" 的 models 列表中'
    );
  });

  it('validates Governance shadow sample rate bounds', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        shadow: {
          enabled: true,
          sample_rate: 1.5,
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.shadow.sample_rate must be between 0 and 1'
    );
  });

  it('validates Governance shadow mode values', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        shadow: {
          enabled: true,
          mode: 'invalid-mode' as any,
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.shadow.mode must be either "async_audit" or "sync_guard"'
    );
  });

  it('validates SmartRouter semantic threshold bounds', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      SmartRouter: {
        enabled: true,
        semantic: {
          enabled: true,
          threshold: 1.5,
        },
      },
    });

    expect(result.errors).toContain(
      'SmartRouter.semantic.threshold must be between 0 and 1'
    );
  });

  it('accepts Governance semantic classifier model when configured', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        semantic: {
          enabled: true,
          mode: 'classifier',
          classifier_model: 'glm,glm-5-air',
          threshold: 0.5,
          prototypes: {
            architecture: '重构 系统 结构 模块 拆分 架构 设计',
          },
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Governance?.semantic?.classifier_model).toBe('glm,glm-5-air');
  });

  it('requires SmartRouter semantic classifier model when classifier mode is enabled', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      SmartRouter: {
        enabled: true,
        semantic: {
          enabled: true,
          mode: 'classifier',
          threshold: 0.5,
          prototypes: {
            architecture: '重构 系统 结构 模块 拆分 架构 设计',
          },
        },
      },
    });

    expect(result.errors).toContain(
      'SmartRouter.semantic.classifier_model is required when semantic mode is "classifier"'
    );
  });

  it('validates Governance cascade level model references', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        cascade: {
          enabled: true,
          levels: [
            {
              from: 'openrouter,anthropic/claude-sonnet-4',
              to: 'glm,missing-model',
            },
          ],
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.cascade.levels[0].to 引用的模型 "missing-model" 不在提供商 "glm" 的 models 列表中'
    );
  });

  it('merges Governance observability anomaly threshold defaults when configured', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        observability: {
          anomaly_thresholds: {
            min_sample_size: 5,
          },
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Governance?.observability?.anomaly_thresholds).toEqual(
      expect.objectContaining({
        min_sample_size: 5,
        cascade_warn_rate: 0.4,
        latency_warn_ms: 1500,
      })
    );
  });

  it('validates Governance observability anomaly threshold bounds', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        observability: {
          anomaly_thresholds: {
            min_sample_size: 0,
            cascade_warn_rate: 1.2,
            latency_warn_ms: -1,
          },
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.min_sample_size must be at least 1'
    );
    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.cascade_warn_rate must be between 0 and 1'
    );
    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.latency_warn_ms must be greater than 0'
    );
  });

  it('validates Governance observability threshold ordering', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        observability: {
          anomaly_thresholds: {
            cascade_warn_rate: 0.8,
            cascade_critical_rate: 0.6,
            shadow_warn_rate: 0.9,
            shadow_critical_rate: 0.7,
            latency_warn_ms: 4000,
            latency_critical_ms: 3000,
          },
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.cascade_warn_rate must be less than or equal to cascade_critical_rate'
    );
    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.shadow_warn_rate must be less than or equal to shadow_critical_rate'
    );
    expect(result.errors).toContain(
      'Governance.observability.anomaly_thresholds.latency_warn_ms must be less than or equal to latency_critical_ms'
    );
  });

  it('accepts simplified Models config without Providers', () => {
    const result = normalizeAndValidateConfig({
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
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Models).toHaveLength(1);
    expect(result.config.Models?.[0].id).toBe('sonnet');
    expect(result.config.Models?.[0].api).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(result.config.Models?.[0].key).toBe('sk-test');
    expect(result.config.Models?.[0].interface).toBe('openai');
  });

  it('validates Models fields and uniqueness', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: '',
          key: '',
          interface: 'invalid' as any,
          model: '',
          thinking: {
            mode: 'wrong' as any,
            effort: 'wrong' as any,
            budget_tokens: 0,
          },
        },
        {
          id: 'sonnet',
          api: 'https://example.com',
          key: 'sk-test',
          interface: 'openai',
          model: 'model-a',
        },
      ],
    });

    expect(result.errors).toContain('Models[0].api is required');
    expect(result.errors).toContain('Models[0].key is required');
    expect(result.errors).toContain('Models[0].interface must be either "openai" or "anthropic"');
    expect(result.errors).toContain('Models[0].model is required');
    expect(result.errors).toContain('Models[0].thinking.mode must be one of "off", "auto", "on"');
    expect(result.errors).toContain('Models[0].thinking.effort must be one of "low", "medium", "high"');
    expect(result.errors).toContain('Models[0].thinking.budget_tokens must be greater than 0');
    expect(result.errors).toContain('Models[1].id must be unique');
  });

  it('accepts Governance model references via Models ids', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      Governance: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'sonnet',
          },
        },
        cascade: {
          enabled: true,
          levels: [
            {
              from: 'sonnet',
              to: 'opus',
            },
          ],
        },
        semantic: {
          enabled: true,
          mode: 'classifier',
          classifier_model: 'sonnet',
        },
        shadow: {
          enabled: true,
          verifier_model: 'opus',
        },
      },
    } as any);

    expect(result.errors).toEqual([]);
  });

  it('normalizes legacy Models keys into the new public aliases', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          protocol: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Models?.[0]).toEqual(
      expect.objectContaining({
        api: 'https://openrouter.ai/api/v1/chat/completions',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        key: 'sk-test',
        api_key: 'sk-test',
        interface: 'openai',
        protocol: 'openai',
      })
    );
  });

  it('accepts simplified thinking aliases and normalizes them internally', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
          thinking: 'high',
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.config.Models?.[0].thinking).toEqual({
      mode: 'on',
      effort: 'high',
    });
  });

  it('returns non-fatal capability warnings for unsupported runtime hints', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'restricted' },
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
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
      'Models[0].metadata.supports_tools disables tools for model "restricted". Tool definitions and tool call/result blocks will fall back to plain text.',
      'Models[0].metadata.supports_images disables image input for model "restricted". Image blocks will fall back to plain text descriptions.',
    ]);
  });

  it('validates model context window metadata bounds', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'tiny' },
      Models: [
        {
          id: 'tiny',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'vendor/tiny',
          metadata: {
            context_window_tokens: 1000,
            safe_input_tokens: 2000,
          },
        },
        {
          id: 'invalid',
          api: 'https://api.example.com/v1/messages',
          key: 'sk-test',
          interface: 'anthropic',
          model: 'vendor/invalid',
          metadata: {
            context_window_tokens: 0,
            safe_input_tokens: 1.5,
          },
        },
      ],
    });

    expect(result.errors).toContain('Models[0].metadata.safe_input_tokens must be less than or equal to context_window_tokens');
    expect(result.errors).toContain('Models[1].metadata.context_window_tokens must be a positive integer');
    expect(result.errors).toContain('Models[1].metadata.safe_input_tokens must be a positive integer');
  });

  it('normalizes unified Router routes and decision config into runtime-compatible trigger/smart/governance structures', () => {
    const result = normalizeAndValidateConfig({
      Router: {
        default: 'sonnet',
        routes: [
          {
            name: 'architecture',
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
            priority: 90,
            match: {
              semantic: true,
              semantic_profile: {
                threshold: 0.2,
              },
            },
          },
          {
            name: 'coding',
            model: 'sonnet',
            description: '通用编程与调试',
            priority: 60,
            match: {
              keywords: ['写代码', 'debug'],
            },
          },
        ],
        decision: {
          smart_fallback: true,
          router_model: 'sonnet',
          candidates: [
            { model: 'sonnet', description: '通用编程与调试' },
            { model: 'opus', description: '架构与复杂评审' },
          ],
          router_hint: {
            include_task_summary: true,
            include_top_route_candidates: true,
          },
        },
        defaults: {
          sticky: {
            enabled: true,
            alignment: {
              enabled: true,
              summarizer_model: 'sonnet',
            },
          },
          semantic: {
            enabled: true,
            threshold: 0.2,
          },
        },
      },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
    } as any);

    expect(result.errors).toEqual([]);
    expect(result.config.TriggerRouter).toBeUndefined();
    expect(result.config.SmartRouter).toEqual(expect.objectContaining({
      enabled: true,
      router_model: 'sonnet',
      candidates: [
        expect.objectContaining({ model: 'sonnet' }),
        expect.objectContaining({ model: 'opus' }),
      ],
      rules: [
        expect.objectContaining({
          name: 'architecture',
          model: 'opus',
        }),
        expect.objectContaining({
          name: 'coding',
          model: 'sonnet',
        }),
      ],
      semantic: expect.objectContaining({
        enabled: true,
        threshold: 0.2,
        prototypes: expect.objectContaining({
          architecture: '重构 系统 结构 模块 拆分 架构 设计',
          coding: '通用编程与调试',
        }),
      }),
      sticky: expect.objectContaining({
        enabled: true,
        alignment: expect.objectContaining({
          enabled: true,
          summarizer_model: 'sonnet',
        }),
      }),
      router_hint: {
        include_task_summary: true,
        include_top_route_candidates: true,
      },
    }));
    expect(result.config.Governance).toBeUndefined();
    expect(result.config.Router.routes).toHaveLength(2);
  });

  it('accepts enabled SmartRouter without router_model when using embedded trigger-style rules and semantic fallback', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
        semantic: {
          enabled: true,
          threshold: 0.2,
          prototypes: {
            architecture: '重构 系统 结构 模块 拆分 架构 设计',
          },
        },
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'sonnet',
          },
        },
      },
    } as any);

    expect(result.errors).toEqual([]);
    expect(result.config.SmartRouter).toEqual(expect.objectContaining({
      enabled: true,
      router_model: '',
      rules: [
        expect.objectContaining({
          name: 'architecture',
          model: 'opus',
        }),
      ],
      semantic: expect.objectContaining({
        enabled: true,
      }),
      sticky: expect.objectContaining({
        enabled: true,
      }),
    }));
  });

  it('derives SmartRouter semantic classifier from legacy Trigger intent config during normalization', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      TriggerRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'sonnet',
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['不会命中'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
      },
    } as any);

    expect(result.errors).toEqual([]);
    expect(result.config.SmartRouter).toEqual(expect.objectContaining({
      enabled: true,
      rules: [
        expect.objectContaining({
          name: 'architecture',
          model: 'opus',
        }),
      ],
      semantic: expect.objectContaining({
        enabled: true,
        mode: 'classifier',
        classifier_model: 'sonnet',
        prototypes: expect.objectContaining({
          architecture: '重构 系统 结构 模块 拆分 架构 设计',
        }),
      }),
    }));
    expect(result.config.TriggerRouter).toBeUndefined();
  });

  it('enables SmartRouter semantic and sticky defaults but keeps alignment opt-in', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'opus',
            description: '重构 系统 结构 模块 拆分 架构 设计',
          },
        ],
      },
    } as any);

    expect(result.errors).toEqual([]);
    expect(result.config.SmartRouter).toEqual(expect.objectContaining({
      enabled: true,
      semantic: expect.objectContaining({
        enabled: true,
        threshold: 0.2,
      }),
      sticky: expect.objectContaining({
        enabled: true,
        alignment: expect.objectContaining({
          enabled: false,
          summarizer_model: 'sonnet',
        }),
      }),
    }));
  });

  it('preserves explicit SmartRouter alignment opt-in when SmartRouter is enabled', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        sticky: {
          enabled: true,
          alignment: {
            enabled: true,
            summarizer_model: 'sonnet',
          },
        },
      },
    } as any);

    expect(result.errors).toEqual([]);
    expect(result.config.SmartRouter?.sticky?.alignment).toEqual(expect.objectContaining({
      enabled: true,
      summarizer_model: 'sonnet',
    }));
  });

  it('validates SmartRouter sticky alignment model references and bounds', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        sticky: {
          enabled: true,
          session_ttl_ms: 0,
          fingerprint_similarity_threshold: 1.2,
          alignment: {
            enabled: true,
            summarizer_model: 'missing-model',
            max_summary_tokens: 0,
          },
        },
      },
    } as any);

    expect(result.errors).toContain('SmartRouter.sticky.session_ttl_ms must be greater than 0 when sticky routing is enabled');
    expect(result.errors).toContain('SmartRouter.sticky.fingerprint_similarity_threshold must be between 0 and 1');
    expect(result.errors).toContain('SmartRouter.sticky.alignment.summarizer_model 格式不正确，应为 "provider,model"，当前值："missing-model"');
    expect(result.errors).toContain('SmartRouter.sticky.alignment.max_summary_tokens must be greater than 0 when alignment is enabled');
  });

  it('validates SmartRouter semantic classifier references and mode values', () => {
    const result = normalizeAndValidateConfig({
      Router: { default: 'sonnet' },
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
      ],
      SmartRouter: {
        enabled: true,
        semantic: {
          enabled: true,
          mode: 'classifier',
          classifier_model: 'missing-model',
          threshold: 1.2,
        },
      },
    } as any);

    expect(result.errors).toContain('SmartRouter.semantic.threshold must be between 0 and 1');
    expect(result.errors).toContain('SmartRouter.semantic.classifier_model 格式不正确，应为 "provider,model"，当前值："missing-model"');
  });

  it('treats unified Router model-id references as valid even when Providers still exist', () => {
    const result = normalizeAndValidateConfig({
      Providers: [
        {
          name: 'openrouter',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          models: ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4'],
        },
      ],
      Models: [
        {
          id: 'sonnet',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api: 'https://openrouter.ai/api/v1/chat/completions',
          key: 'sk-test',
          interface: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      Router: {
        default: 'sonnet',
        routes: [
          {
            name: 'architecture',
            model: 'opus',
            description: '架构设计',
            match: {
              semantic: true,
            },
          },
        ],
        decision: {
          smart_fallback: true,
          router_model: 'sonnet',
          candidates: [
            { model: 'sonnet', description: '通用' },
            { model: 'opus', description: '架构' },
          ],
        },
      },
    } as any);

    expect(result.errors).toEqual([]);
  });
});
