import { describe, it, expect, beforeEach } from 'vitest';
import { ModelSelector } from '../trigger/selector';
import { ITriggerConfig, ITriggerRule } from '../trigger/types';

describe('ModelSelector', () => {
  let selector: ModelSelector;

  beforeEach(() => {
    selector = new ModelSelector();
  });

  // ============ sortRulesByPriority ============

  describe('sortRulesByPriority', () => {
    it('should sort rules by priority descending', () => {
      const rules: ITriggerRule[] = [
        { name: 'low', priority: 10, enabled: true, patterns: [], model: 'a' },
        { name: 'high', priority: 100, enabled: true, patterns: [], model: 'b' },
        { name: 'mid', priority: 50, enabled: true, patterns: [], model: 'c' },
      ];
      const sorted = selector.sortRulesByPriority(rules);
      expect(sorted[0].name).toBe('high');
      expect(sorted[1].name).toBe('mid');
      expect(sorted[2].name).toBe('low');
    });

    it('should filter out disabled rules', () => {
      const rules: ITriggerRule[] = [
        { name: 'enabled', priority: 10, enabled: true, patterns: [], model: 'a' },
        { name: 'disabled', priority: 100, enabled: false, patterns: [], model: 'b' },
      ];
      const sorted = selector.sortRulesByPriority(rules);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].name).toBe('enabled');
    });

    it('should not mutate original array', () => {
      const rules: ITriggerRule[] = [
        { name: 'a', priority: 10, enabled: true, patterns: [], model: 'x' },
        { name: 'b', priority: 20, enabled: true, patterns: [], model: 'y' },
      ];
      selector.sortRulesByPriority(rules);
      expect(rules[0].name).toBe('a');
    });
  });

  // ============ matchRule ============

  describe('matchRule', () => {
    it('should match rule with exact pattern', () => {
      const rule: ITriggerRule = {
        name: 'image',
        priority: 100,
        enabled: true,
        patterns: [{ type: 'exact', keywords: ['生成图片', '画图'] }],
        model: 'openrouter,dall-e-3',
      };
      const result = selector.matchRule('请帮我生成图片', rule);
      expect(result.matched).toBe(true);
    });

    it('should match rule with regex pattern', () => {
      const rule: ITriggerRule = {
        name: 'image',
        priority: 100,
        enabled: true,
        patterns: [{ type: 'regex', pattern: '(画|生成).*(图|图片)' }],
        model: 'openrouter,dall-e-3',
      };
      const result = selector.matchRule('帮我画一幅图', rule);
      expect(result.matched).toBe(true);
    });

    it('should return false for empty text', () => {
      const rule: ITriggerRule = {
        name: 'test',
        priority: 10,
        enabled: true,
        patterns: [{ type: 'exact', keywords: ['test'] }],
        model: 'x',
      };
      expect(selector.matchRule('', rule).matched).toBe(false);
    });

    it('should return false for rule with no patterns', () => {
      const rule: ITriggerRule = {
        name: 'test',
        priority: 10,
        enabled: true,
        patterns: [],
        model: 'x',
      };
      expect(selector.matchRule('test', rule).matched).toBe(false);
    });
  });

  // ============ matchRuleFromText ============

  describe('matchRuleFromText', () => {
    const rules: ITriggerRule[] = [
      {
        name: 'image',
        priority: 100,
        enabled: true,
        patterns: [{ type: 'exact', keywords: ['生成图片', '画图'] }],
        model: 'openrouter,dall-e-3',
      },
      {
        name: 'architecture',
        priority: 90,
        enabled: true,
        patterns: [{ type: 'exact', keywords: ['系统架构', '架构设计'] }],
        model: 'openrouter,claude-opus-4',
      },
      {
        name: 'simple',
        priority: 10,
        enabled: true,
        patterns: [{ type: 'exact', keywords: ['简单', '快速'] }],
        model: 'ollama,qwen',
      },
    ];

    it('should match highest priority rule first', () => {
      const result = selector.matchRuleFromText('请帮我生成图片', rules);
      expect(result).not.toBeNull();
      expect(result!.rule.name).toBe('image');
      expect(result!.rule.model).toBe('openrouter,dall-e-3');
    });

    it('should match lower priority when higher does not match', () => {
      const result = selector.matchRuleFromText('请帮我设计系统架构', rules);
      expect(result).not.toBeNull();
      expect(result!.rule.name).toBe('architecture');
    });

    it('should return null when no rule matches', () => {
      const result = selector.matchRuleFromText('完全不相关的内容', rules);
      expect(result).toBeNull();
    });

    it('should return null for empty text', () => {
      expect(selector.matchRuleFromText('', rules)).toBeNull();
    });

    it('should return null for empty rules', () => {
      expect(selector.matchRuleFromText('test', [])).toBeNull();
    });
  });

  // ============ selectModel (async) ============

  describe('selectModel', () => {
    const config: ITriggerConfig = {
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
    };

    it('should select model when keyword matches', async () => {
      const req = {
        body: {
          messages: [{ role: 'user', content: '请帮我生成图片' }],
        },
      };
      const result = await selector.selectModel(req, config);
      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,dall-e-3');
      expect(result.confidence).toBe(1.0);
      expect(result.rule?.name).toBe('image_generation');
      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });

    it('should return not matched when no rule matches', async () => {
      const req = {
        body: {
          messages: [{ role: 'user', content: '今天天气怎么样' }],
        },
      };
      const result = await selector.selectModel(req, config);
      expect(result.matched).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should return not matched when config is disabled', async () => {
      const disabledConfig = { ...config, enabled: false };
      const req = {
        body: {
          messages: [{ role: 'user', content: '生成图片' }],
        },
      };
      const result = await selector.selectModel(req, disabledConfig);
      expect(result.matched).toBe(false);
    });

    it('should return not matched when no messages', async () => {
      const req = { body: {} };
      const result = await selector.selectModel(req, config);
      expect(result.matched).toBe(false);
      expect(result.analyzedText).toBe('');
    });
  });

  // ============ selectModelSync ============

  describe('selectModelSync', () => {
    const config: ITriggerConfig = {
      enabled: true,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [
        {
          name: 'code_review',
          priority: 80,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['代码审查', 'code review'] }],
          model: 'openrouter,claude-sonnet-4',
        },
      ],
    };

    it('should select model synchronously', () => {
      const req = {
        body: {
          messages: [{ role: 'user', content: '请帮我做代码审查' }],
        },
      };
      const result = selector.selectModelSync(req, config);
      expect(result.matched).toBe(true);
      expect(result.model).toBe('openrouter,claude-sonnet-4');
    });

    it('should not match when disabled', () => {
      const req = {
        body: {
          messages: [{ role: 'user', content: '代码审查' }],
        },
      };
      const result = selector.selectModelSync(req, { ...config, enabled: false });
      expect(result.matched).toBe(false);
    });
  });
});
