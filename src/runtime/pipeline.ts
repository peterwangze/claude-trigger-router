export const RUNTIME_PIPELINE_STAGE_ORDER = [
  'auth',
  'remote_forward',
  'smart_router',
  'agent_tools',
  'router',
  'context_guard',
  'protocol_dispatch',
  'agent_stream',
  'response_governance',
] as const;

export type TRuntimePipelineStage = typeof RUNTIME_PIPELINE_STAGE_ORDER[number];

export type TRuntimePipelineStatus =
  | 'completed'
  | 'skipped'
  | 'bypassed'
  | 'failed';

export interface IRuntimePipelineEntry {
  stage: TRuntimePipelineStage;
  status: TRuntimePipelineStatus;
  at: number;
  detail?: Record<string, unknown>;
}

export function isRuntimeModelCallPath(url: string | undefined): boolean {
  const path = String(url ?? '').split('?')[0];
  return path === '/v1/messages' || path === '/v1/chat/completions';
}

export function recordRuntimePipelineStage(
  req: any,
  stage: TRuntimePipelineStage,
  status: TRuntimePipelineStatus,
  detail?: Record<string, unknown>
): IRuntimePipelineEntry {
  const entry: IRuntimePipelineEntry = {
    stage,
    status,
    at: Date.now(),
    ...(detail ? { detail } : {}),
  };
  req.runtimePipeline = Array.isArray(req.runtimePipeline)
    ? req.runtimePipeline
    : [];
  req.runtimePipeline.push(entry);
  return entry;
}

export function getRuntimePipeline(req: any): IRuntimePipelineEntry[] {
  return Array.isArray(req?.runtimePipeline) ? req.runtimePipeline : [];
}

export function assertRuntimePipelineOrder(entries: IRuntimePipelineEntry[]): boolean {
  let previousIndex = -1;
  for (const entry of entries) {
    const index = RUNTIME_PIPELINE_STAGE_ORDER.indexOf(entry.stage);
    if (index === -1 || index < previousIndex) {
      return false;
    }
    previousIndex = index;
  }
  return true;
}
