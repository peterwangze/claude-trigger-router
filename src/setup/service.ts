import { DetectedService } from './detect';

interface IDecideServiceActionInput {
  configChanged: boolean;
  detectedService: DetectedService;
  reloadSupported: boolean;
}

export type SetupServiceAction =
  | { kind: 'reuse' }
  | { kind: 'start' }
  | { kind: 'reload' }
  | { kind: 'restart' };

interface IApplyServiceActionInput {
  action: SetupServiceAction;
  executeStart: () => Promise<void>;
  executeReload: () => Promise<void>;
  executeRestart: () => Promise<void>;
  verifyHealth: () => Promise<boolean>;
}

export function decideServiceAction(input: IDecideServiceActionInput): SetupServiceAction {
  if (input.detectedService.kind === 'non_self_occupied') {
    throw new Error('target port is occupied by another service');
  }

  if (input.detectedService.kind === 'none') {
    return { kind: 'start' };
  }

  if (input.detectedService.kind === 'self_unhealthy') {
    return { kind: 'restart' };
  }

  if (input.configChanged && input.detectedService.kind === 'self_healthy') {
    return input.reloadSupported ? { kind: 'reload' } : { kind: 'restart' };
  }

  return { kind: 'reuse' };
}

export async function applyServiceAction(input: IApplyServiceActionInput): Promise<void> {
  if (input.action.kind === 'start') {
    await input.executeStart();
  }

  if (input.action.kind === 'reload') {
    await input.executeReload();
  }

  if (input.action.kind === 'restart') {
    await input.executeRestart();
  }

  const healthy = await input.verifyHealth();
  if (!healthy) {
    if (input.action.kind === 'restart') {
      throw new Error('service health check failed after restart; the previous ctr service may still be shutting down. Please wait a moment and retry, or run `ctr stop` first.');
    }
    if (input.action.kind === 'start') {
      throw new Error('service health check failed after start; please check whether the target port is already occupied or the configuration is still invalid.');
    }
    if (input.action.kind === 'reload') {
      throw new Error('service health check failed after reload; please retry or run `ctr restart` / `ctr stop` first.');
    }
    throw new Error('service health check failed while reusing the current service; please run `ctr status` or `ctr restart` to verify it.');
  }
}
