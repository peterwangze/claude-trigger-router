import { describe, expect, it } from 'vitest';

import { getProviderPreset, getUiProviderTemplates, listProviderPresetKeys } from './provider-presets';

describe('provider preset catalog', () => {
  it('returns setup presets from the shared catalog', () => {
    expect(listProviderPresetKeys('setup')).toEqual([
      'openrouter',
      'deepseek',
      'openai-compatible',
      'anthropic',
      'siliconflow',
      'custom',
    ]);
  });

  it('returns ui templates from the shared catalog', () => {
    expect(Object.keys(getUiProviderTemplates())).toEqual([
      'openrouter',
      'deepseek',
      'openai-compatible',
      'anthropic',
      'siliconflow',
    ]);
  });

  it('clones preset data instead of leaking shared references', () => {
    const preset = getProviderPreset('openrouter');
    preset!.label = 'mutated';
    preset!.model_examples?.push('mutated-model');

    expect(getProviderPreset('openrouter')?.label).toBe('OpenRouter');
    expect(getProviderPreset('openrouter')?.model_examples).not.toContain('mutated-model');
  });
});
