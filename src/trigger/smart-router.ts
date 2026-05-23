/**
 * SmartRouter Selector
 *
 * 智能路由选择器，使用 LLM 从候选模型列表中选择最优模型
 */

import { LRUCache } from 'lru-cache';
import { ISmartRouterConfig, TSmartRouterCollaborationMode } from './types';
import { DEFAULT_CONFIG } from '../constants';
import { logError, logWarn } from '../utils/log';
import { createSingleUserTextIR } from '../protocols/message-ir';
import { toAnthropicMessagesRequest } from '../protocols/anthropic';
import {
  buildRoutingAdvisorSummary,
  formatRoutingAdvisorPromptSection,
  IRoutingAdvisorSummary,
  orderCandidatesByRoutingAdvisor,
} from '../governance/routing-advisor';

/**
 * SmartRouter 选择结果
 */
export interface ISmartRouterResult {
  /** 选中的模型，格式：provider_name,model_name */
  model: string;

  /** 置信度 0-1 */
  confidence: number;

  /** LLM 的选择理由 */
  reasoning?: string;

  /** 自适应路由模式 */
  routingMode?: string;

  /** 多模型协作模式 */
  collaborationMode?: TSmartRouterCollaborationMode;

  /** 用于本次选择的历史收益/能力画像证据 */
  routingEvidence?: string[];
}

export interface ISmartRouterHintContext {
  taskSummary?: string;
  topRouteCandidates?: Array<{
    name: string;
    model: string;
    description?: string;
    confidence?: number;
  }>;
  routingAdvisor?: IRoutingAdvisorSummary;
  routingBudget?: ISmartRouterBudgetHint;
  collaboration?: ISmartRouterCollaborationHint;
}

export interface ISmartRouterBudgetHint {
  latencyBudgetMs?: number;
  confidenceThreshold?: number;
  source?: 'config' | 'metadata';
}

export interface ISmartRouterCollaborationHint {
  mode: TSmartRouterCollaborationMode;
  allowedModes: TSmartRouterCollaborationMode[];
  confidenceThreshold?: number;
  source: 'config' | 'metadata' | 'default';
}

const COLLABORATION_MODES: TSmartRouterCollaborationMode[] = [
  'route_only',
  'verify_only',
  'compare_then_arbiter',
  'cascade_on_evidence',
];

/**
 * SmartRouter Prompt 模板
 */
/**
 * 智能路由选择器类
 */
export class SmartRouterSelector {
  private cache: LRUCache<string, ISmartRouterResult>;

  constructor() {
    this.cache = new LRUCache<string, ISmartRouterResult>({
      max: 500,
      ttl: 600000, // 默认 10 分钟，具体条目可被 config.cache_ttl 覆盖
    });
  }

  /**
   * 生成缓存 key（基于请求文本 + router_model + 候选模型列表）
   * 注意：包含 router_model 以防止切换路由模型后命中旧缓存
   */
  private generateCacheKey(
    text: string,
    routerModel: string,
    candidates: ISmartRouterConfig['candidates'],
    advisorSignature?: string,
    budgetSignature?: string
  ): string {
    const content = `${text}:${routerModel}:${candidates.map(c => c.model).join(',')}:${advisorSignature ?? 'static'}:${budgetSignature ?? 'no-budget'}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * 构建候选模型列表字符串
   */
  private buildCandidatesList(candidates: ISmartRouterConfig['candidates'], advisor?: IRoutingAdvisorSummary): string {
    const profiles = new Map(advisor?.candidateProfiles.map((profile) => [profile.model, profile]));
    return orderCandidatesByRoutingAdvisor(candidates, advisor)
      .map((c, i) => {
        const profile = profiles.get(c.model);
        const evidence = profile?.profileSource === 'history' && profile.evidence.length
          ? ` | recent profile: ${profile.evidence.join('; ')}`
          : '';
        return `${i + 1}. ${c.model} - ${c.description}${evidence}`;
      })
      .join('\n');
  }

  /**
   * 构建完整 prompt
   */
  private buildPrompt(
    text: string,
    candidates: ISmartRouterConfig['candidates'],
    hint?: ISmartRouterHintContext
  ): string {
    const sections = [
      'You are a model routing assistant. Your job is to select the most appropriate AI model from the given candidates to handle the user\'s request.',
    ];

    if (hint?.taskSummary) {
      sections.push(`Task summary:\n"""\n${hint.taskSummary}\n"""`);
    }

    if (hint?.topRouteCandidates?.length) {
      sections.push(
        'Pre-filtered route candidates:\n' +
        hint.topRouteCandidates
          .map((candidate, index) =>
            `${index + 1}. ${candidate.name} -> ${candidate.model}` +
            `${candidate.description ? ` (${candidate.description})` : ''}` +
            `${candidate.confidence !== undefined ? ` [confidence=${candidate.confidence}]` : ''}`
          )
          .join('\n')
      );
    }

    if (hint?.routingAdvisor) {
      sections.push(
        'Adaptive routing evidence from recent governance traces:\n' +
        formatRoutingAdvisorPromptSection(hint.routingAdvisor)
      );
    }

    if (hint?.routingBudget?.latencyBudgetMs || hint?.routingBudget?.confidenceThreshold) {
      sections.push(
        'Routing budget:\n' +
        [
          hint.routingBudget.latencyBudgetMs
            ? `- latency budget: ${hint.routingBudget.latencyBudgetMs}ms`
            : undefined,
          hint.routingBudget.confidenceThreshold
            ? `- confidence threshold: ${hint.routingBudget.confidenceThreshold}`
            : undefined,
          hint.routingBudget.source ? `- source: ${hint.routingBudget.source}` : undefined,
          '- If recent evidence shows a candidate repeatedly exceeds the latency budget, prefer a faster candidate unless the task clearly needs a deep model.',
          '- If your confidence would fall below the threshold, choose the safer or higher-quality model and explain why.',
        ].filter(Boolean).join('\n')
      );
    }

    if (hint?.collaboration) {
      sections.push(
        'Collaboration mode policy:\n' +
        [
          `- default mode: ${hint.collaboration.mode}`,
          `- allowed modes: ${hint.collaboration.allowedModes.join(', ')}`,
          hint.collaboration.confidenceThreshold
            ? `- collaboration confidence threshold: ${hint.collaboration.confidenceThreshold}`
            : undefined,
          `- source: ${hint.collaboration.source}`,
          '- route_only means use one model only.',
          '- verify_only means route to one model and ask downstream governance/verifier to pay extra attention.',
          '- compare_then_arbiter and cascade_on_evidence are planning modes in this release; do not assume parallel execution unless explicitly enabled by future runtime support.',
        ].filter(Boolean).join('\n')
      );
    }

    sections.push(
      `User request:\n"""\n${text}\n"""`,
      `Available models:\n${this.buildCandidatesList(candidates, hint?.routingAdvisor)}`,
      `Select the most appropriate model and respond in the following JSON format ONLY:
{
  "model": "<exact model identifier from the list>",
  "confidence": <0.0-1.0>,
  "routingMode": "balanced|quality|speed",
  "collaborationMode": "route_only|verify_only|compare_then_arbiter|cascade_on_evidence",
  "reasoning": "<brief explanation>"
}

Important:
- The "model" field MUST be one of the exact identifiers listed above
- If adaptive evidence is present, use it to balance user intent, recent quality, recent latency, and reliability
- Respond ONLY with the JSON, no additional text`
    );

    return sections.join('\n\n');
  }

  /**
   * 使用 LLM 选择最优模型
   *
   * @param text 请求文本
   * @param config SmartRouter 配置
   * @param port 本地服务端口（默认 5678）
   * @param fetchFn 可注入的 fetch 函数（用于测试）
   * @returns 选择结果，失败时返回 null
   */
  async selectModel(
    text: string,
    config: ISmartRouterConfig,
    port: number = DEFAULT_CONFIG.PORT,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number,
    hint?: ISmartRouterHintContext
  ): Promise<ISmartRouterResult | null> {
    // 未启用或候选不足
    if (!config.enabled) {
      return null;
    }

    if (!config.router_model) {
      return null;
    }

    if (!config.candidates || config.candidates.length < 2) {
      return null;
    }

    // 检查缓存
    const routingAdvisor = config.adaptive?.enabled === false
      ? undefined
      : hint?.routingAdvisor ?? buildRoutingAdvisorSummary({
          candidates: config.candidates,
          historyLimit: config.adaptive?.history_limit,
        });
    const routingBudget = hint?.routingBudget ?? {
      latencyBudgetMs: config.routing_budget?.latency_budget_ms,
      confidenceThreshold: config.routing_budget?.confidence_threshold,
      source: config.routing_budget ? 'config' as const : undefined,
    };
    const collaboration = this.buildCollaborationHint(config, hint);

    const effectiveHint = routingAdvisor
      ? {
          ...(hint ?? {}),
          routingAdvisor,
          routingBudget,
          collaboration,
        }
      : {
          ...(hint ?? {}),
          routingBudget,
          collaboration,
        };

    const cacheKey = this.generateCacheKey(
      text,
      config.router_model,
      config.candidates,
      routingAdvisor?.signature,
      this.buildBudgetSignature(routingBudget, collaboration)
    );
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const prompt = this.buildPrompt(text, config.candidates, effectiveHint);

      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ctr-smart-router': '1',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify(
          toAnthropicMessagesRequest({
            model: config.router_model,
            max_tokens: config.max_tokens ?? 256,
            ir: createSingleUserTextIR(prompt),
          })
        ),
        ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        logError('[SmartRouter] LLM request failed:', (response as any).status);
        return null;
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';

      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logWarn('[SmartRouter] No JSON found in LLM response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as ISmartRouterResult;

      // 验证返回的模型在候选列表中
      const validModels = config.candidates.map(c => c.model);
      if (!validModels.includes(parsed.model)) {
        logWarn(`[SmartRouter] LLM returned unknown model: "${parsed.model}"`);
        return null;
      }

      // 缓存结果（使用配置的 TTL 进行按条目覆盖）
      const result = this.applyRoutingBudgetGuard({
        ...parsed,
        routingMode: parsed.routingMode ?? routingAdvisor?.routeMode,
        collaborationMode: this.normalizeCollaborationMode(parsed.collaborationMode, collaboration),
        routingEvidence: routingAdvisor?.evidence.slice(0, 6),
      }, routingAdvisor, routingBudget, collaboration, validModels);

      this.cache.set(cacheKey, result, { ttl: config.cache_ttl ?? 600000 });

      return result;
    } catch (error) {
      logError('[SmartRouter] Error selecting model:', error);
      return null;
    }
  }

  /**
   * 清除缓存（用于测试）
   */
  clearCache(): void {
    this.cache.clear();
  }

  private buildBudgetSignature(
    budget: ISmartRouterBudgetHint | undefined,
    collaboration: ISmartRouterCollaborationHint | undefined
  ): string | undefined {
    if (!budget?.latencyBudgetMs && !budget?.confidenceThreshold && !collaboration) {
      return undefined;
    }

    return [
      budget.latencyBudgetMs ?? '-',
      budget.confidenceThreshold ?? '-',
      budget.source ?? 'config',
      collaboration?.mode ?? 'route_only',
      collaboration?.allowedModes.join('+') ?? 'route_only',
    ].join(':');
  }

  private buildCollaborationHint(
    config: ISmartRouterConfig,
    hint?: ISmartRouterHintContext
  ): ISmartRouterCollaborationHint {
    const configured = config.collaboration;
    const existing = hint?.collaboration;
    if (existing) {
      return existing;
    }

    const allowedModes = (configured?.allowed_modes?.length
      ? configured.allowed_modes
      : configured?.mode
        ? [configured.mode]
        : ['route_only']
    ).filter((mode): mode is TSmartRouterCollaborationMode => COLLABORATION_MODES.includes(mode as TSmartRouterCollaborationMode));
    const normalizedAllowedModes = allowedModes.length ? Array.from(new Set(allowedModes)) : ['route_only'];
    const mode = configured?.mode && normalizedAllowedModes.includes(configured.mode)
      ? configured.mode
      : normalizedAllowedModes[0] ?? 'route_only';

    return {
      mode,
      allowedModes: normalizedAllowedModes,
      confidenceThreshold: configured?.confidence_threshold,
      source: configured ? 'config' : 'default',
    };
  }

  private normalizeCollaborationMode(
    mode: unknown,
    collaboration: ISmartRouterCollaborationHint | undefined
  ): TSmartRouterCollaborationMode {
    const requested = typeof mode === 'string' && COLLABORATION_MODES.includes(mode as TSmartRouterCollaborationMode)
      ? mode as TSmartRouterCollaborationMode
      : undefined;
    if (requested && collaboration?.allowedModes.includes(requested)) {
      return requested;
    }
    return collaboration?.mode ?? 'route_only';
  }

  private applyRoutingBudgetGuard(
    result: ISmartRouterResult,
    advisor: IRoutingAdvisorSummary | undefined,
    budget: ISmartRouterBudgetHint | undefined,
    collaboration: ISmartRouterCollaborationHint | undefined,
    validModels: string[]
  ): ISmartRouterResult {
    const evidence = [...(result.routingEvidence ?? [])];
    let next = { ...result };

    if (advisor && (budget?.latencyBudgetMs || budget?.confidenceThreshold)) {
      const profiles = new Map(advisor.candidateProfiles.map((profile) => [profile.model, profile]));
      const selectedProfile = profiles.get(next.model);
      const fastestProfile = advisor.fastestModel ? profiles.get(advisor.fastestModel) : undefined;

      if (
        budget.latencyBudgetMs &&
        selectedProfile?.averageLatencyMs &&
        selectedProfile.averageLatencyMs > budget.latencyBudgetMs &&
        fastestProfile?.averageLatencyMs &&
        fastestProfile.averageLatencyMs <= budget.latencyBudgetMs &&
        validModels.includes(fastestProfile.model)
      ) {
        evidence.push(
          `latency budget guard: ${selectedProfile.model} avg ${selectedProfile.averageLatencyMs}ms > ${budget.latencyBudgetMs}ms; using ${fastestProfile.model} avg ${fastestProfile.averageLatencyMs}ms`
        );
        next = {
          ...next,
          model: fastestProfile.model,
          routingMode: 'speed',
          reasoning: [
            next.reasoning,
            `Latency budget favored ${fastestProfile.model}.`,
          ].filter(Boolean).join(' '),
        };
      }

      const confidenceThreshold = budget.confidenceThreshold;
      const qualityProfile = advisor.qualityModel ? profiles.get(advisor.qualityModel) : undefined;
      if (
        confidenceThreshold &&
        next.confidence < confidenceThreshold &&
        qualityProfile &&
        qualityProfile.model !== next.model &&
        validModels.includes(qualityProfile.model)
      ) {
        evidence.push(
          `confidence guard: ${next.confidence} < ${confidenceThreshold}; using quality-backed ${qualityProfile.model}`
        );
        next = {
          ...next,
          model: qualityProfile.model,
          routingMode: 'quality',
          reasoning: [
            next.reasoning,
            `Confidence threshold favored quality-backed ${qualityProfile.model}.`,
          ].filter(Boolean).join(' '),
        };
      }
    }

    return {
      ...next,
      collaborationMode: this.applyCollaborationMode(next, collaboration, evidence),
      routingEvidence: evidence,
    };
  }

  private applyCollaborationMode(
    result: ISmartRouterResult,
    collaboration: ISmartRouterCollaborationHint | undefined,
    evidence: string[]
  ): TSmartRouterCollaborationMode {
    const mode = this.normalizeCollaborationMode(result.collaborationMode, collaboration);
    const threshold = collaboration?.confidenceThreshold;
    if (
      threshold &&
      result.confidence < threshold &&
      mode === 'route_only' &&
      collaboration.allowedModes.includes('verify_only')
    ) {
      evidence.push(`collaboration guard: confidence ${result.confidence} < ${threshold}; using verify_only`);
      return 'verify_only';
    }
    return mode;
  }
}

// 导出单例实例
export const smartRouterSelector = new SmartRouterSelector();
