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
  const reader = stream.getReader();

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          const result = await handler(value, controller);

          if (result !== undefined) {
            controller.enqueue(result);
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
