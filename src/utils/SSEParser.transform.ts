/**
 * SSE Parser Transform
 *
 * Server-Sent Events 解析转换流
 */

export class SSEParserTransform {
  private buffer: string = "";
  private currentEvent: any = {};

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
          this.parseBuffer(controller, true);
        } else if (Object.keys(this.currentEvent).length > 0) {
          this.parseBuffer(controller, true);
        }
      },
    });

    // Copy readable and writable to this instance
    this.readable = transformStream.readable;
    this.writable = transformStream.writable;
  }

  readable: ReadableStream<any>;
  writable: WritableStream<any>;

  private parseBuffer(controller: TransformStreamDefaultController<any>, flush = false) {
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = flush ? "" : (lines.pop() || "");

    for (const rawLine of lines) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith("event:")) {
        this.currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        try {
          this.currentEvent.data = JSON.parse(dataStr);
        } catch {
          this.currentEvent.data = dataStr;
        }
      } else if (line === "" && Object.keys(this.currentEvent).length > 0) {
        controller.enqueue(this.currentEvent);
        this.currentEvent = {};
      }
    }

    if (flush && Object.keys(this.currentEvent).length > 0) {
      controller.enqueue(this.currentEvent);
      this.currentEvent = {};
    }
  }
}
