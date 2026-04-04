/**
 * Session State Store
 *
 * 用于保存会话级治理状态，为 sticky routing 提供基础数据。
 */

import { LRUCache } from 'lru-cache';
import { ISessionState } from './types';

export class SessionStateStore {
  private cache: LRUCache<string, ISessionState>;

  constructor(ttlMs = 1000 * 60 * 60) {
    this.cache = new LRUCache<string, ISessionState>({
      max: 1000,
      ttl: ttlMs,
    });
  }

  get(sessionKey: string | undefined): ISessionState | undefined {
    if (!sessionKey) return undefined;
    return this.cache.get(sessionKey);
  }

  put(sessionKey: string | undefined, state: Omit<ISessionState, 'sessionKey' | 'updatedAt'>): void {
    if (!sessionKey) return;
    this.cache.set(sessionKey, {
      sessionKey,
      ...state,
      updatedAt: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export function createTaskFingerprint(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized || undefined;
}

export const sessionStateStore = new SessionStateStore();
