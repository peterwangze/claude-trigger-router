export type TModelPoolEndpointHealthStatus = 'healthy' | 'cooldown';

export interface IModelPoolEndpointHealthSnapshot {
  modelId: string;
  endpointId: string;
  status: TModelPoolEndpointHealthStatus;
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
}

interface IModelPoolEndpointHealthState {
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
}

export class ModelPoolHealthStore {
  private states = new Map<string, IModelPoolEndpointHealthState>();

  constructor(private readonly cooldownMs = 60_000) {}

  clear(): void {
    this.states.clear();
  }

  recordFailure(modelId: string, endpointId: string, now = Date.now()): IModelPoolEndpointHealthSnapshot {
    const key = this.key(modelId, endpointId);
    const current = this.states.get(key) ?? {
      failureCount: 0,
      successCount: 0,
    };
    const next = {
      ...current,
      failureCount: current.failureCount + 1,
      lastFailureAt: now,
      cooldownUntil: now + this.cooldownMs,
    };
    this.states.set(key, next);
    return this.toSnapshot(modelId, endpointId, next, now);
  }

  recordSuccess(modelId: string, endpointId: string, now = Date.now()): IModelPoolEndpointHealthSnapshot {
    const key = this.key(modelId, endpointId);
    const current = this.states.get(key) ?? {
      failureCount: 0,
      successCount: 0,
    };
    const next = {
      ...current,
      failureCount: 0,
      successCount: current.successCount + 1,
      lastSuccessAt: now,
      cooldownUntil: undefined,
    };
    this.states.set(key, next);
    return this.toSnapshot(modelId, endpointId, next, now);
  }

  getSnapshot(modelId: string, endpointId: string, now = Date.now()): IModelPoolEndpointHealthSnapshot {
    return this.toSnapshot(
      modelId,
      endpointId,
      this.states.get(this.key(modelId, endpointId)),
      now
    );
  }

  isEndpointAvailable(modelId: string, endpointId: string, now = Date.now()): boolean {
    return this.getSnapshot(modelId, endpointId, now).status === 'healthy';
  }

  private key(modelId: string, endpointId: string): string {
    return `${modelId}\u0000${endpointId}`;
  }

  private toSnapshot(
    modelId: string,
    endpointId: string,
    state?: IModelPoolEndpointHealthState,
    now = Date.now()
  ): IModelPoolEndpointHealthSnapshot {
    const cooldownUntil = state?.cooldownUntil;
    const inCooldown = typeof cooldownUntil === 'number' && cooldownUntil > now;
    return {
      modelId,
      endpointId,
      status: inCooldown ? 'cooldown' : 'healthy',
      failureCount: state?.failureCount ?? 0,
      successCount: state?.successCount ?? 0,
      lastFailureAt: state?.lastFailureAt,
      lastSuccessAt: state?.lastSuccessAt,
      ...(inCooldown ? { cooldownUntil } : {}),
    };
  }
}

export const modelPoolHealthStore = new ModelPoolHealthStore();
