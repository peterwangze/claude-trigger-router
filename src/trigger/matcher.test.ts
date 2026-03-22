import { describe, it, expect, beforeEach } from 'vitest';
import { PatternMatcher } from '../trigger/matcher';
import { ITriggerPattern } from '../trigger/types';

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;

  beforeEach(() => {
    matcher = new PatternMatcher();
    matcher.clearCache();
  });

  // ============ matchExact ============

  describe('matchExact', () => {
    it('should match exact keyword (case-insensitive)', () => {
      const result = matcher.matchExact('请帮我生成图片', ['生成图片', '画图']);
      expect(result.matched).toBe(true);
      expect(result.matchedKeyword).toBe('生成图片');
    });

    it('should match English keyword (case-insensitive)', () => {
      const result = matcher.matchExact('Generate an Image for me', ['generate an image']);
      expect(result.matched).toBe(true);
    });

    it('should not match when case-sensitive and case differs', () => {
      const result = matcher.matchExact('Generate Image', ['generate image'], true);
      expect(result.matched).toBe(false);
    });

    it('should match when case-sensitive and case matches', () => {
      const result = matcher.matchExact('Generate Image', ['Generate Image'], true);
      expect(result.matched).toBe(true);
    });

    it('should return false for empty text', () => {
      const result = matcher.matchExact('', ['keyword']);
      expect(result.matched).toBe(false);
    });

    it('should return false for empty keywords', () => {
      const result = matcher.matchExact('some text', []);
      expect(result.matched).toBe(false);
    });

    it('should skip empty keyword strings', () => {
      const result = matcher.matchExact('hello world', ['', 'hello']);
      expect(result.matched).toBe(true);
      expect(result.matchedKeyword).toBe('hello');
    });

    it('should match first keyword found', () => {
      const result = matcher.matchExact('design the architecture', ['architecture', 'design']);
      expect(result.matched).toBe(true);
      expect(result.matchedKeyword).toBe('architecture');
    });
  });

  // ============ matchRegex ============

  describe('matchRegex', () => {
    it('should match simple regex pattern', () => {
      const result = matcher.matchRegex('请生成一张风景图片', '生成.*图片');
      expect(result.matched).toBe(true);
      expect(result.regexMatch).toBeTruthy();
    });

    it('should return false for non-matching regex', () => {
      const result = matcher.matchRegex('hello world', '^goodbye');
      expect(result.matched).toBe(false);
    });

    it('should handle invalid regex gracefully', () => {
      const result = matcher.matchRegex('test', '[invalid');
      expect(result.matched).toBe(false);
    });

    it('should return false for empty text', () => {
      const result = matcher.matchRegex('', 'pattern');
      expect(result.matched).toBe(false);
    });

    it('should return false for empty pattern', () => {
      const result = matcher.matchRegex('text', '');
      expect(result.matched).toBe(false);
    });

    it('should handle cached regex correctly (lastIndex reset)', () => {
      const pattern = 'test\\d+';
      // First call
      const result1 = matcher.matchRegex('test123', pattern);
      expect(result1.matched).toBe(true);
      // Second call with same pattern should also match (lastIndex must reset)
      const result2 = matcher.matchRegex('test456', pattern);
      expect(result2.matched).toBe(true);
    });
  });

  // ============ match ============

  describe('match', () => {
    it('should dispatch to matchExact for exact type', () => {
      const pattern: ITriggerPattern = {
        type: 'exact',
        keywords: ['图片生成'],
      };
      const result = matcher.match('请帮我图片生成', pattern);
      expect(result.matched).toBe(true);
    });

    it('should dispatch to matchRegex for regex type', () => {
      const pattern: ITriggerPattern = {
        type: 'regex',
        pattern: '(画|生成|创建).*(图|图片|图像)',
      };
      const result = matcher.match('帮我画一张图', pattern);
      expect(result.matched).toBe(true);
    });

    it('should return false for regex pattern without pattern string', () => {
      const pattern: ITriggerPattern = {
        type: 'regex',
      };
      const result = matcher.match('text', pattern);
      expect(result.matched).toBe(false);
    });

    it('should return false for unknown pattern type', () => {
      const pattern = { type: 'unknown' } as any;
      const result = matcher.match('text', pattern);
      expect(result.matched).toBe(false);
    });

    it('should return false for null/empty input', () => {
      const pattern: ITriggerPattern = { type: 'exact', keywords: ['test'] };
      expect(matcher.match('', pattern).matched).toBe(false);
      expect(matcher.match('text', null as any).matched).toBe(false);
    });
  });

  // ============ matchAny ============

  describe('matchAny', () => {
    it('should return first matching pattern', () => {
      const patterns: ITriggerPattern[] = [
        { type: 'exact', keywords: ['no-match'] },
        { type: 'exact', keywords: ['生成图片'] },
        { type: 'regex', pattern: '图片' },
      ];
      const result = matcher.matchAny('请生成图片', patterns);
      expect(result.matched).toBe(true);
      expect(result.matchedKeyword).toBe('生成图片');
    });

    it('should return false when no pattern matches', () => {
      const patterns: ITriggerPattern[] = [
        { type: 'exact', keywords: ['no-match'] },
        { type: 'regex', pattern: '^xyz$' },
      ];
      const result = matcher.matchAny('hello world', patterns);
      expect(result.matched).toBe(false);
    });

    it('should return false for empty patterns array', () => {
      const result = matcher.matchAny('text', []);
      expect(result.matched).toBe(false);
    });
  });
});
