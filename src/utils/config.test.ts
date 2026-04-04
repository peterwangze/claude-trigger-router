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
});
