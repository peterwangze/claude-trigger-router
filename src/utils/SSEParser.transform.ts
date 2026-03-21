/**
 * SSE Parser Transform
 *
 * Server-Sent Events 解析转换流
 */

export class SSEParserTransform {
  private buffer: string = "";

  constructor() {
    const transformStream = new TransformStream({
      start: (controller) => {
        // Initialization if needed
      },
      transform: (chunk: Uint8Array, controller) => {
        const text = new TextDecoder().decode(chunk);
        this.buffer += text;

        this.parseBuffer(controller);
      },
      flush: (controller) => {
        if (this.buffer.trim()) {
          this.parseBuffer(controller);
        }
      },
    });

    // Copy readable and writable to this instance
    this.readable = transformStream.readable;
    this.writable = transformStream.writable;
  }

  readable: ReadableStream<any>;
  writable: WritableStream<any>;

  private parseBuffer(controller: TransformStreamDefaultController<any>) {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    let currentEvent: any = {};

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        try {
          currentEvent.data = JSON.parse(dataStr);
        } catch {
          currentEvent.data = dataStr;
        }
      } else if (line === "" && Object.keys(currentEvent).length > 0) {
        controller.enqueue(currentEvent);
        currentEvent = {};
      }
    }
  }
}
