/**
 * Semantic Router
 *
 * 第一阶段采用 prototype 语义匹配，后续可扩展为 embedding/classifier。
 */

import { ISemanticRouterConfig } from './types';
import { logError, logWarn } from '../utils/log';
import { createSingleUserTextIR } from '../protocols/message-ir';
import { toAnthropicMessagesRequest } from '../protocols/anthropic';

export interface ISemanticIntentResult {
  intent: string;
  confidence: number;
  matchedPrototype?: string;
  evidence?: string[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];

  const parts = normalized.split(' ').filter(Boolean);
  const chars = normalized
    .replace(/\s+/g, '')
    .split('')
    .filter(Boolean);

  return Array.from(new Set([...parts, ...chars]));
}

function buildVector(tokens: string[]): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left.values()) {
    leftNorm += value * value;
  }

  for (const value of right.values()) {
    rightNorm += value * value;
  }

  for (const [token, leftValue] of left.entries()) {
    const rightValue = right.get(token) ?? 0;
    dot += leftValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export class SemanticRouter {
  private buildClassifierPrompt(text: string, prototypes: Record<string, string>): string {
    const intents = Object.entries(prototypes)
      .map(([intent, description]) => `- ${intent}: ${description}`)
      .join('\n');

    return `You are a semantic intent classifier for an AI model router.
Analyze the user request and choose the best matching intent.

User request:
"""
${text}
"""

Available intents:
${intents}

Return JSON only:
{
  "intent": "<intent>",
  "confidence": 0.0,
  "evidence": ["keyword"]
}`;
  }

  private analyzeEmbedding(text: string, config?: ISemanticRouterConfig): ISemanticIntentResult | null {
    if (!config?.enabled || !config.prototypes || Object.keys(config.prototypes).length === 0) {
      return null;
    }

    const inputTokens = tokenize(text);
    if (inputTokens.length === 0) {
      return null;
    }
    const inputVector = buildVector(inputTokens);

    const threshold = config.threshold ?? 0.85;
    let best: ISemanticIntentResult | null = null;

    for (const [intent, prototype] of Object.entries(config.prototypes)) {
      const prototypeTokens = tokenize(prototype);
      if (prototypeTokens.length === 0) continue;

      const prototypeVector = buildVector(prototypeTokens);
      const matched = prototypeTokens.filter((token) => inputTokens.includes(token));
      const confidence = cosineSimilarity(inputVector, prototypeVector);

      if (!best || confidence > best.confidence) {
        best = {
          intent,
          confidence,
          matchedPrototype: prototype,
          evidence: matched,
        };
      }
    }

    if (!best || best.confidence < threshold) {
      return null;
    }

    return best;
  }

  analyze(text: string, config?: ISemanticRouterConfig): ISemanticIntentResult | null {
    return this.analyzeEmbedding(text, config);
  }

  async analyzeWithClassifier(
    text: string,
    config?: ISemanticRouterConfig,
    port: number = 3456,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<ISemanticIntentResult | null> {
    if (!config?.enabled || config.mode !== 'classifier' || !config.prototypes || Object.keys(config.prototypes).length === 0) {
      return this.analyzeEmbedding(text, config);
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
            model: config.classifier_model,
            max_tokens: 128,
            ir: createSingleUserTextIR(this.buildClassifierPrompt(text, config.prototypes)),
          })
        ),
        ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        logWarn('[SemanticRouter] Classifier request failed:', response.status);
        return this.analyzeEmbedding(text, config);
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        logWarn('[SemanticRouter] No JSON found in classifier response');
        return this.analyzeEmbedding(text, config);
      }

      const parsed = JSON.parse(match[0]) as ISemanticIntentResult;
      const threshold = config.threshold ?? 0.85;
      if (!parsed.intent || (parsed.confidence ?? 0) < threshold) {
        return null;
      }

      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      };
    } catch (error) {
      logError('[SemanticRouter] Classifier mode failed:', error);
      return this.analyzeEmbedding(text, config);
    }
  }
}

export const semanticRouter = new SemanticRouter();
