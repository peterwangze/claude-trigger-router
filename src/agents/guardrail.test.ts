import { describe, expect, it } from 'vitest';
import { evaluateToolCapabilityGuardrail } from './guardrail';
import type { ITool } from './type';

const tool: ITool = {
  name: 'analyzeImage',
  description: 'Analyze image',
  input_schema: {},
  capabilities: {
    requiredModelCapabilities: ['tools'],
    internalCall: true,
  },
  handler: async () => 'ok',
};

describe('tool capability guardrail', () => {
  it('allows tools when model capabilities satisfy the declaration', () => {
    expect(evaluateToolCapabilityGuardrail({ name: 'image' }, tool, {
      id: 'sonnet',
      providerName: 'model__sonnet',
      modelName: 'claude-sonnet',
      protocol: 'anthropic',
      compatibilityProfile: 'anthropic-native',
      dispatchFormat: 'anthropic_messages',
      capabilities: {
        tools: true,
        images: true,
        thinking: { supported: true },
        systemMessageStyle: 'anthropic',
      },
      source: 'models',
    })).toEqual(expect.objectContaining({
      allowed: true,
      reason: 'capabilities_satisfied',
      modelId: 'sonnet',
    }));
  });

  it('denies tools when the selected model cannot receive tool calls', () => {
    expect(evaluateToolCapabilityGuardrail({ name: 'image' }, tool, {
      id: 'fast',
      providerName: 'model__fast',
      modelName: 'fast-model',
      protocol: 'openai',
      compatibilityProfile: 'openai-compatible-anthropic-dispatch',
      dispatchFormat: 'anthropic_messages',
      capabilities: {
        tools: false,
        images: true,
        thinking: { supported: false },
        systemMessageStyle: 'openai',
      },
      source: 'models',
    })).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'model_missing_tools',
      modelId: 'fast',
      requiredModelCapabilities: ['tools'],
    }));
  });
});
