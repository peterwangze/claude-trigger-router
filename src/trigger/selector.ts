/**
 * Model Selector
 *
 * 模型选择器，负责根据触发规则选择合适的模型
 */

import { ITriggerConfig, ITriggerRule, IAnalysisResult, IMatchResult, IRequestContext } from './types';
import { patternMatcher } from './matcher';
import { contextAnalyzer } from './analyzer';
import { intentDetector } from './intent';
import { logError } from '../utils/log';

/**
 * 模型选择器类
 */
export class ModelSelector {
  /**
   * 按优先级排序规则
   * 优先级数值越大，优先级越高
   *
   * @param rules 规则列表
   * @returns 排序后的规则列表（降序）
   */
  sortRulesByPriority(rules: ITriggerRule[]): ITriggerRule[] {
    return [...rules]
      .filter((rule) => rule.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 使用规则匹配文本
   *
   * @param text 待匹配的文本
   * @param rule 规则
   * @returns 匹配结果
   */
  matchRule(text: string, rule: ITriggerRule): IMatchResult {
    if (!text || !rule || !rule.patterns || rule.patterns.length === 0) {
      return { matched: false };
    }

    return patternMatcher.matchAny(text, rule.patterns);
  }

  /**
   * 从文本中匹配规则
   * 按优先级顺序匹配，返回第一个匹配的规则
   *
   * @param text 待匹配的文本
   * @param rules 规则列表
   * @returns 匹配的规则，如果没有匹配则返回 null
   */
  matchRuleFromText(text: string, rules: ITriggerRule[]): { rule: ITriggerRule; result: IMatchResult } | null {
    if (!text || !rules || rules.length === 0) {
      return null;
    }

    // 按优先级排序
    const sortedRules = this.sortRulesByPriority(rules);

    for (const rule of sortedRules) {
      const result = this.matchRule(text, rule);
      if (result.matched) {
        return { rule, result };
      }
    }

    return null;
  }

  /**
   * 选择模型
   * 综合使用关键词匹配和 LLM 意图识别
   *
   * @param req 请求对象
   * @param config 触发配置
   * @returns 分析结果
   */
  async selectModel(req: IRequestContext, config: ITriggerConfig, port: number = 3456): Promise<IAnalysisResult> {
    const startTime = Date.now();

    // 如果触发路由未启用，直接返回不匹配
    if (!config.enabled) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
      };
    }

    // 提取待分析的文本
    const text = contextAnalyzer.analyze(req, config);

    if (!text) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
        analyzedText: '',
      };
    }

    // 第一步：关键词/正则匹配
    const matchResult = this.matchRuleFromText(text, config.rules);

    if (matchResult) {
      return {
        matched: true,
        rule: matchResult.rule,
        model: matchResult.rule.model,
        confidence: 1.0, // 关键词匹配置信度为 1
        analysisTime: Date.now() - startTime,
        analyzedText: text,
      };
    }

    // 第二步：如果启用了 LLM 意图识别，进行意图检测
    if (config.llm_intent_recognition && config.intent_model) {
      try {
        const intentResult = await intentDetector.detectIntent(text, config, port);

        if (intentResult.confidence > 0.5 && intentResult.intent !== 'general') {
          const matchedRule = intentDetector.findRuleByIntent(intentResult.intent, config.rules);

          if (matchedRule) {
            return {
              matched: true,
              rule: matchedRule,
              model: matchedRule.model,
              confidence: intentResult.confidence,
              analysisTime: Date.now() - startTime,
              analyzedText: text,
            };
          }
        }
      } catch (error) {
        logError('[ModelSelector] Intent detection error:', error);
      }
    }

    // 没有匹配任何规则
    return {
      matched: false,
      confidence: 0,
      analysisTime: Date.now() - startTime,
      analyzedText: text,
    };
  }

  /**
   * 同步版本的模型选择
   * 仅使用关键词匹配，不进行 LLM 意图识别
   *
   * @param req 请求对象
   * @param config 触发配置
   * @returns 分析结果
   */
  selectModelSync(req: IRequestContext, config: ITriggerConfig): IAnalysisResult {
    const startTime = Date.now();

    // 如果触发路由未启用，直接返回不匹配
    if (!config.enabled) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
      };
    }

    // 提取待分析的文本
    const text = contextAnalyzer.analyze(req, config);

    if (!text) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
        analyzedText: '',
      };
    }

    // 关键词/正则匹配
    const matchResult = this.matchRuleFromText(text, config.rules);

    if (matchResult) {
      return {
        matched: true,
        rule: matchResult.rule,
        model: matchResult.rule.model,
        confidence: 1.0,
        analysisTime: Date.now() - startTime,
        analyzedText: text,
      };
    }

    // 没有匹配任何规则
    return {
      matched: false,
      confidence: 0,
      analysisTime: Date.now() - startTime,
      analyzedText: text,
    };
  }
}

// 导出单例实例
export const modelSelector = new ModelSelector();
