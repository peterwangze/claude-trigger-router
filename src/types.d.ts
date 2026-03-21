/**
 * Type Declarations
 *
 * 模块类型声明
 */

declare module 'openurl' {
  function open(url: string): void;
  export = open;
}

declare module '@musistudio/llms' {
  class Server {
    app: {
      _server: {
        transformerService: {
          getAllTransformers(): Map<string, any>;
        };
      };
      get(path: string, handler: (...args: any[]) => any): void;
      post(path: string, handler: (...args: any[]) => any): void;
      register(plugin: any, options?: any): void;
      addHook(name: string, handler: (...args: any[]) => any): void;
    };
    addHook(name: string, handler: (...args: any[]) => any): void;
    start(): void;
    constructor(config: any);
  }
  export = Server;
}

declare module 'rotating-file-stream' {
  export function createStream(
    generator: string | ((time: Date | number, index: number) => string),
    options?: {
      path?: string;
      maxFiles?: number;
      interval?: string;
      compress?: string;
    }
  ): any;
}
