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
      5678
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
      id: 'req-stream-pass',
      sessionId: 'session-pass',
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
      5678
    );

    const output = await readAll(result);
    expect(output).toContain('hello world');
    expect(req.governanceTrace.routeReason).not.toContain('cascade_gate_stream');
    expect(req.streamLifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'start',
        requestId: 'req-stream-pass',
        sessionId: 'session-pass',
      }),
      expect.objectContaining({
        event: 'chunk',
        detail: expect.objectContaining({
          chunks: 1,
        }),
      }),
      expect.objectContaining({
        event: 'finalize',
        detail: expect.objectContaining({
          status: 'completed',
          chunks: 2,
          sawText: true,
        }),
      }),
    ]));
  });

  it('emits streamed chunks before the upstream stream closes when stream_guard is disabled', async () => {
    let releaseSecondChunk: (() => void) | undefined;
    const secondChunkReady = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    const encoder = new TextEncoder();
    const req: any = {
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-live' }),
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"delta":{"text":"first"}}\n\n'));
        await secondChunkReady;
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"delta":{"text":"second"}}\n\n'));
        controller.close();
      },
    });

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
      5678
    );

    const reader = result.getReader();
    const firstRead = await reader.read();

    expect(firstRead.done).toBe(false);
    expect(new TextDecoder().decode(firstRead.value)).toContain('first');

    releaseSecondChunk?.();
    const secondRead = await reader.read();
    expect(new TextDecoder().decode(secondRead.value)).toContain('second');
    expect((await reader.read()).done).toBe(true);
  });

  it('closes with a readable SSE error event when upstream stream fails mid-flight', async () => {
    const encoder = new TextEncoder();
    const req: any = {
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-error' }),
    };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"delta":{"text":"first"}}\n\n'));
        controller.error(new Error('upstream socket closed'));
      },
    });

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
      5678
    );

    const output = await readAll(result);
    expect(output).toContain('first');
    expect(output).toContain('event: error');
    expect(output).toContain('upstream_stream_error');
    expect(output).toContain('The upstream stream closed before completion.');
    expect(req.streamLifecycle).toEqual([
      expect.objectContaining({ event: 'start' }),
      expect.objectContaining({ event: 'chunk' }),
      expect.objectContaining({
        event: 'upstream_error',
        detail: expect.objectContaining({
          message: 'upstream socket closed',
          chunks: 1,
        }),
      }),
      expect.objectContaining({
        event: 'finalize',
        detail: expect.objectContaining({
          status: 'upstream_error',
          streamError: 'upstream socket closed',
        }),
      }),
    ]);
  });

  it('records client cancellation lifecycle without treating it as upstream failure', async () => {
    let releaseSecondChunk: (() => void) | undefined;
    const secondChunkReady = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    const upstreamCancel = vi.fn();
    const encoder = new TextEncoder();
    const req: any = {
      id: 'req-stream-cancel',
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-stream-cancel' }),
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"delta":{"text":"first"}}\n\n'));
        await secondChunkReady;
        controller.enqueue(encoder.encode('event: content_block_delta\ndata: {"delta":{"text":"second"}}\n\n'));
        controller.close();
      },
      cancel: upstreamCancel,
    });

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
      5678
    );

    const reader = result.getReader();
    const firstRead = await reader.read();
    expect(firstRead.done).toBe(false);

    await reader.cancel(new Error('manual stop'));
    releaseSecondChunk?.();

    expect(upstreamCancel).toHaveBeenCalledWith(expect.any(Error));
    expect(req.streamLifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'start' }),
      expect.objectContaining({
        event: 'chunk',
        detail: expect.objectContaining({ chunks: 1 }),
      }),
      expect.objectContaining({
        event: 'client_cancel',
        detail: expect.objectContaining({
          reason: 'manual stop',
          chunks: 1,
        }),
      }),
      expect.objectContaining({
        event: 'finalize',
        detail: expect.objectContaining({
          status: 'client_cancel',
          chunks: 1,
        }),
      }),
    ]));
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
      5678,
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
      5678,
      {
        executeCascadeRetryStream: vi.fn().mockResolvedValue(retried),
      }
    );

    await readAll(result);
    expect(req.body.model).toBe('model__opus,anthropic/claude-opus-4');
  });
});
