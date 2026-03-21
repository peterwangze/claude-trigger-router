/**
 * Pattern Matcher
 *
 * 模式匹配器，支持精确匹配和正则表达式匹配
 */

import { ITriggerPattern, IMatchResult } from './types';
import { LRUCache } from 'lru-cache';

/**
 * 正则表达式缓存
 * 避免重复编译相同的正则表达式
 */
const regexCache = new LRUCache<string, RegExp>({
  max: 100,
  ttl: 1000 * 60 * 30, // 30 分钟
});

/**
 * 模式匹配器类
 */
export class PatternMatcher {
  /**
   * 精确匹配
   * 检查文本是否包含任一关键词
   *
   * @param text 待匹配的文本
   * @param keywords 关键词列表
   * @param caseSensitive 是否区分大小写
   * @returns 匹配结果
   */
  matchExact(
    text: string,
    keywords: string[],
    caseSensitive: boolean = false
  ): IMatchResult {
    if (!text || !keywords || keywords.length === 0) {
      return { matched: false };
    }

    const searchText = caseSensitive ? text : text.toLowerCase();

    for (const keyword of keywords) {
      if (!keyword) continue;

      const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

      if (searchText.includes(searchKeyword)) {
        return {
          matched: true,
          matchedKeyword: keyword,
        };
      }
    }

    return { matched: false };
  }

  /**
   * 正则表达式匹配
   * 使用正则表达式检查文本
   *
   * @param text 待匹配的文本
   * @param pattern 正则表达式模式字符串
   * @returns 匹配结果
   */
  matchRegex(text: string, pattern: string): IMatchResult {
    if (!text || !pattern) {
      return { matched: false };
    }

    try {
      // 尝试从缓存获取编译好的正则表达式
      let regex = regexCache.get(pattern);

      if (!regex) {
        // 编译正则表达式
        regex = new RegExp(pattern, 'gm');
        regexCache.set(pattern, regex);
      }

      // 重置正则表达式的 lastIndex
      regex.lastIndex = 0;

      const match = regex.exec(text);

      if (match) {
        return {
          matched: true,
          regexMatch: match,
        };
      }
    } catch (error) {
      console.error(`[PatternMatcher] Invalid regex pattern: ${pattern}`, error);
    }

    return { matched: false };
  }

  /**
   * 使用指定的模式进行匹配
   *
   * @param text 待匹配的文本
   * @param pattern 触发模式配置
   * @returns 匹配结果
   */
  match(text: string, pattern: ITriggerPattern): IMatchResult {
    if (!text || !pattern) {
      return { matched: false };
    }

    switch (pattern.type) {
      case 'exact':
        return this.matchExact(
          text,
          pattern.keywords || [],
          pattern.caseSensitive || false
        );

      case 'regex':
        if (!pattern.pattern) {
          return { matched: false };
        }
        return this.matchRegex(text, pattern.pattern);

      default:
        console.warn(`[PatternMatcher] Unknown pattern type: ${pattern.type}`);
        return { matched: false };
    }
  }

  /**
   * 检查文本是否匹配任一模式
   *
   * @param text 待匹配的文本
   * @param patterns 模式列表
   * @returns 第一个匹配的结果，如果没有匹配则返回 false
   */
  matchAny(text: string, patterns: ITriggerPattern[]): IMatchResult {
    if (!text || !patterns || patterns.length === 0) {
      return { matched: false };
    }

    for (const pattern of patterns) {
      const result = this.match(text, pattern);
      if (result.matched) {
        return result;
      }
    }

    return { matched: false };
  }

  /**
   * 清除正则表达式缓存
   */
  clearCache(): void {
    regexCache.clear();
  }
}

// 导出单例实例
export const patternMatcher = new PatternMatcher();
