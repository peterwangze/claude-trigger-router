import { existsSync, mkdirSync } from 'fs';
import { readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import type { IAuthConfig } from '../trigger/types';

const QUOTA_USAGE_FILE = join(HOME_DIR, 'auth-quota-usage.json');
let quotaUsageWriteQueue: Promise<void> = Promise.resolve();

export async function loadPersistedAuthQuotaUsage(): Promise<IAuthConfig['quota_usage'] | undefined> {
  if (!existsSync(QUOTA_USAGE_FILE)) {
    return undefined;
  }

  const content = await readFile(QUOTA_USAGE_FILE, 'utf-8');
  const parsed = JSON.parse(content);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as NonNullable<IAuthConfig['quota_usage']>
    : undefined;
}

export async function savePersistedAuthQuotaUsage(usage: NonNullable<IAuthConfig['quota_usage']>): Promise<void> {
  if (!existsSync(HOME_DIR)) {
    mkdirSync(HOME_DIR, { recursive: true });
  }
  const tempFile = `${QUOTA_USAGE_FILE}.tmp`;
  quotaUsageWriteQueue = quotaUsageWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await writeFile(tempFile, JSON.stringify(usage, null, 2), 'utf-8');
      await rename(tempFile, QUOTA_USAGE_FILE);
    });
  await quotaUsageWriteQueue;
}

export { QUOTA_USAGE_FILE };
