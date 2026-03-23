/**
 * Intent Detector
 *
 * 意图识别器，使用 LLM 辅助识别用户意图
 */

import { LRUCache } from 'lru-cache';
import { ITriggerConfig, ITriggerRule, IIntentResult } from './types';
import { logError, logWarn } from '../utils/log';

/**
 * 意图识别缓存
 * 相同的输入在缓存有效期内直接返回缓存结果
 */
const intentCache = new LRUCache<string, IIntentResult>({
  max: 500,
  ttl: 1000 * 60 * 10, // 10 分钟
});

/**
 * 意图识别的 Prompt 模板
 */
const INTENT_PROMPT_TEMPLATE = `You are an intent classifier for an AI assistant router.
Analyze the following user message and identify the primary intent.

User Message:
"""
{message}
"""

Available intent categories:
{intents}

Respond in the following JSON format only:
{
  "intent": "<intent_name>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

If the message doesn't match any category well, respond with:
{
  "intent": "general",
  "confidence": 0.5,
  "reasoning": "No specific intent matched"
}

Important: Respond ONLY with the JSON, no additional text.`;

/**
 * 意图识别器类
 */
export class IntentDetector {
  /**
   * 生成缓存 key
   * 使用消息内容的 hash 作为 key
   */
  private generateCacheKey(text: string, intents: string[]): string {
    const content = `${text}:${intents.join(',')}`;
    // 简单的 hash 函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * 构建 intent 列表字符串
   */
  private buildIntentsList(rules: ITriggerRule[]): string {
    return rules
      .filter((rule) => rule.enabled)
      .map((rule) => `- ${rule.name}: ${rule.description || 'No description'}`)
      .join('\n');
  }

  /**
   * 构建意图识别的 prompt
   */
  private buildPrompt(message: string, rules: ITriggerRule[]): string {
    const intents = this.buildIntentsList(rules);

    return INTENT_PROMPT_TEMPLATE
      .replace('{message}', message)
      .replace('{intents}', intents);
  }

  /**
   * 使用 LLM 检测意图
   *
   * @param text 待分析的文本
   * @param config 触发配置
   * @param fetchFn fetch 函数（用于发起 API 请求）
   * @returns 意图识别结果
   */
  async detectIntent(
    text: string,
    config: ITriggerConfig,
    port: number = 3456,
    fetchFn?: typeof fetch,
    apiKey?: string
  ): Promise<IIntentResult> {
    // 如果没有启用 LLM 意图识别，返回默认结果
    if (!config.llm_intent_recognition) {
      return {
        intent: 'general',
        confidence: 0,
      };
    }

    // 如果没有配置 intent_model，返回默认结果
    if (!config.intent_model) {
      logWarn('[IntentDetector] LLM intent recognition enabled but no intent_model configured');
      return {
        intent: 'general',
        confidence: 0,
      };
    }

    // 检查缓存
    const cacheKey = this.generateCacheKey(text, config.rules.map(r => r.name));
    const cachedResult = intentCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      const fetchImpl = fetchFn || fetch;

      // 构建 prompt
      const prompt = this.buildPrompt(text, config.rules);

      // 调用 LLM API
      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          model: config.intent_model,
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        logError('[IntentDetector] LLM request failed:', response.status);
        return { intent: 'general', confidence: 0 };
      }

      const data = await response.json() as any;

      // 解析 LLM 响应
      const content = data.content?.[0]?.text || '';

      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logWarn('[IntentDetector] No JSON found in LLM response');
        return { intent: 'general', confidence: 0 };
      }

      const result = JSON.parse(jsonMatch[0]) as IIntentResult;

      // 缓存结果
      intentCache.set(cacheKey, result);

      return result;
    } catch (error) {
      logError('[IntentDetector] Error detecting intent:', error);
      return { intent: 'general', confidence: 0 };
    }
  }

  /**
   * 根据意图找到匹配的规则
   *
   * @param intent 意图名称
   * @param rules 规则列表
   * @returns 匹配的规则，如果没有匹配则返回 null
   */
  findRuleByIntent(intent: string, rules: ITriggerRule[]): ITriggerRule | null {
    return rules.find(
      (rule) => rule.enabled && rule.name.toLowerCase() === intent.toLowerCase()
    ) || null;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    intentCache.clear();
  }
}

// 导出单例实例
export const intentDetector = new IntentDetector();
