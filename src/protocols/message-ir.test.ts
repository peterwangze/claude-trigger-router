import { describe, expect, it } from 'vitest';
import { createMessageIR, createSingleUserTextIR } from './message-ir';
import { toAnthropicMessagesRequest } from './anthropic';
import { toOpenAIChatRequest } from './openai';

describe('message IR', () => {
  it('creates IR from anthropic-style request payload', () => {
    const ir = createMessageIR({
      system: [{ type: 'text', text: 'System rule' }],
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'tool_use', id: 'call-1', name: 'search', input: { q: 'x' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'call-1', content: 'done' },
          ],
        },
      ],
      thinking: { type: 'enabled', effort: 'high' },
    });

    expect(ir).toEqual({
      system: ['System rule'],
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        {
          role: 'assistant',
          parts: [
            { type: 'text', text: 'hi' },
            { type: 'tool_call', id: 'call-1', name: 'search', arguments: '{"q":"x"}' },
          ],
        },
        {
          role: 'user',
          parts: [{ type: 'tool_result', tool_call_id: 'call-1', content: 'done' }],
        },
      ],
      options: {
        thinking: {
          enabled: true,
          effort: 'high',
          budget_tokens: undefined,
        },
      },
    });
  });

  it('builds anthropic messages request from IR', () => {
    const body = toAnthropicMessagesRequest({
      model: 'sonnet',
      max_tokens: 128,
      ir: createSingleUserTextIR('pick the best model', {
        thinking: {
          enabled: true,
          effort: 'medium',
        },
      }),
    });

    expect(body).toEqual({
      model: 'sonnet',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'pick the best model' }],
        },
      ],
      thinking: {
        type: 'enabled',
        effort: 'medium',
      },
    });
  });

  it('builds openai chat request from IR', () => {
    const body = toOpenAIChatRequest({
      model: 'gpt-5',
      max_completion_tokens: 256,
      ir: {
        system: ['You are helpful'],
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'hello' }],
          },
        ],
        options: {
          thinking: {
            enabled: true,
            effort: 'high',
          },
        },
      },
    });

    expect(body).toEqual({
      model: 'gpt-5',
      max_completion_tokens: 256,
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hello' },
      ],
      reasoning: {
        effort: 'high',
      },
    });
  });
});
