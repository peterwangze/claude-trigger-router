import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { HOME_DIR } from '../constants';
import type { IAuthConfig } from '../trigger/types';

const QUOTA_USAGE_FILE = join(HOME_DIR, 'auth-quota-usage.json');

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
  await writeFile(QUOTA_USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
}

export { QUOTA_USAGE_FILE };
