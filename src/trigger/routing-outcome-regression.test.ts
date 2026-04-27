import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeRoutingOutcomes } from '../governance/metrics';
import { applyResponseGovernance } from '../governance/response-governance';
import { sessionStateStore } from '../governance/session-store';
import { createGovernanceTrace, governanceTraceStore } from '../governance/trace';
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

describe('routing outcome synthetic regression', () => {
  let router: TriggerRouter;

  beforeEach(() => {
    router = new TriggerRouter();
    sessionStateStore.clear();
    governanceTraceStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStateStore.clear();
    governanceTraceStore.clear();
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
    const cascadeReq = createRequest('长上下文任务生成后请验证失败并自动升级', 'synthetic-cascade');

    const ruleResult = await router.route(ruleReq);
    const semanticResult = await router.route(semanticReq);
    const smartResult = await router.route(smartReq);
    const stickyResult = await router.route(stickyReq);
    const cascadeRouteResult = await router.route(cascadeReq);

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
    expect(cascadeRouteResult).toMatchObject({
      matched: true,
      model: SONNET,
      routeSource: 'smart_router',
    });
    expect(smartSpy).toHaveBeenCalled();

    cascadeReq.body.model = cascadeRouteResult.model!;
    cascadeReq.triggerResult = cascadeRouteResult;
    const cascadeRetryInputs: Array<{
      model?: string;
      nextModel: string;
      port: number;
      apiKey?: string;
      timeoutMs?: number;
    }> = [];
    const cascadeRetry = vi.fn(async (body: any, nextModel: string, port: number, apiKey?: string, timeoutMs?: number) => {
      cascadeRetryInputs.push({ model: body?.model, nextModel, port, apiKey, timeoutMs });
      return {
        content: [{ text: 'rescued output from stronger model' }],
      };
    });
    await applyResponseGovernance({
      req: cascadeReq,
      payload: {
        content: [
          {
            text: 'Build failed with a TypeScript error. Test failed with AssertionError. TODO left in implementation.',
          },
        ],
      },
      config,
      servicePort: 5678,
      deps: {
        executeCascadeRetry: cascadeRetry,
      },
    });

    const cascadeTrace = cascadeReq.governanceTrace!;
    cascadeTrace.latencyMs = 240;
    expect(cascadeReq.body.model).toBe(OPUS);
    expect(cascadeRetryInputs).toEqual([
      {
        model: SONNET,
        nextModel: OPUS,
        port: 5678,
        apiKey: undefined,
        timeoutMs: undefined,
      },
    ]);
    expect(cascadeTrace).toMatchObject({
      finalModel: OPUS,
      cascadeTriggered: true,
      cascadeNextModel: OPUS,
      cascadeEvidence: ['compile_failure', 'test_failure', 'placeholder_pattern'],
    });
    expect(cascadeTrace.routeReason).toEqual(
      expect.arrayContaining(['smart_router', 'cascade_gate', 'cascade_retry_executed'])
    );

    const traces = [
      finishRouteTrace(ruleReq, ruleResult, 80),
      finishRouteTrace(semanticReq, semanticResult, 160),
      finishRouteTrace(smartReq, smartResult, 120),
      finishRouteTrace(stickyReq, stickyResult, 90),
      cascadeTrace,
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
      cascade_retry_executed: 240,
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
          key: 'cascade_retry_executed',
          totalTraces: 1,
          modelSwitchRate: 1,
          cascadeAfterSwitchRate: 1,
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
