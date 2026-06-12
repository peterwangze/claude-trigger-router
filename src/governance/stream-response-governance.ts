/**
 * Stream Response Governance
 *
 * 处理流式响应下的治理逻辑，重点支持 cascade 的 stream_guard。
 */

import { IAppConfig, IRequestContext } from '../trigger/types';
import { sessionUsageCache } from '../router/cache';
import { SSEParserTransform } from '../utils/SSEParser.transform';
import { appendTraceReason, buildTraceSpansFromPipeline, finalizeTrace, recordGovernanceTrace, summarizeRouteHandoffTrace } from './trace';
import { decideCascadeEscalation, detectFailureEvidence, executeCascadeRetryStream } from './cascade-gate';
import { resolveModelReference } from '../models/compile';
import { getRuntimePipeline } from '../runtime/pipeline';
import { inspectOutputGuardrail } from './io-guardrail';
import { recordStreamLifecycle } from '../utils/stream-lifecycle';

interface ICollectedSSE {
  events: any[];
  text: string;
  usage?: any;
  sawText: boolean;
}

interface IStreamObservation {
  text: string;
  usage?: any;
  sawText: boolean;
  streamError?: string;
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

function serializeStreamErrorEvent(message: string): Uint8Array {
  return serializeEvent({
    event: 'error',
    data: {
      type: 'upstream_stream_error',
      message,
    },
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeEnqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  value: Uint8Array
): boolean {
  try {
    controller.enqueue(value);
    return true;
  } catch {
    return false;
  }
}

function safeClose(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    // Downstream may have cancelled while the upstream reader was settling.
  }
}

function parseSSEBlock(block: string): any | null {
  const event: any = {};
  const dataLines: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('event:')) {
      event.event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length > 0) {
    const dataStr = dataLines.join('\n');
    try {
      event.data = JSON.parse(dataStr);
    } catch {
      event.data = dataStr;
    }
  }

  return Object.keys(event).length > 0 ? event : null;
}

function collectEventObservation(event: any, observation: IStreamObservation) {
  const deltaText = event?.data?.delta?.text;
  if (typeof deltaText === 'string') {
    observation.sawText = true;
    observation.text += deltaText;
  }

  if (event?.event === 'message_delta' && event?.data?.usage) {
    observation.usage = event.data.usage;
  }
}

function observeSSEChunk(buffer: string, chunkText: string, observation: IStreamObservation): string {
  let nextBuffer = buffer + chunkText;

  while (true) {
    const match = /\r?\n\r?\n/.exec(nextBuffer);
    if (!match || match.index < 0) {
      break;
    }

    const block = nextBuffer.slice(0, match.index);
    nextBuffer = nextBuffer.slice(match.index + match[0].length);
    const event = parseSSEBlock(block);
    if (event) {
      collectEventObservation(event, observation);
    }
  }

  return nextBuffer;
}

function finalizeStreamingTrace(
  req: IRequestContext & Record<string, any>,
  observation: IStreamObservation
) {
  if (req.sessionId && observation.usage) {
    sessionUsageCache.put(req.sessionId, observation.usage);
  }

  if (!req.governanceTrace) {
    return;
  }

  const outputGuardrail = inspectOutputGuardrail(observation.text);
  req.governanceTrace.outputGuardrail = outputGuardrail;
  for (const finding of outputGuardrail.findings) {
    appendTraceReason(req.governanceTrace, `output_guardrail:${finding.code}`);
  }
  if (observation.streamError) {
    appendTraceReason(req.governanceTrace, 'upstream_stream_error');
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
  recordGovernanceTrace(req.governanceTrace);
}

function passThroughStreamingResponse(
  stream: ReadableStream<Uint8Array>,
  req: IRequestContext & Record<string, any>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const observation: IStreamObservation = { text: '', sawText: false };
  let buffer = '';
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let chunks = 0;
  let bytes = 0;
  let status: 'completed' | 'upstream_error' | 'client_cancel' = 'completed';
  let clientCancelRecorded = false;

  const recordClientCancel = (reason: unknown) => {
    status = 'client_cancel';
    if (clientCancelRecorded) {
      return;
    }
    clientCancelRecorded = true;
    recordStreamLifecycle(req, 'client_cancel', {
      reason: reason instanceof Error ? reason.message : String(reason ?? ''),
      chunks,
      bytes,
    });
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = stream.getReader();
      recordStreamLifecycle(req, 'start', {
        mode: 'pass_through',
        streamGuard: false,
      });
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          chunks += 1;
          bytes += value.byteLength;
          recordStreamLifecycle(req, 'chunk', {
            chunks,
            bytes,
            chunkBytes: value.byteLength,
          });
          if (!safeEnqueue(controller, value)) {
            recordClientCancel('downstream_closed');
            await reader.cancel('downstream_closed').catch(() => undefined);
            break;
          }
          buffer = observeSSEChunk(buffer, decoder.decode(value, { stream: true }), observation);
        }
      } catch (error) {
        const message = getErrorMessage(error, 'The upstream stream closed before completion.');
        if (status !== 'client_cancel') {
          status = 'upstream_error';
        }
        observation.streamError = message;
        if (status === 'upstream_error') {
          recordStreamLifecycle(req, 'upstream_error', {
            message,
            chunks,
            bytes,
          });
          safeEnqueue(controller, serializeStreamErrorEvent('The upstream stream closed before completion.'));
        }
      } finally {
        const remaining = decoder.decode();
        if (remaining) {
          buffer = observeSSEChunk(buffer, remaining, observation);
        }
        if (buffer.trim()) {
          const event = parseSSEBlock(buffer);
          if (event) {
            collectEventObservation(event, observation);
          }
        }
        finalizeStreamingTrace(req, observation);
        reader.releaseLock();
        reader = undefined;
        recordStreamLifecycle(req, 'finalize', {
          status,
          chunks,
          bytes,
          sawText: observation.sawText,
          streamError: observation.streamError,
        });
        safeClose(controller);
      }
    },
    cancel(reason) {
      recordClientCancel(reason);
      return reader?.cancel(reason);
    },
  });
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
  const shouldBufferForStreamGuard = Boolean(
    config.Governance?.enabled &&
    resolvedCascadeConfig?.enabled &&
    resolvedCascadeConfig.stream_guard &&
    req.governanceTrace
  );

  if (!shouldBufferForStreamGuard) {
    return passThroughStreamingResponse(stream, req);
  }

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
          if (!safeEnqueue(controller, serializeEvent(event))) {
            return;
          }
        }
        safeClose(controller);

        if (req.sessionId && selected.usage) {
          sessionUsageCache.put(req.sessionId, selected.usage);
        }

        if (req.governanceTrace) {
          const outputGuardrail = inspectOutputGuardrail(selected.text);
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
          recordGovernanceTrace(req.governanceTrace);
        }
      } catch (error) {
        const message = getErrorMessage(error, 'The upstream stream closed before completion.');
        safeEnqueue(controller, serializeStreamErrorEvent(message));
        safeClose(controller);
      }
    },
  });
}
