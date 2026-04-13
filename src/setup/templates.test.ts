import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';
import { normalizeAndValidateConfig } from '../utils/config';
import { getProviderPreset, buildMinimalConfig, buildUsableMinimalTemplateConfig } from './templates';

describe('setup templates', () => {
  // ============ getProviderPreset ============

  describe('getProviderPreset', () => {
    it('should return openrouter preset with correct api_base_url', () => {
      const preset = getProviderPreset('openrouter');
      expect(preset).toBeDefined();
      expect(preset?.api).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(preset?.api_base_url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(preset?.interface).toBe('openai');
      expect(preset?.protocol).toBe('openai');
    });

    it('should return deepseek preset with correct api_base_url', () => {
      const preset = getProviderPreset('deepseek');
      expect(preset).toBeDefined();
      expect(preset?.api).toBe('https://api.deepseek.com/chat/completions');
      expect(preset?.api_base_url).toBe('https://api.deepseek.com/chat/completions');
      expect(preset?.interface).toBe('openai');
      expect(preset?.protocol).toBe('openai');
    });

    it('should return openai-compatible preset with generic OpenAI URL', () => {
      const preset = getProviderPreset('openai-compatible');
      expect(preset).toBeDefined();
      expect(preset?.api).toBe('https://api.openai.com/v1/chat/completions');
      expect(preset?.api_base_url).toBe('https://api.openai.com/v1/chat/completions');
      expect(preset?.interface).toBe('openai');
      expect(preset?.protocol).toBe('openai');
    });

    it('should return anthropic preset with Anthropic messages URL', () => {
      const preset = getProviderPreset('anthropic');
      expect(preset).toBeDefined();
      expect(preset?.api).toBe('https://api.anthropic.com/v1/messages');
      expect(preset?.api_base_url).toBe('https://api.anthropic.com/v1/messages');
      expect(preset?.interface).toBe('anthropic');
      expect(preset?.protocol).toBe('anthropic');
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
    it('should generate Models[0].id from minimal single provider input', () => {
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
      expect(config.Models).toHaveLength(1);
      expect(config.Models?.[0].id).toBe('my-provider');
      expect(config.Models?.[0].key).toBe('sk-test');
      expect(config.Models?.[0].api_key).toBe('sk-test');
      expect(config.Models?.[0].model).toBe('model-1');
    });

    it('should generate Router.default as model id', () => {
      const input = {
        providers: [
          {
            name: 'test-provider',
            api_key: 'sk-test',
            models: ['gpt-4'],
          },
        ],
        defaultModel: 'test-provider',
      };
      const config = buildMinimalConfig(input);
      expect(config.Router.default).toBe('test-provider');
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
      expect(config.Models?.[0].api).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
      expect(config.Models?.[0].api_base_url).toBe(
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
      expect(config.Models?.[0].api).toBe(
        'https://custom.api.com/v1/chat/completions'
      );
      expect(config.Models?.[0].api_base_url).toBe(
        'https://custom.api.com/v1/chat/completions'
      );
    });

    it('should omit api_base_url when explicit value is an empty string', () => {
      const config = buildMinimalConfig({
        providers: [
          {
            name: 'custom-provider',
            api_base_url: '',
            api_key: 'sk-custom',
            models: ['custom-model'],
          },
        ],
      });

      expect(config.Models?.[0].api).toBeUndefined();
      expect(config.Models?.[0].api_base_url).toBeUndefined();
    });

    it('should not infer Router.default when explicit defaultModel is an empty string', () => {
      const config = buildMinimalConfig({
        providers: [
          {
            name: 'openrouter',
            api_key: 'sk-test',
            models: ['anthropic/claude-sonnet-4'],
          },
        ],
        defaultModel: '',
      });

      expect(config.Router.default).toBeUndefined();
    });

    it('should generate correct Router.default with first model id', () => {
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
      expect(config.Router.default).toBe('deepseek');
    });

    it('should include protocol from preset', () => {
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
      expect(config.Models?.[0].interface).toBe('openai');
      expect(config.Models?.[0].protocol).toBe('openai');
    });

    it('should apply the anthropic preset protocol and API URL', () => {
      const config = buildMinimalConfig({
        providers: [
          {
            name: 'anthropic',
            preset: 'anthropic',
            api_key: 'sk-ant',
            models: ['claude-sonnet-4-5'],
          },
        ],
      });

      expect(config.Models?.[0].api).toBe('https://api.anthropic.com/v1/messages');
      expect(config.Models?.[0].api_base_url).toBe('https://api.anthropic.com/v1/messages');
      expect(config.Models?.[0].interface).toBe('anthropic');
      expect(config.Models?.[0].protocol).toBe('anthropic');
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
      expect(config.Models?.[0].api).toBe(
        'https://my-custom-url.com/v1/chat/completions'
      );
      expect(config.Models?.[0].api_base_url).toBe(
        'https://my-custom-url.com/v1/chat/completions'
      );
    });

    it('should not inject empty api_base_url for custom preset without explicit URL', () => {
      const input = {
        providers: [
          {
            name: 'my-custom',
            preset: 'custom',
            api_key: 'sk-custom',
            models: ['custom-model'],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Models?.[0].api).toBeUndefined();
      expect(config.Models?.[0].api_base_url).toBeUndefined();
    });

    it('should omit Router.default when first provider has no models', () => {
      const input = {
        providers: [
          {
            name: 'empty-provider',
            api_key: 'sk-empty',
            models: [],
          },
        ],
      };
      const config = buildMinimalConfig(input);
      expect(config.Router.default).toBeUndefined();
    });

    it('should clone provider arrays and preset protocol to avoid shared references', () => {
      const models = ['deepseek-chat'];
      const config = buildMinimalConfig({
        providers: [
          {
            name: 'deepseek',
            preset: 'deepseek',
            api_key: 'sk-ds',
            models,
          },
        ],
      });

      models.push('deepseek-reasoner');
      if (config.Models?.[0]) {
        config.Models[0].interface = 'anthropic';
        config.Models[0].protocol = 'anthropic';
      }

      expect(config.Models?.[0].model).toEqual('deepseek-chat');
      expect(getProviderPreset('deepseek')?.interface).toEqual('openai');
      expect(getProviderPreset('deepseek')?.protocol).toEqual('openai');
    });

    it('should return a cloned preset instead of leaking shared preset references', () => {
      const preset = getProviderPreset('deepseek');
      if (preset) {
        preset.interface = 'anthropic';
        preset.protocol = 'anthropic';
      }

      expect(getProviderPreset('deepseek')?.interface).toEqual('openai');
      expect(getProviderPreset('deepseek')?.protocol).toEqual('openai');
    });

    it('should build a usable minimal template config with zero validation errors', () => {
      const template = buildUsableMinimalTemplateConfig();
      const normalized = normalizeAndValidateConfig(template as any);

      expect(normalized.errors).toEqual([]);
      expect(template.Models?.[0]).toEqual(expect.objectContaining({
        id: 'sonnet',
        api: 'https://openrouter.ai/api/v1/chat/completions',
        key: 'sk-xxx',
        interface: 'openai',
        model: 'anthropic/claude-sonnet-4',
        thinking: 'auto',
      }));
      expect(template.Router.default).toBe('sonnet');
    });

    it('keeps config/trigger.example.yaml aligned with the generated usable minimal template', () => {
      const examplePath = join(process.cwd(), 'config', 'trigger.example.yaml');
      const exampleConfig = yaml.load(readFileSync(examplePath, 'utf-8')) as Record<string, unknown>;

      expect(exampleConfig).toEqual(buildUsableMinimalTemplateConfig());
    });
  });
});
