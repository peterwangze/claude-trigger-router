export type StreamLifecycleEvent =
  | 'start'
  | 'chunk'
  | 'upstream_error'
  | 'client_cancel'
  | 'finalize';

export interface IStreamLifecycleEntry {
  event: StreamLifecycleEvent;
  at: number;
  requestId?: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
}

export interface IStreamLifecycleTarget {
  id?: string;
  sessionId?: string;
  streamLifecycle?: IStreamLifecycleEntry[];
}

export function recordStreamLifecycle(
  target: IStreamLifecycleTarget | undefined,
  event: StreamLifecycleEvent,
  detail?: Record<string, unknown>
): void {
  if (!target) {
    return;
  }

  if (!Array.isArray(target.streamLifecycle)) {
    target.streamLifecycle = [];
  }

  target.streamLifecycle.push({
    event,
    at: Date.now(),
    requestId: target.id,
    sessionId: target.sessionId,
    detail,
  });
}
