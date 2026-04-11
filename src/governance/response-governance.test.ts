import { describe, expect, it, vi } from 'vitest';
import { createGovernanceTrace } from './trace';
import { applyResponseGovernance } from './response-governance';
import { ModelSelector } from '../trigger/selector';

describe('applyResponseGovernance', () => {
  it('executes cascade retry when response contains failure evidence', async () => {
    const req: any = {
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-cascade' }),
    };

    const payload = { content: [{ text: 'TODO: finish implementation' }] };
    const config: any = {
      Governance: {
        enabled: true,
        cascade: {
          enabled: true,
          max_attempts: 2,
          triggers: {
            placeholder_patterns: ['TODO'],
          },
          levels: [
            { from: 'provider,model-a', to: 'provider,model-b' },
          ],
        },
      },
    };

    const nextPayload = await applyResponseGovernance({
      req,
      payload,
      config,
      servicePort: 5678,
      deps: {
        executeCascadeRetry: vi.fn().mockResolvedValue({
          content: [{ text: 'rescued output' }],
        }),
      },
    });

    expect(nextPayload).toEqual({ content: [{ text: 'rescued output' }] });
    expect(req.body.model).toBe('provider,model-b');
    expect(req.governanceTrace.cascadeTriggered).toBe(true);
    expect(req.governanceTrace.routeReason).toContain('cascade_gate');
    expect(req.governanceTrace.routeReason).toContain('cascade_retry_executed');
  });

  it('supports semantic + shadow sync_guard combination', async () => {
    const selector = new ModelSelector();
    const req: any = {
      body: {
        model: 'provider,model-a',
        messages: [{ role: 'user', content: '请帮我重构系统结构并拆分核心模块' }],
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-combo' }),
    };

    const triggerConfig: any = {
      enabled: true,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [
        {
          name: 'architecture',
          priority: 90,
          enabled: true,
          patterns: [{ type: 'exact', keywords: ['架构设计'] }],
          model: 'provider,model-a',
        },
      ],
    };

    const selectResult = await selector.selectModel(
      req,
      triggerConfig,
      5678,
      undefined,
      {
        enabled: true,
        semantic: {
          enabled: true,
          threshold: 0.2,
          prototypes: {
            architecture: '重构 系统 结构 模块 拆分 架构 设计',
          },
        },
      } as any
    );

    req.body.model = selectResult.model;
    req.triggerResult = selectResult;

    const config: any = {
      Governance: {
        enabled: true,
        cascade: {
          enabled: true,
          max_attempts: 2,
          triggers: {
            compile_failure: true,
          },
          levels: [
            { from: 'provider,model-a', to: 'provider,model-b' },
          ],
        },
        shadow: {
          enabled: true,
          mode: 'sync_guard',
          checks: {
            placeholder_patterns: true,
          },
        },
      },
    };

    const nextPayload = await applyResponseGovernance({
      req,
      payload: { content: [{ text: 'TODO: finish implementation' }] },
      config,
      servicePort: 5678,
      deps: {
        executeCascadeRetry: vi.fn().mockResolvedValue({
          content: [{ text: 'guard rescued output' }],
        }),
      },
    });

    expect(selectResult.routeSource).toBe('intent');
    expect(req.governanceTrace.semanticIntent).toBe('architecture');
    expect(nextPayload).toEqual({ content: [{ text: 'guard rescued output' }] });
    expect(req.body.model).toBe('provider,model-b');
    expect(req.governanceTrace.routeReason).toContain('shadow_supervisor');
    expect(req.governanceTrace.routeReason).toContain('shadow_sync_guard');
    expect(req.governanceTrace.verificationResult).toContain('guard_retry:provider,model-b');
  });

  it('resolves governance model references from Models ids during response governance', async () => {
    const req: any = {
      body: {
        model: 'model__sonnet,anthropic/claude-sonnet-4',
        metadata: {},
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-governance-model-id' }),
    };

    const payload = { content: [{ text: 'TODO: finish implementation' }] };
    const config: any = {
      Models: [
        {
          id: 'sonnet',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          protocol: 'openai',
          model: 'anthropic/claude-sonnet-4',
        },
        {
          id: 'opus',
          api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
          api_key: 'sk-test',
          protocol: 'openai',
          model: 'anthropic/claude-opus-4',
        },
      ],
      Governance: {
        enabled: true,
        cascade: {
          enabled: true,
          max_attempts: 2,
          triggers: {
            placeholder_patterns: ['TODO'],
          },
          levels: [
            { from: 'sonnet', to: 'opus' },
          ],
        },
        shadow: {
          enabled: true,
          verifier_model: 'opus',
        },
      },
    };

    await applyResponseGovernance({
      req,
      payload,
      config,
      servicePort: 5678,
      deps: {
        executeCascadeRetry: vi.fn().mockResolvedValue({
          content: [{ text: 'rescued output' }],
        }),
      },
    });

    expect(req.body.model).toBe('model__opus,anthropic/claude-opus-4');
  });
});
