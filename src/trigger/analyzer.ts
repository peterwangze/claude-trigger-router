/**
 * Context Analyzer
 *
 * 上下文分析器，负责从请求中提取用户消息内容
 */

import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { AnalysisScope, ITriggerConfig } from './types';

/**
 * 上下文分析器类
 */
export class ContextAnalyzer {
  /**
   * 从消息中提取文本内容
   *
   * @param message 消息对象
   * @returns 提取的文本内容
   */
  private extractTextFromMessage(message: MessageParam): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .filter((part: any) => part.type === 'text' && part.text)
        .map((part: any) => part.text)
        .join('\n');
    }

    return '';
  }

  /**
   * 提取最后一条用户消息
   *
   * @param messages 消息列表
   * @returns 最后一条用户消息的文本内容
   */
  extractLastUserMessage(messages: MessageParam[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // 从后往前找最后一条用户消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        return this.extractTextFromMessage(message);
      }
    }

    return '';
  }

  /**
   * 提取所有用户消息
   *
   * @param messages 消息列表
   * @returns 所有用户消息的文本内容数组
   */
  extractAllUserMessages(messages: MessageParam[]): string[] {
    if (!messages || messages.length === 0) {
      return [];
    }

    return messages
      .filter((message) => message.role === 'user')
      .map((message) => this.extractTextFromMessage(message));
  }

  /**
   * 根据配置的分析范围提取文本
   *
   * @param messages 消息列表
   * @param scope 分析范围
   * @returns 提取的文本内容
   */
  extractTextByScope(messages: MessageParam[], scope: AnalysisScope): string {
    switch (scope) {
      case 'last_message':
        return this.extractLastUserMessage(messages);

      case 'full_conversation':
        const allMessages = this.extractAllUserMessages(messages);
        return allMessages.join('\n\n---\n\n');

      default:
        return this.extractLastUserMessage(messages);
    }
  }

  /**
   * 分析请求，提取待分析的文本
   *
   * @param req 请求对象
   * @param config 触发配置
   * @returns 待分析的文本内容
   */
  analyze(req: any, config: ITriggerConfig): string {
    const messages = req.body?.messages;

    if (!messages) {
      return '';
    }

    const scope = config.analysis_scope || 'last_message';

    return this.extractTextByScope(messages, scope);
  }

  /**
   * 检查消息是否包含工具调用结果
   * 如果消息主要是工具调用结果，可能需要跳过分析
   *
   * @param messages 消息列表
   * @returns 是否主要是工具调用结果
   */
  hasToolResults(messages: MessageParam[]): boolean {
    if (!messages || messages.length === 0) {
      return false;
    }

    // 检查最后一条用户消息
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return false;
    }

    if (Array.isArray(lastMessage.content)) {
      const toolResults = lastMessage.content.filter(
        (part: any) => part.type === 'tool_result'
      );
      // 如果工具结果占比超过 50%，认为主要是工具调用
      return toolResults.length > lastMessage.content.length / 2;
    }

    return false;
  }
}

// 导出单例实例
export const contextAnalyzer = new ContextAnalyzer();
