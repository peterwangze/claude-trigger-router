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
  enterClaudeCode: (input: {
    config: ISetupConfigDraft;
    service: {
      action: 'reuse' | 'start' | 'reload' | 'restart';
      healthChecked: boolean;
    };
  }) => Promise<void>;
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

function getLegacyProviderCount(input: unknown): number {
  if (typeof input !== 'object' || input === null) {
    return 0;
  }

  const legacyConfig = input as { providers?: unknown; Providers?: unknown };
  if (Array.isArray(legacyConfig.providers)) {
    return legacyConfig.providers.length;
  }

  if (Array.isArray(legacyConfig.Providers)) {
    return legacyConfig.Providers.length;
  }

  return 0;
}

function getMigratedModelCount(draft: ISetupConfigDraft): number {
  if (Array.isArray(draft.Models)) {
    return draft.Models.length;
  }

  if (Array.isArray(draft.Providers)) {
    return draft.Providers.reduce((total, provider) => total + (provider.models?.length ?? 0), 0);
  }

  return 0;
}

function isRouterServiceDeploymentDraft(draft: ISetupConfigDraft | undefined): boolean {
  return draft?.Runtime?.mode === 'server' || draft?.Runtime?.mode === 'cloud';
}

function getRouterServiceDeploymentLabel(draft: ISetupConfigDraft | undefined): 'server' | 'cloud' {
  return draft?.Runtime?.mode === 'cloud' ? 'cloud' : 'server';
}

function printRouterServiceDeploymentNextSteps(
  io: IRunSetupDeps['io'],
  draft: ISetupConfigDraft | undefined,
  message = '已生成 {mode} 部署配置；setup 不会自动启动远程服务。'
): void {
  io.info(message.replace('{mode}', getRouterServiceDeploymentLabel(draft)));
  io.info('下一步：编辑 Models[].key / Models[].model，运行 ctr doctor，然后运行 ctr start --daemon。');
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
    currentConfigAction === 'overwrite' ||
    currentConfigAction === 'fresh'
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
  let finalDraft: ISetupConfigDraft | undefined;

  if (branch.kind === 'repair_current') {
    if (detection.currentConfig.kind !== 'invalid' && detection.currentConfig.kind !== 'valid') {
      throw new Error('repair_current requires current config');
    }

    const repairPlan = deps.mapConfigErrorsToRepairFields([
      ...detection.currentConfig.errors,
      ...detection.currentConfig.warnings,
    ]);
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
    finalDraft = completedDraft;
    const persistResult = await deps.persistConfig({
      config: completedDraft,
      currentConfigPath: detection.currentConfig.path,
      hasExistingConfig: true,
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'reuse_current') {
    if (
      detection.currentConfig.kind === 'valid' &&
      isRouterServiceDeploymentDraft(detection.currentConfig.config)
    ) {
      printRouterServiceDeploymentNextSteps(
        deps.io,
        detection.currentConfig.config,
        '当前配置是 {mode} 部署配置；setup 不会自动启动远程服务。'
      );
      return;
    }

    const service = await deps.ensureServiceReady({
      configChanged: false,
      detectedService: detection.detectedService,
      reloadSupported: deps.reloadSupported,
    });

    await deps.enterClaudeCode({
      config: detection.currentConfig.config,
      service,
    });
    return;
  }

  if (branch.kind === 'unparseable_current') {
    const draft = await deps.buildFreshConfig();
    finalDraft = draft;
    const persistResult = await deps.persistConfig({
      config: draft,
      currentConfigPath: detection.currentConfig.path,
      hasExistingConfig: true,
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'fresh_init') {
    const draft = await deps.buildFreshConfig();
    finalDraft = draft;
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
    deps.io.info(`已识别旧配置中的 ${getLegacyProviderCount(detection.legacyConfig.config)} 个 provider。`);
    deps.io.info(`已从旧配置迁移 ${getMigratedModelCount(migrated.draft)} 个模型。`);
    if (migrated.draft.Router.default) {
      deps.io.info(`迁移后的默认模型：${migrated.draft.Router.default}`);
    } else {
      deps.io.info('迁移后的默认模型仍需补全。');
    }
    if (migrated.skippedFields.length > 0) {
      deps.io.info(`以下旧字段未自动迁移：${migrated.skippedFields.join(', ')}`);
    }

    let migratedFinalDraft = migrated.draft;
    if (migrated.needsCompletion) {
      migratedFinalDraft = await deps.completeDraft({
        draft: migrated.draft,
        fields: migrated.missingFields,
      });
    }

    finalDraft = migratedFinalDraft;
    const persistResult = await deps.persistConfig({
      config: migratedFinalDraft,
      currentConfigPath: getTargetConfigPath(detection),
      hasExistingConfig: detection.currentConfig.kind !== 'missing',
    });
    configChanged = persistResult.configChanged;
  }

  if (branch.kind === 'fresh_init' || branch.kind === 'repair_current' || branch.kind === 'unparseable_current' || branch.kind === 'migrate_legacy') {
    if (isRouterServiceDeploymentDraft(finalDraft)) {
      printRouterServiceDeploymentNextSteps(deps.io, finalDraft);
      return;
    }

    const service = await deps.ensureServiceReady({
      configChanged,
      detectedService: detection.detectedService,
      reloadSupported: deps.reloadSupported,
    });

    if (!finalDraft) {
      throw new Error('setup finished without a final config draft');
    }

    await deps.enterClaudeCode({
      config: finalDraft,
      service,
    });
    return;
  }

}
