import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriggerRouter } from '../trigger/index';
import { modelSelector } from '../trigger/selector';
import { IAppConfig } from '../trigger/types';
import { sessionStateStore } from '../governance/session-store';

describe('TriggerRouter', () => {
  let router: TriggerRouter;

  beforeEach(() => {
    router = new TriggerRouter();
    sessionStateStore.clear();
  });

  const createAppConfig = (overrides?: Partial<IAppConfig>): IAppConfig => ({
    PORT: 5678,
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

    it('should pass API timeout from app config into model selector', async () => {
      const config = createAppConfig({ API_TIMEOUT_MS: 4321 });
      router.init(config);
      const req = { body: { messages: [{ role: 'user', content: '帮我选一个模型' }] } };
      const selectSpy = vi.spyOn(modelSelector, 'selectModel').mockResolvedValue({
        matched: false,
        confidence: 0,
        analysisTime: 0,
      });

      await router.route(req as any);

      expect(selectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: req.body,
          appConfig: config,
        }),
        config.TriggerRouter,
        5678,
        expect.objectContaining({
          enabled: true,
          rules: config.TriggerRouter?.rules,
        }),
        config.Governance,
        config.APIKEY,
        4321
      );
      selectSpy.mockRestore();
    });

    it('should append governance trace reason when a rule matches', async () => {
      router.init(createAppConfig());
      const req = {
        governanceTrace: {
          requestId: 'req-1',
          routeReason: [],
          stickyHit: false,
          alignmentUsed: false,
          cascadeTriggered: false,
          shadowChecked: false,
          startedAt: Date.now(),
        },
        body: { messages: [{ role: 'user', content: '请帮我生成图片' }] },
      };

      const result = await router.route(req as any);

      expect(result.matched).toBe(true);
      expect(req.governanceTrace.routeReason).toContain('trigger_rule:image_generation');
    });

    it('should keep route source for sticky results', async () => {
      const config = createAppConfig({
        Governance: {
          enabled: true,
          sticky: { enabled: true },
        } as any,
      });
      router.init(config);
      sessionStateStore.put('sticky-session', {
        preferredModel: 'provider,sticky-model',
        lastSuccessfulModel: 'provider,sticky-model',
        lastTaskFingerprint: '请帮我修复登录逻辑',
      });
      const req = {
        sessionId: 'sticky-session',
        governanceTrace: {
          requestId: 'req-2',
          routeReason: [],
          stickyHit: false,
          alignmentUsed: false,
          cascadeTriggered: false,
          shadowChecked: false,
          startedAt: Date.now(),
        },
        body: { messages: [{ role: 'user', content: '请帮我修复登录逻辑' }] },
      };

      const result = await router.route(req as any);

      expect(result.routeSource).toBe('sticky_correction');
      expect(req.governanceTrace.routeReason).toContain('sticky_correction');
      expect(req.governanceTrace.stickyHit).toBe(true);
    });

    it('should record semantic_match trace reasons with unified labels', async () => {
      const config = createAppConfig({
        Governance: {
          enabled: true,
          semantic: {
            enabled: true,
            threshold: 0.2,
            prototypes: {
              architecture: '重构 系统 结构 模块 拆分 架构 设计',
            },
          },
        } as any,
      });
      router.init(config);
      const req = {
        governanceTrace: {
          requestId: 'req-semantic',
          routeReason: [],
          stickyHit: false,
          alignmentUsed: false,
          cascadeTriggered: false,
          shadowChecked: false,
          startedAt: Date.now(),
        },
        body: { messages: [{ role: 'user', content: '请帮我重构系统结构并拆分核心模块' }] },
      };

      const result = await router.route(req as any);

      expect(result.routeSource).toBe('semantic_match');
      expect(req.governanceTrace.routeReason).toContain('semantic_match:architecture');
    });

    it('should route through SmartRouter-only embedded rules even when TriggerRouter is disabled', async () => {
      const config = createAppConfig({
        TriggerRouter: {
          enabled: false,
          analysis_scope: 'last_message',
          llm_intent_recognition: false,
          rules: [],
        },
        SmartRouter: {
          enabled: true,
          rules: [
            {
              name: 'architecture',
              priority: 90,
              enabled: true,
              patterns: [{ type: 'exact', keywords: ['架构设计'] }],
              model: 'openrouter,claude-opus-4',
            },
          ],
        } as any,
      });
      router.init(config);
      expect(router.isEnabled()).toBe(true);

      const req = { body: { messages: [{ role: 'user', content: '请帮我做架构设计' }] } };
      const result = await router.route(req as any);

      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,claude-opus-4');
      expect(result.routeSource).toBe('trigger_rule');
    });

    it('should record smart_router trace reason with unified naming', async () => {
      const config = createAppConfig({
        TriggerRouter: {
          enabled: false,
          analysis_scope: 'last_message',
          llm_intent_recognition: false,
          rules: [],
        },
        SmartRouter: {
          enabled: true,
          router_model: 'provider,router-model',
          candidates: [
            { model: 'provider,model-a', description: 'A' },
            { model: 'provider,model-b', description: 'B' },
          ],
        } as any,
      });
      router.init(config);
      const req = {
        governanceTrace: {
          requestId: 'req-smart',
          routeReason: [],
          stickyHit: false,
          alignmentUsed: false,
          cascadeTriggered: false,
          shadowChecked: false,
          startedAt: Date.now(),
        },
        body: { messages: [{ role: 'user', content: '帮我选一个模型' }] },
      };
      const selectSpy = vi.spyOn(modelSelector, 'selectModel').mockResolvedValue({
        matched: true,
        model: 'provider,model-a',
        confidence: 0.9,
        analysisTime: 0,
        analyzedText: '帮我选一个模型',
        routeSource: 'smart_router',
      });

      const result = await router.route(req as any);

      expect(result.routeSource).toBe('smart_router');
      expect(req.governanceTrace.routeReason).toContain('smart_router');
      expect(req.governanceTrace.routeReason).not.toContain('smart_decision');
      selectSpy.mockRestore();
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
