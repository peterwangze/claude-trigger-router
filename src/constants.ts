/**
 * Constants
 *
 * 常量定义
 */

import { homedir } from 'os';
import { join } from 'path';

/**
 * 配置目录
 */
export const CONFIG_DIR = join(homedir(), '.claude-trigger-router');

/**
 * 配置文件路径
 */
export const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

/**
 * JSON 配置文件路径（兼容）
 */
export const CONFIG_FILE_JSON = join(CONFIG_DIR, 'config.json');

/**
 * .yml 配置文件路径（兼容）
 */
export const CONFIG_FILE_YML = join(CONFIG_DIR, 'config.yml');

/**
 * 日志目录
 */
export const HOME_DIR = join(CONFIG_DIR, 'logs');

/**
 * PID 文件路径
 */
export const PID_FILE = join(CONFIG_DIR, 'claude-trigger-router.pid');

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  HOST: '127.0.0.1',
  PORT: 3456,
  LOG: true,
  LOG_LEVEL: 'debug',
  API_TIMEOUT_MS: 600000,
  NON_INTERACTIVE_MODE: false,
};

/**
 * 默认触发路由配置
 */
export const DEFAULT_TRIGGER_CONFIG = {
  enabled: true,
  analysis_scope: 'last_message' as const,
  llm_intent_recognition: false,
  rules: [],
};

/**
 * 默认 SmartRouter 配置
 * 注意：enabled 默认为 false，须在 config.yaml 中显式开启
 */
export const DEFAULT_SMART_ROUTER_CONFIG = {
  enabled: false,
  router_model: '',
  candidates: [] as Array<{ model: string; description: string }>,
  cache_ttl: 600000,
  max_tokens: 256,
  fallback: 'default' as const,
};

/**
 * 支持的配置文件扩展名
 */
export const SUPPORTED_CONFIG_EXTENSIONS = ['.yaml', '.yml', '.json'];
