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
  latency?: IModelPoolEndpointLatencyWindow;
}

export interface IModelPoolEndpointLatencyWindow {
  sampleCount: number;
  averageMs: number;
  lastMs: number;
  windowStartedAt?: number;
  windowEndedAt?: number;
}

export interface IModelPoolEndpointHealthPersistenceEntry {
  modelId: string;
  endpointId: string;
  failureCount?: number;
  successCount?: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
  circuitOpenUntil?: number;
  latencySamples?: IModelPoolEndpointLatencySample[];
}

export interface IModelPoolHealthPersistencePayload {
  version: 1;
  updatedAt: string;
  endpoints: IModelPoolEndpointHealthPersistenceEntry[];
}

export interface IModelPoolEndpointLatencySample {
  latencyMs: number;
  recordedAt: number;
}

interface IModelPoolEndpointHealthState {
  failureCount: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
  circuitOpenUntil?: number;
  latencySamples?: IModelPoolEndpointLatencySample[];
}

export class ModelPoolHealthStore {
  private states = new Map<string, IModelPoolEndpointHealthState>();
  private changeListener?: (payload: IModelPoolHealthPersistencePayload) => void;

  constructor(
    private readonly cooldownMs = 60_000,
    private readonly circuitBreakerFailureThreshold = 3,
    private readonly circuitBreakerCooldownMs = 300_000,
    private readonly latencyWindowSize = 20
  ) {}

  clear(): void {
    this.states.clear();
    this.notifyChange();
  }

  setChangeListener(listener: ((payload: IModelPoolHealthPersistencePayload) => void) | undefined): void {
    this.changeListener = listener;
  }

  hydrate(payload: IModelPoolHealthPersistencePayload | undefined): void {
    this.states.clear();
    if (!payload || !Array.isArray(payload.endpoints)) {
      return;
    }

    for (const entry of payload.endpoints) {
      if (!entry || typeof entry.modelId !== 'string' || typeof entry.endpointId !== 'string') {
        continue;
      }
      const modelId = entry.modelId.trim();
      const endpointId = entry.endpointId.trim();
      if (!modelId || !endpointId) {
        continue;
      }
      this.states.set(this.key(modelId, endpointId), {
        failureCount: this.readFiniteNumber(entry.failureCount) ?? 0,
        successCount: this.readFiniteNumber(entry.successCount) ?? 0,
        lastFailureAt: this.readFiniteNumber(entry.lastFailureAt),
        lastSuccessAt: this.readFiniteNumber(entry.lastSuccessAt),
        cooldownUntil: this.readFiniteNumber(entry.cooldownUntil),
        circuitOpenUntil: this.readFiniteNumber(entry.circuitOpenUntil),
        latencySamples: this.normalizeLatencySamples(entry.latencySamples),
      });
    }
  }

  exportForPersistence(now = new Date()): IModelPoolHealthPersistencePayload {
    const endpoints = Array.from(this.states.entries()).map(([key, state]) => {
      const [modelId, endpointId] = key.split('\u0000');
      return {
        modelId,
        endpointId,
        failureCount: state.failureCount,
        successCount: state.successCount,
        lastFailureAt: state.lastFailureAt,
        lastSuccessAt: state.lastSuccessAt,
        cooldownUntil: state.cooldownUntil,
        circuitOpenUntil: state.circuitOpenUntil,
        latencySamples: state.latencySamples,
      };
    });

    return {
      version: 1,
      updatedAt: now.toISOString(),
      endpoints,
    };
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
    this.notifyChange();
    return this.toSnapshot(modelId, endpointId, next, now);
  }

  recordSuccess(
    modelId: string,
    endpointId: string,
    now = Date.now(),
    latencyMs?: number
  ): IModelPoolEndpointHealthSnapshot {
    const key = this.key(modelId, endpointId);
    const current = this.states.get(key) ?? {
      failureCount: 0,
      successCount: 0,
    };
    const latencySamples = this.appendLatencySample(current.latencySamples, latencyMs, now);
    const next = {
      ...current,
      failureCount: 0,
      successCount: current.successCount + 1,
      lastSuccessAt: now,
      cooldownUntil: undefined,
      circuitOpenUntil: undefined,
      ...(latencySamples ? { latencySamples } : {}),
    };
    this.states.set(key, next);
    this.notifyChange();
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

  private appendLatencySample(
    samples: IModelPoolEndpointLatencySample[] | undefined,
    latencyMs: number | undefined,
    recordedAt: number
  ): IModelPoolEndpointLatencySample[] | undefined {
    if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
      return samples;
    }

    return [
      ...(samples ?? []),
      {
        latencyMs,
        recordedAt,
      },
    ].slice(-this.latencyWindowSize);
  }

  private normalizeLatencySamples(samples: unknown): IModelPoolEndpointLatencySample[] | undefined {
    if (!Array.isArray(samples)) {
      return undefined;
    }

    const normalized = samples
      .map((sample) => ({
        latencyMs: this.readFiniteNumber(sample?.latencyMs),
        recordedAt: this.readFiniteNumber(sample?.recordedAt),
      }))
      .filter((sample): sample is IModelPoolEndpointLatencySample =>
        sample.latencyMs !== undefined && sample.latencyMs >= 0 && sample.recordedAt !== undefined
      )
      .slice(-this.latencyWindowSize);

    return normalized.length ? normalized : undefined;
  }

  private readFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private notifyChange(): void {
    this.changeListener?.(this.exportForPersistence());
  }

  private toLatencyWindow(
    samples: IModelPoolEndpointLatencySample[] | undefined
  ): IModelPoolEndpointLatencyWindow | undefined {
    if (!samples?.length) {
      return undefined;
    }

    const latencyValues = samples.map((sample) => sample.latencyMs);
    const recordedAtValues = samples.map((sample) => sample.recordedAt);
    return {
      sampleCount: samples.length,
      averageMs: latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length,
      lastMs: samples[samples.length - 1].latencyMs,
      windowStartedAt: Math.min(...recordedAtValues),
      windowEndedAt: Math.max(...recordedAtValues),
    };
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
      ...(state?.latencySamples?.length ? { latency: this.toLatencyWindow(state.latencySamples) } : {}),
    };
  }
}

export const modelPoolHealthStore = new ModelPoolHealthStore();
