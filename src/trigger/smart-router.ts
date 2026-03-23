/**
 * SmartRouter Selector
 *
 * 智能路由选择器，使用 LLM 从候选模型列表中选择最优模型
 */

import { LRUCache } from 'lru-cache';
import { ISmartRouterConfig } from './types';
import { logError, logWarn } from '../utils/log';

/**
 * SmartRouter 选择结果
 */
export interface ISmartRouterResult {
  /** 选中的模型，格式：provider_name,model_name */
  model: string;

  /** 置信度 0-1 */
  confidence: number;

  /** LLM 的选择理由 */
  reasoning?: string;
}

/**
 * SmartRouter Prompt 模板
 */
const SMART_ROUTER_PROMPT = `You are a model routing assistant. Your job is to select the most appropriate AI model from the given candidates to handle the user's request.

User request:
"""
{request}
"""

Available models:
{candidates}

Select the most appropriate model and respond in the following JSON format ONLY:
{
  "model": "<exact model identifier from the list>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

Important:
- The "model" field MUST be one of the exact identifiers listed above
- Respond ONLY with the JSON, no additional text`;

/**
 * 智能路由选择器类
 */
export class SmartRouterSelector {
  private cache: LRUCache<string, ISmartRouterResult>;

  constructor() {
    this.cache = new LRUCache<string, ISmartRouterResult>({
      max: 500,
      ttl: 600000, // 默认 10 分钟，具体条目可被 config.cache_ttl 覆盖
    });
  }

  /**
   * 生成缓存 key（基于请求文本 + router_model + 候选模型列表）
   * 注意：包含 router_model 以防止切换路由模型后命中旧缓存
   */
  private generateCacheKey(text: string, routerModel: string, candidates: ISmartRouterConfig['candidates']): string {
    const content = `${text}:${routerModel}:${candidates.map(c => c.model).join(',')}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * 构建候选模型列表字符串
   */
  private buildCandidatesList(candidates: ISmartRouterConfig['candidates']): string {
    return candidates
      .map((c, i) => `${i + 1}. ${c.model} - ${c.description}`)
      .join('\n');
  }

  /**
   * 构建完整 prompt
   */
  private buildPrompt(text: string, candidates: ISmartRouterConfig['candidates']): string {
    return SMART_ROUTER_PROMPT
      .replace('{request}', text)
      .replace('{candidates}', this.buildCandidatesList(candidates));
  }

  /**
   * 使用 LLM 选择最优模型
   *
   * @param text 请求文本
   * @param config SmartRouter 配置
   * @param port 本地服务端口（默认 3456）
   * @param fetchFn 可注入的 fetch 函数（用于测试）
   * @returns 选择结果，失败时返回 null
   */
  async selectModel(
    text: string,
    config: ISmartRouterConfig,
    port: number = 3456,
    fetchFn?: typeof fetch,
    apiKey?: string
  ): Promise<ISmartRouterResult | null> {
    // 未启用或候选不足
    if (!config.enabled) {
      return null;
    }

    if (!config.candidates || config.candidates.length < 2) {
      return null;
    }

    // 检查缓存
    const cacheKey = this.generateCacheKey(text, config.router_model, config.candidates);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const prompt = this.buildPrompt(text, config.candidates);

      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          model: config.router_model,
          max_tokens: config.max_tokens ?? 256,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        logError('[SmartRouter] LLM request failed:', (response as any).status);
        return null;
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';

      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logWarn('[SmartRouter] No JSON found in LLM response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as ISmartRouterResult;

      // 验证返回的模型在候选列表中
      const validModels = config.candidates.map(c => c.model);
      if (!validModels.includes(parsed.model)) {
        logWarn(`[SmartRouter] LLM returned unknown model: "${parsed.model}"`);
        return null;
      }

      // 缓存结果（使用配置的 TTL 进行按条目覆盖）
      this.cache.set(cacheKey, parsed, { ttl: config.cache_ttl ?? 600000 });

      return parsed;
    } catch (error) {
      logError('[SmartRouter] Error selecting model:', error);
      return null;
    }
  }

  /**
   * 清除缓存（用于测试）
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 导出单例实例
export const smartRouterSelector = new SmartRouterSelector();
