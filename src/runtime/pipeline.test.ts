import { describe, expect, it } from 'vitest';
import {
  RUNTIME_PIPELINE_STAGE_ORDER,
  assertRuntimePipelineOrder,
  getRuntimePipeline,
  isRuntimeModelCallPath,
  recordRuntimePipelineStage,
} from './pipeline';

describe('runtime pipeline contract', () => {
  it('defines a stable hook order for model request processing', () => {
    expect(RUNTIME_PIPELINE_STAGE_ORDER).toEqual([
      'auth',
      'remote_forward',
      'smart_router',
      'agent_tools',
      'router',
      'context_guard',
      'protocol_dispatch',
      'agent_stream',
      'response_governance',
    ]);
  });

  it('records pipeline stages on the request object', () => {
    const req: any = {};

    recordRuntimePipelineStage(req, 'auth', 'completed');
    recordRuntimePipelineStage(req, 'remote_forward', 'skipped', {
      reason: 'local_runtime',
    });

    expect(getRuntimePipeline(req)).toEqual([
      expect.objectContaining({
        stage: 'auth',
        status: 'completed',
      }),
      expect.objectContaining({
        stage: 'remote_forward',
        status: 'skipped',
        detail: {
          reason: 'local_runtime',
        },
      }),
    ]);
    expect(assertRuntimePipelineOrder(getRuntimePipeline(req))).toBe(true);
  });

  it('detects out-of-order stage records', () => {
    expect(assertRuntimePipelineOrder([
      { stage: 'router', status: 'completed', at: 1 },
      { stage: 'smart_router', status: 'completed', at: 2 },
    ])).toBe(false);
  });

  it('only treats model call endpoints as runtime model paths', () => {
    expect(isRuntimeModelCallPath('/v1/messages')).toBe(true);
    expect(isRuntimeModelCallPath('/v1/messages?anthropic-version=2023-06-01')).toBe(true);
    expect(isRuntimeModelCallPath('/v1/chat/completions')).toBe(true);
    expect(isRuntimeModelCallPath('/api/service-info')).toBe(false);
  });
});
