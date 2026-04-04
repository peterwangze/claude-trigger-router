import { describe, expect, it, vi } from 'vitest';
import { createGovernanceTrace } from './trace';
import { governStreamingResponse } from './stream-response-governance';

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
  });
});
