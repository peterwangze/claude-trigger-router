import { existsSync, mkdirSync } from 'fs';
import { readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import type { IModelPoolHealthPersistencePayload } from './pool-health';

const MODEL_POOL_HEALTH_FILE = join(HOME_DIR, 'model-pool-health.json');
let modelPoolHealthWriteQueue: Promise<void> = Promise.resolve();

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
  if (!existsSync(HOME_DIR)) {
    mkdirSync(HOME_DIR, { recursive: true });
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

export { MODEL_POOL_HEALTH_FILE };
