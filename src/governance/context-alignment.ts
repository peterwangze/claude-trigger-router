/**
 * Context Alignment
 *
 * 在模型切换时生成技术摘要，并把摘要注入到后续请求的 system 上下文中。
 */

import { IContextAlignmentConfig } from './types';
import { DEFAULT_CONFIG } from '../constants';
import { logError, logWarn } from '../utils/log';
import { createSingleUserTextIR } from '../protocols/message-ir';
import { toAnthropicMessagesRequest } from '../protocols/anthropic';

const DEFAULT_ALIGNMENT_CONTEXT_CHARS = 4000;
const DEFAULT_ALIGNMENT_TIMEOUT_MS = 30000;

export interface IContextAlignmentSummaryResult {
  summary: string | null;
  skipped: boolean;
  skipReason?: string;
  inputChars: number;
  boundedChars: number;
  truncated: boolean;
  timeoutMs?: number;
}

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

  private boundContext(text: string, config: IContextAlignmentConfig): {
    text: string;
    inputChars: number;
    boundedChars: number;
    truncated: boolean;
  } {
    const maxChars = config.max_context_chars && config.max_context_chars > 0
      ? config.max_context_chars
      : DEFAULT_ALIGNMENT_CONTEXT_CHARS;
    const bounded = text.length > maxChars ? text.slice(-maxChars) : text;
    return {
      text: bounded,
      inputChars: text.length,
      boundedChars: bounded.length,
      truncated: bounded.length < text.length,
    };
  }

  async summarizeTransitionWithDiagnostics(
    text: string,
    previousModel: string,
    nextModel: string,
    config: IContextAlignmentConfig,
    port: number = DEFAULT_CONFIG.PORT,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<IContextAlignmentSummaryResult> {
    const bounded = this.boundContext(text, config);
    const effectiveTimeoutMs = config.timeout_ms && config.timeout_ms > 0
      ? config.timeout_ms
      : timeoutMs && timeoutMs > 0
        ? Math.min(timeoutMs, DEFAULT_ALIGNMENT_TIMEOUT_MS)
        : DEFAULT_ALIGNMENT_TIMEOUT_MS;

    if (!config.enabled) {
      return {
        summary: null,
        skipped: true,
        skipReason: 'disabled',
        ...bounded,
        timeoutMs: effectiveTimeoutMs,
      };
    }

    if (!config.summarizer_model) {
      return {
        summary: null,
        skipped: true,
        skipReason: 'missing_summarizer_model',
        ...bounded,
        timeoutMs: effectiveTimeoutMs,
      };
    }

    if (!bounded.text.trim()) {
      return {
        summary: null,
        skipped: true,
        skipReason: 'empty_context',
        ...bounded,
        timeoutMs: effectiveTimeoutMs,
      };
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
            ir: createSingleUserTextIR(this.buildPrompt(bounded.text, previousModel, nextModel)),
          })
        ),
        signal: AbortSignal.timeout(effectiveTimeoutMs),
      });

      if (!response.ok) {
        logWarn('[ContextAlignment] Alignment request failed:', response.status);
        return {
          summary: null,
          skipped: true,
          skipReason: `http_${response.status}`,
          ...bounded,
          timeoutMs: effectiveTimeoutMs,
        };
      }

      const data = await response.json() as any;
      const summary = data.content?.[0]?.text?.trim?.() || '';
      return {
        summary: summary || null,
        skipped: !summary,
        ...(!summary ? { skipReason: 'empty_summary' } : {}),
        ...bounded,
        timeoutMs: effectiveTimeoutMs,
      };
    } catch (error) {
      logError('[ContextAlignment] Failed to summarize transition:', error);
      return {
        summary: null,
        skipped: true,
        skipReason: error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'request_failed',
        ...bounded,
        timeoutMs: effectiveTimeoutMs,
      };
    }
  }

  async summarizeTransition(
    text: string,
    previousModel: string,
    nextModel: string,
    config: IContextAlignmentConfig,
    port: number = DEFAULT_CONFIG.PORT,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<string | null> {
    const result = await this.summarizeTransitionWithDiagnostics(
      text,
      previousModel,
      nextModel,
      config,
      port,
      fetchFn,
      apiKey,
      timeoutMs
    );
    return result.summary;
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
