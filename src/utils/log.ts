/**
 * Log Utilities
 *
 * 日志工具
 */

import { IAppConfig } from '../trigger/types';

// 日志级别枚举（数值越大越详细）
const LOG_LEVELS: Record<string, number> = {
  fatal: 0,
  error: 1,
  warn:  2,
  info:  3,
  debug: 4,
  trace: 5,
};

let logEnabled = true;
let currentLevel = LOG_LEVELS.debug;

/**
 * 配置日志
 */
export function configureLogging(config: IAppConfig): void {
  logEnabled = config.LOG !== false;
  const level = (config.LOG_LEVEL || 'debug').toLowerCase();
  currentLevel = LOG_LEVELS[level] ?? LOG_LEVELS.debug;
}

/**
 * 检查给定级别是否应该输出
 */
function shouldLog(level: number): boolean {
  return logEnabled && level <= currentLevel;
}

/**
 * 格式化时间戳
 */
function ts(): string {
  return new Date().toISOString();
}

/**
 * INFO 日志（原 log）
 */
export function log(...args: any[]): void {
  if (!shouldLog(LOG_LEVELS.info)) return;
  console.log(`[${ts()}] [INFO]`, ...args);
}

/**
 * ERROR 日志
 */
export function logError(...args: any[]): void {
  if (!shouldLog(LOG_LEVELS.error)) return;
  console.error(`[${ts()}] [ERROR]`, ...args);
}

/**
 * WARN 日志
 */
export function logWarn(...args: any[]): void {
  if (!shouldLog(LOG_LEVELS.warn)) return;
  console.warn(`[${ts()}] [WARN]`, ...args);
}

/**
 * DEBUG 日志
 */
export function logDebug(...args: any[]): void {
  if (!shouldLog(LOG_LEVELS.debug)) return;
  console.log(`[${ts()}] [DEBUG]`, ...args);
}

/**
 * TRACE 日志
 */
export function logTrace(...args: any[]): void {
  if (!shouldLog(LOG_LEVELS.trace)) return;
  console.log(`[${ts()}] [TRACE]`, ...args);
}

/**
 * FATAL 日志（总是输出，因为是致命错误）
 */
export function logFatal(...args: any[]): void {
  console.error(`[${ts()}] [FATAL]`, ...args);
}
