export interface IWorkbenchFragmentContract {
  surface: 'user' | 'maintainer';
  name: string;
  rootId: string;
  requiredAnchors: string[];
}

export const WORKBENCH_FRAGMENT_CONTRACTS: IWorkbenchFragmentContract[] = [
  {
    surface: 'user',
    name: 'config-draft',
    rootId: 'userSurface',
    requiredAnchors: [
      'quickProviderTemplate',
      'quickModelKey',
      'applyQuickConfigBtn',
      'previewQuickConfigBtn',
      'saveQuickConfigBtn',
      'loadConfigDraftBtn',
      'previewConfigDraftBtn',
      'saveConfigDraftBtn',
      'modelsFormGrid',
    ],
  },
  {
    surface: 'user',
    name: 'compiled-models',
    rootId: 'userSurface',
    requiredAnchors: ['compiledModelMapTable', 'routerSlotTable', 'compiledModelPoolsTable'],
  },
  {
    surface: 'maintainer',
    name: 'auth',
    rootId: 'maintainerSurface',
    requiredAnchors: ['authScopeGuide', 'authQuotaTable'],
  },
  {
    surface: 'maintainer',
    name: 'model-pool-health',
    rootId: 'maintainerSurface',
    requiredAnchors: ['modelPoolHealthSummary', 'modelPoolHealthTable', 'probeModelPoolBtn'],
  },
  {
    surface: 'maintainer',
    name: 'governance-observability',
    rootId: 'maintainerSurface',
    requiredAnchors: ['requestId', 'routeReason', 'metricsGrid', 'routeHandoffSummaryList', 'traceEvidenceDetail', 'traceTable'],
  },
  {
    surface: 'maintainer',
    name: 'benchmark',
    rootId: 'maintainerSurface',
    requiredAnchors: ['benchmarkHistorySummary', 'benchmarkHistoryList', 'saveCalibrationBtn'],
  },
  {
    surface: 'user',
    name: 'role-aware-entry',
    rootId: 'uiDesignAssistantPanel',
    requiredAnchors: ['localUserRoleCard', 'remoteClientRoleCard', 'maintainerRoleCard', 'routingDesignerRoleCard'],
  },
];

export function toInlineScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSurfaceTabs(): string {
  return [
    '<div class="surface-tabs" role="tablist" aria-label="工作台切换">',
    '<button id="userSurfaceTab" class="surface-tab active" type="button" role="tab" aria-selected="true" data-surface-target="user">使用者工作台</button>',
    '<button id="maintainerSurfaceTab" class="surface-tab" type="button" role="tab" aria-selected="false" data-surface-target="maintainer">维护者工作台</button>',
    '</div>',
  ].join('');
}
