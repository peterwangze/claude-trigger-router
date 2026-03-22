import { describe, it, expect, beforeEach } from 'vitest';
import { IntentDetector } from '../trigger/intent';
import { ITriggerConfig, ITriggerRule } from '../trigger/types';

describe('IntentDetector', () => {
  let detector: IntentDetector;

  beforeEach(() => {
    detector = new IntentDetector();
    detector.clearCache();
  });

  // ============ findRuleByIntent ============

  describe('findRuleByIntent', () => {
    const rules: ITriggerRule[] = [
      { name: 'image_generation', priority: 100, enabled: true, patterns: [], model: 'a' },
      { name: 'architecture', priority: 90, enabled: true, patterns: [], model: 'b' },
      { name: 'disabled_rule', priority: 80, enabled: false, patterns: [], model: 'c' },
    ];

    it('should find rule by intent name (case-insensitive)', () => {
      const rule = detector.findRuleByIntent('Image_Generation', rules);
      expect(rule).not.toBeNull();
      expect(rule!.name).toBe('image_generation');
    });

    it('should find rule with exact name', () => {
      const rule = detector.findRuleByIntent('architecture', rules);
      expect(rule).not.toBeNull();
      expect(rule!.name).toBe('architecture');
    });

    it('should not find disabled rule', () => {
      const rule = detector.findRuleByIntent('disabled_rule', rules);
      expect(rule).toBeNull();
    });

    it('should return null for unknown intent', () => {
      const rule = detector.findRuleByIntent('unknown', rules);
      expect(rule).toBeNull();
    });
  });

  // ============ detectIntent (without LLM) ============

  describe('detectIntent (no LLM)', () => {
    it('should return default when llm_intent_recognition is disabled', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: false,
        rules: [],
      };
      const result = await detector.detectIntent('test', config);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should return default when intent_model is not configured', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        rules: [],
      };
      const result = await detector.detectIntent('test', config);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should handle LLM call failure gracefully', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'test,model',
        rules: [
          { name: 'test', priority: 10, enabled: true, patterns: [], model: 'x' },
        ],
      };
      // Mock fetch that fails
      const mockFetch = async () => {
        throw new Error('Network error');
      };
      const result = await detector.detectIntent('test', config, 3456, mockFetch as any);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should handle non-OK response gracefully', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'test,model',
        rules: [
          { name: 'test', priority: 10, enabled: true, patterns: [], model: 'x' },
        ],
      };
      const mockFetch = async () => ({
        ok: false,
        status: 500,
      });
      const result = await detector.detectIntent('test', config, 3456, mockFetch as any);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });

    it('should parse valid LLM response', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'test,model',
        rules: [
          { name: 'image_generation', priority: 10, enabled: true, patterns: [], model: 'x', description: 'Image gen' },
        ],
      };
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                intent: 'image_generation',
                confidence: 0.95,
                reasoning: 'The user wants to generate an image',
              }),
            },
          ],
        }),
      });
      const result = await detector.detectIntent('生成一张图', config, 3456, mockFetch as any);
      expect(result.intent).toBe('image_generation');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle LLM response without valid JSON', async () => {
      const config: ITriggerConfig = {
        enabled: true,
        analysis_scope: 'last_message',
        llm_intent_recognition: true,
        intent_model: 'test,model',
        rules: [
          { name: 'test', priority: 10, enabled: true, patterns: [], model: 'x' },
        ],
      };
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          content: [{ text: 'no json here' }],
        }),
      });
      const result = await detector.detectIntent('test', config, 3456, mockFetch as any);
      expect(result.intent).toBe('general');
      expect(result.confidence).toBe(0);
    });
  });
});
