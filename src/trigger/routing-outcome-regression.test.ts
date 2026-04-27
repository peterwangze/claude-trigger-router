import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideCascadeEscalation, detectFailureEvidence } from '../governance/cascade-gate';
import { summarizeRoutingOutcomes } from '../governance/metrics';
import { sessionStateStore } from '../governance/session-store';
import { createGovernanceTrace } from '../governance/trace';
import { IGovernanceTrace } from '../governance/types';
import { TriggerRouter } from './index';
import { smartRouterSelector } from './smart-router';
import { IAnalysisResult, IAppConfig, IRequestContext } from './types';

const HAIKU = 'model__haiku,claude-3-5-haiku';
const SONNET = 'model__sonnet,claude-sonnet-4-5';
const OPUS = 'model__opus,claude-opus-4';

function createSyntheticConfig(): IAppConfig {
  return {
    PORT: 5678,
    Providers: [],
    Models: [
      {
        id: 'haiku',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-test',
        interface: 'anthropic',
        model: 'claude-3-5-haiku',
      },
      {
        id: 'sonnet',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-test',
        interface: 'anthropic',
        model: 'claude-sonnet-4-5',
      },
      {
        id: 'opus',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-test',
        interface: 'anthropic',
        model: 'claude-opus-4',
      },
      {
        id: 'router',
        api: 'https://api.example.com/v1/messages',
        key: 'sk-test',
        interface: 'anthropic',
        model: 'claude-router',
      },
    ],
    Router: { default: 'sonnet' },
    TriggerRouter: {
      enabled: false,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [],
    },
    SmartRouter: {
      enabled: true,
      router_model: 'router',
      candidates: [
        { model: 'haiku', description: 'fast lightweight tasks' },
        { model: 'sonnet', description: 'balanced coding tasks' },
        { model: 'opus', description: 'deep architecture reasoning' },
      ],
      rules: [
        {
          name: 'quick_reply',
          priority: 100,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['快速回答'] }],
          model: 'haiku',
          description: '短问题 快速 状态检查',
        },
        {
          name: 'architecture',
          priority: 90,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['不会命中架构'] }],
          model: 'opus',
          description: '重构 系统 结构 模块 拆分 架构 设计',
        },
      ],
      semantic: {
        enabled: true,
        threshold: 0.2,
        prototypes: {
          architecture: '重构 系统 结构 模块 拆分 架构 设计',
        },
      },
      sticky: { enabled: true },
    },
    Governance: {
      enabled: true,
      sticky: { enabled: true },
      semantic: {
        enabled: true,
        threshold: 0.2,
        prototypes: {
          architecture: '重构 系统 结构 模块 拆分 架构 设计',
        },
      },
      cascade: {
        enabled: true,
        max_attempts: 2,
        triggers: {
          compile_failure: true,
          test_failure: true,
          placeholder_patterns: ['TODO'],
        },
        levels: [
          {
            from: SONNET,
            to: OPUS,
            reasoning: 'high',
          },
        ],
      },
    },
  };
}

function createRequest(content: string, requestId: string, sessionId?: string): IRequestContext {
  return {
    id: requestId,
    sessionId,
    governanceTrace: createGovernanceTrace({
      requestId,
      sessionKey: sessionId,
      initialModel: SONNET,
      finalModel: SONNET,
    }),
    body: {
      model: SONNET,
      messages: [{ role: 'user', content }],
    },
  } as IRequestContext;
}

function finishRouteTrace(req: IRequestContext, result: IAnalysisResult, latencyMs: number): IGovernanceTrace {
  const trace = req.governanceTrace!;
  trace.finalModel = result.model ?? trace.finalModel;
  trace.latencyMs = latencyMs;
  return trace;
}

function createCascadeTrace(config: IAppConfig): IGovernanceTrace {
  const evidences = detectFailureEvidence(
    {
      content: [
        {
          text: 'Build failed with a TypeScript error. Test failed with AssertionError. TODO left in implementation.',
        },
      ],
    },
    config.Governance?.cascade
  );
  const decision = decideCascadeEscalation(SONNET, evidences, config.Governance?.cascade, 0);

  expect(evidences.map((item) => item.type)).toEqual([
    'compile_failure',
    'test_failure',
    'placeholder_pattern',
  ]);
  expect(decision).toMatchObject({
    shouldEscalate: true,
    nextModel: OPUS,
  });

  return createGovernanceTrace({
    requestId: 'synthetic-cascade',
    initialModel: SONNET,
    finalModel: decision.nextModel,
    routeReason: ['smart_router', 'cascade_gate'],
    cascadeTriggered: true,
    cascadeEvidence: evidences.map((item) => item.type),
    cascadeNextModel: decision.nextModel,
    latencyMs: 240,
  });
}

describe('routing outcome synthetic regression', () => {
  let router: TriggerRouter;

  beforeEach(() => {
    router = new TriggerRouter();
    sessionStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStateStore.clear();
  });

  it('covers rule, semantic, SmartRouter, sticky and cascade outcomes with fixed tasks', async () => {
    const config = createSyntheticConfig();
    const smartSpy = vi.spyOn(smartRouterSelector, 'selectModel').mockImplementation(async (text: string) => {
      if (text.includes('长上下文任务')) {
        return { model: SONNET, confidence: 0.88 };
      }
      return null;
    });
    router.init(config);

    sessionStateStore.put('sticky-session', {
      preferredModel: 'haiku',
      lastSuccessfulModel: 'haiku',
      lastTaskFingerprint: '继续修复登录逻辑',
    });

    const ruleReq = createRequest('请快速回答这个状态检查', 'synthetic-rule');
    const semanticReq = createRequest('请帮我重构系统结构并拆分核心模块', 'synthetic-semantic');
    const smartReq = createRequest('帮我选择适合这个长上下文任务的模型', 'synthetic-smart');
    const stickyReq = createRequest('继续修复登录逻辑', 'synthetic-sticky', 'sticky-session');

    const ruleResult = await router.route(ruleReq);
    const semanticResult = await router.route(semanticReq);
    const smartResult = await router.route(smartReq);
    const stickyResult = await router.route(stickyReq);

    expect(ruleResult).toMatchObject({
      matched: true,
      model: HAIKU,
      routeSource: 'smart_rule',
      rule: expect.objectContaining({ name: 'quick_reply' }),
    });
    expect(semanticResult).toMatchObject({
      matched: true,
      model: OPUS,
      routeSource: 'semantic_match',
      rule: expect.objectContaining({ name: 'architecture' }),
    });
    expect(smartResult).toMatchObject({
      matched: true,
      model: SONNET,
      routeSource: 'smart_router',
    });
    expect(stickyResult).toMatchObject({
      matched: true,
      model: HAIKU,
      routeSource: 'sticky_correction',
    });
    expect(smartSpy).toHaveBeenCalled();

    const traces = [
      finishRouteTrace(ruleReq, ruleResult, 80),
      finishRouteTrace(semanticReq, semanticResult, 160),
      finishRouteTrace(smartReq, smartResult, 120),
      finishRouteTrace(stickyReq, stickyResult, 90),
      createCascadeTrace(config),
    ];
    const outcome = summarizeRoutingOutcomes(traces);

    expect(outcome).toMatchObject({
      totalTraces: 5,
      routedTraces: 5,
      routedRate: 1,
      modelSwitchCount: 4,
      modelSwitchRate: 0.8,
      stableModelCount: 1,
      stableModelRate: 0.2,
      cascadeAfterSwitchCount: 1,
      cascadeAfterSwitchRate: 0.25,
    });
    expect(outcome.averageLatencyByRouteReason).toMatchObject({
      'smart_rule:quick_reply': 80,
      'semantic_match:architecture': 160,
      smart_router: 180,
      sticky_correction: 90,
      cascade_gate: 240,
    });
    expect(outcome.byRouteReason).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'smart_rule:quick_reply',
          totalTraces: 1,
          modelSwitchRate: 1,
        }),
        expect.objectContaining({
          key: 'semantic_match:architecture',
          totalTraces: 1,
          modelSwitchRate: 1,
        }),
        expect.objectContaining({
          key: 'smart_router',
          totalTraces: 2,
          modelSwitchRate: 0.5,
          cascadeAfterSwitchRate: 1,
          averageLatencyMs: 180,
        }),
        expect.objectContaining({
          key: 'sticky_correction',
          totalTraces: 1,
          modelSwitchRate: 1,
        }),
      ])
    );
    expect(outcome.byFinalModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: HAIKU, totalTraces: 2 }),
        expect.objectContaining({ key: OPUS, totalTraces: 2 }),
        expect.objectContaining({ key: SONNET, totalTraces: 1 }),
      ])
    );
    expect(outcome.bySemanticIntent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'architecture',
          totalTraces: 1,
          modelSwitchRate: 1,
        }),
      ])
    );
  });
});
