/**
 * Semantic Router
 *
 * 第一阶段采用 prototype 语义匹配，后续可扩展为 embedding/classifier。
 */

import { ISemanticRouterConfig } from './types';
import { logError, logWarn } from '../utils/log';

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

  private analyzePrototype(text: string, config?: ISemanticRouterConfig): ISemanticIntentResult | null {
    if (!config?.enabled || !config.prototypes || Object.keys(config.prototypes).length === 0) {
      return null;
    }

    const inputTokens = tokenize(text);
    if (inputTokens.length === 0) {
      return null;
    }

    const threshold = config.threshold ?? 0.85;
    let best: ISemanticIntentResult | null = null;

    for (const [intent, prototype] of Object.entries(config.prototypes)) {
      const prototypeTokens = tokenize(prototype);
      if (prototypeTokens.length === 0) continue;

      const matched = prototypeTokens.filter((token) => inputTokens.includes(token));
      const confidence = matched.length / prototypeTokens.length;

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
    return this.analyzePrototype(text, config);
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
      return this.analyzePrototype(text, config);
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          model: config.classifier_model,
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: this.buildClassifierPrompt(text, config.prototypes),
            },
          ],
        }),
        ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        logWarn('[SemanticRouter] Classifier request failed:', response.status);
        return this.analyzePrototype(text, config);
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        logWarn('[SemanticRouter] No JSON found in classifier response');
        return this.analyzePrototype(text, config);
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
      return this.analyzePrototype(text, config);
    }
  }
}

export const semanticRouter = new SemanticRouter();
