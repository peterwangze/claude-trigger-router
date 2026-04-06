import { describe, expect, it } from 'vitest';
import { createMessageIR, createSingleUserTextIR } from './message-ir';
import { toAnthropicMessagesRequest } from './anthropic';
import { toOpenAIChatRequest } from './openai';
import { buildUpstreamRequest } from './index';

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
      tools: [
        {
          name: 'search',
          description: 'Search the docs',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ],
      tool_choice: {
        type: 'tool',
        name: 'search',
      },
      ir: {
        system: ['You are helpful'],
        messages: [
          {
            role: 'assistant',
            parts: [
              { type: 'text', text: 'Let me check.' },
              { type: 'tool_call', id: 'call-1', name: 'search', arguments: '{"query":"router"}' },
            ],
          },
          {
            role: 'user',
            parts: [{ type: 'tool_result', tool_call_id: 'call-1', content: { ok: true } }],
          },
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
        {
          role: 'assistant',
          content: 'Let me check.',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"query":"router"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call-1',
          content: '{"ok":true}',
        },
        { role: 'user', content: 'hello' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the docs',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: {
          name: 'search',
        },
      },
      reasoning: {
        effort: 'high',
      },
    });
  });

  it('builds an openai upstream request from an anthropic-style request payload', () => {
    const upstream = buildUpstreamRequest({
      model: 'gpt-5-mini',
      interface: 'openai',
      capabilities: {
        thinking: {
          supported: true,
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
      },
      request: {
        model: 'model__fast,gpt-5-mini',
        max_tokens: 128,
        temperature: 0.2,
        system: [{ type: 'text', text: 'Stay concise' }],
        messages: [
          { role: 'user', content: 'hello' },
        ],
        tools: [
          {
            name: 'search',
            description: 'Search the docs',
            input_schema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        ],
      },
    });

    expect(upstream.ir).toEqual({
      system: ['Stay concise'],
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      ],
      options: undefined,
    });
    expect(upstream.body).toEqual({
      model: 'gpt-5-mini',
      max_completion_tokens: 128,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Stay concise' },
        { role: 'user', content: 'hello' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the docs',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        },
      ],
    });
  });

  it('drops thinking when compiled capabilities mark reasoning unsupported', () => {
    const upstream = buildUpstreamRequest({
      model: 'gpt-5-mini',
      interface: 'openai',
      capabilities: {
        thinking: {
          supported: false,
        },
        tools: true,
        images: true,
        systemMessageStyle: 'openai',
      },
      request: {
        model: 'model__fast,gpt-5-mini',
        max_tokens: 128,
        messages: [
          { role: 'user', content: 'hello' },
        ],
        thinking: {
          type: 'enabled',
          effort: 'high',
        },
      },
    });

    expect(upstream.diagnostics).toEqual(['thinking_ignored']);
    expect(upstream.body).toEqual({
      model: 'gpt-5-mini',
      max_completion_tokens: 128,
      messages: [
        { role: 'user', content: 'hello' },
      ],
    });
  });
});
