import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerRouter } from '../trigger/index';
import { IAppConfig } from '../trigger/types';

describe('TriggerRouter', () => {
  let router: TriggerRouter;

  beforeEach(() => {
    router = new TriggerRouter();
  });

  const createAppConfig = (overrides?: Partial<IAppConfig>): IAppConfig => ({
    PORT: 3456,
    Providers: [
      { name: 'openrouter', api_base_url: 'https://openrouter.ai/api/v1', api_key: 'key', models: ['dall-e-3'] },
    ],
    Router: { default: 'openrouter,dall-e-3' },
    TriggerRouter: {
      enabled: true,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [
        {
          name: 'image_generation',
          priority: 100,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['生成图片', '画图', 'generate image'] }],
          model: 'openrouter,dall-e-3',
        },
        {
          name: 'architecture',
          priority: 90,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['系统架构', '架构设计'] }],
          model: 'openrouter,claude-opus-4',
        },
      ],
    },
    ...overrides,
  });

  // ============ init ============

  describe('init', () => {
    it('should initialize with app config', () => {
      const config = createAppConfig();
      router.init(config);
      expect(router.isEnabled()).toBe(true);
      expect(router.getConfig()).not.toBeNull();
      expect(router.getConfig()!.rules).toHaveLength(2);
    });

    it('should use default config when TriggerRouter is not set', () => {
      const config = createAppConfig({ TriggerRouter: undefined });
      router.init(config);
      expect(router.isEnabled()).toBe(false);
    });
  });

  // ============ isEnabled ============

  describe('isEnabled', () => {
    it('should return false before init', () => {
      expect(router.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      router.init(createAppConfig());
      expect(router.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const config = createAppConfig();
      config.TriggerRouter!.enabled = false;
      router.init(config);
      expect(router.isEnabled()).toBe(false);
    });
  });

  // ============ route ============

  describe('route', () => {
    it('should return not matched before init', async () => {
      const req = { body: { messages: [{ role: 'user', content: '生成图片' }] } };
      const result = await router.route(req);
      expect(result.matched).toBe(false);
    });

    it('should match image generation rule', async () => {
      router.init(createAppConfig());
      const req = { body: { messages: [{ role: 'user', content: '请帮我生成图片' }] } };
      const result = await router.route(req);
      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,dall-e-3');
      expect(result.rule?.name).toBe('image_generation');
    });

    it('should match architecture rule', async () => {
      router.init(createAppConfig());
      const req = { body: { messages: [{ role: 'user', content: '请帮我设计系统架构' }] } };
      const result = await router.route(req);
      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,claude-opus-4');
    });

    it('should return not matched for unrelated content', async () => {
      router.init(createAppConfig());
      const req = { body: { messages: [{ role: 'user', content: '今天天气如何' }] } };
      const result = await router.route(req);
      expect(result.matched).toBe(false);
    });

    it('should skip analysis when messages are mostly tool results', async () => {
      router.init(createAppConfig());
      const req = {
        body: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: '1', content: 'result with 生成图片' },
                { type: 'tool_result', tool_use_id: '2', content: 'another result' },
                { type: 'text', text: 'continue' },
              ],
            },
          ],
        },
      };
      const result = await router.route(req);
      expect(result.matched).toBe(false);
    });
  });

  // ============ routeSync ============

  describe('routeSync', () => {
    it('should match rule synchronously', () => {
      router.init(createAppConfig());
      const req = { body: { messages: [{ role: 'user', content: '画图' }] } };
      const result = router.routeSync(req);
      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,dall-e-3');
    });

    it('should return not matched before init', () => {
      const req = { body: { messages: [{ role: 'user', content: '画图' }] } };
      const result = router.routeSync(req);
      expect(result.matched).toBe(false);
    });
  });
});
