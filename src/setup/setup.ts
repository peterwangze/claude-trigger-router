import { CONFIG_FILE } from '../constants';
import { decideSetupBranch, LegacyConfigAction } from './decision';
import { ISetupEnvironmentDetectionResult } from './detect';
import { IMigrateLegacyConfigResult } from './migrate';
import { ISetupPrompts, ISetupRepairPlan } from './prompts';
import { ISetupConfigDraft } from './types';

interface IRunSetupDeps extends ISetupPrompts {
  detectSetupEnvironment: () => Promise<ISetupEnvironmentDetectionResult>;
  migrateLegacyConfig: (input: unknown) => IMigrateLegacyConfigResult;
  mapConfigErrorsToRepairFields: (errors: string[]) => ISetupRepairPlan;
  persistConfig: (input: {
    config: ISetupConfigDraft;
    currentConfigPath: string;
    hasExistingConfig: boolean;
  }) => Promise<{
    configChanged: boolean;
    configPath: string;
    backupPath?: string;
  }>;
  ensureServiceReady: (input: {
    configChanged: boolean;
    detectedService: ISetupEnvironmentDetectionResult['detectedService'];
    reloadSupported: boolean;
  }) => Promise<{
    action: 'reuse' | 'start' | 'reload' | 'restart';
    healthChecked: boolean;
  }>;
  enterClaudeCode: () => Promise<void>;
  reloadSupported: boolean;
}

function getTargetConfigPath(detection: ISetupEnvironmentDetectionResult): string {
  if (detection.currentConfig.kind === 'valid' || detection.currentConfig.kind === 'invalid') {
    return detection.currentConfig.path;
  }

  if (detection.currentConfig.kind === 'parse_error') {
    return detection.currentConfig.path;
  }

  return CONFIG_FILE;
}

export async function runSetup(deps: IRunSetupDeps): Promise<void> {
  const detection = await deps.detectSetupEnvironment();
  const currentConfigAction = await deps.chooseCurrentConfigAction({
    currentConfig: detection.currentConfig,
    legacyConfig: detection.legacyConfig,
  });

  let legacyConfigAction: LegacyConfigAction | undefined;
  if (
    currentConfigAction === 'create' ||
    currentConfigAction === 'overwrite'
  ) {
    if (detection.legacyConfig.kind === 'found' || detection.legacyConfig.kind === 'read_error') {
      legacyConfigAction = await deps.chooseLegacyConfigAction({
        legacyConfig: detection.legacyConfig,
      });
    }
  }

  const branch = decideSetupBranch({
    detection,
    currentConfigAction,
    legacyConfigAction,
  });

  if (branch.kind === 'cancelled') {
    return;
  }

  let configChanged = false;

  if (branch.kind === 'repair_current') {
    if (detection.currentConfig.kind !== 'invalid') {
      throw new Error('repair_current requires invalid current config');
    }

    const repairPlan = deps.mapConfigErrorsToRepairFields(detection.currentConfig.errors);
    if (repairPlan.mode === 'manualReview') {
      throw new Error('manual review is required for current config');
    }

    const baseDraft = await deps.buildRepairConfig({
      currentConfig: detection.currentConfig.config,
      fields: repairPlan.fields,
    });
    const completedDraft = await deps.completeDraft({
      draft: baseDraft,
      fields: repairPlan.fields,
    });
    const persistResult = await deps.persistConfig({
      config: completedDraft,
      currentConfigPath: detection.currentConfig.path,
      hasExistingConfig: true,
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'reuse_current') {
    await deps.ensureServiceReady({
      configChanged: false,
      detectedService: detection.detectedService,
      reloadSupported: deps.reloadSupported,
    });

    await deps.enterClaudeCode();
    return;
  }

  if (branch.kind === 'unparseable_current') {
    const draft = await deps.buildFreshConfig();
    const persistResult = await deps.persistConfig({
      config: draft,
      currentConfigPath: detection.currentConfig.path,
      hasExistingConfig: true,
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'fresh_init') {
    const draft = await deps.buildFreshConfig();
    const persistResult = await deps.persistConfig({
      config: draft,
      currentConfigPath: getTargetConfigPath(detection),
      hasExistingConfig: detection.currentConfig.kind !== 'missing',
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'migrate_legacy') {
    if (detection.legacyConfig.kind !== 'found') {
      throw new Error('migrate_legacy requires legacy config');
    }

    const migrated = deps.migrateLegacyConfig(detection.legacyConfig.config);
    let finalDraft = migrated.draft;
    if (migrated.needsCompletion) {
      finalDraft = await deps.completeDraft({
        draft: migrated.draft,
        fields: migrated.missingFields,
      });
    }

    const persistResult = await deps.persistConfig({
      config: finalDraft,
      currentConfigPath: getTargetConfigPath(detection),
      hasExistingConfig: detection.currentConfig.kind !== 'missing',
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'fresh_init' || branch.kind === 'repair_current' || branch.kind === 'unparseable_current' || branch.kind === 'migrate_legacy') {
    await deps.ensureServiceReady({
      configChanged,
      detectedService: detection.detectedService,
      reloadSupported: deps.reloadSupported,
    });

    await deps.enterClaudeCode();
    return;
  }

}
