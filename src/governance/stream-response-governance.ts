/**
 * Stream Response Governance
 *
 * 处理流式响应下的治理逻辑，重点支持 cascade 的 stream_guard。
 */

import { IAppConfig, IRequestContext } from '../trigger/types';
import { sessionUsageCache } from '../router/cache';
import { SSEParserTransform } from '../utils/SSEParser.transform';
import { appendTraceReason, finalizeTrace, recordGovernanceTrace, summarizeRouteHandoffTrace } from './trace';
import { decideCascadeEscalation, detectFailureEvidence, executeCascadeRetryStream } from './cascade-gate';
import { resolveModelReference } from '../models/compile';
import { getRuntimePipeline } from '../runtime/pipeline';

interface ICollectedSSE {
  events: any[];
  text: string;
  usage?: any;
  sawText: boolean;
}

export interface IStreamGovernanceDeps {
  executeCascadeRetryStream?: typeof executeCascadeRetryStream;
  detectFailureEvidence?: typeof detectFailureEvidence;
  decideCascadeEscalation?: typeof decideCascadeEscalation;
}

function serializeEvent(event: any): Uint8Array {
  let output = '';
  if (event.event) {
    output += `event: ${event.event}\n`;
  }
  if (event.data !== undefined) {
    output += `data: ${typeof event.data === 'string' ? event.data : JSON.stringify(event.data)}\n`;
  }
  output += '\n';
  return new TextEncoder().encode(output);
}

async function collectSSE(stream: ReadableStream<Uint8Array>): Promise<ICollectedSSE> {
  const parser = new SSEParserTransform();
  const parsedStream = stream.pipeThrough(parser as any);
  const reader = parsedStream.getReader();
  const events: any[] = [];
  let text = '';
  let usage: any;
  let sawText = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      events.push(value);

      const deltaText = value?.data?.delta?.text;
      if (typeof deltaText === 'string') {
        sawText = true;
        text += deltaText;
      }

      if (value?.event === 'message_delta' && value?.data?.usage) {
        usage = value.data.usage;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { events, text, usage, sawText };
}

export function governStreamingResponse(
  stream: ReadableStream<Uint8Array>,
  req: IRequestContext & Record<string, any>,
  config: IAppConfig,
  servicePort: number,
  deps?: IStreamGovernanceDeps
): ReadableStream<Uint8Array> {
  const executeCascadeRetryStreamFn = deps?.executeCascadeRetryStream ?? executeCascadeRetryStream;
  const detectFailureEvidenceFn = deps?.detectFailureEvidence ?? detectFailureEvidence;
  const decideCascadeEscalationFn = deps?.decideCascadeEscalation ?? decideCascadeEscalation;
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

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const original = await collectSSE(stream);
        let selected = original;

        if (
          config.Governance?.enabled &&
          resolvedCascadeConfig?.enabled &&
          resolvedCascadeConfig.stream_guard &&
          req.governanceTrace &&
          original.sawText
        ) {
          const evidences = detectFailureEvidenceFn(
            { content: [{ text: original.text }] },
            resolvedCascadeConfig
          );

          if (evidences.length > 0) {
            const cascadeAttempt = Number(req.body?.metadata?.ctr_cascade_attempt ?? 0);
            const decision = decideCascadeEscalationFn(
              req.body?.model,
              evidences,
              resolvedCascadeConfig,
              cascadeAttempt
            );
            req.governanceTrace.cascadeEvidence = evidences.map((item) => item.type);

            if (decision.shouldEscalate && decision.nextModel) {
              req.governanceTrace.cascadeTriggered = true;
              req.governanceTrace.cascadeNextModel = decision.nextModel;
              appendTraceReason(req.governanceTrace, 'cascade_gate_stream');

              const retryStream = await executeCascadeRetryStreamFn(
                req.body,
                decision.nextModel,
                servicePort,
                config.APIKEY,
                config.API_TIMEOUT_MS
              );

              if (retryStream) {
                selected = await collectSSE(retryStream);
                req.body.model = decision.nextModel;
                appendTraceReason(req.governanceTrace, 'cascade_stream_retry_executed');
              }
            }
          }
        }

        for (const event of selected.events) {
          controller.enqueue(serializeEvent(event));
        }
        controller.close();

        if (req.sessionId && selected.usage) {
          sessionUsageCache.put(req.sessionId, selected.usage);
        }

        if (req.governanceTrace) {
          req.governanceTrace.handoffSummary = summarizeRouteHandoffTrace(
            req.governanceTrace,
            getRuntimePipeline(req)
          );
          req.governanceTrace = finalizeTrace(req.governanceTrace, {
            finalModel: req.body?.model ?? req.governanceTrace.finalModel,
          });
          recordGovernanceTrace(req.governanceTrace);
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
