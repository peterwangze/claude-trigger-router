import { normalizeAndValidateConfig } from '../utils/config';
import { IAppConfig } from '../trigger/types';

export type ConfigFormat = 'yaml' | 'yml' | 'json';

export type RawCurrentConfigResult =
  | { kind: 'missing' }
  | {
      kind: 'found';
      path: string;
      format: ConfigFormat;
      config: Partial<IAppConfig>;
    }
  | {
      kind: 'parse_error';
      path: string;
      format: ConfigFormat;
      error: string;
    };

export type RawLegacyConfigResult =
  | { kind: 'missing' }
  | {
      kind: 'found';
      path: string;
      config: unknown;
    }
  | {
      kind: 'read_error';
      path: string;
      error: string;
    };

export type DetectedService =
  | { kind: 'none' }
  | { kind: 'self_healthy'; port: number }
  | { kind: 'self_unhealthy'; port: number }
  | { kind: 'non_self_occupied'; port: number };

export type SetupCurrentConfig =
  | { kind: 'missing' }
  | {
      kind: 'valid';
      path: string;
      format: ConfigFormat;
      config: IAppConfig;
      errors: [];
    }
  | {
      kind: 'invalid';
      path: string;
      format: ConfigFormat;
      config: IAppConfig;
      errors: string[];
    }
  | {
      kind: 'parse_error';
      path: string;
      format: ConfigFormat;
      error: string;
    };

export interface IDetectSetupEnvironmentDeps {
  readCurrentConfig: () => Promise<RawCurrentConfigResult>;
  readLegacyConfig: () => Promise<RawLegacyConfigResult>;
  probeService: () => Promise<DetectedService>;
}

export interface ISetupEnvironmentDetectionResult {
  currentConfig: SetupCurrentConfig;
  legacyConfig: RawLegacyConfigResult;
  detectedService: DetectedService;
}

function normalizeCurrentConfig(result: RawCurrentConfigResult): SetupCurrentConfig {
  if (result.kind === 'missing' || result.kind === 'parse_error') {
    return result;
  }

  const normalized = normalizeAndValidateConfig(result.config);
  if (normalized.errors.length === 0) {
    return {
      kind: 'valid',
      path: result.path,
      format: result.format,
      config: normalized.config,
      errors: [],
    };
  }

  return {
    kind: 'invalid',
    path: result.path,
    format: result.format,
    config: normalized.config,
    errors: normalized.errors,
  };
}

export async function detectSetupEnvironment(
  deps: IDetectSetupEnvironmentDeps
): Promise<ISetupEnvironmentDetectionResult> {
  const [currentConfig, legacyConfig, detectedService] = await Promise.all([
    deps.readCurrentConfig(),
    deps.readLegacyConfig(),
    deps.probeService(),
  ]);

  return {
    currentConfig: normalizeCurrentConfig(currentConfig),
    legacyConfig,
    detectedService,
  };
}
