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
  CONFIG_FILE_YML,
  DEFAULT_CONFIG,
  DEFAULT_GOVERNANCE_CONFIG,
  DEFAULT_TRIGGER_CONFIG,
  DEFAULT_SMART_ROUTER_CONFIG,
} from '../constants';
import { IAppConfig, ITriggerConfig } from '../trigger/types';
import { collectCapabilityWarnings, isKnownModelReference } from '../models/compile';
import { getModelApi, getModelInterface, getModelKey, normalizeModelEndpointConfig, toExternalModelConfig } from '../models/schema';
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
 * 返回 null 表示文件不存在；解析失败时抛出错误（区分两种情况）
 */
async function loadYamlConfig(path: string): Promise<Partial<IAppConfig> | null> {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    return yaml.load(content) as Partial<IAppConfig>;
  } catch (error: any) {
    const divider = '─'.repeat(60);
    console.error(`\n${divider}`);
    console.error('  ❌  配置文件解析失败（YAML 格式错误）');
    console.error(divider);
    console.error(`  文件：${path}`);
    console.error(`  错误：${error.message || error}`);
    console.error(`  提示：请检查 YAML 缩进是否使用空格（不能用 Tab）`);
    console.error(`        可用在线工具验证：https://yaml.lint.me`);
    console.error(`${divider}\n`);
    throw new Error(`YAML parse error in ${path}: ${error.message}`);
  }
}

/**
 * 尝试加载 JSON 配置文件
 * 返回 null 表示文件不存在；解析失败时抛出错误（区分两种情况）
 */
async function loadJsonConfig(path: string): Promise<Partial<IAppConfig> | null> {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    const divider = '─'.repeat(60);
    console.error(`\n${divider}`);
    console.error('  ❌  配置文件解析失败（JSON 格式错误）');
    console.error(divider);
    console.error(`  文件：${path}`);
    console.error(`  错误：${error.message || error}`);
    console.error(`  提示：请检查 JSON 格式，例如是否有多余逗号或缺少引号`);
    console.error(`${divider}\n`);
    throw new Error(`JSON parse error in ${path}: ${error.message}`);
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
 * 校验 "provider,model" 格式的模型引用是否在 Providers 列表中存在
 * 返回错误描述，合法则返回 null
 */
function validateModelRef(
  ref: string,
  providers: IAppConfig['Providers'],
  fieldName: string
): string | null {
  if (!ref || !ref.includes(',')) {
    return `${fieldName} 格式不正确，应为 "provider,model"，当前值："${ref}"`;
  }
  const [providerName, modelName] = ref.split(',');
  const provider = providers.find(p => p.name === providerName);
  if (!provider) {
    return `${fieldName} 引用了不存在的提供商 "${providerName}"，请检查 Providers 配置`;
  }
  if (!provider.models.includes(modelName)) {
    return `${fieldName} 引用的模型 "${modelName}" 不在提供商 "${providerName}" 的 models 列表中`;
  }
  return null;
}

/**
 * 验证配置
 */
function validateConfig(config: Partial<IAppConfig>): string[] {
  const errors: string[] = [];

  if (config.Models !== undefined) {
    if (!Array.isArray(config.Models)) {
      errors.push('Models must be an array when provided');
    } else {
      const ids = new Set<string>();
      config.Models.forEach((item, index) => {
        if (!item.id?.trim()) {
          errors.push(`Models[${index}].id is required`);
        } else if (ids.has(item.id.trim())) {
          errors.push(`Models[${index}].id must be unique`);
        } else {
          ids.add(item.id.trim());
        }

        if (!getModelApi(item)) {
          errors.push(`Models[${index}].api is required`);
        }

        if (!getModelKey(item)) {
          errors.push(`Models[${index}].key is required`);
        }

        const modelInterface = getModelInterface(item);
        if (!modelInterface) {
          errors.push(`Models[${index}].interface is required`);
        } else if (!['openai', 'anthropic'].includes(modelInterface)) {
          errors.push(`Models[${index}].interface must be either "openai" or "anthropic"`);
        }

        if (!item.model?.trim()) {
          errors.push(`Models[${index}].model is required`);
        }

        const thinking = item.thinking;
        if (thinking?.mode && !['off', 'auto', 'on'].includes(thinking.mode)) {
          errors.push(`Models[${index}].thinking.mode must be one of "off", "auto", "on"`);
        }

        if (thinking?.effort && !['low', 'medium', 'high'].includes(thinking.effort)) {
          errors.push(`Models[${index}].thinking.effort must be one of "low", "medium", "high"`);
        }

        if (thinking?.budget_tokens !== undefined && thinking.budget_tokens <= 0) {
          errors.push(`Models[${index}].thinking.budget_tokens must be greater than 0`);
        }
      });
    }
  }

  // 验证 Providers
  const hasModels = Array.isArray(config.Models) && config.Models.length > 0;

  if (!hasModels && (!config.Providers || !Array.isArray(config.Providers) || config.Providers.length === 0)) {
    errors.push('Providers is required and must be a non-empty array');
  } else if (config.Providers && Array.isArray(config.Providers)) {
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

  // Provider/model 交叉引用校验（仅在 Providers 列表有效时执行）
  const validProviders = config.Providers?.filter(p => p.name && p.models?.length) ?? [];
  if (validProviders.length > 0) {
    const router = config.Router;
    if (router) {
      const routerModelFields: Array<[string | undefined, string]> = [
        [router.default,         'Router.default'],
        [router.background,      'Router.background'],
        [router.think,           'Router.think'],
        [router.longContext,     'Router.longContext'],
        [router.webSearch,       'Router.webSearch'],
        [router.image,           'Router.image'],
      ];
      for (const [ref, field] of routerModelFields) {
        if (ref) {
          const err = validateModelRef(ref, validProviders, field);
          if (err) errors.push(err);
        }
      }
    }
  }

  // 验证触发路由配置
  if (config.TriggerRouter) {
    if (config.TriggerRouter.llm_intent_recognition && !config.TriggerRouter.intent_model) {
      errors.push('TriggerRouter.intent_model is required when llm_intent_recognition is enabled');
    } else if (config.TriggerRouter.intent_model && validProviders.length > 0) {
      const err = validateModelRef(config.TriggerRouter.intent_model, validProviders, 'TriggerRouter.intent_model');
      if (err) errors.push(err);
    }

    if (config.TriggerRouter.rules) {
      config.TriggerRouter.rules.forEach((rule, index) => {
        if (!rule.name) {
          errors.push(`TriggerRouter.rules[${index}].name is required`);
        }
        if (!rule.model) {
          errors.push(`TriggerRouter.rules[${index}].model is required`);
        } else if (validProviders.length > 0) {
          const err = validateModelRef(rule.model, validProviders, `TriggerRouter.rules[${index}].model`);
          if (err) errors.push(err);
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
    } else if (validProviders.length > 0) {
      const err = validateModelRef(config.SmartRouter.router_model, validProviders, 'SmartRouter.router_model');
      if (err) errors.push(err);
    }
    if (!config.SmartRouter.candidates || config.SmartRouter.candidates.length < 2) {
      errors.push('SmartRouter.candidates must have at least 2 entries when SmartRouter is enabled');
    } else {
      config.SmartRouter.candidates.forEach((candidate, index) => {
        if (!candidate.model) {
          errors.push(`SmartRouter.candidates[${index}].model is required`);
        } else if (validProviders.length > 0) {
          const err = validateModelRef(candidate.model, validProviders, `SmartRouter.candidates[${index}].model`);
          if (err) errors.push(err);
        }
        if (!candidate.description) {
          errors.push(`SmartRouter.candidates[${index}].description is required`);
        }
      });
    }
  }

  // 验证 Governance 配置
  if (config.Governance?.enabled) {
    const sticky = config.Governance.sticky;
    if (sticky?.enabled) {
      if ((sticky.session_ttl_ms ?? 0) <= 0) {
        errors.push('Governance.sticky.session_ttl_ms must be greater than 0 when sticky routing is enabled');
      }
      const threshold = sticky.fingerprint_similarity_threshold;
      if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
        errors.push('Governance.sticky.fingerprint_similarity_threshold must be between 0 and 1');
      }
      if (sticky.alignment?.enabled) {
        if (!sticky.alignment.summarizer_model) {
          errors.push('Governance.sticky.alignment.summarizer_model is required when alignment is enabled');
        } else if (!isKnownModelReference(config as IAppConfig, sticky.alignment.summarizer_model)) {
          const err = validateModelRef(
            sticky.alignment.summarizer_model,
            validProviders,
            'Governance.sticky.alignment.summarizer_model'
          );
          if (err) errors.push(err);
        }
        if ((sticky.alignment.max_summary_tokens ?? 0) <= 0) {
          errors.push('Governance.sticky.alignment.max_summary_tokens must be greater than 0 when alignment is enabled');
        }
      }
    }

    const cascade = config.Governance.cascade;
    if (cascade?.enabled) {
      if ((cascade.max_attempts ?? 0) < 1) {
        errors.push('Governance.cascade.max_attempts must be at least 1 when cascade is enabled');
      }
      cascade.levels?.forEach((level, index) => {
        if (!level.from) {
          errors.push(`Governance.cascade.levels[${index}].from is required`);
        } else if (!isKnownModelReference(config as IAppConfig, level.from)) {
          const err = validateModelRef(level.from, validProviders, `Governance.cascade.levels[${index}].from`);
          if (err) errors.push(err);
        }
        if (!level.to) {
          errors.push(`Governance.cascade.levels[${index}].to is required`);
        } else if (!isKnownModelReference(config as IAppConfig, level.to)) {
          const err = validateModelRef(level.to, validProviders, `Governance.cascade.levels[${index}].to`);
          if (err) errors.push(err);
        }
      });
    }

    const semantic = config.Governance.semantic;
    if (semantic?.enabled) {
      const threshold = semantic.threshold;
      if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
        errors.push('Governance.semantic.threshold must be between 0 and 1');
      }
      if (semantic.mode && !['embedding', 'classifier'].includes(semantic.mode)) {
        errors.push('Governance.semantic.mode must be either "embedding" or "classifier"');
      }
      if (semantic.mode === 'classifier') {
        if (!semantic.classifier_model) {
          errors.push('Governance.semantic.classifier_model is required when semantic mode is "classifier"');
        } else if (!isKnownModelReference(config as IAppConfig, semantic.classifier_model)) {
          const err = validateModelRef(semantic.classifier_model, validProviders, 'Governance.semantic.classifier_model');
          if (err) errors.push(err);
        }
      }
    }

    const shadow = config.Governance.shadow;
    if (shadow?.enabled) {
      const sampleRate = shadow.sample_rate;
      if (sampleRate !== undefined && (sampleRate < 0 || sampleRate > 1)) {
        errors.push('Governance.shadow.sample_rate must be between 0 and 1');
      }
      if (shadow.mode && !['async_audit', 'sync_guard'].includes(shadow.mode)) {
        errors.push('Governance.shadow.mode must be either "async_audit" or "sync_guard"');
      }
      if (shadow.verifier_model && !isKnownModelReference(config as IAppConfig, shadow.verifier_model)) {
        const err = validateModelRef(shadow.verifier_model, validProviders, 'Governance.shadow.verifier_model');
        if (err) errors.push(err);
      }
    }

    const anomalyThresholds = config.Governance.observability?.anomaly_thresholds;
    if (anomalyThresholds) {
      const rateFields: Array<[number | undefined, string]> = [
        [anomalyThresholds.cascade_warn_rate, 'Governance.observability.anomaly_thresholds.cascade_warn_rate'],
        [anomalyThresholds.cascade_critical_rate, 'Governance.observability.anomaly_thresholds.cascade_critical_rate'],
        [anomalyThresholds.shadow_warn_rate, 'Governance.observability.anomaly_thresholds.shadow_warn_rate'],
        [anomalyThresholds.shadow_critical_rate, 'Governance.observability.anomaly_thresholds.shadow_critical_rate'],
        [anomalyThresholds.spike_warn_rate, 'Governance.observability.anomaly_thresholds.spike_warn_rate'],
        [anomalyThresholds.spike_delta_rate, 'Governance.observability.anomaly_thresholds.spike_delta_rate'],
      ];
      for (const [value, field] of rateFields) {
        if (value !== undefined && (value < 0 || value > 1)) {
          errors.push(`${field} must be between 0 and 1`);
        }
      }

      const minSampleSize = anomalyThresholds.min_sample_size;
      if (minSampleSize !== undefined && minSampleSize < 1) {
        errors.push('Governance.observability.anomaly_thresholds.min_sample_size must be at least 1');
      }

      const latencyWarnMs = anomalyThresholds.latency_warn_ms;
      const latencyCriticalMs = anomalyThresholds.latency_critical_ms;
      if (latencyWarnMs !== undefined && latencyWarnMs < 1) {
        errors.push('Governance.observability.anomaly_thresholds.latency_warn_ms must be greater than 0');
      }
      if (latencyCriticalMs !== undefined && latencyCriticalMs < 1) {
        errors.push('Governance.observability.anomaly_thresholds.latency_critical_ms must be greater than 0');
      }
      if (
        anomalyThresholds.cascade_warn_rate !== undefined &&
        anomalyThresholds.cascade_critical_rate !== undefined &&
        anomalyThresholds.cascade_warn_rate > anomalyThresholds.cascade_critical_rate
      ) {
        errors.push('Governance.observability.anomaly_thresholds.cascade_warn_rate must be less than or equal to cascade_critical_rate');
      }
      if (
        anomalyThresholds.shadow_warn_rate !== undefined &&
        anomalyThresholds.shadow_critical_rate !== undefined &&
        anomalyThresholds.shadow_warn_rate > anomalyThresholds.shadow_critical_rate
      ) {
        errors.push('Governance.observability.anomaly_thresholds.shadow_warn_rate must be less than or equal to shadow_critical_rate');
      }
      if (
        latencyWarnMs !== undefined &&
        latencyCriticalMs !== undefined &&
        latencyWarnMs > latencyCriticalMs
      ) {
        errors.push('Governance.observability.anomaly_thresholds.latency_warn_ms must be less than or equal to latency_critical_ms');
      }
    }
  }

  return errors;
}

export function normalizeAndValidateConfig(config: Partial<IAppConfig> = {}): {
  config: IAppConfig;
  errors: string[];
  warnings: string[];
} {
  const normalizedConfig = deepMerge(
    {
      ...DEFAULT_CONFIG,
      Router: {
        default: '',
      },
      Providers: [],
      SmartRouter: DEFAULT_SMART_ROUTER_CONFIG,
    },
    config
  ) as IAppConfig;

  if (config.TriggerRouter) {
    normalizedConfig.TriggerRouter = deepMerge(DEFAULT_TRIGGER_CONFIG, config.TriggerRouter) as IAppConfig['TriggerRouter'];
  }

  if (config.Governance) {
    normalizedConfig.Governance = deepMerge(DEFAULT_GOVERNANCE_CONFIG, config.Governance) as IAppConfig['Governance'];
  }

  if (config.Models) {
    normalizedConfig.Models = config.Models.map((item) => normalizeModelEndpointConfig(item));
  }

  return {
    config: normalizedConfig,
    errors: validateConfig(normalizedConfig),
    warnings: collectCapabilityWarnings(normalizedConfig).entries.map((entry) => entry.message),
  };
}

/**
 * 初始化并加载配置
 */
export async function initConfig(): Promise<IAppConfig> {
  await initDir();

  // 尝试加载配置文件（优先顺序：config.yaml → config.yml → config.json）
  let config: Partial<IAppConfig> | null = null;

  // 尝试 .yaml 配置
  config = await loadYamlConfig(CONFIG_FILE);

  // 尝试 .yml 配置
  if (!config) {
    config = await loadYamlConfig(CONFIG_FILE_YML);
  }

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

  const result = normalizeAndValidateConfig(config);

  if (result.errors.length > 0) {
    const divider = '─'.repeat(60);
    console.error(`\n${divider}`);
    console.error('  ❌  Configuration Error');
    console.error(divider);
    console.error('  The following issues were found in your config file:\n');
    result.errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
    console.error(`\n  Config file: ${CONFIG_FILE}`);
    console.error(`  Run 'ctr init' to create a new config from the example.`);
    console.error(`  Reference:   https://github.com/peterwangze/claude-trigger-router#configuration`);
    console.error(`${divider}\n`);
    throw new Error('Invalid configuration');
  }

  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => logWarn(`[ConfigWarning] ${warning}`));
  }

  return result.config;
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

  // 检测原始配置文件格式：仅存在 JSON 且不存在 YAML/YML 时，写回 JSON
  const hasYaml = existsSync(CONFIG_FILE);
  const hasYml = existsSync(CONFIG_FILE_YML);
  const hasJson = existsSync(CONFIG_FILE_JSON);
  const useJson = !hasYaml && !hasYml && hasJson;

  // 写回同名文件：yaml → config.yaml，yml → config.yml，json → config.json，默认 yaml
  const targetFile = useJson ? CONFIG_FILE_JSON : (hasYml && !hasYaml ? CONFIG_FILE_YML : CONFIG_FILE);

  let content: string;
  const externalConfig = {
    ...config,
    Models: config.Models?.map((item) => toExternalModelConfig(item)),
  };

  if (useJson) {
    content = JSON.stringify(externalConfig, null, 2);
  } else {
    content = yaml.dump(externalConfig, {
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
                     existsSync(CONFIG_FILE_YML) ? CONFIG_FILE_YML :
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
