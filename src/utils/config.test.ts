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

  it('validates Governance sticky alignment model references', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
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
      'Governance.sticky.alignment.summarizer_model 引用的模型 "missing-model" 不在提供商 "glm" 的 models 列表中'
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

  it('validates Governance semantic threshold bounds', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
        enabled: true,
        semantic: {
          enabled: true,
          threshold: 1.5,
        },
      },
    });

    expect(result.errors).toContain(
      'Governance.semantic.threshold must be between 0 and 1'
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

  it('requires Governance semantic classifier model when classifier mode is enabled', () => {
    const result = normalizeAndValidateConfig({
      ...baseConfig,
      Governance: {
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
      'Governance.semantic.classifier_model is required when semantic mode is "classifier"'
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
    expect(result.config.TriggerRouter).toEqual(expect.objectContaining({
      enabled: true,
      rules: [
        expect.objectContaining({
          name: 'architecture',
          model: 'opus',
          description: '重构 系统 结构 模块 拆分 架构 设计',
          semantic_profile: expect.objectContaining({
            enabled: true,
            threshold: 0.2,
          }),
        }),
        expect.objectContaining({
          name: 'coding',
          model: 'sonnet',
          patterns: [
            expect.objectContaining({
              type: 'exact',
              keywords: ['写代码', 'debug'],
            }),
          ],
        }),
      ],
    }));
    expect(result.config.SmartRouter).toEqual(expect.objectContaining({
      enabled: true,
      router_model: 'sonnet',
      candidates: [
        expect.objectContaining({ model: 'sonnet' }),
        expect.objectContaining({ model: 'opus' }),
      ],
      router_hint: {
        include_task_summary: true,
        include_top_route_candidates: true,
      },
    }));
    expect(result.config.Governance?.semantic?.prototypes).toEqual(expect.objectContaining({
      architecture: '重构 系统 结构 模块 拆分 架构 设计',
      coding: '通用编程与调试',
    }));
    expect(result.config.Governance?.enabled).toBe(true);
    expect(result.config.Governance?.sticky?.alignment?.summarizer_model).toBe('sonnet');
    expect(result.config.Router.routes).toHaveLength(2);
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
