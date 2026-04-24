/**
 * Model Selector
 *
 * 模型选择器，负责根据触发规则选择合适的模型
 */

import { ITriggerConfig, ITriggerRule, IAnalysisResult, IMatchResult, IRequestContext, ISmartRouterConfig, IAppConfig } from './types';
import { patternMatcher } from './matcher';
import { contextAnalyzer } from './analyzer';
import { intentDetector } from './intent';
import { smartRouterSelector } from './smart-router';
import { log, logError } from '../utils/log';
import { DEFAULT_CONFIG } from '../constants';
import { IGovernanceConfig } from '../governance/types';
import { createTaskFingerprint, sessionStateStore } from '../governance/session-store';
import { semanticRouter } from '../governance/semantic-router';
import { resolveModelReference } from '../models/compile';

interface IStickyCorrectionContext {
  sessionModel?: string;
  fingerprint?: string;
}

/**
 * 模型选择器类
 */
export class ModelSelector {
  private isRoutingEnabled(config: ITriggerConfig, smartRouterConfig?: ISmartRouterConfig): boolean {
    if (smartRouterConfig) {
      return Boolean(smartRouterConfig.enabled);
    }
    return Boolean(config.enabled);
  }

  private getRoutingRules(config: ITriggerConfig, smartRouterConfig?: ISmartRouterConfig): ITriggerRule[] {
    return smartRouterConfig?.rules?.length
      ? smartRouterConfig.rules
      : config.rules;
  }

  private getEffectiveGovernanceConfig(
    smartRouterConfig?: ISmartRouterConfig,
    governanceConfig?: IGovernanceConfig
  ): IGovernanceConfig | undefined {
    if (!smartRouterConfig?.semantic && !smartRouterConfig?.sticky) {
      return governanceConfig;
    }

    return {
      ...(governanceConfig ?? {}),
      enabled: Boolean(
        governanceConfig?.enabled ||
        smartRouterConfig.semantic?.enabled ||
        smartRouterConfig.sticky?.enabled
      ),
      sticky: smartRouterConfig.sticky
        ? {
            ...(governanceConfig?.sticky ?? {}),
            ...smartRouterConfig.sticky,
          }
        : governanceConfig?.sticky,
      semantic: smartRouterConfig.semantic
        ? {
            ...(governanceConfig?.semantic ?? {}),
            ...smartRouterConfig.semantic,
            prototypes: {
              ...(governanceConfig?.semantic?.prototypes ?? {}),
              ...(smartRouterConfig.semantic?.prototypes ?? {}),
            },
          }
        : governanceConfig?.semantic,
      cascade: governanceConfig?.cascade,
      shadow: governanceConfig?.shadow,
      observability: governanceConfig?.observability,
    };
  }

  private resolveRouteModel(appConfig: IAppConfig | undefined, ref: string | undefined): string | undefined {
    if (!ref) {
      return undefined;
    }
    return appConfig ? resolveModelReference(appConfig, ref) ?? ref : ref;
  }

  private buildSemanticCandidates(
    rules: ITriggerRule[],
    governanceConfig?: IGovernanceConfig
  ) {
    const defaultThreshold = governanceConfig?.semantic?.threshold;
    const legacyPrototypes = governanceConfig?.semantic?.prototypes ?? {};

    return this.sortRulesByPriority(rules)
      .map((rule) => {
        const prototype = rule.semantic_profile?.prototype
          ?? legacyPrototypes[rule.name]
          ?? rule.description;
        const semanticEnabled = rule.semantic_profile?.enabled !== false && Boolean(prototype);
        if (!semanticEnabled || !prototype) {
          return null;
        }

        return {
          rule,
          prototype,
          threshold: rule.semantic_profile?.threshold ?? defaultThreshold,
        };
      })
      .filter(Boolean) as Array<{ rule: ITriggerRule; prototype: string; threshold?: number }>;
  }

  private getStickyCorrection(
    text: string,
    req: IRequestContext,
    governanceConfig?: IGovernanceConfig
  ): IStickyCorrectionContext {
    if (!governanceConfig?.enabled || !governanceConfig.sticky?.enabled || !req.sessionId) {
      return {};
    }

    const fingerprint = createTaskFingerprint(text);
    const sessionState = sessionStateStore.get(req.sessionId);
    if (
      !fingerprint ||
      sessionState?.lastTaskFingerprint !== fingerprint ||
      !(sessionState.preferredModel || sessionState.lastSuccessfulModel)
    ) {
      return {};
    }

    return {
      fingerprint,
      sessionModel: sessionState.preferredModel || sessionState.lastSuccessfulModel,
    };
  }

  private applyStickyCorrection(
    candidate: IAnalysisResult | null,
    sticky: IStickyCorrectionContext,
    appConfig?: IAppConfig
  ): IAnalysisResult | null {
    if (!sticky.sessionModel) {
      return candidate;
    }

    const stickyModel = this.resolveRouteModel(appConfig, sticky.sessionModel);
    if (!stickyModel) {
      return candidate;
    }

    if (!candidate) {
      log(`[StickyRouting] Reusing model "${stickyModel}" as unified router correction`);
      return {
        matched: true,
        model: stickyModel,
        confidence: 0.95,
        analysisTime: 0,
        routeSource: 'sticky_correction',
      };
    }

    if (candidate.model === stickyModel) {
      return candidate;
    }

    log(`[StickyRouting] Correcting selected model "${candidate.model}" -> "${stickyModel}"`);
    return {
      ...candidate,
      model: stickyModel,
      confidence: Math.max(candidate.confidence, 0.95),
      routeSource: 'sticky_correction',
    };
  }

  private buildSmartRouterHint(text: string, rules: ITriggerRule[]) {
    return {
      taskSummary: text.slice(0, 240),
      topRouteCandidates: this.sortRulesByPriority(rules)
        .filter((rule) => rule.description)
        .slice(0, 3)
        .map((rule) => ({
          name: rule.name,
          model: rule.model,
          description: rule.description,
          confidence: undefined,
        })),
    };
  }
  /**
   * 按优先级排序规则
   * 优先级数值越大，优先级越高
   *
   * @param rules 规则列表
   * @returns 排序后的规则列表（降序）
   */
  sortRulesByPriority(rules: ITriggerRule[]): ITriggerRule[] {
    return [...rules]
      .filter((rule) => rule.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 使用规则匹配文本
   *
   * @param text 待匹配的文本
   * @param rule 规则
   * @returns 匹配结果
   */
  matchRule(text: string, rule: ITriggerRule): IMatchResult {
    if (!text || !rule || !rule.patterns || rule.patterns.length === 0) {
      return { matched: false };
    }

    return patternMatcher.matchAny(text, rule.patterns);
  }

  /**
   * 从文本中匹配规则
   * 按优先级顺序匹配，返回第一个匹配的规则
   *
   * @param text 待匹配的文本
   * @param rules 规则列表
   * @returns 匹配的规则，如果没有匹配则返回 null
   */
  matchRuleFromText(text: string, rules: ITriggerRule[]): { rule: ITriggerRule; result: IMatchResult } | null {
    if (!text || !rules || rules.length === 0) {
      return null;
    }

    // 按优先级排序
    const sortedRules = this.sortRulesByPriority(rules);

    for (const rule of sortedRules) {
      const result = this.matchRule(text, rule);
      if (result.matched) {
        return { rule, result };
      }
    }

    return null;
  }

  /**
   * 选择模型
   * 综合使用关键词匹配和 LLM 意图识别
   *
   * @param req 请求对象
   * @param config 触发配置
   * @returns 分析结果
   */
  async selectModel(
    req: IRequestContext,
    config: ITriggerConfig,
    port: number = DEFAULT_CONFIG.PORT,
    smartRouterConfig?: ISmartRouterConfig,
    governanceConfig?: IGovernanceConfig,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<IAnalysisResult> {
    const startTime = Date.now();
    const appConfig = (req as any).appConfig as IAppConfig | undefined;
    const effectiveGovernanceConfig = this.getEffectiveGovernanceConfig(smartRouterConfig, governanceConfig);
    const routingRules = this.getRoutingRules(config, smartRouterConfig);
    const analysisConfig = smartRouterConfig?.analysis_scope
      ? {
          ...config,
          analysis_scope: smartRouterConfig.analysis_scope,
        }
      : config;

    // 如果统一路由未启用，直接返回不匹配
    if (!this.isRoutingEnabled(config, smartRouterConfig)) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
      };
    }

    // 提取待分析的文本
    const text = contextAnalyzer.analyze(req, analysisConfig);

    if (!text) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
        analyzedText: '',
      };
    }

    // 第一步：关键词/正则匹配
    const matchResult = this.matchRuleFromText(text, routingRules);

    if (matchResult) {
      return {
        matched: true,
        rule: matchResult.rule,
        model: appConfig ? resolveModelReference(appConfig, matchResult.rule.model) ?? matchResult.rule.model : matchResult.rule.model,
        confidence: 1.0, // 关键词匹配置信度为 1
        analysisTime: Date.now() - startTime,
        analyzedText: text,
        routeSource: 'smart_rule',
      };
    }

    const stickyCorrection = this.getStickyCorrection(text, req, effectiveGovernanceConfig);

    // 第二步：Semantic Router 语义辅助匹配
    const semanticCandidates = this.buildSemanticCandidates(routingRules, effectiveGovernanceConfig);
    if (effectiveGovernanceConfig?.enabled && effectiveGovernanceConfig.semantic?.enabled && semanticCandidates.length > 0) {
      const semanticConfig = {
        ...effectiveGovernanceConfig.semantic,
        prototypes: Object.fromEntries(semanticCandidates.map((candidate) => [candidate.rule.name, candidate.prototype])),
      };
      const semanticResult = semanticConfig.mode === 'classifier'
        ? await semanticRouter.analyzeWithClassifier(
            text,
            semanticConfig,
            port,
            undefined,
            apiKey,
            timeoutMs
          )
        : semanticRouter.analyzeCandidates(
            text,
            semanticCandidates.map((candidate) => ({
              intent: candidate.rule.name,
              prototype: candidate.prototype,
              threshold: candidate.threshold,
            })),
            semanticConfig.threshold
          );
      if (semanticResult) {
        const matchedRule = routingRules.find(
          (rule) => rule.enabled !== false && rule.name.toLowerCase() === semanticResult.intent.toLowerCase()
        );

        if (matchedRule) {
          log(`[SemanticRouter] Matched intent "${semanticResult.intent}" -> "${matchedRule.model}"`);
          if (req.governanceTrace) {
            req.governanceTrace.semanticIntent = semanticResult.intent;
          }
          const semanticSelection: IAnalysisResult = {
            matched: true,
            rule: matchedRule,
            model: this.resolveRouteModel(appConfig, matchedRule.model),
            confidence: semanticResult.confidence,
            analysisTime: Date.now() - startTime,
            analyzedText: text,
            routeSource: 'semantic_match',
          };
          return this.applyStickyCorrection(semanticSelection, stickyCorrection, appConfig) ?? semanticSelection;
        }
      }
    }

    // 第三步：SmartRouter 作为结构化 fallback
    if (smartRouterConfig?.enabled && smartRouterConfig.router_model && smartRouterConfig.candidates?.length >= 2) {
      try {
        const resolvedSmartRouterConfig = appConfig ? {
          ...smartRouterConfig,
          router_model: this.resolveRouteModel(appConfig, smartRouterConfig.router_model) ?? smartRouterConfig.router_model,
          candidates: smartRouterConfig.candidates.map((candidate) => ({
            ...candidate,
            model: this.resolveRouteModel(appConfig, candidate.model) ?? candidate.model,
          })),
        } : smartRouterConfig;
        const smartResult = await smartRouterSelector.selectModel(
          text,
          resolvedSmartRouterConfig,
          port,
          undefined,
          apiKey,
          timeoutMs,
          this.buildSmartRouterHint(text, routingRules)
        );
        if (smartResult) {
          log(`[SmartRouter] Selected model "${smartResult.model}" (confidence: ${smartResult.confidence})`);
          const smartSelection: IAnalysisResult = {
            matched: true,
            model: smartResult.model,
            confidence: smartResult.confidence,
            analysisTime: Date.now() - startTime,
            analyzedText: text,
            routeSource: 'smart_router',
          };
          return this.applyStickyCorrection(smartSelection, stickyCorrection, appConfig) ?? smartSelection;
        }
      } catch (error) {
        logError('[ModelSelector] SmartRouter error:', error);
      }
    }

    // 第四步：保留 legacy intent fallback 作为兼容兜底
    if (!smartRouterConfig?.enabled && config.llm_intent_recognition && config.intent_model) {
      try {
        const intentResult = await intentDetector.detectIntent(text, config, port, undefined, apiKey, timeoutMs);

        if (intentResult.confidence > 0.5 && intentResult.intent !== 'general') {
          const matchedRule = intentDetector.findRuleByIntent(intentResult.intent, routingRules);

          if (matchedRule) {
            const intentSelection: IAnalysisResult = {
              matched: true,
              rule: matchedRule,
              model: this.resolveRouteModel(appConfig, matchedRule.model),
              confidence: intentResult.confidence,
              analysisTime: Date.now() - startTime,
              analyzedText: text,
              routeSource: 'intent_fallback',
            };
            return this.applyStickyCorrection(intentSelection, stickyCorrection, appConfig) ?? intentSelection;
          }
        }
      } catch (error) {
        logError('[ModelSelector] Intent detection error:', error);
      }
    }

    // 第五步：若前层均未稳定命中，再尝试 sticky correction 作为最后稳定性修正
    const stickyOnlySelection = this.applyStickyCorrection(null, stickyCorrection, appConfig);
    if (stickyOnlySelection) {
      return {
        ...stickyOnlySelection,
        analysisTime: Date.now() - startTime,
        analyzedText: text,
      };
    }

    return {
      matched: false,
      confidence: 0,
      analysisTime: Date.now() - startTime,
      analyzedText: text,
    };
  }

  /**
   * 同步版本的模型选择
   * 仅使用关键词匹配，不进行 LLM 意图识别
   *
   * @param req 请求对象
   * @param config 触发配置
   * @returns 分析结果
   */
  selectModelSync(
    req: IRequestContext,
    config: ITriggerConfig,
    smartRouterConfig?: ISmartRouterConfig
  ): IAnalysisResult {
    const startTime = Date.now();
    const appConfig = (req as any).appConfig as IAppConfig | undefined;
    const effectiveGovernanceConfig = this.getEffectiveGovernanceConfig(smartRouterConfig, undefined);
    const analysisConfig = smartRouterConfig?.analysis_scope
      ? {
          ...config,
          analysis_scope: smartRouterConfig.analysis_scope,
        }
      : config;

    // 如果统一路由未启用，直接返回不匹配
    if (!this.isRoutingEnabled(config, smartRouterConfig)) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
      };
    }

    // 提取待分析的文本
    const text = contextAnalyzer.analyze(req, analysisConfig);

    if (!text) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: Date.now() - startTime,
        analyzedText: '',
      };
    }

    const routingRules = this.getRoutingRules(config, smartRouterConfig);
    const stickyCorrection = this.getStickyCorrection(text, req, effectiveGovernanceConfig);

    // 第一步：关键词/正则匹配
    const matchResult = this.matchRuleFromText(text, routingRules);

    if (matchResult) {
      return {
        matched: true,
        rule: matchResult.rule,
        model: appConfig ? resolveModelReference(appConfig, matchResult.rule.model) ?? matchResult.rule.model : matchResult.rule.model,
        confidence: 1.0,
        analysisTime: Date.now() - startTime,
        analyzedText: text,
        routeSource: 'smart_rule',
      };
    }

    // 第二步：同步路径下也尽量执行语义增强（仅 embedding/prototype 分析，不触发 classifier/LLM）
    const semanticCandidates = this.buildSemanticCandidates(routingRules, effectiveGovernanceConfig);
    if (effectiveGovernanceConfig?.enabled && effectiveGovernanceConfig.semantic?.enabled && semanticCandidates.length > 0) {
      const semanticResult = semanticRouter.analyzeCandidates(
        text,
        semanticCandidates.map((candidate) => ({
          intent: candidate.rule.name,
          prototype: candidate.prototype,
          threshold: candidate.threshold,
        })),
        effectiveGovernanceConfig.semantic.threshold
      );

      if (semanticResult) {
        const matchedRule = routingRules.find(
          (rule) => rule.enabled !== false && rule.name.toLowerCase() === semanticResult.intent.toLowerCase()
        );

        if (matchedRule) {
          const semanticSelection: IAnalysisResult = {
            matched: true,
            rule: matchedRule,
            model: this.resolveRouteModel(appConfig, matchedRule.model),
            confidence: semanticResult.confidence,
            analysisTime: Date.now() - startTime,
            analyzedText: text,
            routeSource: 'semantic_match',
          };
          return this.applyStickyCorrection(semanticSelection, stickyCorrection, appConfig) ?? semanticSelection;
        }
      }
    }

    // 第三步：同步路径下若前层都未命中，再尝试 sticky 作为稳定修正
    const stickyOnlySelection = this.applyStickyCorrection(null, stickyCorrection, appConfig);
    if (stickyOnlySelection) {
      return {
        ...stickyOnlySelection,
        analysisTime: Date.now() - startTime,
        analyzedText: text,
      };
    }

    // 没有匹配任何规则
    return {
      matched: false,
      confidence: 0,
      analysisTime: Date.now() - startTime,
      analyzedText: text,
    };
  }
}

// 导出单例实例
export const modelSelector = new ModelSelector();
