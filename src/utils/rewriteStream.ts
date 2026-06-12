/**
 * Rewrite Stream
 *
 * 流重写工具
 */

/**
 * 重写流
 * 允许对 SSE 流进行转换处理
 */
export function rewriteStream(
  stream: ReadableStream,
  handler: (
    data: any,
    controller: any
  ) => Promise<any>
): ReadableStream {
  let reader: ReadableStreamDefaultReader | undefined;
  let cancelled = false;

  const safeClose = (controller: ReadableStreamDefaultController) => {
    try {
      controller.close();
    } catch {
      // Downstream may have cancelled while the upstream reader was settling.
    }
  };

  const safeEnqueue = (controller: ReadableStreamDefaultController, value: any): boolean => {
    try {
      controller.enqueue(value);
      return true;
    } catch {
      cancelled = true;
      return false;
    }
  };

  return new ReadableStream({
    async start(controller) {
      reader = stream.getReader();
      try {
        while (true) {
          if (cancelled) {
            break;
          }

          const { done, value } = await reader.read();

          if (done) {
            safeClose(controller);
            break;
          }

          const result = await handler(value, controller);

          if (result !== undefined) {
            if (!safeEnqueue(controller, result)) {
              await reader.cancel('downstream_closed').catch(() => undefined);
              break;
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          try {
            controller.error(error);
          } catch {
            // The consumer may already have cancelled; treat it as a settled stream.
          }
        }
      } finally {
        reader?.releaseLock();
        reader = undefined;
      }
    },
    cancel(reason) {
      cancelled = true;
      return reader?.cancel(reason);
    },
  });
}
