import { describe, expect, it, vi } from 'vitest';
import { createGovernanceTrace } from './trace';
import { applyResponseGovernance, executeModelPoolFallbackRetry } from './response-governance';
import { ModelSelector } from '../trigger/selector';
import { sessionStateStore } from './session-store';

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

    expect(selectResult.routeSource).toBe('semantic_match');
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

  it('persists sticky session state when SmartRouter sticky defaults are enabled even without Governance.enabled', async () => {
    const req: any = {
      sessionId: 'smart-session',
      body: {
        model: 'provider,model-a',
        metadata: {},
      },
      triggerResult: {
        analyzedText: '请帮我重构系统结构并拆分核心模块',
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-smart-sticky' }),
    };

    await applyResponseGovernance({
      req,
      payload: { content: [{ text: 'done' }] },
      config: {
        SmartRouter: {
          enabled: true,
          sticky: {
            enabled: true,
          },
        },
      } as any,
      servicePort: 5678,
    });

    expect(sessionStateStore.get('smart-session')).toEqual(
      expect.objectContaining({
        preferredModel: 'provider,model-a',
        lastSuccessfulModel: 'provider,model-a',
      })
    );
  });

  it('falls back to the next registration model pool endpoint on upstream error', async () => {
    const executeModelPoolFallbackRetry = vi.fn().mockResolvedValue({
      content: [{ text: 'fallback output' }],
    });
    const req: any = {
      headers: {},
      body: {
        model: 'registration__edge-a,claude-sonnet-4-5',
        metadata: {},
      },
      modelPoolSelection: {
        modelId: 'sonnet',
        endpointId: 'edge-a',
        strategy: 'priority',
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-pool-fallback' }),
    };
    const config: any = {
      APIKEY: 'admin-key',
      API_TIMEOUT_MS: 1234,
      Registration: {
        enabled: true,
        models: [
          {
            id: 'sonnet',
            api: 'https://edge-a.example.com/v1',
            key: 'sk-edge-a',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-a',
              pool_priority: 10,
            },
          },
          {
            id: 'sonnet',
            api: 'https://edge-b.example.com/v1',
            key: 'sk-edge-b',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-b',
              pool_priority: 20,
            },
          },
        ],
      },
    };

    const nextPayload = await applyResponseGovernance({
      req,
      payload: {
        error: {
          message: 'upstream timeout',
        },
      },
      config,
      servicePort: 5678,
      deps: {
        executeModelPoolFallbackRetry,
      },
    });

    expect(nextPayload).toEqual({ content: [{ text: 'fallback output' }] });
    expect(executeModelPoolFallbackRetry).toHaveBeenCalledWith(
      req.body,
      'registration__edge-b,claude-sonnet-4-5',
      5678,
      'admin-key',
      1234
    );
    expect(req.body.model).toBe('registration__edge-b,claude-sonnet-4-5');
    expect(req.modelPoolSelection).toEqual({
      modelId: 'sonnet',
      endpointId: 'edge-b',
      strategy: 'priority',
    });
    expect(req.governanceTrace.modelPoolFallbackTriggered).toBe(true);
    expect(req.governanceTrace.modelPoolFallbackFromEndpoint).toBe('edge-a');
    expect(req.governanceTrace.modelPoolFallbackNextEndpoint).toBe('edge-b');
    expect(req.governanceTrace.modelPoolFallbackEvidence).toBe('upstream timeout');
    expect(req.governanceTrace.routeReason).toContain('model_pool_fallback:sonnet:edge-b');
    expect(req.governanceTrace.routeReason).toContain('model_pool_fallback_executed');
  });

  it('uses the current request API key for model pool fallback when bootstrap APIKEY is absent', async () => {
    const executeModelPoolFallbackRetry = vi.fn().mockResolvedValue({
      content: [{ text: 'fallback output' }],
    });
    const req: any = {
      headers: {
        authorization: 'Bearer managed-client-key',
      },
      body: {
        model: 'registration__edge-a,claude-sonnet-4-5',
        metadata: {},
      },
      modelPoolSelection: {
        modelId: 'sonnet',
        endpointId: 'edge-a',
        strategy: 'priority',
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-pool-managed-key' }),
    };
    const config: any = {
      API_TIMEOUT_MS: 1234,
      Registration: {
        enabled: true,
        models: [
          {
            id: 'sonnet',
            api: 'https://edge-a.example.com/v1',
            key: 'sk-edge-a',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-a',
              pool_priority: 10,
            },
          },
          {
            id: 'sonnet',
            api: 'https://edge-b.example.com/v1',
            key: 'sk-edge-b',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-b',
              pool_priority: 20,
            },
          },
        ],
      },
    };

    await applyResponseGovernance({
      req,
      payload: {
        error: {
          message: 'upstream timeout',
        },
      },
      config,
      servicePort: 5678,
      deps: {
        executeModelPoolFallbackRetry,
      },
    });

    expect(executeModelPoolFallbackRetry).toHaveBeenCalledWith(
      expect.any(Object),
      'registration__edge-b,claude-sonnet-4-5',
      5678,
      'managed-client-key',
      1234
    );
  });

  it('does not chain model pool fallback after the first fallback attempt', async () => {
    const executeModelPoolFallbackRetry = vi.fn();
    const req: any = {
      headers: {
        'x-api-key': 'managed-client-key',
      },
      body: {
        model: 'registration__edge-b,claude-sonnet-4-5',
        metadata: {
          ctr_model_pool_fallback_attempt: 1,
        },
      },
      modelPoolSelection: {
        modelId: 'sonnet',
        endpointId: 'edge-b',
        strategy: 'priority',
      },
      governanceTrace: createGovernanceTrace({ requestId: 'req-pool-fallback-once' }),
    };
    const config: any = {
      Registration: {
        enabled: true,
        models: [
          {
            id: 'sonnet',
            api: 'https://edge-b.example.com/v1',
            key: 'sk-edge-b',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-b',
              pool_priority: 20,
            },
          },
          {
            id: 'sonnet',
            api: 'https://edge-c.example.com/v1',
            key: 'sk-edge-c',
            interface: 'anthropic',
            model: 'claude-sonnet-4-5',
            metadata: {
              pool_endpoint_id: 'edge-c',
              pool_priority: 30,
            },
          },
        ],
      },
    };

    const nextPayload = await applyResponseGovernance({
      req,
      payload: {
        error: {
          message: 'fallback endpoint still failed',
        },
      },
      config,
      servicePort: 5678,
      deps: {
        executeModelPoolFallbackRetry,
      },
    });

    expect(nextPayload).toEqual({
      error: {
        message: 'fallback endpoint still failed',
      },
    });
    expect(executeModelPoolFallbackRetry).not.toHaveBeenCalled();
    expect(req.governanceTrace.modelPoolFallbackEvidence).toBe('fallback endpoint still failed');
    expect(req.governanceTrace.routeReason).toContain('model_pool_fallback_skipped:max_attempts');
  });

  it('retries model pool fallback through the local service with SmartRouter bypassed', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'fallback ok' }] }),
    });

    const payload = await executeModelPoolFallbackRetry(
      {
        model: 'registration__edge-a,claude-sonnet-4-5',
        metadata: {
          request_id: 'req-1',
          ctr_model_pool_fallback_attempt: 1,
        },
      },
      'registration__edge-b,claude-sonnet-4-5',
      6789,
      'admin-key',
      2345,
      fetchFn as any
    );

    expect(payload).toEqual({ content: [{ text: 'fallback ok' }] });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:6789/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': 'admin-key',
          'x-ctr-smart-router': '1',
        }),
        body: JSON.stringify({
          model: 'registration__edge-b,claude-sonnet-4-5',
          metadata: {
            request_id: 'req-1',
            ctr_model_pool_fallback_attempt: 2,
          },
        }),
      })
    );
  });
});
