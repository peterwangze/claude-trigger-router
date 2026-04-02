import { describe, it, expect } from 'vitest';
import { getProviderPreset, buildMinimalConfig } from './templates';

describe('setup templates', () => {
  // ============ getProviderPreset ============

  describe('getProviderPreset', () => {
    it('should return openrouter preset with correct api_base_url', () => {
      const preset = getProviderPreset('openrouter');
      expect(preset).toBeDefined();
      expect(preset?.api_base_url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(preset?.transformer?.use).toContain('openrouter');
    });

    it('should return deepseek preset with correct api_base_url', () => {
      const preset = getProviderPreset('deepseek');
      expect(preset).toBeDefined();
      expect(preset?.api_base_url).toBe('https://api.deepseek.com/chat/completions');
      expect(preset?.transformer?.use).toContain('deepseek');
    });

    it('should return openai-compatible preset with generic OpenAI URL', () => {
      const preset = getProviderPreset('openai-compatible');
      expect(preset).toBeDefined();
      expect(preset?.api_base_url).toBe('https://api.openai.com/v1/chat/completions');
      expect(preset?.transformer?.use).toContain('openrouter');
    });

    it('should return custom preset without default URL', () => {
      const preset = getProviderPreset('custom');
      expect(preset).toBeDefined();
      expect(preset?.api_base_url).toBeUndefined();
    });

    it('should return undefined for unknown preset', () => {
      const preset = getProviderPreset('unknown-preset' as any);
      expect(preset).toBeUndefined();
    });
  });

  // ============ buildMinimalConfig ============

  describe('buildMinimalConfig', () => {
    it('should generate Providers[0].name from minimal single provider input', () => {
      const input = {
        providers: [
          {
            name: 'my-provider',
            api_key: 'sk-test',
            models: ['model-1'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Providers).toHaveLength(1);
      expect(config.Providers[0].name).toBe('my-provider');
      expect(config.Providers[0].api_key).toBe('sk-test');
      expect(config.Providers[0].models).toContain('model-1');
    });

    it('should generate Router.default in correct format', () => {
      const input = {
        providers: [
          {
            name: 'test-provider',
            api_key: 'sk-test',
            models: ['gpt-4'],
          },
        ],
        defaultModel: 'test-provider,gpt-4',
      };
      const config = buildMinimalConfig(input);
      expect(config.Router.default).toBe('test-provider,gpt-4');
    });

    it('should use preset api_base_url when preset is specified', () => {
      const input = {
        providers: [
          {
            name: 'openrouter',
            preset: 'openrouter',
            api_key: 'sk-or',
            models: ['anthropic/claude-sonnet-4'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Providers[0].api_base_url).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
    });

    it('should use custom api_base_url when provided', () => {
      const input = {
        providers: [
          {
            name: 'custom-provider',
            api_base_url: 'https://custom.api.com/v1/chat/completions',
            api_key: 'sk-custom',
            models: ['custom-model'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Providers[0].api_base_url).toBe(
        'https://custom.api.com/v1/chat/completions'
      );
    });

    it('should generate correct Router.default with provider and first model', () => {
      const input = {
        providers: [
          {
            name: 'deepseek',
            preset: 'deepseek',
            api_key: 'sk-ds',
            models: ['deepseek-chat', 'deepseek-reasoner'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Router.default).toBe('deepseek,deepseek-chat');
    });

    it('should include transformer from preset', () => {
      const input = {
        providers: [
          {
            name: 'deepseek',
            preset: 'deepseek',
            api_key: 'sk-ds',
            models: ['deepseek-chat'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Providers[0].transformer).toBeDefined();
      expect(config.Providers[0].transformer.use).toContain('deepseek');
    });

    it('should handle custom preset without forcing default URL', () => {
      const input = {
        providers: [
          {
            name: 'my-custom',
            preset: 'custom',
            api_base_url: 'https://my-custom-url.com/v1/chat/completions',
            api_key: 'sk-custom',
            models: ['custom-model'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Providers[0].api_base_url).toBe(
        'https://my-custom-url.com/v1/chat/completions'
      );
    });
  });
});
