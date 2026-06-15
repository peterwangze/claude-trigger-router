/**
 * Response Governance
 *
 * 抽取非流式响应的治理链，便于在主链复用并做组合场景测试。
 */

import { IAppConfig, IRequestContext } from '../trigger/types';
import { appendTraceReason, buildTraceSpansFromPipeline, finalizeTrace, recordGovernanceTrace, summarizeRouteHandoffTrace } from './trace';
import { createTaskFingerprint, sessionStateStore } from './session-store';
import { decideCascadeEscalation, detectFailureEvidence, executeCascadeRetry } from './cascade-gate';
import { shadowSupervisor } from './shadow-supervisor';
import { getModelPoolFallbackCandidate, resolveModelReference } from '../models/compile';
import { extractApiKeyFromHeaders } from '../auth/api-keys';
import { modelPoolHealthStore } from '../models/pool-health';
import { getRuntimePipeline } from '../runtime/pipeline';
import { inspectOutputGuardrail } from './io-guardrail';
import { attachPreflightDiagnostics } from './preflight-diagnostics';

export interface IResponseGovernanceDeps {
  decideCascadeEscalation?: typeof decideCascadeEscalation;
  detectFailureEvidence?: typeof detectFailureEvidence;
  executeCascadeRetry?: typeof executeCascadeRetry;
  executeModelPoolFallbackRetry?: typeof executeModelPoolFallbackRetry;
}

export interface IApplyResponseGovernanceInput {
  req: IRequestContext & Record<string, any>;
  payload: any;
  config: IAppConfig;
  servicePort: number;
  deps?: IResponseGovernanceDeps;
}

function hasUpstreamError(payload: any): boolean {
  return Boolean(payload && typeof payload === 'object' && payload.error);
}

function describeUpstreamError(payload: any): string {
  const error = payload?.error;
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error?.message === 'string') {
    return error.message;
  }
  if (typeof error?.type === 'string') {
    return error.type;
  }
  return 'upstream_error';
}

function getLoopbackApiKey(req: Record<string, any>, config: IAppConfig): string | undefined {
  return extractApiKeyFromHeaders(req.headers) || config.APIKEY;
}

function getModelPoolFallbackAttempt(req: Record<string, any>): number {
  const attempt = Number(req.body?.metadata?.ctr_model_pool_fallback_attempt ?? 0);
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 0;
}

function shouldRecordModelPoolSuccess(
  req: Record<string, any>,
  originalPayload: any,
  finalPayload: any
): boolean {
  if (!req.modelPoolSelection || hasUpstreamError(finalPayload)) {
    return false;
  }

  const routeReason = req.governanceTrace?.routeReason ?? [];
  if (routeReason.includes('cascade_retry_executed') || routeReason.includes('shadow_sync_guard')) {
    return false;
  }

  if (!hasUpstreamError(originalPayload)) {
    return true;
  }

  return routeReason.includes('model_pool_fallback_executed');
}

export async function executeModelPoolFallbackRetry(
  requestBody: any,
  fallbackModelRef: string,
  port: number,
  apiKey?: string,
  timeoutMs?: number,
  fetchFn?: typeof fetch
): Promise<any | null> {
  const fetchImpl = fetchFn || fetch;
  const currentAttempt = Number(requestBody?.metadata?.ctr_model_pool_fallback_attempt ?? 0);
  const retryBody = {
    ...requestBody,
    model: fallbackModelRef,
    metadata: {
      ...(requestBody?.metadata ?? {}),
      ctr_model_pool_fallback_attempt: currentAttempt + 1,
    },
  };

  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ctr-smart-router': '1',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(retryBody),
      ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function applyResponseGovernance({
  req,
  payload,
  config,
  servicePort,
  deps,
}: IApplyResponseGovernanceInput): Promise<any> {
  let nextPayload = payload;
  const effectiveStickyConfig = config.SmartRouter?.sticky
    ? {
        ...(config.Governance?.sticky ?? {}),
        ...config.SmartRouter.sticky,
      }
    : config.Governance?.sticky;
  const resolvedCascadeConfig = config.Governance?.cascade
    ? {
        ...config.Governance.cascade,
        levels: config.Governance.cascade.levels?.map((level) => ({
          ...level,
          from: resolveModelReference(config, level.from) ?? level.from,
          to: resolveModelReference(config, level.to) ?? level.to,
        })),
      }
    : undefined;
  const resolvedShadowConfig = config.Governance?.shadow
    ? {
        ...config.Governance.shadow,
        verifier_model: resolveModelReference(config, config.Governance.shadow.verifier_model) ?? config.Governance.shadow.verifier_model,
      }
    : undefined;
  const detectFailureEvidenceFn = deps?.detectFailureEvidence ?? detectFailureEvidence;
  const decideCascadeEscalationFn = deps?.decideCascadeEscalation ?? decideCascadeEscalation;
  const executeCascadeRetryFn = deps?.executeCascadeRetry ?? executeCascadeRetry;
  const executeModelPoolFallbackRetryFn = deps?.executeModelPoolFallbackRetry ?? executeModelPoolFallbackRetry;
  const loopbackApiKey = getLoopbackApiKey(req, config);

  if (hasUpstreamError(nextPayload) && req.modelPoolSelection && req.governanceTrace) {
    const fallbackAttempt = getModelPoolFallbackAttempt(req);
    modelPoolHealthStore.recordFailure(req.modelPoolSelection.modelId, req.modelPoolSelection.endpointId);
    const fallback = getModelPoolFallbackCandidate(config, req.modelPoolSelection);
    req.governanceTrace.modelPoolFallbackEvidence = describeUpstreamError(nextPayload);

    if (fallback && fallbackAttempt < 1) {
      req.governanceTrace.modelPoolFallbackTriggered = true;
      req.governanceTrace.modelPoolFallbackFromEndpoint = req.modelPoolSelection.endpointId;
      req.governanceTrace.modelPoolFallbackNextEndpoint = fallback.endpointId;
      appendTraceReason(
        req.governanceTrace,
        `model_pool_fallback:${fallback.modelId}:${fallback.endpointId}`
      );

      const retriedPayload = await executeModelPoolFallbackRetryFn(
        req.body,
        fallback.legacyRef,
        servicePort,
        loopbackApiKey,
        config.API_TIMEOUT_MS
      );

      if (retriedPayload && !hasUpstreamError(retriedPayload)) {
        req.body.model = fallback.legacyRef;
        req.modelPoolSelection = {
          modelId: fallback.modelId,
          endpointId: fallback.endpointId,
          strategy: fallback.strategy,
        };
        appendTraceReason(req.governanceTrace, 'model_pool_fallback_executed');
        nextPayload = retriedPayload;
      } else {
        modelPoolHealthStore.recordFailure(fallback.modelId, fallback.endpointId);
        appendTraceReason(req.governanceTrace, 'model_pool_fallback_failed');
        if (retriedPayload) {
          nextPayload = retriedPayload;
        }
      }
    } else if (fallbackAttempt >= 1) {
      appendTraceReason(req.governanceTrace, 'model_pool_fallback_skipped:max_attempts');
    }
  }

  if (
    config.Governance?.enabled &&
    resolvedCascadeConfig?.enabled &&
    req.governanceTrace
  ) {
    const evidences = detectFailureEvidenceFn(nextPayload, resolvedCascadeConfig);
    if (evidences.length > 0) {
      const cascadeAttempt = Number(req.body?.metadata?.ctr_cascade_attempt ?? 0);
      const decision = decideCascadeEscalationFn(
        req.body?.model,
        evidences,
        resolvedCascadeConfig,
        cascadeAttempt
      );
      req.governanceTrace.cascadeEvidence = evidences.map((item) => item.type);
      if (decision.shouldEscalate) {
        req.governanceTrace.cascadeTriggered = true;
        req.governanceTrace.cascadeNextModel = decision.nextModel;
        appendTraceReason(req.governanceTrace, 'cascade_gate');

        if (decision.nextModel) {
          const retriedPayload = await executeCascadeRetryFn(
            req.body,
            decision.nextModel,
            servicePort,
            loopbackApiKey,
            config.API_TIMEOUT_MS
          );

          if (retriedPayload) {
            req.body.model = decision.nextModel;
            appendTraceReason(req.governanceTrace, 'cascade_retry_executed');
            nextPayload = retriedPayload;
          }
        }
      }
    }
  }

  if (effectiveStickyConfig?.enabled && req.sessionId && req.body?.model) {
    const fingerprint = createTaskFingerprint(req.triggerResult?.analyzedText);
    if (fingerprint) {
      sessionStateStore.put(req.sessionId, {
        preferredModel: req.body.model,
        lastSuccessfulModel: req.body.model,
        lastTaskFingerprint: fingerprint,
      });
    }
  }

  if (
    config.Governance?.enabled &&
    resolvedShadowConfig?.enabled &&
    req.governanceTrace
  ) {
    const audit = resolvedShadowConfig.verifier_model
      ? await shadowSupervisor.inspectWithVerifier(
          nextPayload,
          resolvedShadowConfig,
          servicePort,
          undefined,
          loopbackApiKey,
          config.API_TIMEOUT_MS
        )
      : shadowSupervisor.inspect(nextPayload, resolvedShadowConfig);
    if (audit.triggered) {
      req.governanceTrace.shadowChecked = true;
      req.governanceTrace.verificationResult = `${audit.riskLevel}:${audit.findings.join(',')}`;
      appendTraceReason(req.governanceTrace, 'shadow_supervisor');

      if (
        resolvedShadowConfig.mode === 'sync_guard' &&
        resolvedCascadeConfig?.enabled &&
        audit.riskLevel !== 'low'
      ) {
        const guardAttempt = Number(req.body?.metadata?.ctr_cascade_attempt ?? 0);
        const guardDecision = decideCascadeEscalationFn(
          req.body?.model,
          shadowSupervisor.toFailureEvidence(audit),
          resolvedCascadeConfig,
          guardAttempt
        );

        if (guardDecision.shouldEscalate && guardDecision.nextModel) {
          const guardedPayload = await executeCascadeRetryFn(
            req.body,
            guardDecision.nextModel,
            servicePort,
            loopbackApiKey,
            config.API_TIMEOUT_MS
          );

          if (guardedPayload) {
            req.body.model = guardDecision.nextModel;
            req.governanceTrace.verificationResult =
              `${audit.riskLevel}:${audit.findings.join(',')}|guard_retry:${guardDecision.nextModel}`;
            appendTraceReason(req.governanceTrace, 'shadow_sync_guard');
            nextPayload = guardedPayload;
          }
        }
      }
    }
  }

  if (req.governanceTrace) {
    attachPreflightDiagnostics(req);
    const outputGuardrail = inspectOutputGuardrail(nextPayload);
    req.governanceTrace.outputGuardrail = outputGuardrail;
    for (const finding of outputGuardrail.findings) {
      appendTraceReason(req.governanceTrace, `output_guardrail:${finding.code}`);
    }
    req.governanceTrace.handoffSummary = summarizeRouteHandoffTrace(
      req.governanceTrace,
      getRuntimePipeline(req)
    );
    req.governanceTrace.spans = buildTraceSpansFromPipeline(
      req.governanceTrace,
      getRuntimePipeline(req)
    );
    req.governanceTrace = finalizeTrace(req.governanceTrace, {
      finalModel: req.body?.model ?? req.governanceTrace.finalModel,
    });
    if (shouldRecordModelPoolSuccess(req, payload, nextPayload)) {
      modelPoolHealthStore.recordSuccess(
        req.modelPoolSelection.modelId,
        req.modelPoolSelection.endpointId,
        req.governanceTrace.completedAt ?? Date.now(),
        req.governanceTrace.latencyMs
      );
    }
    recordGovernanceTrace(req.governanceTrace);
  }

  return nextPayload;
}
