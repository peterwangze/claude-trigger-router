import { describe, expect, it, vi } from 'vitest';
import { createGovernanceTrace, governanceTraceStore } from './trace';
import { governStreamingResponse } from './stream-response-governance';
import { sessionUsageCache } from '../router/cache';

function createSSEStream(events: any[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        let output = '';
        if (event.event) {
          output += `event: ${event.event}\n`;
        }
        output += `data: ${JSON.stringify(event.data)}\n\n`;
        controller.enqueue(encoder.encode(output));
      }
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }

  return output;
}

describe('governStreamingResponse', () => {
  it('preserves tool call events when no stream guard retry is needed', async () => {
    governanceTraceStore.clear();
    sessionUsageCache.clear();

    const req: any = {
      sessionId: 'session-tool',
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-tool' }),
    };

    const stream = createSSEStream([
      {
        event: 'content_block_start',
        data: {
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tool-1',
            name: 'search_docs',
          },
        },
      },
      {
        event: 'content_block_delta',
        data: {
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"query":"router"}',
          },
        },
      },
      {
        event: 'content_block_stop',
        data: {
          index: 0,
          type: 'content_block_stop',
        },
      },
      {
        event: 'message_delta',
        data: {
          usage: { input_tokens: 3, output_tokens: 5 },
        },
      },
    ]);

    const result = governStreamingResponse(
      stream,
      req,
      {
        Governance: {
          enabled: true,
          cascade: {
            enabled: true,
            stream_guard: true,
            triggers: {
              placeholder_patterns: ['TODO'],
            },
            levels: [
              { from: 'provider,model-a', to: 'provider,model-b' },
            ],
          },
        },
      } as any,
      3456
    );

    const output = await readAll(result);
    expect(output).toContain('content_block_start');
    expect(output).toContain('search_docs');
    expect(output).toContain('input_json_delta');
    expect(sessionUsageCache.get('session-tool')).toEqual({ input_tokens: 3, output_tokens: 5 });
    expect(governanceTraceStore.get('req-stream-tool')?.requestId).toBe('req-stream-tool');
    expect(req.governanceTrace.routeReason).not.toContain('cascade_gate_stream');
  });

  it('passes through original stream when stream_guard is disabled', async () => {
    const req: any = {
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-pass' }),
    };

    const stream = createSSEStream([
      { event: 'content_block_delta', data: { delta: { text: 'hello world' } } },
      { event: 'message_delta', data: { usage: { input_tokens: 1, output_tokens: 2 } } },
    ]);

    const result = governStreamingResponse(
      stream,
      req,
      {
        Governance: {
          enabled: true,
          cascade: {
            enabled: true,
            stream_guard: false,
          },
        },
      } as any,
      3456
    );

    const output = await readAll(result);
    expect(output).toContain('hello world');
    expect(req.governanceTrace.routeReason).not.toContain('cascade_gate_stream');
  });

  it('retries with upgraded model when stream_guard detects failure evidence', async () => {
    governanceTraceStore.clear();

    const req: any = {
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-retry' }),
    };

    const original = createSSEStream([
      { event: 'content_block_delta', data: { delta: { text: 'TODO: finish implementation' } } },
      { event: 'message_delta', data: { usage: { input_tokens: 1, output_tokens: 2 } } },
    ]);

    const retried = createSSEStream([
      { event: 'content_block_delta', data: { delta: { text: 'rescued streamed output' } } },
      { event: 'message_delta', data: { usage: { input_tokens: 2, output_tokens: 4 } } },
    ]);

    const result = governStreamingResponse(
      original,
      req,
      {
        Governance: {
          enabled: true,
          cascade: {
            enabled: true,
            stream_guard: true,
            triggers: {
              placeholder_patterns: ['TODO'],
            },
            levels: [
              { from: 'provider,model-a', to: 'provider,model-b' },
            ],
          },
        },
      } as any,
      3456,
      {
        executeCascadeRetryStream: vi.fn().mockResolvedValue(retried),
      }
    );

    const output = await readAll(result);
    expect(output).toContain('rescued streamed output');
    expect(req.body.model).toBe('provider,model-b');
    expect(req.governanceTrace.routeReason).toContain('cascade_gate_stream');
    expect(req.governanceTrace.routeReason).toContain('cascade_stream_retry_executed');
    expect(governanceTraceStore.get('req-stream-retry')?.finalModel).toBe('provider,model-b');
  });

  it('resolves cascade level modelIds in stream governance', async () => {
    governanceTraceStore.clear();

    const req: any = {
      body: {
        model: 'model__sonnet,anthropic/claude-sonnet-4',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-model-id' }),
    };

    const original = createSSEStream([
      { event: 'content_block_delta', data: { delta: { text: 'TODO: finish implementation' } } },
      { event: 'message_delta', data: { usage: { input_tokens: 1, output_tokens: 2 } } },
    ]);

    const retried = createSSEStream([
      { event: 'content_block_delta', data: { delta: { text: 'rescued streamed output' } } },
      { event: 'message_delta', data: { usage: { input_tokens: 2, output_tokens: 4 } } },
    ]);

    const result = governStreamingResponse(
      original,
      req,
      {
        Models: [
          {
            id: 'sonnet',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'anthropic/claude-sonnet-4',
          },
          {
            id: 'opus',
            api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
            api_key: 'sk-test',
            protocol: 'openai',
            model: 'anthropic/claude-opus-4',
          },
        ],
        Governance: {
          enabled: true,
          cascade: {
            enabled: true,
            stream_guard: true,
            triggers: {
              placeholder_patterns: ['TODO'],
            },
            levels: [
              { from: 'sonnet', to: 'opus' },
            ],
          },
        },
      } as any,
      3456,
      {
        executeCascadeRetryStream: vi.fn().mockResolvedValue(retried),
      }
    );

    await readAll(result);
    expect(req.body.model).toBe('model__opus,anthropic/claude-opus-4');
  });
});
