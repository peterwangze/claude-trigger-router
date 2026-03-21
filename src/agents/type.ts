/**
 * Agent Types
 *
 * Agent 类型定义
 */

/**
 * 工具接口
 */
export interface ITool {
  name: string;
  description: string;
  input_schema: any;
  handler: (args: any, context: any) => Promise<string>;
}

/**
 * Agent 接口
 */
export interface IAgent {
  /** Agent 名称 */
  name: string;

  /** Agent 拥有的工具 */
  tools: Map<string, ITool>;

  /** 判断是否应该处理此请求 */
  shouldHandle: (req: any, config: any) => boolean;

  /** 请求处理器 */
  reqHandler: (req: any, config: any) => void;

  /** 响应处理器（可选） */
  resHandler?: (payload: any, config: any) => void;
}
