import { ISetupEnvironmentDetectionResult } from './detect';

export type CurrentConfigAction =
  | 'reuse'
  | 'overwrite'
  | 'repair'
  | 'rebuild'
  | 'create'
  | 'cancel';

export type LegacyConfigAction = 'migrate' | 'skip';

export type SetupBranchDecision =
  | { kind: 'reuse_current' }
  | { kind: 'repair_current' }
  | { kind: 'unparseable_current' }
  | { kind: 'migrate_legacy' }
  | { kind: 'fresh_init' }
  | { kind: 'cancelled' };

export interface IDecideSetupBranchInput {
  detection: ISetupEnvironmentDetectionResult;
  currentConfigAction: CurrentConfigAction;
  legacyConfigAction?: LegacyConfigAction;
}

function resolveLegacyChoice(
  detection: ISetupEnvironmentDetectionResult,
  legacyConfigAction?: LegacyConfigAction
): SetupBranchDecision {
  if (detection.legacyConfig.kind === 'found') {
    if (!legacyConfigAction) {
      throw new Error('legacy migration choice is required');
    }

    return legacyConfigAction === 'migrate'
      ? { kind: 'migrate_legacy' }
      : { kind: 'fresh_init' };
  }

  if (detection.legacyConfig.kind === 'read_error') {
    if (!legacyConfigAction) {
      throw new Error('legacy read error must be acknowledged');
    }
    if (legacyConfigAction !== 'skip') {
      throw new Error('legacy migration action is only valid when legacy config is found');
    }
    return { kind: 'fresh_init' };
  }

  if (legacyConfigAction) {
    throw new Error('legacy migration action is only valid when legacy config is found');
  }

  return { kind: 'fresh_init' };
}

function invalidCurrentAction(): never {
  throw new Error('invalid current config action');
}

function invalidLegacyAction(): never {
  throw new Error('invalid legacy config action');
}

function ensureNoLegacyAction(legacyConfigAction?: LegacyConfigAction): void {
  if (legacyConfigAction) {
    invalidLegacyAction();
  }
}

function ensureLegacyFlow(
  detection: ISetupEnvironmentDetectionResult,
  legacyConfigAction?: LegacyConfigAction
): SetupBranchDecision {
  return resolveLegacyChoice(detection, legacyConfigAction);
}

function invalidAction(): never {
  return invalidCurrentAction();
}

export function decideSetupBranch(input: IDecideSetupBranchInput): SetupBranchDecision {
  const { detection, currentConfigAction, legacyConfigAction } = input;

  if (currentConfigAction === 'cancel') {
    ensureNoLegacyAction(legacyConfigAction);
    return { kind: 'cancelled' };
  }

  switch (detection.currentConfig.kind) {
    case 'valid':
      if (currentConfigAction === 'reuse') {
        ensureNoLegacyAction(legacyConfigAction);
        return { kind: 'reuse_current' };
      }
      if (currentConfigAction === 'overwrite') {
        return ensureLegacyFlow(detection, legacyConfigAction);
      }
      return invalidAction();

    case 'invalid':
      if (currentConfigAction === 'repair') {
        ensureNoLegacyAction(legacyConfigAction);
        return { kind: 'repair_current' };
      }
      if (currentConfigAction === 'overwrite') {
        return ensureLegacyFlow(detection, legacyConfigAction);
      }
      return invalidAction();

    case 'parse_error':
      ensureNoLegacyAction(legacyConfigAction);
      if (currentConfigAction === 'rebuild') {
        return { kind: 'unparseable_current' };
      }
      return invalidAction();

    case 'missing':
      if (currentConfigAction === 'create') {
        return ensureLegacyFlow(detection, legacyConfigAction);
      }
      return invalidAction();
  }
}
