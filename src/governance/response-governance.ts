/**
 * Response Governance
 *
 * 抽取非流式响应的治理链，便于在主链复用并做组合场景测试。
 */

import { IAppConfig, IRequestContext } from '../trigger/types';
import { appendTraceReason, finalizeTrace, recordGovernanceTrace } from './trace';
import { createTaskFingerprint, sessionStateStore } from './session-store';
import { decideCascadeEscalation, detectFailureEvidence, executeCascadeRetry } from './cascade-gate';
import { shadowSupervisor } from './shadow-supervisor';

export interface IResponseGovernanceDeps {
  decideCascadeEscalation?: typeof decideCascadeEscalation;
  detectFailureEvidence?: typeof detectFailureEvidence;
  executeCascadeRetry?: typeof executeCascadeRetry;
}

export interface IApplyResponseGovernanceInput {
  req: IRequestContext & Record<string, any>;
  payload: any;
  config: IAppConfig;
  servicePort: number;
  deps?: IResponseGovernanceDeps;
}

export async function applyResponseGovernance({
  req,
  payload,
  config,
  servicePort,
  deps,
}: IApplyResponseGovernanceInput): Promise<any> {
  let nextPayload = payload;
  const detectFailureEvidenceFn = deps?.detectFailureEvidence ?? detectFailureEvidence;
  const decideCascadeEscalationFn = deps?.decideCascadeEscalation ?? decideCascadeEscalation;
  const executeCascadeRetryFn = deps?.executeCascadeRetry ?? executeCascadeRetry;

  if (
    config.Governance?.enabled &&
    config.Governance.cascade?.enabled &&
    req.governanceTrace
  ) {
    const evidences = detectFailureEvidenceFn(nextPayload, config.Governance.cascade);
    if (evidences.length > 0) {
      const cascadeAttempt = Number(req.body?.metadata?.ctr_cascade_attempt ?? 0);
      const decision = decideCascadeEscalationFn(
        req.body?.model,
        evidences,
        config.Governance.cascade,
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
            config.APIKEY,
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

  if (config.Governance?.enabled && config.Governance.sticky?.enabled && req.sessionId && req.body?.model) {
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
    config.Governance.shadow?.enabled &&
    req.governanceTrace
  ) {
    const audit = config.Governance.shadow.verifier_model
      ? await shadowSupervisor.inspectWithVerifier(
          nextPayload,
          config.Governance.shadow,
          servicePort,
          undefined,
          config.APIKEY,
          config.API_TIMEOUT_MS
        )
      : shadowSupervisor.inspect(nextPayload, config.Governance.shadow);
    if (audit.triggered) {
      req.governanceTrace.shadowChecked = true;
      req.governanceTrace.verificationResult = `${audit.riskLevel}:${audit.findings.join(',')}`;
      appendTraceReason(req.governanceTrace, 'shadow_supervisor');

      if (
        config.Governance.shadow.mode === 'sync_guard' &&
        config.Governance.cascade?.enabled &&
        audit.riskLevel !== 'low'
      ) {
        const guardAttempt = Number(req.body?.metadata?.ctr_cascade_attempt ?? 0);
        const guardDecision = decideCascadeEscalationFn(
          req.body?.model,
          shadowSupervisor.toFailureEvidence(audit),
          config.Governance.cascade,
          guardAttempt
        );

        if (guardDecision.shouldEscalate && guardDecision.nextModel) {
          const guardedPayload = await executeCascadeRetryFn(
            req.body,
            guardDecision.nextModel,
            servicePort,
            config.APIKEY,
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
    req.governanceTrace = finalizeTrace(req.governanceTrace, {
      finalModel: req.body?.model ?? req.governanceTrace.finalModel,
    });
    recordGovernanceTrace(req.governanceTrace);
  }

  return nextPayload;
}
