import { describe, expect, it, vi } from 'vitest';
import { rewriteStream } from './rewriteStream';

describe('rewriteStream', () => {
  it('forwards rewritten values and closes normally', async () => {
    const source = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
        controller.enqueue(2);
        controller.close();
      },
    });

    const result = rewriteStream(source, async (value) => value * 2);
    const reader = result.getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: 2 });
    await expect(reader.read()).resolves.toEqual({ done: false, value: 4 });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it('cancels the upstream reader when the downstream consumer cancels', async () => {
    const upstreamCancel = vi.fn();
    let releaseSecondRead: (() => void) | undefined;
    const secondReadReady = new Promise<void>((resolve) => {
      releaseSecondRead = resolve;
    });
    const source = new ReadableStream<number>({
      async start(controller) {
        controller.enqueue(1);
        await secondReadReady;
        controller.enqueue(2);
      },
      cancel: upstreamCancel,
    });

    const result = rewriteStream(source, async (value) => value);
    const reader = result.getReader();

    await expect(reader.read()).resolves.toEqual({ done: false, value: 1 });
    await expect(reader.cancel(new Error('manual stop'))).resolves.toBeUndefined();
    releaseSecondRead?.();

    expect(upstreamCancel).toHaveBeenCalledWith(expect.any(Error));
  });

  it('surfaces handler failures when the stream is still active', async () => {
    const source = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(1);
      },
    });

    const result = rewriteStream(source, async () => {
      throw new Error('handler failed');
    });
    const reader = result.getReader();

    await expect(reader.read()).rejects.toThrow('handler failed');
  });
});
