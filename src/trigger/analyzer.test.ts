import { describe, it, expect } from 'vitest';
import { ContextAnalyzer } from '../trigger/analyzer';
import { ITriggerConfig } from '../trigger/types';

describe('ContextAnalyzer', () => {
  const analyzer = new ContextAnalyzer();

  // ============ extractLastUserMessage ============

  describe('extractLastUserMessage', () => {
    it('should extract text from the last user message (string content)', () => {
      const messages = [
        { role: 'user' as const, content: 'first message' },
        { role: 'assistant' as const, content: 'reply' },
        { role: 'user' as const, content: '请帮我生成一张图片' },
      ];
      expect(analyzer.extractLastUserMessage(messages)).toBe('请帮我生成一张图片');
    });

    it('should extract text from structured content array', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image', source: { data: 'base64...' } },
            { type: 'text', text: 'world' },
          ],
        },
      ];
      expect(analyzer.extractLastUserMessage(messages)).toBe('hello\nworld');
    });

    it('should skip assistant messages to find last user message', () => {
      const messages = [
        { role: 'user' as const, content: 'user msg' },
        { role: 'assistant' as const, content: 'assistant msg' },
      ];
      expect(analyzer.extractLastUserMessage(messages)).toBe('user msg');
    });

    it('should return empty string for empty messages', () => {
      expect(analyzer.extractLastUserMessage([])).toBe('');
    });

    it('should return empty string for null messages', () => {
      expect(analyzer.extractLastUserMessage(null as any)).toBe('');
    });

    it('should return empty string when no user messages exist', () => {
      const messages = [
        { role: 'assistant' as const, content: 'only assistant' },
      ];
      expect(analyzer.extractLastUserMessage(messages)).toBe('');
    });
  });

  // ============ extractAllUserMessages ============

  describe('extractAllUserMessages', () => {
    it('should extract all user messages', () => {
      const messages = [
        { role: 'user' as const, content: 'first' },
        { role: 'assistant' as const, content: 'reply' },
        { role: 'user' as const, content: 'second' },
      ];
      expect(analyzer.extractAllUserMessages(messages)).toEqual(['first', 'second']);
    });

    it('should return empty array for empty messages', () => {
      expect(analyzer.extractAllUserMessages([])).toEqual([]);
    });
  });

  // ============ extractTextByScope ============

  describe('extractTextByScope', () => {
    const messages = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'hi' },
      { role: 'user' as const, content: 'world' },
    ];

    it('should extract last message for last_message scope', () => {
      expect(analyzer.extractTextByScope(messages, 'last_message')).toBe('world');
    });

    it('should extract all messages for full_conversation scope', () => {
      const result = analyzer.extractTextByScope(messages, 'full_conversation');
      expect(result).toContain('hello');
      expect(result).toContain('world');
      expect(result).toContain('---');
    });

    it('should default to last_message for unknown scope', () => {
      expect(analyzer.extractTextByScope(messages, 'unknown' as any)).toBe('world');
    });
  });

  // ============ analyze ============

  describe('analyze', () => {
    const config: ITriggerConfig = {
      enabled: true,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [],
    };

    it('should analyze request with default scope', () => {
      const req = {
        body: {
          messages: [
            { role: 'user', content: '请帮我设计系统架构' },
          ],
        },
      };
      expect(analyzer.analyze(req, config)).toBe('请帮我设计系统架构');
    });

    it('should return empty string when no messages', () => {
      const req = { body: {} };
      expect(analyzer.analyze(req, config)).toBe('');
    });
  });

  // ============ hasToolResults ============

  describe('hasToolResults', () => {
    it('should return true when last message is mostly tool results', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: '1', content: 'result1' },
            { type: 'tool_result', tool_use_id: '2', content: 'result2' },
            { type: 'text', text: 'continue' },
          ],
        },
      ];
      expect(analyzer.hasToolResults(messages)).toBe(true);
    });

    it('should return false when tool results are minority', () => {
      const messages = [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'some text' },
            { type: 'text', text: 'more text' },
            { type: 'tool_result', tool_use_id: '1', content: 'result' },
          ],
        },
      ];
      expect(analyzer.hasToolResults(messages)).toBe(false);
    });

    it('should return false when last message is from assistant', () => {
      const messages = [
        { role: 'assistant' as const, content: 'reply' },
      ];
      expect(analyzer.hasToolResults(messages)).toBe(false);
    });

    it('should return false for string content', () => {
      const messages = [
        { role: 'user' as const, content: 'just text' },
      ];
      expect(analyzer.hasToolResults(messages)).toBe(false);
    });

    it('should return false for empty messages', () => {
      expect(analyzer.hasToolResults([])).toBe(false);
    });
  });
});
