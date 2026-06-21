import { describe, expect, it } from 'vitest';

import { getProviderPreset, getUiProviderTemplates, listProviderPresetKeys } from './provider-presets';

describe('provider preset catalog', () => {
  it('returns setup presets from the shared catalog', () => {
    expect(listProviderPresetKeys('setup')).toEqual([
      'glm',
      'deepseek',
      'kimi',
      'minimax',
      'openai',
      'anthropic',
      'alibaba-bailian',
      'volcengine-ark',
      'baidu-qianfan',
      'xunfei-astron',
      'openrouter',
      'custom',
    ]);
  });

  it('returns ui templates from the shared catalog', () => {
    const templates = getUiProviderTemplates();

    expect(Object.keys(templates)).toEqual([
      'glm',
      'deepseek',
      'kimi',
      'minimax',
      'openai',
      'anthropic',
      'alibaba-bailian',
      'volcengine-ark',
      'baidu-qianfan',
      'xunfei-astron',
      'openrouter',
    ]);
    expect(templates.glm).toEqual(
      expect.objectContaining({
        category: 'model_vendor',
        suggested_id: 'glm',
        default_model: 'glm-5.2',
        vendor_hint: 'glm',
      })
    );
    expect(templates['alibaba-bailian']).toEqual(
      expect.objectContaining({
        category: 'aggregator',
        api: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        default_model: 'qwen-plus',
        default_thinking: 'auto',
      })
    );
  });

  it('clones preset data instead of leaking shared references', () => {
    const preset = getProviderPreset('openrouter');
    preset!.label = 'mutated';
    preset!.model_examples?.push('mutated-model');

    expect(getProviderPreset('openrouter')?.label).toBe('OpenRouter');
    expect(getProviderPreset('openrouter')?.model_examples).not.toContain('mutated-model');
  });
});
