/**
 * Cascade Reasoning Gate
 *
 * 第一阶段先落地失败证据识别与升级决策基础，不直接执行真实重投。
 */

import { ICascadeGateConfig } from './types';

export interface IFailureEvidence {
  type: 'compile_failure' | 'test_failure' | 'placeholder_pattern' | 'empty_response' | 'short_response';
  detail: string;
}

export interface ICascadeDecision {
  shouldEscalate: boolean;
  nextModel?: string;
  reasoning?: string;
}

function extractTextPayload(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.content?.[0]?.text === 'string') {
    return payload.content[0].text;
  }
  if (typeof payload?.error?.message === 'string') {
    return payload.error.message;
  }
  return '';
}

export function detectFailureEvidence(payload: any, config?: ICascadeGateConfig): IFailureEvidence[] {
  const evidences: IFailureEvidence[] = [];
  const text = extractTextPayload(payload).trim();
  const placeholderPatterns = config?.triggers?.placeholder_patterns ?? [];

  if (!text) {
    evidences.push({ type: 'empty_response', detail: 'Response payload is empty' });
    return evidences;
  }

  if (text.length < 20) {
    evidences.push({ type: 'short_response', detail: `Response is unusually short (${text.length} chars)` });
  }

  if (config?.triggers?.compile_failure && /compile failed|compilation failed|build failed|typescript error|syntaxerror/i.test(text)) {
    evidences.push({ type: 'compile_failure', detail: 'Detected compile/build failure marker in response' });
  }

  if (config?.triggers?.test_failure && /test failed|failing test|assertionerror|expected .* to/i.test(text)) {
    evidences.push({ type: 'test_failure', detail: 'Detected test failure marker in response' });
  }

  for (const pattern of placeholderPatterns) {
    if (pattern && text.toLowerCase().includes(pattern.toLowerCase())) {
      evidences.push({ type: 'placeholder_pattern', detail: `Matched placeholder pattern: ${pattern}` });
    }
  }

  return evidences;
}

export function decideCascadeEscalation(
  currentModel: string | undefined,
  evidences: IFailureEvidence[],
  config?: ICascadeGateConfig,
  attempt = 0
): ICascadeDecision {
  if (!config?.enabled || !currentModel || evidences.length === 0) {
    return { shouldEscalate: false };
  }

  const maxAttempts = config.max_attempts ?? 2;
  if (attempt >= maxAttempts) {
    return { shouldEscalate: false, reasoning: 'Reached max cascade attempts' };
  }

  const nextLevel = config.levels?.find((level) => level.from === currentModel);
  if (!nextLevel) {
    return { shouldEscalate: false, reasoning: 'No cascade level configured for current model' };
  }

  return {
    shouldEscalate: true,
    nextModel: nextLevel.to,
    reasoning: evidences.map((item) => item.type).join(', '),
  };
}
