import { describe, expect, it } from 'vitest';
import { SSEParserTransform } from './SSEParser.transform';

async function collectEvents(chunks: string[]) {
  const encoder = new TextEncoder();
  const parser = new SSEParserTransform();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  const reader = source.pipeThrough(parser as any).getReader();
  const events: any[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    events.push(value);
  }

  return events;
}

describe('SSEParserTransform', () => {
  it('preserves event state across chunk boundaries', async () => {
    const events = await collectEvents([
      'event: content_block_delta\n',
      'data: {"delta":{"text":"hel',
      'lo"}}\n',
      '\n',
    ]);

    expect(events).toEqual([
      {
        event: 'content_block_delta',
        data: {
          delta: {
            text: 'hello',
          },
        },
      },
    ]);
  });

  it('flushes a final event without a trailing blank line', async () => {
    const events = await collectEvents([
      'event: message_delta\n',
      'data: {"usage":{"input_tokens":1,"output_tokens":2}}',
    ]);

    expect(events).toEqual([
      {
        event: 'message_delta',
        data: {
          usage: {
            input_tokens: 1,
            output_tokens: 2,
          },
        },
      },
    ]);
  });

  it('decodes multibyte text split across chunks', async () => {
    const parser = new SSEParserTransform();
    const bytes = new TextEncoder().encode('event: content_block_delta\ndata: {"delta":{"text":"你好"}}\n\n');
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 48));
        controller.enqueue(bytes.slice(48));
        controller.close();
      },
    });
    const reader = source.pipeThrough(parser as any).getReader();
    const events: any[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      events.push(value);
    }

    expect(events).toEqual([
      {
        event: 'content_block_delta',
        data: {
          delta: {
            text: '你好',
          },
        },
      },
    ]);
  });
});
