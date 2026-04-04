/**
 * Semantic Router
 *
 * 第一阶段采用 prototype 语义匹配，后续可扩展为 embedding/classifier。
 */

import { ISemanticRouterConfig } from './types';

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
  analyze(text: string, config?: ISemanticRouterConfig): ISemanticIntentResult | null {
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
}

export const semanticRouter = new SemanticRouter();
