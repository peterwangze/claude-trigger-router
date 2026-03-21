/**
 * Cache Utilities
 *
 * 缓存工具
 */

import { LRUCache } from 'lru-cache';

/**
 * 使用量数据
 */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * 会话使用量缓存
 */
class SessionUsageCache {
  private cache: LRUCache<string, Usage>;

  constructor() {
    this.cache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 60, // 1 小时
    });
  }

  /**
   * 存储使用量
   */
  put(sessionId: string | undefined, usage: Usage | undefined): void {
    if (!sessionId || !usage) return;
    this.cache.set(sessionId, usage);
  }

  /**
   * 获取使用量
   */
  get(sessionId: string | undefined): Usage | undefined {
    if (!sessionId) return undefined;
    return this.cache.get(sessionId);
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear();
  }
}

export const sessionUsageCache = new SessionUsageCache();
