import { describe, expect, it } from 'vitest';
import { formatRoutePreview, previewRoute } from './route-preview';
import { IAppConfig } from '../trigger/types';

function createConfig(overrides: Partial<IAppConfig> = {}): IAppConfig {
  return {
    Providers: [],
    Models: [
      {
        id: 'sonnet',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-sonnet',
        interface: 'anthropic',
        model: 'claude-sonnet-4-5',
        metadata: {
          context_window_tokens: 200000,
          safe_input_tokens: 180000,
        },
      },
      {
        id: 'reasoner',
        api: 'https://api.example.com/v1/chat/completions',
        key: 'sk-reasoner',
        interface: 'openai',
        model: 'deepseek-reasoner',
      },
      {
        id: 'long',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-long',
        interface: 'anthropic',
        model: 'claude-long-context',
      },
    ],
    Router: {
      default: 'sonnet',
      think: 'reasoner',
      longContext: 'long',
      longContextThreshold: 100,
      webSearch: 'sonnet',
    },
    ...overrides,
  } as IAppConfig;
}

describe('route preview', () => {
  it('explains SmartRouter rule matches before basic Router fallback', () => {
    const result = previewRoute(createConfig({
      SmartRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        rules: [
          {
            name: 'architecture',
            priority: 90,
            enabled: true,
            patterns: [{ type: 'exact', keywords: ['架构设计'] }],
            model: 'reasoner',
          },
        ],
      },
    }), {
      text: '请做架构设计',
      model: 'claude-3-5-sonnet',
    });

    expect(result.source).toBe('smart_rule');
    expect(result.ruleName).toBe('architecture');
    expect(result.finalModel).toBe('model__reasoner,deepseek-reasoner');
    expect(formatRoutePreview(result).join('\n')).toContain('SmartRouter.rules');
  });

  it('does not call the SmartRouter LLM and reports pending router_model selection', () => {
    const result = previewRoute(createConfig({
      SmartRouter: {
        enabled: true,
        analysis_scope: 'last_message',
        rules: [],
        router_model: 'sonnet',
        candidates: [
          { model: 'sonnet', description: 'default' },
          { model: 'reasoner', description: 'deep reasoning' },
        ],
      },
    }), {
      text: '分析一个没有关键词的复杂任务',
    });

    expect(result.source).toBe('smart_router_pending');
    expect(result.finalModel).toBeUndefined();
    expect(result.warnings.join('\n')).toContain('不会调用 SmartRouter LLM');
    expect(formatRoutePreview(result).join('\n')).toContain('会增加首包前等待');
  });

  it('explains longContext priority before thinking and webSearch', () => {
    const result = previewRoute(createConfig(), {
      text: 'hello',
      model: 'claude-3-5-sonnet',
      thinking: true,
      webSearch: true,
      tokenCount: 120,
    });

    expect(result.source).toBe('basic_long_context');
    expect(result.finalModel).toBe('model__long,claude-long-context');
    expect(formatRoutePreview(result).join('\n')).toContain('tokenCount 120 > threshold 100');
  });

  it('explains thinking route when longContext threshold is not crossed', () => {
    const result = previewRoute(createConfig(), {
      text: 'hello',
      model: 'claude-3-5-sonnet',
      thinking: true,
      tokenCount: 20,
    });

    expect(result.source).toBe('basic_thinking');
    expect(result.finalModel).toBe('model__reasoner,deepseek-reasoner');
    expect(result.steps.some((step) => step.label === 'Router.longContext' && step.status === 'info')).toBe(true);
  });

  it('explains explicit upstream model bypassing basic slots', () => {
    const result = previewRoute(createConfig(), {
      text: 'hello',
      model: 'provider,upstream-model',
      thinking: true,
      tokenCount: 999,
    });

    expect(result.source).toBe('explicit_model');
    expect(result.finalModel).toBe('provider,upstream-model');
    expect(formatRoutePreview(result).join('\n')).toContain('基础槽位不会再覆盖');
  });
});
