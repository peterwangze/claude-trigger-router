export type TModelPoolEndpointHealthStatus = 'healthy' | 'cooldown' | 'open';

export interface IModelPoolEndpointHealthSnapshot {
  modelId: string;
  endpointId: string;
  status: TModelPoolEndpointHealthStatus;
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
  circuitOpenUntil?: number;
}

interface IModelPoolEndpointHealthState {
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
  circuitOpenUntil?: number;
}

export class ModelPoolHealthStore {
  private states = new Map<string, IModelPoolEndpointHealthState>();

  constructor(
    private readonly cooldownMs = 60_000,
    private readonly circuitBreakerFailureThreshold = 3,
    private readonly circuitBreakerCooldownMs = 300_000
  ) {}

  clear(): void {
    this.states.clear();
  }

  recordFailure(modelId: string, endpointId: string, now = Date.now()): IModelPoolEndpointHealthSnapshot {
    const key = this.key(modelId, endpointId);
    const current = this.states.get(key) ?? {
      failureCount: 0,
      successCount: 0,
    };
    const failureCount = current.failureCount + 1;
    const shouldOpenCircuit = failureCount >= this.circuitBreakerFailureThreshold;
    const next = {
      ...current,
      failureCount,
      lastFailureAt: now,
      cooldownUntil: now + this.cooldownMs,
      circuitOpenUntil: shouldOpenCircuit ? now + this.circuitBreakerCooldownMs : current.circuitOpenUntil,
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
      circuitOpenUntil: undefined,
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
    const circuitOpenUntil = state?.circuitOpenUntil;
    const inCooldown = typeof cooldownUntil === 'number' && cooldownUntil > now;
    const circuitOpen = typeof circuitOpenUntil === 'number' && circuitOpenUntil > now;
    return {
      modelId,
      endpointId,
      status: circuitOpen ? 'open' : inCooldown ? 'cooldown' : 'healthy',
      failureCount: state?.failureCount ?? 0,
      successCount: state?.successCount ?? 0,
      lastFailureAt: state?.lastFailureAt,
      lastSuccessAt: state?.lastSuccessAt,
      ...(inCooldown ? { cooldownUntil } : {}),
      ...(circuitOpen ? { circuitOpenUntil } : {}),
    };
  }
}

export const modelPoolHealthStore = new ModelPoolHealthStore();
