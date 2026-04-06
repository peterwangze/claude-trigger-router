/**
 * Context Alignment
 *
 * 在模型切换时生成技术摘要，并把摘要注入到后续请求的 system 上下文中。
 */

import { IContextAlignmentConfig } from './types';
import { logError, logWarn } from '../utils/log';
import { createSingleUserTextIR } from '../protocols/message-ir';
import { toAnthropicMessagesRequest } from '../protocols/anthropic';

const CONTEXT_ALIGNMENT_PROMPT = `You are a technical handoff assistant.
Summarize the current task so a different model can continue the work without losing context.

Previous model:
{previousModel}

Next model:
{nextModel}

User request / latest task context:
"""
{request}
"""

Respond with a concise technical summary only. Focus on:
- task goal
- important technical constraints
- any implied implementation direction
- what the next model should continue doing

Do not include markdown fences.`;

export class ContextAlignmentService {
  private buildPrompt(text: string, previousModel: string, nextModel: string): string {
    return CONTEXT_ALIGNMENT_PROMPT
      .replace('{previousModel}', previousModel)
      .replace('{nextModel}', nextModel)
      .replace('{request}', text);
  }

  async summarizeTransition(
    text: string,
    previousModel: string,
    nextModel: string,
    config: IContextAlignmentConfig,
    port: number = 3456,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<string | null> {
    if (!config.enabled || !config.summarizer_model || !text.trim()) {
      return null;
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify(
          toAnthropicMessagesRequest({
            model: config.summarizer_model,
            max_tokens: config.max_summary_tokens ?? 256,
            ir: createSingleUserTextIR(this.buildPrompt(text, previousModel, nextModel)),
          })
        ),
        ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        logWarn('[ContextAlignment] Alignment request failed:', response.status);
        return null;
      }

      const data = await response.json() as any;
      const summary = data.content?.[0]?.text?.trim?.() || '';
      return summary || null;
    } catch (error) {
      logError('[ContextAlignment] Failed to summarize transition:', error);
      return null;
    }
  }

  injectAlignmentContext(system: any, summary: string, previousModel: string, nextModel: string): any {
    if (!summary) {
      return system;
    }

    const alignmentText =
      `<CTR-CONTEXT-ALIGNMENT from="${previousModel}" to="${nextModel}">\n` +
      `${summary}\n` +
      `</CTR-CONTEXT-ALIGNMENT>`;

    if (!system) {
      return [{ type: 'text', text: alignmentText }];
    }

    if (typeof system === 'string') {
      return [
        { type: 'text', text: alignmentText },
        { type: 'text', text: system },
      ];
    }

    if (Array.isArray(system)) {
      return [
        { type: 'text', text: alignmentText },
        ...system,
      ];
    }

    return [
      { type: 'text', text: alignmentText },
      system,
    ];
  }
}

export const contextAlignmentService = new ContextAlignmentService();
