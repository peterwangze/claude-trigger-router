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
 * Governance trace 持久化文件
 */
export const GOVERNANCE_TRACE_FILE = join(CONFIG_DIR, 'governance-traces.json');

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
 * 默认 Governance 配置
 * 注意：总开关默认关闭，子能力默认均为保守配置
 */
export const DEFAULT_GOVERNANCE_CONFIG = {
  enabled: false,
  sticky: {
    enabled: false,
    session_ttl_ms: 3600000,
    fingerprint_similarity_threshold: 0.82,
    break_on_explicit_route: true,
    alignment: {
      enabled: false,
      summarizer_model: '',
      max_summary_tokens: 256,
    },
  },
  cascade: {
    enabled: false,
    max_attempts: 2,
    stream_guard: false,
    triggers: {
      compile_failure: true,
      test_failure: true,
      placeholder_patterns: ['TODO', '...rest of code', 'placeholder'],
    },
    levels: [],
  },
  semantic: {
    enabled: false,
    mode: 'embedding' as const,
    threshold: 0.85,
    prototypes: {},
  },
  shadow: {
    enabled: false,
    mode: 'async_audit' as const,
    sample_rate: 0.2,
    verifier_model: '',
    checks: {
      placeholder_patterns: true,
      length_anomaly: true,
      missing_code_block: true,
    },
  },
};

/**
 * 支持的配置文件扩展名
 */
export const SUPPORTED_CONFIG_EXTENSIONS = ['.yaml', '.yml', '.json'];
