import { extname } from 'path';

import { IAppConfig } from '../trigger/types';

interface IPersistSetupConfigInput {
  config: IAppConfig;
  currentConfigPath: string;
  hasExistingConfig: boolean;
  validateConfig: (config: IAppConfig) => string[];
  backupCurrentConfig: () => Promise<string | null>;
  writeConfig: (config: IAppConfig) => Promise<void>;
}

interface IPersistSetupConfigResult {
  configChanged: boolean;
  configPath: string;
  backupPath?: string;
}

function formatUtcTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}${milliseconds}`;
}

export function buildBackupPath(currentConfigPath: string, now: Date, suffix?: string): string {
  const extension = extname(currentConfigPath) || '.yaml';
  const timestamp = formatUtcTimestamp(now);
  const collisionSuffix = suffix ? `-${suffix}` : '';

  return currentConfigPath.replace(
    new RegExp(`${extension.replace('.', '\\.')}$`),
    `.backup.${timestamp}${collisionSuffix}${extension}`
  );
}

export async function persistSetupConfig(
  input: IPersistSetupConfigInput
): Promise<IPersistSetupConfigResult> {
  const errors = input.validateConfig(input.config);
  if (errors.length > 0) {
    throw new Error('config validation failed');
  }

  let backupPath: string | undefined;
  if (input.hasExistingConfig) {
    const createdBackupPath = await input.backupCurrentConfig();
    if (!createdBackupPath) {
      throw new Error('failed to back up existing config');
    }
    backupPath = createdBackupPath;
  }

  await input.writeConfig(input.config);

  return {
    configChanged: true,
    configPath: input.currentConfigPath,
    backupPath,
  };
}
