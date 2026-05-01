import { existsSync, mkdirSync } from 'fs';
import { readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { CONFIG_DIR } from '../constants';
import type { IModelPoolHealthPersistencePayload } from './pool-health';

const MODEL_POOL_HEALTH_FILE = join(CONFIG_DIR, 'model-pool-health.json');
let modelPoolHealthWriteQueue: Promise<void> = Promise.resolve();

export interface IModelPoolHealthPersistenceScheduler {
  schedule(payload: IModelPoolHealthPersistencePayload): void;
  flush(payload?: IModelPoolHealthPersistencePayload): Promise<void>;
}

export interface IModelPoolHealthPersistenceSchedulerOptions {
  debounceMs?: number;
  save?: (payload: IModelPoolHealthPersistencePayload) => Promise<void>;
  onError?: (error: unknown) => void;
}

export async function loadPersistedModelPoolHealth(): Promise<IModelPoolHealthPersistencePayload | undefined> {
  if (!existsSync(MODEL_POOL_HEALTH_FILE)) {
    return undefined;
  }

  const content = await readFile(MODEL_POOL_HEALTH_FILE, 'utf-8');
  const parsed = JSON.parse(content);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as IModelPoolHealthPersistencePayload
    : undefined;
}

export async function savePersistedModelPoolHealth(payload: IModelPoolHealthPersistencePayload): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const tempFile = `${MODEL_POOL_HEALTH_FILE}.tmp`;
  modelPoolHealthWriteQueue = modelPoolHealthWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf-8');
      await rename(tempFile, MODEL_POOL_HEALTH_FILE);
    });
  await modelPoolHealthWriteQueue;
}

export function createModelPoolHealthPersistenceScheduler(
  options: IModelPoolHealthPersistenceSchedulerOptions = {}
): IModelPoolHealthPersistenceScheduler {
  const debounceMs = options.debounceMs ?? 25;
  const save = options.save ?? savePersistedModelPoolHealth;
  const onError = options.onError;
  let pendingPayload: IModelPoolHealthPersistencePayload | undefined;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  let persistQueue: Promise<void> = Promise.resolve();

  const enqueue = (payload: IModelPoolHealthPersistencePayload) => {
    persistQueue = persistQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await save(payload);
        } catch (error) {
          onError?.(error);
        }
      });
    return persistQueue;
  };

  const flush = async (payload?: IModelPoolHealthPersistencePayload) => {
    if (payload) {
      pendingPayload = payload;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    const nextPayload = pendingPayload;
    pendingPayload = undefined;
    if (nextPayload) {
      await enqueue(nextPayload);
      return;
    }
    await persistQueue;
  };

  const schedule = (payload: IModelPoolHealthPersistencePayload) => {
    pendingPayload = payload;
    if (persistTimer) {
      return;
    }
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      const nextPayload = pendingPayload;
      pendingPayload = undefined;
      if (nextPayload) {
        void enqueue(nextPayload);
      }
    }, debounceMs);
    persistTimer.unref?.();
  };

  return {
    schedule,
    flush,
  };
}

export { MODEL_POOL_HEALTH_FILE };
