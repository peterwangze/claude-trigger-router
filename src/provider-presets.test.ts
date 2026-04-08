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
    const templates = getUiProviderTemplates();

    expect(Object.keys(templates)).toEqual([
      'openrouter',
      'deepseek',
      'openai-compatible',
      'anthropic',
      'siliconflow',
    ]);
    expect(templates.anthropic).toEqual(
      expect.objectContaining({
        suggested_id: 'claude',
        key_placeholder: 'sk-ant-...',
        vendor_hint: 'anthropic',
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
