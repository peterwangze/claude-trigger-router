import { buildModelRegistry, getCompiledModelRef, resolveModelReference } from '../models/compile';
import { patternMatcher } from '../trigger/matcher';
import { IAppConfig, ITriggerRule } from '../trigger/types';
import { deriveRuntimeSmartRouterConfig } from '../utils/config';
import { semanticRouter } from '../governance/semantic-router';

export interface IRoutePreviewRequest {
  text: string;
  model?: string;
  thinking?: boolean;
  webSearch?: boolean;
  tokenCount?: number;
}

export interface IRoutePreviewStep {
  label: string;
  status: 'matched' | 'skipped' | 'warning' | 'info';
  detail: string;
}

export interface IRoutePreviewResult {
  input: IRoutePreviewRequest;
  finalModel?: string;
  finalModelRef?: string;
  source: 'explicit_model' | 'basic_long_context' | 'basic_background' | 'basic_thinking' | 'basic_web_search' | 'basic_default' | 'smart_rule' | 'semantic_match' | 'smart_router_pending' | 'unresolved';
  confidence?: number;
  ruleName?: string;
  steps: IRoutePreviewStep[];
  warnings: string[];
}

function resolveDisplayModel(config: IAppConfig, ref?: string): { model?: string; resolved?: string } {
  if (!ref) {
    return {};
  }
  const resolved = resolveModelReference(config, ref);
  return {
    model: ref,
    resolved,
  };
}

function extractRuleMatch(text: string, rules: ITriggerRule[]): { rule: ITriggerRule; detail: string } | undefined {
  const sortedRules = rules
    .filter((rule) => rule.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sortedRules) {
    for (const pattern of rule.patterns ?? []) {
      const result = patternMatcher.match(text, pattern);
      if (!result.matched) {
        continue;
      }
      const detail = result.matchedKeyword
        ? `keyword "${result.matchedKeyword}"`
        : result.regexMatch
          ? `regex "${pattern.pattern}"`
          : pattern.type;
      return { rule, detail };
    }
  }

  return undefined;
}

function buildSemanticCandidates(rules: ITriggerRule[], config: NonNullable<IAppConfig['SmartRouter']>) {
  const defaultThreshold = config.semantic?.threshold;
  const prototypes = config.semantic?.prototypes ?? {};
  return rules
    .filter((rule) => rule.enabled !== false)
    .map((rule) => {
      const prototype = rule.semantic_profile?.prototype
        ?? prototypes[rule.name]
        ?? rule.description;
      if (!prototype || rule.semantic_profile?.enabled === false) {
        return undefined;
      }
      return {
        intent: rule.name,
        prototype,
        threshold: rule.semantic_profile?.threshold ?? defaultThreshold,
        rule,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function previewBasicRouter(config: IAppConfig, input: IRoutePreviewRequest): IRoutePreviewResult {
  const steps: IRoutePreviewStep[] = [];
  const warnings: string[] = [];
  const registry = buildModelRegistry(config);
  const tokenCount = input.tokenCount ?? 0;
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const explicit = resolveModelReference(config, input.model);

  if (explicit && explicit.includes(',')) {
    steps.push({
      label: 'Explicit model',
      status: 'matched',
      detail: `请求模型 "${input.model}" 已解析为上游引用，基础槽位不会再覆盖。`,
    });
    return {
      input,
      finalModel: explicit,
      finalModelRef: input.model,
      source: 'explicit_model',
      steps,
      warnings,
    };
  }

  if (tokenCount > longContextThreshold && config.Router.longContext) {
    const model = resolveDisplayModel(config, config.Router.longContext);
    steps.push({
      label: 'Router.longContext',
      status: 'matched',
      detail: `tokenCount ${tokenCount} > threshold ${longContextThreshold}，优先使用长上下文槽位。`,
    });
    return {
      input,
      finalModel: model.resolved,
      finalModelRef: model.model,
      source: 'basic_long_context',
      steps,
      warnings,
    };
  }

  steps.push({
    label: 'Router.longContext',
    status: config.Router.longContext ? 'info' : 'skipped',
    detail: config.Router.longContext
      ? `当前 tokenCount ${tokenCount} 未超过 threshold ${longContextThreshold}；真实运行还会在最终定模后检查 safe_input/context_window。`
      : '未配置 Router.longContext，大上下文请求会回到当前选中模型。',
  });

  if (input.model?.startsWith('claude-3-5-haiku') && config.Router.background) {
    const model = resolveDisplayModel(config, config.Router.background);
    steps.push({
      label: 'Router.background',
      status: 'matched',
      detail: '请求模型以 claude-3-5-haiku 开头，按当前基础路由实现识别为后台请求。',
    });
    return {
      input,
      finalModel: model.resolved,
      finalModelRef: model.model,
      source: 'basic_background',
      steps,
      warnings,
    };
  }

  steps.push({
    label: 'Router.background',
    status: config.Router.background ? 'info' : 'skipped',
    detail: config.Router.background
      ? '仅当请求模型以 claude-3-5-haiku 开头时命中；如果 Claude Code 后台模型标识变化，需要重新校准。'
      : '未配置 Router.background。',
  });

  if (input.thinking && config.Router.think) {
    const model = resolveDisplayModel(config, config.Router.think);
    steps.push({
      label: 'Router.think',
      status: 'matched',
      detail: '请求包含 thinking，使用思考槽位。',
    });
    return {
      input,
      finalModel: model.resolved,
      finalModelRef: model.model,
      source: 'basic_thinking',
      steps,
      warnings,
    };
  }

  steps.push({
    label: 'Router.think',
    status: config.Router.think ? 'info' : 'skipped',
    detail: config.Router.think
      ? '本次未声明 thinking；如果同时超过 longContext threshold，长上下文会先于 thinking 命中。'
      : '未配置 Router.think。',
  });

  if (input.webSearch && config.Router.webSearch) {
    const model = resolveDisplayModel(config, config.Router.webSearch);
    steps.push({
      label: 'Router.webSearch',
      status: 'matched',
      detail: '请求包含 web_search 工具，使用联网搜索槽位。',
    });
    return {
      input,
      finalModel: model.resolved,
      finalModelRef: model.model,
      source: 'basic_web_search',
      steps,
      warnings,
    };
  }

  steps.push({
    label: 'Router.webSearch',
    status: config.Router.webSearch ? 'info' : 'skipped',
    detail: config.Router.webSearch
      ? '本次未声明 web_search；如果同时超过 longContext threshold，长上下文会先于 webSearch 命中。'
      : '未配置 Router.webSearch。',
  });

  const defaultModel = resolveDisplayModel(config, config.Router.default);
  if (!defaultModel.resolved || !getCompiledModelRef(config, defaultModel.resolved)) {
    warnings.push(`Router.default "${config.Router.default}" 未解析到可用模型。`);
  }
  steps.push({
    label: 'Router.default',
    status: defaultModel.resolved ? 'matched' : 'warning',
    detail: defaultModel.resolved
      ? '前置槽位均未命中，使用默认模型。'
      : 'Router.default 未解析到可用模型。',
  });

  if (defaultModel.model && !registry.modelMap[defaultModel.model] && !defaultModel.model.includes(',')) {
    warnings.push(`Router.default "${defaultModel.model}" 不在 Models/Providers/Registration 中。`);
  }

  return {
    input,
    finalModel: defaultModel.resolved,
    finalModelRef: defaultModel.model,
    source: defaultModel.resolved ? 'basic_default' : 'unresolved',
    steps,
    warnings,
  };
}

export function previewRoute(config: IAppConfig, input: IRoutePreviewRequest): IRoutePreviewResult {
  const smartRouterConfig = deriveRuntimeSmartRouterConfig(config, config);
  const text = input.text.trim();
  const smartRouterEnabled = Boolean(smartRouterConfig?.enabled);
  const rules = smartRouterConfig?.rules ?? [];

  if (smartRouterEnabled && smartRouterConfig && text) {
    const ruleMatch = extractRuleMatch(text, rules);
    if (ruleMatch) {
      const model = resolveDisplayModel(config, ruleMatch.rule.model);
      return {
        input,
        finalModel: model.resolved,
        finalModelRef: model.model,
        source: 'smart_rule',
        confidence: 1,
        ruleName: ruleMatch.rule.name,
        steps: [
          {
            label: 'SmartRouter.rules',
            status: 'matched',
            detail: `命中规则 "${ruleMatch.rule.name}"（${ruleMatch.detail}），会在基础 Router 前选定模型。`,
          },
        ],
        warnings: [],
      };
    }

    const semanticCandidates = buildSemanticCandidates(rules, smartRouterConfig);
    if (smartRouterConfig.semantic?.enabled && smartRouterConfig.semantic.mode !== 'classifier' && semanticCandidates.length) {
      const result = semanticRouter.analyzeCandidates(
        text,
        semanticCandidates.map((candidate) => ({
          intent: candidate.intent,
          prototype: candidate.prototype,
          threshold: candidate.threshold,
        })),
        smartRouterConfig.semantic.threshold
      );
      if (result) {
        const candidate = semanticCandidates.find((item) => item.intent === result.intent);
        const model = resolveDisplayModel(config, candidate?.rule.model);
        return {
          input,
          finalModel: model.resolved,
          finalModelRef: model.model,
          source: 'semantic_match',
          confidence: result.confidence,
          ruleName: result.intent,
          steps: [
            {
              label: 'SmartRouter.semantic',
              status: 'matched',
              detail: `语义 prototype 命中 "${result.intent}"，confidence=${result.confidence.toFixed(3)}。`,
            },
          ],
          warnings: [],
        };
      }
    }

    if (smartRouterConfig.router_model && (smartRouterConfig.candidates?.length ?? 0) >= 2) {
      const model = resolveDisplayModel(config, smartRouterConfig.router_model);
      return {
        input,
        finalModel: undefined,
        finalModelRef: undefined,
        source: 'smart_router_pending',
        steps: [
          {
            label: 'SmartRouter.router_model',
            status: 'info',
            detail: `未命中确定性规则；真实请求会先调用 router_model "${smartRouterConfig.router_model}"（${model.resolved ?? '未解析'}）在 ${smartRouterConfig.candidates?.length ?? 0} 个候选中选择，会增加首包前等待。`,
          },
          {
            label: 'Basic Router fallback',
            status: 'info',
            detail: '如果 SmartRouter 调用失败或返回无效模型，请求会继续进入基础 Router fallback。',
          },
        ],
        warnings: [
          'doctor route preview 不会调用 SmartRouter LLM；这里展示的是待决策路径，不代表最终候选选择。',
        ],
      };
    }
  }

  const basic = previewBasicRouter(config, input);
  if (smartRouterEnabled) {
    basic.steps.unshift({
      label: 'SmartRouter',
      status: 'skipped',
      detail: 'SmartRouter 已启用，但本次未命中规则/语义，且没有可用 router_model+candidates 兜底。',
    });
  }
  return basic;
}

export function formatRoutePreview(result: IRoutePreviewResult): string[] {
  const lines = [
    `路由预演：${result.input.text || '<empty>'}`,
    '基础路由顺序：显式上游模型 -> longContext -> background -> think -> webSearch -> default',
    `预计来源：${result.source}${result.ruleName ? ` (${result.ruleName})` : ''}`,
    `预计模型：${result.finalModelRef ?? '-'}${result.finalModel ? ` -> ${result.finalModel}` : ''}`,
  ];
  if (result.confidence !== undefined) {
    lines.push(`置信度：${result.confidence.toFixed(3)}`);
  }
  for (const step of result.steps) {
    lines.push(`- [${step.status}] ${step.label}: ${step.detail}`);
  }
  for (const warning of result.warnings) {
    lines.push(`! ${warning}`);
  }
  return lines;
}
