/**
 * Config Utilities
 *
 * 配置加载和管理工具
 */

import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import * as yaml from 'js-yaml';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  CONFIG_FILE_JSON,
  DEFAULT_CONFIG,
  DEFAULT_TRIGGER_CONFIG,
  DEFAULT_SMART_ROUTER_CONFIG,
} from '../constants';
import { IAppConfig, ITriggerConfig } from '../trigger/types';
import { logError, logWarn } from './log';

/**
 * 确保配置目录存在
 */
export async function initDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 尝试加载 YAML 配置文件
 */
async function loadYamlConfig(path: string): Promise<Partial<IAppConfig> | null> {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    return yaml.load(content) as Partial<IAppConfig>;
  } catch (error) {
    logError(`Error loading YAML config from ${path}:`, error);
    return null;
  }
}

/**
 * 尝试加载 JSON 配置文件
 */
async function loadJsonConfig(path: string): Promise<Partial<IAppConfig> | null> {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logError(`Error loading JSON config from ${path}:`, error);
    return null;
  }
}

/**
 * 深度合并配置对象
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * 验证配置
 */
function validateConfig(config: Partial<IAppConfig>): string[] {
  const errors: string[] = [];

  // 验证 Providers
  if (!config.Providers || !Array.isArray(config.Providers) || config.Providers.length === 0) {
    errors.push('Providers is required and must be a non-empty array');
  } else {
    config.Providers.forEach((provider, index) => {
      if (!provider.name) {
        errors.push(`Providers[${index}].name is required`);
      }
      if (!provider.api_base_url) {
        errors.push(`Providers[${index}].api_base_url is required`);
      }
      if (!provider.models || provider.models.length === 0) {
        errors.push(`Providers[${index}].models must be a non-empty array`);
      }
    });
  }

  // 验证 Router
  if (!config.Router?.default) {
    errors.push('Router.default is required');
  }

  // 验证触发路由配置
  if (config.TriggerRouter) {
    if (config.TriggerRouter.llm_intent_recognition && !config.TriggerRouter.intent_model) {
      errors.push('TriggerRouter.intent_model is required when llm_intent_recognition is enabled');
    }

    if (config.TriggerRouter.rules) {
      config.TriggerRouter.rules.forEach((rule, index) => {
        if (!rule.name) {
          errors.push(`TriggerRouter.rules[${index}].name is required`);
        }
        if (!rule.model) {
          errors.push(`TriggerRouter.rules[${index}].model is required`);
        }
        if (!rule.patterns || rule.patterns.length === 0) {
          errors.push(`TriggerRouter.rules[${index}].patterns must be a non-empty array`);
        }
      });
    }
  }

  // 验证 SmartRouter 配置
  if (config.SmartRouter?.enabled) {
    if (!config.SmartRouter.router_model) {
      errors.push('SmartRouter.router_model is required when SmartRouter is enabled');
    }
    if (!config.SmartRouter.candidates || config.SmartRouter.candidates.length < 2) {
      errors.push('SmartRouter.candidates must have at least 2 entries when SmartRouter is enabled');
    } else {
      config.SmartRouter.candidates.forEach((candidate, index) => {
        if (!candidate.model) {
          errors.push(`SmartRouter.candidates[${index}].model is required`);
        }
        if (!candidate.description) {
          errors.push(`SmartRouter.candidates[${index}].description is required`);
        }
      });
    }
  }

  return errors;
}

/**
 * 初始化并加载配置
 */
export async function initConfig(): Promise<IAppConfig> {
  await initDir();

  // 尝试加载配置文件（优先 YAML）
  let config: Partial<IAppConfig> | null = null;

  // 尝试 YAML 配置
  config = await loadYamlConfig(CONFIG_FILE);

  // 如果没有 YAML 配置，尝试 JSON 配置
  if (!config) {
    config = await loadJsonConfig(CONFIG_FILE_JSON);
  }

  // 如果没有配置文件，使用默认配置
  if (!config) {
    const divider = '─'.repeat(60);
    console.error(`\n${divider}`);
    console.error('  ⚠️   No configuration file found');
    console.error(divider);
    console.error(`  Expected: ${CONFIG_FILE}`);
    console.error(`  Run 'ctr init' to create a configuration file.`);
    console.error(`${divider}\n`);
    config = {};
  }

  // 合并默认配置
  const mergedConfig = deepMerge(
    {
      ...DEFAULT_CONFIG,
      Router: {
        default: '',
      },
      Providers: [],
      TriggerRouter: DEFAULT_TRIGGER_CONFIG,
      SmartRouter: DEFAULT_SMART_ROUTER_CONFIG,
    },
    config
  );

  // 验证配置
  const errors = validateConfig(mergedConfig);
  if (errors.length > 0) {
    const divider = '─'.repeat(60);
    console.error(`\n${divider}`);
    console.error('  ❌  Configuration Error');
    console.error(divider);
    console.error('  The following issues were found in your config file:\n');
    errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
    console.error(`\n  Config file: ${CONFIG_FILE}`);
    console.error(`  Run 'ctr init' to create a new config from the example.`);
    console.error(`  Reference:   https://github.com/peterwangze/claude-trigger-router#configuration`);
    console.error(`${divider}\n`);
    throw new Error('Invalid configuration');
  }

  return mergedConfig as IAppConfig;
}

/**
 * 读取配置文件
 */
export async function readConfigFile(): Promise<IAppConfig> {
  return initConfig();
}

/**
 * 写入配置文件
 * 写回策略：优先保持原有格式（YAML 或 JSON）。
 * 若 YAML 文件存在，写入 YAML；若仅存在 JSON 文件，写入 JSON；否则默认写 YAML。
 */
export async function writeConfigFile(config: IAppConfig): Promise<void> {
  await initDir();

  // 检测原始配置文件格式：仅存在 JSON 且不存在 YAML 时，写回 JSON
  const hasYaml = existsSync(CONFIG_FILE);
  const hasJson = existsSync(CONFIG_FILE_JSON);
  const useJson = !hasYaml && hasJson;

  const targetFile = useJson ? CONFIG_FILE_JSON : CONFIG_FILE;

  let content: string;

  if (useJson) {
    content = JSON.stringify(config, null, 2);
  } else {
    content = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
  }

  await writeFile(targetFile, content, 'utf-8');
}

/**
 * 备份配置文件
 */
export async function backupConfigFile(): Promise<string | null> {
  const configPath = existsSync(CONFIG_FILE) ? CONFIG_FILE :
                     existsSync(CONFIG_FILE_JSON) ? CONFIG_FILE_JSON : null;

  if (!configPath || !existsSync(configPath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(CONFIG_DIR, `config.backup.${timestamp}.yaml`);

  try {
    const content = await readFile(configPath, 'utf-8');
    await writeFile(backupPath, content, 'utf-8');
    return backupPath;
  } catch (error) {
    logError('Error backing up config file:', error);
    return null;
  }
}

/**
 * 合并触发配置
 * 将独立的触发配置文件合并到主配置
 */
export async function mergeTriggerConfig(
  config: IAppConfig,
  triggerConfigPath?: string
): Promise<IAppConfig> {
  if (!triggerConfigPath) {
    return config;
  }

  const triggerConfig = await loadYamlConfig(triggerConfigPath);

  if (!triggerConfig?.TriggerRouter) {
    return config;
  }

  return {
    ...config,
    TriggerRouter: {
      ...DEFAULT_TRIGGER_CONFIG,
      ...triggerConfig.TriggerRouter,
    } as ITriggerConfig,
  };
}
