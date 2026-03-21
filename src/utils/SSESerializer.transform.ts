/**
 * SSE Serializer Transform
 *
 * Server-Sent Events 序列化转换流
 */

export class SSESerializerTransform {
  constructor() {
    const transformStream = new TransformStream({
      transform: (event: any, controller) => {
        let output = "";

        if (event.event) {
          output += `event: ${event.event}\n`;
        }

        if (event.data) {
          const dataStr =
            typeof event.data === "string"
              ? event.data
              : JSON.stringify(event.data);
          output += `data: ${dataStr}\n`;
        }

        output += "\n";

        controller.enqueue(new TextEncoder().encode(output));
      },
    });

    // Copy readable and writable to this instance
    this.readable = transformStream.readable;
    this.writable = transformStream.writable;
  }

  readable: ReadableStream<any>;
  writable: WritableStream<any>;
}
