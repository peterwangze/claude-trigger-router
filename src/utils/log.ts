/**
 * Log Utilities
 *
 * 日志工具
 */

import { IAppConfig } from '../trigger/types';

let logEnabled = true;
let logLevel = 'debug';

/**
 * 配置日志
 */
export function configureLogging(config: IAppConfig): void {
  logEnabled = config.LOG !== false;
  logLevel = config.LOG_LEVEL || 'debug';
}

/**
 * 日志函数
 */
export function log(...args: any[]): void {
  if (!logEnabled) return;

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
}

/**
 * 错误日志
 */
export function logError(...args: any[]): void {
  if (!logEnabled) return;

  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR]`, ...args);
}

/**
 * 警告日志
 */
export function logWarn(...args: any[]): void {
  if (!logEnabled) return;

  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [WARN]`, ...args);
}

/**
 * 调试日志
 */
export function logDebug(...args: any[]): void {
  if (!logEnabled || logLevel !== 'debug') return;

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [DEBUG]`, ...args);
}
