import { describe, expect, it } from 'vitest';
import { buildModelRegistry, compileModelsToProviders, getDispatchFormatForProfile } from './compile';

describe('model compile', () => {
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
      compatibilityProfile: 'openrouter-like',
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
      compatibilityProfile: 'openrouter-like',
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

    expect(registry.modelMap.gpt90?.compatibilityProfile).toBe('generic-openai-compatible');
    expect(registry.modelMap.gpt90?.dispatchFormat).toBe('anthropic_messages');
    expect(registry.modelMap.qianfan?.compatibilityProfile).toBe('qianfan-coding');
    expect(registry.modelMap.minimax?.compatibilityProfile).toBe('minimax-chatcompletion-v2');
    expect(getDispatchFormatForProfile('openai', 'openrouter-like')).toBe('anthropic_messages');
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
});
