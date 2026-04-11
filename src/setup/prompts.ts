import { CurrentConfigAction, LegacyConfigAction } from './decision';
import { ISetupEnvironmentDetectionResult } from './detect';
import { ISetupConfigDraft } from './types';

export interface ISetupRepairPlan {
  mode: 'repair' | 'manualReview';
  fields: string[];
}

export interface ISetupPrompts {
  chooseCurrentConfigAction: (input: {
    currentConfig: ISetupEnvironmentDetectionResult['currentConfig'];
    legacyConfig: ISetupEnvironmentDetectionResult['legacyConfig'];
  }) => Promise<CurrentConfigAction>;
  chooseLegacyConfigAction: (input: {
    legacyConfig: ISetupEnvironmentDetectionResult['legacyConfig'];
  }) => Promise<LegacyConfigAction>;
  buildFreshConfig: () => Promise<ISetupConfigDraft>;
  buildRepairConfig: (input: {
    currentConfig: ISetupConfigDraft;
    fields: string[];
  }) => Promise<ISetupConfigDraft>;
  completeDraft: (input: {
    draft: ISetupConfigDraft;
    fields: string[];
  }) => Promise<ISetupConfigDraft>;
  io: {
    info: (message: string) => void;
  };
}
