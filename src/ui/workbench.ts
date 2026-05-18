import { getUiProviderTemplates } from "../provider-presets";
import {
  LOCAL_USER_ROLE_GUIDE,
  REMOTE_CLIENT_ROLE_GUIDE,
  SERVER_MAINTAINER_ROLE_GUIDE,
} from "../runtime-role-guidance";

function toInlineScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWorkbenchHtml(rawInitialConfig: any, configuredThresholds: any = {}): string {
  const initialConfig = rawInitialConfig ?? {};
  const modelsCount = Array.isArray(initialConfig.Models)
    ? initialConfig.Models.length
    : 0;
  const routerDefault = initialConfig.Router?.default ?? '-';
  const displayPort = initialConfig.PORT ?? '-';
  const runtimeMode = initialConfig.Runtime?.mode ?? 'local';
  const serviceRole = runtimeMode === 'local' ? 'local_agent' : 'router_service';
  const remoteService = initialConfig.Runtime?.remote_service ?? {};
  const remoteBaseUrl = typeof remoteService.base_url === 'string'
    ? remoteService.base_url.trim().replace(/\/+$/, '')
    : '';
  const remoteSummary = remoteService.enabled
    ? `${remoteBaseUrl || '-'} (checking)`
    : 'disabled';
  const configuredHost = String(initialConfig.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const publicHost = ['0.0.0.0', '::', '[::]'].includes(configuredHost);
  const advertisedUrl = publicHost
    ? `http://<server-host>:${displayPort}`
    : `http://${configuredHost}:${displayPort}`;
  const clientConnectionSummary = runtimeMode === 'local' && remoteService.enabled
    ? `${remoteBaseUrl || '-'} · client + read-only token`
    : runtimeMode === 'local'
      ? `local only · http://127.0.0.1:${displayPort}`
      : `${advertisedUrl} · client + read-only token`;
  const registration = initialConfig.Registration ?? {};
  const registrationModels = Array.isArray(registration.models) ? registration.models.length : 0;
  const registrationUpstreamServices = Array.isArray(registration.upstream_services) ? registration.upstream_services.length : 0;
  const registrationSummary = registration.enabled
    ? `${registrationModels} models / ${registrationUpstreamServices} upstream`
    : 'disabled';
  const initialManagedKeys = Array.isArray(initialConfig.Auth?.managed_keys) ? initialConfig.Auth.managed_keys : [];
  const nowMs = Date.now();
  const initialActiveManagedKeys = initialManagedKeys.filter((record: any) => {
    if (record?.revoked_at) {
      return false;
    }
    if (!record?.expires_at) {
      return true;
    }
    const expiresAt = Date.parse(record.expires_at);
    return !Number.isFinite(expiresAt) || expiresAt > nowMs;
  }).length;
  const authSummary = initialConfig.APIKEY || initialManagedKeys.length > 0 ? `configured · ${initialActiveManagedKeys} active` : 'not configured';
  const securitySummary = (!initialConfig.APIKEY && initialManagedKeys.length === 0 && (runtimeMode !== 'local' || publicHost))
    ? 'critical'
    : (!initialConfig.APIKEY && initialManagedKeys.length > 0 && initialActiveManagedKeys === 0)
      ? 'warning'
    : 'ok';
  const escapedDisplayPort = escapeHtml(displayPort);
  const escapedModelsCount = escapeHtml(modelsCount);
  const escapedRouterDefault = escapeHtml(routerDefault);
  const escapedRuntimeMode = escapeHtml(runtimeMode);
  const escapedServiceRole = escapeHtml(serviceRole);
  const escapedListenerSummary = escapeHtml(`${configuredHost}:${displayPort}${publicHost ? ' (public)' : ' (local)'}`);
  const escapedClientConnectionSummary = escapeHtml(clientConnectionSummary);
  const escapedRemoteSummary = escapeHtml(remoteSummary);
  const escapedRegistrationSummary = escapeHtml(registrationSummary);
  const escapedAuthSummary = escapeHtml(authSummary);
  const escapedSecuritySummary = escapeHtml(securitySummary);
  const escapedLocalUserRoleGuide = escapeHtml(LOCAL_USER_ROLE_GUIDE);
  const escapedServerMaintainerRoleGuide = escapeHtml(SERVER_MAINTAINER_ROLE_GUIDE);
  const escapedRemoteClientRoleGuide = escapeHtml(REMOTE_CLIENT_ROLE_GUIDE);
  const escapedMinSampleSize = escapeHtml(configuredThresholds.min_sample_size ?? 3);
  const escapedCascadeWarnRate = escapeHtml(configuredThresholds.cascade_warn_rate ?? 0.4);
  const escapedShadowWarnRate = escapeHtml(configuredThresholds.shadow_warn_rate ?? 0.5);
  const escapedLatencyWarnMs = escapeHtml(configuredThresholds.latency_warn_ms ?? 1500);

  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claude Trigger Router</title>` +
    `<style>` +
    `body{font-family:ui-sans-serif,system-ui,sans-serif;padding:2rem;max-width:1100px;margin:0 auto;background:#f7f7f5;color:#1f2328}` +
    `.panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1rem}` +
    `.muted{color:#6b7280}` +
    `.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:1rem;align-items:stretch;margin-bottom:1rem}` +
    `.hero h2{margin:.2rem 0 .5rem;font-size:1.55rem}` +
    `.hero-copy{display:flex;flex-direction:column;justify-content:center}` +
    `.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}` +
    `.status-tile{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:.75rem;min-width:0}` +
    `.status-tile strong{display:block;margin-top:.2rem;word-break:break-word}` +
    `@media (max-width:760px){.hero{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr}}` +
    `.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.stat{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:.85rem}` +
    `.stat strong{display:block;font-size:1.1rem;margin-top:.25rem}` +
    `.subpanel{margin-top:1rem;padding-top:1rem;border-top:1px solid #e5e7eb}` +
    `.bucket-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem}` +
    `.mini-list{list-style:none;padding:0;margin:.75rem 0 0}` +
    `.mini-list li{display:flex;justify-content:space-between;gap:.75rem 1rem;flex-wrap:wrap;align-items:flex-start;padding:.45rem 0;border-bottom:1px dashed #e5e7eb}` +
    `.mini-list li:last-child{border-bottom:none}` +
    `.action-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-top:.75rem}` +
    `.management-table{width:100%;margin-top:.75rem}` +
    `.management-table th,.management-table td{padding:.5rem;border-bottom:1px solid #e5e7eb;font-size:.92rem;vertical-align:top}` +
    `.scope-guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.scope-guide div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:.75rem}` +
    `.scope-guide strong{display:block;margin-bottom:.35rem}` +
    `.alert-list{display:grid;gap:.75rem;margin-top:1rem}` +
    `.alert{border-radius:12px;padding:.85rem 1rem;border:1px solid}` +
    `.alert.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}` +
    `.alert.critical{background:#fef2f2;border-color:#fca5a5;color:#991b1b}` +
    `.alert.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}` +
    `.diff-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-top:.75rem}` +
    `.diff-chip{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:.75rem}` +
    `.diff-chip strong{display:block;font-size:1rem;margin-top:.2rem}` +
    `.models-form-grid{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.model-card{border:1px solid #e5e7eb;border-radius:12px;padding:1rem;background:#fcfcfd}` +
    `.model-card-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.75rem}` +
    `.model-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.model-card-grid textarea{min-height:84px;resize:vertical}` +
    `.list-editor{display:grid;gap:.75rem;margin-top:.75rem}` +
    `.list-item{border:1px solid #e5e7eb;border-radius:12px;padding:.85rem;background:#fcfcfd}` +
    `.list-item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
    `.jump-highlight{outline:3px solid #f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15);transition:box-shadow .25s ease,outline-color .25s ease}` +
    `.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
    `.control-grid label{display:block;font-size:.85rem;color:#6b7280;margin-bottom:.35rem}` +
    `.trend-table{width:100%;margin-top:.75rem}` +
    `.trend-table th,.trend-table td{padding:.45rem;border-bottom:1px solid #e5e7eb;font-size:.92rem}` +
    `.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}` +
    `input,select,button{font:inherit;padding:.55rem .75rem;border-radius:8px;border:1px solid #d1d5db}` +
    `button{background:#111827;color:#fff;border-color:#111827;cursor:pointer}` +
    `table{width:100%;border-collapse:collapse;margin-top:1rem}` +
    `th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid #e5e7eb;vertical-align:top}` +
    `code,pre{font-family:ui-monospace,SFMono-Regular,monospace}` +
    `pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:12px;overflow:auto}` +
    `.pill{display:inline-block;padding:.2rem .5rem;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:.8rem}` +
    `.pill.info{background:#eff6ff;color:#1d4ed8}.pill.warn{background:#fff7ed;color:#9a3412}.pill.critical{background:#fef2f2;color:#991b1b}` +
    `.surface-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}` +
    `.surface-tab{background:#fff;color:#1f2328;border-color:#d1d5db}` +
    `.surface-tab.active{background:#111827;color:#fff;border-color:#111827}` +
    `.surface-panel[hidden]{display:none}` +
    `.surface-heading{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem}` +
    `</style></head>` +
    `<body>` +
    `<div class="hero">` +
    `<div class="panel hero-copy">` +
    `<h2>配置与状态工作台</h2>` +
    `<p class="muted">查看当前路由服务、模型配置和默认去向；需要排查时，下方维护者区域可继续查看 Governance Trace、metrics 和归档。</p>` +
    `<div class="action-row">` +
    `<button id="loadConfigDraftHeroBtn" type="button">载入当前配置</button>` +
    `<button id="previewConfigDraftHeroBtn" type="button">预览 compiled models</button>` +
    `<button id="refreshStatusHeroBtn" type="button">刷新状态</button>` +
    `</div>` +
    `</div>` +
    `<div class="panel">` +
    `<div class="status-grid">` +
    `<div class="status-tile"><span class="muted">Service</span><strong id="serviceReadyStatus">ready</strong></div>` +
    `<div class="status-tile"><span class="muted">Port</span><strong id="servicePortStatus">${escapedDisplayPort}</strong></div>` +
    `<div class="status-tile"><span class="muted">Mode</span><strong id="serviceModeStatus">${escapedRuntimeMode}</strong></div>` +
    `<div class="status-tile"><span class="muted">Role</span><strong id="serviceRoleStatus">${escapedServiceRole}</strong></div>` +
    `<div class="status-tile"><span class="muted">Listener</span><strong id="listenerStatusSummary">${escapedListenerSummary}</strong></div>` +
    `<div class="status-tile"><span class="muted">Models</span><strong id="modelCountStatus">${escapedModelsCount}</strong></div>` +
    `<div class="status-tile"><span class="muted">Router.default</span><strong id="routerDefaultStatus">${escapedRouterDefault}</strong></div>` +
    `<div class="status-tile"><span class="muted">Remote service</span><strong id="remoteStatusSummary">${escapedRemoteSummary}</strong></div>` +
    `<div class="status-tile"><span class="muted">Remote registration</span><strong id="remoteRegistrationStatusSummary">checking</strong></div>` +
    `<div class="status-tile"><span class="muted">Registration</span><strong id="registrationStatusSummary">${escapedRegistrationSummary}</strong></div>` +
    `<div class="status-tile"><span class="muted">Auth</span><strong id="authStatusSummary">${escapedAuthSummary}</strong></div>` +
    `<div class="status-tile"><span class="muted">Security</span><strong id="securityStatusSummary">${escapedSecuritySummary}</strong></div>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `<div class="surface-tabs" role="tablist" aria-label="工作台切换">` +
    `<button id="userSurfaceTab" class="surface-tab active" type="button" role="tab" aria-selected="true" data-surface-target="user">使用者工作台</button>` +
    `<button id="maintainerSurfaceTab" class="surface-tab" type="button" role="tab" aria-selected="false" data-surface-target="maintainer">维护者工作台</button>` +
    `</div>` +
    `<section id="userSurface" class="surface-panel" data-surface="user">` +
    `<div class="panel">` +
    `<div class="surface-heading"><strong>使用者工作台</strong><span class="muted">配置、模型、路由、服务状态与下一步保存动作。</span></div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Draft Config Preview</strong><span class="muted">编辑当前配置草稿并即时预览 compiled models 结果，不落盘</span></div>` +
    `<div class="action-row">` +
    `<button id="loadConfigDraftBtn" type="button">载入当前配置</button>` +
    `<button id="addModelDraftBtn" type="button">新增 Model</button>` +
    `<button id="applyBalancedPresetBtn" type="button">应用平衡预设</button>` +
    `<button id="previewBalancedPresetBtn" type="button">预览平衡预设</button>` +
    `<button id="applyFastPresetBtn" type="button">应用快速预设</button>` +
    `<button id="previewFastPresetBtn" type="button">预览快速预设</button>` +
    `<button id="applyGovernancePresetBtn" type="button">应用治理预设</button>` +
    `<button id="previewGovernancePresetBtn" type="button">预览治理预设</button>` +
    `<button id="syncDraftJsonBtn" type="button">同步 JSON 草稿</button>` +
    `<button id="previewConfigDraftBtn" type="button">预览 compiled models</button>` +
    `<button id="saveConfigDraftBtn" type="button">保存配置</button>` +
    `<span id="draftPreviewStatus" class="muted">尚未预览配置草稿</span>` +
    `</div>` +
    `<div class="control-grid">` +
    `<div><label>Preset mode</label><select id="draftPresetMode"><option value="merge" selected>append / merge</option><option value="replace">overwrite</option></select></div>` +
    `<div><label>Mode guide</label><div id="draftPresetModeHint" class="muted">append / merge 会尽量保留当前草稿，仅补充预设相关字段</div></div>` +
    `</div>` +
    `<div id="draftPresetList" class="alert-list">` +
    `<div class="alert info"><strong>Preset guide</strong><div class="muted">选择预设前可先查看其会覆盖的区域与推荐用途</div></div>` +
    `</div>` +
    `<div id="draftPreviewMeta" class="alert-list">` +
    `<div class="alert info"><strong>Draft preview mode</strong><div class="muted">当前显示为草稿编辑视图，预设 dry-run 会在这里提示影响范围。</div></div>` +
    `</div>` +
    `<div id="draftSummaryGrid" class="stats">` +
    `<div class="stat"><span class="muted">Models</span><strong>0</strong></div>` +
    `<div class="stat"><span class="muted">Routing rules</span><strong>0</strong></div>` +
    `<div class="stat"><span class="muted">Patterns</span><strong>0</strong></div>` +
    `<div class="stat"><span class="muted">Smart candidates</span><strong>0</strong></div>` +
    `<div class="stat"><span class="muted">Cascade levels</span><strong>0</strong></div>` +
    `<div class="stat"><span class="muted">Model refs</span><strong>0</strong></div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Validation Summary</strong><span class="muted">集中显示当前草稿的错误与 warning，并区分修复优先级</span></div>` +
    `<div id="draftValidationList" class="alert-list">` +
    `<div class="alert info"><strong>No validation issues</strong><div class="muted">预览前会在这里汇总草稿问题</div></div>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Capability Warnings</strong><span class="muted">显示模型 capability hint 可能带来的运行时降级行为</span></div>` +
    `<div id="capabilityWarningsList" class="alert-list">` +
    `<div class="alert info"><strong>No capability warnings</strong><div class="muted">预览或加载 compiled models 后会在这里显示能力降级提示</div></div>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Current Router slots</strong><span class="muted">解释基础路由槽位引用的 modelId、上游模型、能力和潜在配置风险</span></div>` +
    `<div id="routerSlotSummary" class="diff-summary">` +
    `<div class="diff-chip"><span class="muted">Configured slots</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Resolved slots</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Warnings</span><strong>0</strong></div>` +
    `</div>` +
    `<table id="routerSlotTable" class="management-table">` +
    `<thead><tr><th>Slot</th><th>When used</th><th>Model ref</th><th>Resolved target</th><th>Capabilities</th><th>Warning</th></tr></thead>` +
    `<tbody><tr><td colspan="6" class="muted">Loading router slot explanation...</td></tr></tbody>` +
    `</table>` +
    `<div id="contextWindowGuide" class="alert-list" style="margin-top:.75rem">` +
    `<div class="alert info"><strong>Context window guide</strong><div class="muted">加载 compiled models 后会在这里显示上下文窗口与 Router.longContext 建议</div></div>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>SmartRouter explanation</strong><span class="muted">展示规则命中顺序、候选模型、router_model、semantic/sticky 开关与 fallback</span></div>` +
    `<div id="smartRouterExplanationSummary" class="diff-summary">` +
    `<div class="diff-chip"><span class="muted">Enabled</span><strong>-</strong></div>` +
    `<div class="diff-chip"><span class="muted">Rules</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Candidates</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Warnings</span><strong>0</strong></div>` +
    `</div>` +
    `<div id="smartRouterRouteOrder" class="alert-list" style="margin-top:.75rem">` +
    `<div class="alert info"><strong>Route order</strong><div class="muted">加载 compiled models 后会在这里显示 SmartRouter 决策顺序。</div></div>` +
    `</div>` +
    `<table id="smartRouterRulesTable" class="management-table">` +
    `<thead><tr><th>Order</th><th>Rule</th><th>Model</th><th>Patterns</th><th>Semantic</th></tr></thead>` +
    `<tbody><tr><td colspan="5" class="muted">Loading SmartRouter rules...</td></tr></tbody>` +
    `</table>` +
    `<table id="smartRouterCandidatesTable" class="management-table">` +
    `<thead><tr><th>Order</th><th>Candidate</th><th>Description</th><th>Status</th></tr></thead>` +
    `<tbody><tr><td colspan="4" class="muted">Loading SmartRouter candidates...</td></tr></tbody>` +
    `</table>` +
    `<div id="smartCandidateGuide" class="alert-list" style="margin-top:.75rem">` +
    `<div class="alert info"><strong>Candidate guide</strong><div class="muted">加载 compiled models 后会在这里提示 fast / balanced / deep / long-context 候选覆盖。</div></div>` +
    `</div>` +
    `</div>` +
    `<div class="control-grid">` +
    `<div><label>Router default (modelId)</label><input id="draftRouterDefault" placeholder="例如 sonnet"></div>` +
    `<div><label>Models count</label><input id="draftModelsCount" value="0" readonly></div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Routing Controls</strong><span class="muted">围绕 SmartRouter 统一路由引擎编辑规则、候选与治理增强兼容配置</span></div>` +
    `<div class="detail-grid">` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Routing rules</strong><span class="muted">显式规则、语义提示与兼容输入</span></div>` +
    `<div class="control-grid">` +
    `<div><label><input id="triggerEnabled" type="checkbox"> Enabled</label></div>` +
    `<div><label><input id="triggerIntentEnabled" type="checkbox"> Intent recognition</label></div>` +
    `<div><label>Analysis scope</label><select id="triggerAnalysisScope"><option value="last_message">last_message</option><option value="full_context">full_context</option></select></div>` +
    `<div><label>Intent model</label><input id="triggerIntentModel" list="topLevelTriggerIntentSuggestions" placeholder="modelId"><datalist id="topLevelTriggerIntentSuggestions"></datalist></div>` +
    `</div>` +
    `<div style="margin-top:.75rem"><div class="action-row"><label>Rules</label><button id="addTriggerRuleBtn" type="button">新增 Rule</button></div><div id="triggerRulesList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No routing rules yet</span></div></div></div>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>SmartRouter</strong><span class="muted">智能候选选择</span></div>` +
    `<div class="control-grid">` +
    `<div><label><input id="smartEnabled" type="checkbox"> Enabled</label></div>` +
    `<div><label>Router model</label><input id="smartRouterModel" list="topLevelSmartRouterSuggestions" placeholder="modelId"><datalist id="topLevelSmartRouterSuggestions"></datalist></div>` +
    `<div><label>Fallback</label><select id="smartFallback"><option value="default">default</option><option value="skip">skip</option></select></div>` +
    `<div><label>Cache TTL</label><input id="smartCacheTtl" placeholder="600000"></div>` +
    `<div><label>Max tokens</label><input id="smartMaxTokens" placeholder="256"></div>` +
    `</div>` +
    `<div style="margin-top:.75rem"><div class="action-row"><label>Candidates</label><button id="addSmartCandidateBtn" type="button">新增 Candidate</button></div><div id="smartCandidatesList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No smart candidates yet</span></div></div></div>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Governance</strong><span class="muted">影子校验、级联与观测相关配置</span></div>` +
    `<div class="control-grid">` +
    `<div><label><input id="governanceEnabled" type="checkbox"> Enabled</label></div>` +
    `<div><label><input id="governanceAlignmentEnabled" type="checkbox"> Alignment</label></div>` +
    `<div><label>Summarizer model</label><input id="governanceSummarizerModel" list="topLevelGovernanceSummarizerSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceSummarizerSuggestions"></datalist></div>` +
    `<div><label><input id="governanceSemanticEnabled" type="checkbox"> Semantic</label></div>` +
    `<div><label>Classifier model</label><input id="governanceClassifierModel" list="topLevelGovernanceClassifierSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceClassifierSuggestions"></datalist></div>` +
    `<div><label><input id="governanceShadowEnabled" type="checkbox"> Shadow</label></div>` +
    `<div><label>Verifier model</label><input id="governanceVerifierModel" list="topLevelGovernanceVerifierSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceVerifierSuggestions"></datalist></div>` +
    `</div>` +
    `<div style="margin-top:.75rem"><div class="action-row"><label>Cascade levels</label><button id="addCascadeLevelBtn" type="button">新增 Level</button></div><div id="governanceCascadeLevelsList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No cascade levels yet</span></div></div></div>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `<div class="alert info"><strong>Models field guide</strong><div class="muted">新配置请使用入口字段：id / api / key / interface / model / thinking / metadata；api_key / api_base_url / protocol 仅作为旧配置兼容读取。</div></div>` +
    `<div id="modelsFormGrid" class="models-form-grid">` +
    `<div class="panel" style="margin-bottom:0"><span class="muted">No draft models loaded yet</span></div>` +
    `</div>` +
    `<textarea id="configDraftEditor" aria-label="JSON config draft" style="width:100%;min-height:240px;margin-top:.75rem;padding:.75rem;border-radius:12px;border:1px solid #d1d5db;font:12px/1.5 ui-monospace,SFMono-Regular,monospace" spellcheck="false" placeholder='{"Models":[{"id":"sonnet","api":"https://...","key":"sk-...","interface":"openai","model":"anthropic/claude-sonnet-4","thinking":"auto","metadata":{"vendor_hint":"openrouter"}}],"Router":{"default":"sonnet"}}'></textarea>` +
    `<div class="muted">JSON 草稿同样建议只写入口字段；保存时会自动归一，旧字段别名无需手动补充。</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Preview Diff</strong><span class="muted">对比当前运行配置与草稿配置的 compiled model 变化</span></div>` +
    `<div id="compiledDiffSummary" class="diff-summary">` +
    `<div class="diff-chip"><span class="muted">Added providers</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Removed providers</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Changed providers</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Added models</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Removed models</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Changed models</span><strong>0</strong></div>` +
    `</div>` +
    `<table id="compiledDiffTable" class="management-table">` +
    `<thead><tr><th>Scope</th><th>Type</th><th>Key</th><th>Changed fields</th><th>Target</th></tr></thead>` +
    `<tbody><tr><td colspan="5" class="muted">Preview a draft to inspect compiled registry changes</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Reference Impact</strong><span class="muted">分析 Router / SmartRouter / Governance（shadow/cascade）等 modelId 引用是否仍然有效</span></div>` +
    `<div id="referenceImpactSummary" class="diff-summary">` +
    `<div class="diff-chip"><span class="muted">Total refs</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">modelId refs</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Legacy refs</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Valid modelIds</span><strong>0</strong></div>` +
    `<div class="diff-chip"><span class="muted">Missing modelIds</span><strong>0</strong></div>` +
    `</div>` +
    `<table id="referenceImpactTable" class="management-table">` +
    `<thead><tr><th>Path</th><th>Ref</th><th>Type</th><th>Status</th><th>Resolved target</th><th>Suggestions</th></tr></thead>` +
    `<tbody><tr><td colspan="6" class="muted">Preview a draft to inspect model reference impact</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Compiled Models</strong><span class="muted">查看 Models 编译后的 provider 与路由映射</span></div>` +
    `<div id="compiledModelsStatus" class="muted" style="margin-top:.75rem">加载 compiled models 中...</div>` +
    `<div class="detail-grid">` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Compiled providers</strong><span class="muted">内部 provider、模型列表与 transformer</span></div>` +
    `<table id="compiledProvidersTable" class="management-table">` +
    `<thead><tr><th>Provider</th><th>Interface</th><th>Models</th><th>Transformer</th><th>API key</th></tr></thead>` +
    `<tbody><tr><td colspan="5" class="muted">Loading compiled providers...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Model map</strong><span class="muted">modelId 到内部 provider/model、thinking 与 capability 配置</span></div>` +
    `<table id="compiledModelMapTable" class="management-table">` +
    `<thead><tr><th>Model ID</th><th>Internal target</th><th>Protocol</th><th>Compatibility profile</th><th>Dispatch format</th><th>Thinking</th><th>Capabilities</th><th>Source</th></tr></thead>` +
    `<tbody><tr><td colspan="8" class="muted">Loading model map...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Model pools</strong><span class="muted">Registration.models 编译出的同模型多源池，当前支持 priority / least-latency active endpoint、非流式错误 fallback、内存 health/cooldown、熔断状态与延迟窗口</span></div>` +
    `<table id="compiledModelPoolsTable" class="management-table">` +
    `<thead><tr><th>Pool</th><th>Strategy</th><th>Active endpoint</th><th>Endpoints</th><th>Warnings</th></tr></thead>` +
    `<tbody><tr><td colspan="5" class="muted">Loading model pools...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</section>` +
    `<section id="maintainerSurface" class="surface-panel" data-surface="maintainer" hidden>` +
    `<div class="panel">` +
    `<div class="surface-heading"><strong>维护者工作台</strong><span class="muted">运行观测、Governance Trace、metrics、归档与维护操作。</span></div>` +
    `<div id="securitySummary" class="alert info"><strong>Security pending</strong><div class="muted">等待服务安全状态加载</div></div>` +
    `<div class="subpanel" id="roleConnectionGuide">` +
    `<div class="row"><strong>Role & connection guide</strong><span class="muted">按当前 local / server / cloud 角色确认监听地址、维护入口和远程客户端接入方式。</span></div>` +
    `<div class="scope-guide">` +
    `<div><strong>current role</strong><span id="roleConnectionSummary" class="muted">${escapedRuntimeMode} / ${escapedServiceRole}</span></div>` +
    `<div><strong>listener</strong><span id="listenerConnectionSummary" class="muted">${escapedListenerSummary}</span></div>` +
    `<div><strong>remote clients</strong><span id="clientConnectionSummary" class="muted">${escapedClientConnectionSummary}</span></div>` +
    `</div>` +
    `<div class="muted" style="margin-top:.75rem">${escapedLocalUserRoleGuide}</div>` +
    `<div class="muted" style="margin-top:.5rem">${escapedServerMaintainerRoleGuide}</div>` +
    `<div class="muted" style="margin-top:.5rem">${escapedRemoteClientRoleGuide}</div>` +
    `</div>` +
    `<div class="subpanel" id="authScopeGuide">` +
    `<div class="row"><strong>Auth scope guide</strong><span class="muted">按用途发放最小权限 key，远程客户端不要复用 admin key。</span></div>` +
    `<div class="scope-guide">` +
    `<div><strong>admin</strong><span class="muted">服务所有者使用：/ui、配置保存、auth 管理，以及所有运维写操作。</span></div>` +
    `<div><strong>operator</strong><span class="muted">日常运维使用：重启、治理快照、定时快照、异常阈值和归档删除；不能查看配置或管理 auth。</span></div>` +
    `<div><strong>client</strong><span class="muted">客户端模型调用：/v1/messages、/v1/chat/completions；模型调用配额只计入这里。</span></div>` +
    `<div><strong>read-only</strong><span class="muted">只读观测：health、service-info、compiled models、model pool health、transformers 和 governance GET。</span></div>` +
    `<div><strong>client + read-only</strong><span class="muted">远程 token 同时需要 ready/status 探测与模型调用时使用该组合。</span></div>` +
    `</div>` +
    `<div class="muted" style="margin-top:.75rem">管理入口：用 admin key 调用 <code>GET /api/auth/keys</code> 查看列表，<code>POST /api/auth/keys</code> 生成 key，<code>POST /api/auth/keys/:id/revoke</code> 吊销 key；生成的 secret 只返回一次，请直接交给对应客户端保存。</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Auth quota</strong><span class="muted">按 managed key 查看模型调用配额、当前用量与窗口重置时间</span></div>` +
    `<table id="authQuotaTable" class="management-table">` +
    `<thead><tr><th>Key</th><th>Scope</th><th>Status</th><th>Requests</th><th>Tokens</th><th>Window</th></tr></thead>` +
    `<tbody><tr><td colspan="6" class="muted">Waiting for service status...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Model pool health</strong><span class="muted">查看同模型多源池的 active endpoint、持久化状态、cooldown、熔断与延迟窗口。</span></div>` +
    `<div id="modelPoolHealthSummary" class="alert info"><strong>Pool health pending</strong><div class="muted">等待模型池健康状态加载</div></div>` +
    `<table id="modelPoolHealthTable" class="management-table">` +
    `<thead><tr><th>Pool</th><th>Endpoint</th><th>Status</th><th>Latency</th><th>Failures</th><th>Last success</th><th>Recovery</th></tr></thead>` +
    `<tbody><tr><td colspan="7" class="muted">Waiting for model pool health...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="row"><strong>维护者观测</strong><span class="muted">按 requestId / sessionKey / routeReason 过滤 Governance Trace，并查看近期治理指标。</span></div>` +
    `<div class="row">` +
    `<input id="requestId" placeholder="requestId">` +
    `<input id="sessionKey" placeholder="sessionKey">` +
    `<input id="routeReason" placeholder="routeReason">` +
    `<select id="cascadeTriggered"><option value="">cascadeTriggered</option><option value="true">cascade=true</option><option value="false">cascade=false</option></select>` +
    `<select id="shadowChecked"><option value="">shadowChecked</option><option value="true">shadow=true</option><option value="false">shadow=false</option></select>` +
    `<select id="windowMs">` +
    `<option value="900000">15m window</option>` +
    `<option value="3600000" selected>1h window</option>` +
    `<option value="21600000">6h window</option>` +
    `<option value="86400000">24h window</option>` +
    `</select>` +
    `<input id="limit" placeholder="limit" value="20">` +
    `<button id="refreshBtn">刷新</button>` +
    `</div>` +
    `<div class="muted" style="margin-top:.75rem">数据源：<code>/api/models/compiled</code>、<code>/api/models/pool-health</code>、<code>/api/models/compiled/preview</code>、<code>/api/governance/traces</code>、<code>/api/governance/traces/:requestId</code>、<code>/api/governance/archives</code>、<code>/api/governance/metrics</code>、<code>/api/governance/health</code>、<code>/api/governance/metrics/export</code>、<code>/api/governance/metrics/exports</code></div>` +
    `<div id="metricsGrid" class="stats">` +
    `<div class="stat"><span class="muted">Health</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Recent traces</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Sticky hit rate</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Cascade rate</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Shadow rate</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Alignment rate</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Model switch rate</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Alignment on switch</span><strong>-</strong></div>` +
    `<div class="stat"><span class="muted">Avg latency</span><strong>-</strong></div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Anomaly alerts</strong><span class="muted">检测近期治理异常与突增</span></div>` +
    `<div id="healthSummary" class="alert info"><strong>Health pending</strong><div class="muted">等待治理健康摘要加载</div></div>` +
    `<div id="anomalyList" class="alert-list">` +
    `<div class="alert info"><strong>No alerts yet</strong><div class="muted">等待治理指标加载</div></div>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Routing tuning</strong><span class="muted">基于 outcome 证据给出 SmartRouter 调优建议</span></div>` +
    `<ul id="routingTuningList" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Quality evidence</strong><span class="muted">真实 trace 中的失败、连续性和速度风险样本</span></div>` +
    `<div id="qualityEvidenceSummary" class="stats"><div class="stat"><span class="muted">Samples</span><strong>-</strong></div><div class="stat"><span class="muted">Risk</span><strong>-</strong></div><div class="stat"><span class="muted">Improvement</span><strong>-</strong></div><div class="stat"><span class="muted">Speed risk</span><strong>-</strong></div></div>` +
    `<ul id="qualityEvidenceList" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Task comparison</strong><span class="muted">同类任务下不同最终模型的失败率和速度对比</span></div>` +
    `<div id="taskComparisonSummary" class="stats"><div class="stat"><span class="muted">Tasks</span><strong>-</strong></div><div class="stat"><span class="muted">Traces</span><strong>-</strong></div></div>` +
    `<ul id="taskComparisonList" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Benchmark summary</strong><span class="muted">把治理 trace 与固定任务评测入口合并成维护者 A/B 闭环</span></div>` +
    `<div id="benchmarkSummary" class="stats"><div class="stat"><span class="muted">Comparable tasks</span><strong>-</strong></div><div class="stat"><span class="muted">Evidence samples</span><strong>-</strong></div><div class="stat"><span class="muted">Best quality lift</span><strong>-</strong></div><div class="stat"><span class="muted">Best speed lift</span><strong>-</strong></div></div>` +
    `<ul id="benchmarkActionList" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Anomaly tuning</strong><span class="muted">来自配置文件，可在此临时覆盖当前页面查询</span></div>` +
    `<div class="control-grid">` +
    `<div><label>Min sample</label><input id="minSampleSize" value="${escapedMinSampleSize}"></div>` +
    `<div><label>Cascade warn</label><input id="cascadeWarnRate" value="${escapedCascadeWarnRate}"></div>` +
    `<div><label>Shadow warn</label><input id="shadowWarnRate" value="${escapedShadowWarnRate}"></div>` +
    `<div><label>Latency warn ms</label><input id="latencyWarnMs" value="${escapedLatencyWarnMs}"></div>` +
    `</div>` +
    `<div class="row" style="margin-top:.75rem">` +
    `<button id="saveThresholdsBtn" type="button">保存阈值到配置</button>` +
    `<span id="saveThresholdsStatus" class="muted">当前仅作为页面查询参数；点击可写回配置文件</span>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Window buckets</strong><span id="bucketHint" class="muted">按时间窗查看近期治理趋势</span></div>` +
    `<div id="bucketGrid" class="bucket-grid">` +
    `<div class="stat"><span class="muted">Loading buckets</span><strong>-</strong></div>` +
    `</div>` +
    `</div>` +
    `<div class="detail-grid">` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Route ranking</strong><span class="muted">近期命中原因 Top 5</span></div>` +
    `<ul id="routeRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Model ranking</strong><span class="muted">近期最终模型 Top 5</span></div>` +
    `<ul id="modelRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Intent ranking</strong><span class="muted">近期语义意图 Top 5</span></div>` +
    `<ul id="intentRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Outcome by route</strong><span class="muted">切换、alignment、cascade 与延迟</span></div>` +
    `<ul id="routeOutcomeRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Outcome by model</strong><span class="muted">最终模型切换与延迟表现</span></div>` +
    `<ul id="modelOutcomeRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Outcome by intent</strong><span class="muted">任务意图切换与延迟表现</span></div>` +
    `<ul id="intentOutcomeRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="panel" style="margin-bottom:0">` +
    `<div class="row"><strong>Trend detail</strong><span class="muted">每个 bucket 的详细命中率</span></div>` +
    `<table id="trendTable" class="trend-table">` +
    `<thead><tr><th>Bucket</th><th>Traces</th><th>Sticky</th><th>Cascade</th><th>Shadow</th><th>Alignment</th></tr></thead>` +
    `<tbody><tr><td colspan="6" class="muted">Loading...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Recent route decisions</strong><span class="muted">把最近请求的 route source、规则、语义意图、置信度和 fallback 原因翻译成可读摘要。</span></div>` +
    `<ul id="routeDecisionSummaryList" class="mini-list"><li><span class="muted">Loading route decisions</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<div class="subpanel">` +
    `<div class="row"><strong>Recent switch continuity</strong><span class="muted">解释最近请求是否切换模型、是否补上下文，以及切换后是否触发 cascade。</span></div>` +
    `<ul id="switchContinuitySummaryList" class="mini-list"><li><span class="muted">Loading switch continuity</span><strong>-</strong></li></ul>` +
    `</div>` +
    `<table id="traceTable">` +
    `<thead><tr><th>Request</th><th>Session</th><th>Final Model</th><th>Reasons</th><th>Latency</th><th>Inspect</th></tr></thead>` +
    `<tbody><tr><td colspan="6" class="muted">加载中...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="panel">` +
    `<div class="row"><strong>Trace Detail</strong><span id="detailHint" class="muted">点击上表中的 View 查看详情</span></div>` +
    `<pre id="traceDetail">{}</pre>` +
    `</div>` +
    `<div class="panel">` +
    `<div class="row"><strong>Snapshot Management</strong><span class="muted">查看导出历史、定时任务，并手动创建快照</span></div>` +
    `<div class="action-row">` +
    `<select id="snapshotFormat"><option value="json">snapshot json</option><option value="csv">snapshot csv</option></select>` +
    `<button id="createSnapshotBtn" type="button">生成快照</button>` +
    `<span id="snapshotStatus" class="muted">尚未创建快照</span>` +
    `</div>` +
    `<table id="exportTable" class="management-table">` +
    `<thead><tr><th>Export</th><th>Kind</th><th>Format</th><th>Created</th></tr></thead>` +
    `<tbody><tr><td colspan="4" class="muted">Loading exports...</td></tr></tbody>` +
    `</table>` +
    `<table id="scheduleTable" class="management-table">` +
    `<thead><tr><th>Schedule</th><th>Interval</th><th>Format</th><th>Last run</th></tr></thead>` +
    `<tbody><tr><td colspan="4" class="muted">Loading schedules...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="panel">` +
    `<div class="row"><strong>Archive Management</strong><span class="muted">浏览压缩归档并查看分页结果</span></div>` +
    `<div class="action-row">` +
    `<input id="archiveDate" placeholder="YYYY-MM-DD">` +
    `<input id="archivePage" placeholder="page" value="1">` +
    `<input id="archivePageSize" placeholder="pageSize" value="5">` +
    `<button id="loadArchivesBtn" type="button">加载归档</button>` +
    `<span id="archiveStatus" class="muted">尚未加载归档</span>` +
    `</div>` +
    `<table id="archiveTable" class="management-table">` +
    `<thead><tr><th>Archive</th><th>Range</th><th>Count</th><th>Compressed</th></tr></thead>` +
    `<tbody><tr><td colspan="4" class="muted">Loading archives...</td></tr></tbody>` +
    `</table>` +
    `</div>` +
    `<div class="panel">` +
    `<p>其他管理 API：</p>` +
    `<ul>` +
    `<li><code>GET /api/config</code> — 读取当前配置</li>` +
    `<li><code>GET /api/models/compiled</code> — 查看 Models 编译后的内部 provider / model 映射</li>` +
    `<li><code>POST /api/models/compiled/preview</code> — 用配置草稿预览 compiled models 结果，不写回文件</li>` +
    `<li><code>POST /api/config</code> — 保存配置</li>` +
    `<li><code>GET /api/transformers</code> — 查看已加载 transformer</li>` +
    `<li><code>POST /api/restart</code> — 重启服务</li>` +
    `<li><code>GET /api/governance/archives</code> — 查看治理归档列表</li>` +
    `<li><code>GET /api/governance/archives/:file</code> — 查看归档内 traces</li>` +
    `<li><code>POST /api/governance/archives/:file/delete</code> — 删除指定归档</li>` +
    `<li><code>GET /api/governance/health</code> — 查看治理健康摘要</li>` +
    `<li><code>GET /api/auth/audit</code> — 查看鉴权审计摘要</li>` +
    `<li><code>POST /api/governance/metrics/snapshots</code> — 生成一次治理指标快照</li>` +
    `<li><code>POST /api/governance/metrics/schedules</code> — 注册定时快照任务</li>` +
    `</ul>` +
    `</div>` +
    `</section>` +
    `<script>` +
    `const tbody=document.querySelector('#traceTable tbody');` +
    `const detail=document.getElementById('traceDetail');` +
    `const detailHint=document.getElementById('detailHint');` +
    `const draftPreviewStatus=document.getElementById('draftPreviewStatus');` +
    `const draftPresetMode=document.getElementById('draftPresetMode');` +
    `const draftPresetModeHint=document.getElementById('draftPresetModeHint');` +
    `const draftPresetList=document.getElementById('draftPresetList');` +
    `const draftPreviewMeta=document.getElementById('draftPreviewMeta');` +
    `const draftValidationList=document.getElementById('draftValidationList');` +
    `const capabilityWarningsList=document.getElementById('capabilityWarningsList');` +
    `const routerSlotSummary=document.getElementById('routerSlotSummary');` +
    `const routerSlotTableBody=document.querySelector('#routerSlotTable tbody');` +
    `const contextWindowGuide=document.getElementById('contextWindowGuide');` +
    `const smartRouterExplanationSummary=document.getElementById('smartRouterExplanationSummary');` +
    `const smartRouterRouteOrder=document.getElementById('smartRouterRouteOrder');` +
    `const smartRouterRulesTableBody=document.querySelector('#smartRouterRulesTable tbody');` +
    `const smartRouterCandidatesTableBody=document.querySelector('#smartRouterCandidatesTable tbody');` +
    `const smartCandidateGuide=document.getElementById('smartCandidateGuide');` +
    `const configDraftEditor=document.getElementById('configDraftEditor');` +
    `const draftSummaryGrid=document.getElementById('draftSummaryGrid');` +
    `const modelsFormGrid=document.getElementById('modelsFormGrid');` +
    `const draftRouterDefault=document.getElementById('draftRouterDefault');` +
    `const draftModelsCount=document.getElementById('draftModelsCount');` +
    `const serviceReadyStatus=document.getElementById('serviceReadyStatus');` +
    `const servicePortStatus=document.getElementById('servicePortStatus');` +
    `const serviceModeStatus=document.getElementById('serviceModeStatus');` +
    `const serviceRoleStatus=document.getElementById('serviceRoleStatus');` +
    `const listenerStatusSummary=document.getElementById('listenerStatusSummary');` +
    `const roleConnectionSummary=document.getElementById('roleConnectionSummary');` +
    `const listenerConnectionSummary=document.getElementById('listenerConnectionSummary');` +
    `const clientConnectionSummary=document.getElementById('clientConnectionSummary');` +
    `const remoteStatusSummary=document.getElementById('remoteStatusSummary');` +
    `const registrationStatusSummary=document.getElementById('registrationStatusSummary');` +
    `const authStatusSummary=document.getElementById('authStatusSummary');` +
    `const securityStatusSummary=document.getElementById('securityStatusSummary');` +
    `const modelCountStatus=document.getElementById('modelCountStatus');` +
    `const routerDefaultStatus=document.getElementById('routerDefaultStatus');` +
    `const triggerEnabled=document.getElementById('triggerEnabled');` +
    `const triggerIntentEnabled=document.getElementById('triggerIntentEnabled');` +
    `const triggerAnalysisScope=document.getElementById('triggerAnalysisScope');` +
    `const triggerIntentModel=document.getElementById('triggerIntentModel');` +
    `const triggerRulesList=document.getElementById('triggerRulesList');` +
    `const smartEnabled=document.getElementById('smartEnabled');` +
    `const smartRouterModel=document.getElementById('smartRouterModel');` +
    `const smartFallback=document.getElementById('smartFallback');` +
    `const smartCacheTtl=document.getElementById('smartCacheTtl');` +
    `const smartMaxTokens=document.getElementById('smartMaxTokens');` +
    `const smartCandidatesList=document.getElementById('smartCandidatesList');` +
    `const governanceEnabled=document.getElementById('governanceEnabled');` +
    `const governanceAlignmentEnabled=document.getElementById('governanceAlignmentEnabled');` +
    `const governanceSummarizerModel=document.getElementById('governanceSummarizerModel');` +
    `const governanceSemanticEnabled=document.getElementById('governanceSemanticEnabled');` +
    `const governanceClassifierModel=document.getElementById('governanceClassifierModel');` +
    `const governanceShadowEnabled=document.getElementById('governanceShadowEnabled');` +
    `const governanceVerifierModel=document.getElementById('governanceVerifierModel');` +
    `const governanceCascadeLevelsList=document.getElementById('governanceCascadeLevelsList');` +
    `const topLevelTriggerIntentSuggestions=document.getElementById('topLevelTriggerIntentSuggestions');` +
    `const topLevelSmartRouterSuggestions=document.getElementById('topLevelSmartRouterSuggestions');` +
    `const topLevelGovernanceSummarizerSuggestions=document.getElementById('topLevelGovernanceSummarizerSuggestions');` +
    `const topLevelGovernanceClassifierSuggestions=document.getElementById('topLevelGovernanceClassifierSuggestions');` +
    `const topLevelGovernanceVerifierSuggestions=document.getElementById('topLevelGovernanceVerifierSuggestions');` +
    `const compiledModelsStatus=document.getElementById('compiledModelsStatus');` +
    `const compiledDiffSummary=document.getElementById('compiledDiffSummary');` +
    `const compiledDiffTableBody=document.querySelector('#compiledDiffTable tbody');` +
    `const referenceImpactSummary=document.getElementById('referenceImpactSummary');` +
    `const referenceImpactTableBody=document.querySelector('#referenceImpactTable tbody');` +
    `const compiledProvidersTableBody=document.querySelector('#compiledProvidersTable tbody');` +
    `const compiledModelMapTableBody=document.querySelector('#compiledModelMapTable tbody');` +
    `const compiledModelPoolsTableBody=document.querySelector('#compiledModelPoolsTable tbody');` +
    `const metricsGrid=document.getElementById('metricsGrid');` +
    `const bucketGrid=document.getElementById('bucketGrid');` +
    `const bucketHint=document.getElementById('bucketHint');` +
    `const routeRanking=document.getElementById('routeRanking');` +
    `const modelRanking=document.getElementById('modelRanking');` +
    `const intentRanking=document.getElementById('intentRanking');` +
    `const routeOutcomeRanking=document.getElementById('routeOutcomeRanking');` +
    `const modelOutcomeRanking=document.getElementById('modelOutcomeRanking');` +
    `const intentOutcomeRanking=document.getElementById('intentOutcomeRanking');` +
    `const healthSummary=document.getElementById('healthSummary');` +
    `const routingTuningList=document.getElementById('routingTuningList');` +
    `const routeDecisionSummaryList=document.getElementById('routeDecisionSummaryList');` +
    `const switchContinuitySummaryList=document.getElementById('switchContinuitySummaryList');` +
    `const qualityEvidenceSummary=document.getElementById('qualityEvidenceSummary');` +
    `const qualityEvidenceList=document.getElementById('qualityEvidenceList');` +
    `const taskComparisonSummary=document.getElementById('taskComparisonSummary');` +
    `const taskComparisonList=document.getElementById('taskComparisonList');` +
    `const benchmarkSummary=document.getElementById('benchmarkSummary');` +
    `const benchmarkActionList=document.getElementById('benchmarkActionList');` +
    `const securitySummary=document.getElementById('securitySummary');` +
    `const authQuotaTableBody=document.querySelector('#authQuotaTable tbody');` +
    `const modelPoolHealthSummary=document.getElementById('modelPoolHealthSummary');` +
    `const modelPoolHealthTableBody=document.querySelector('#modelPoolHealthTable tbody');` +
    `const anomalyList=document.getElementById('anomalyList');` +
    `const saveThresholdsStatus=document.getElementById('saveThresholdsStatus');` +
    `const snapshotStatus=document.getElementById('snapshotStatus');` +
    `const archiveStatus=document.getElementById('archiveStatus');` +
    `const exportTableBody=document.querySelector('#exportTable tbody');` +
    `const scheduleTableBody=document.querySelector('#scheduleTable tbody');` +
    `const archiveTableBody=document.querySelector('#archiveTable tbody');` +
    `const trendTableBody=document.querySelector('#trendTable tbody');` +
    `const surfaceTabs=Array.from(document.querySelectorAll('[data-surface-target]'));` +
    `const surfacePanels=Array.from(document.querySelectorAll('[data-surface]'));` +
    `let currentDraftConfig={};` +
    `let knownModelIds=[];` +
    `let lastCompiledModelsData=null;` +
    `let activeValidationHighlight=null;` +
    `function withDraftCompiledData(payload){ return { ...(lastCompiledModelsData || {}), normalizedConfig: payload || currentDraftConfig || {} }; }` +
    `const draftPresets={` +
    `  balanced:{ label:'平衡预设', description:'启用 SmartRouter，并填充平衡/快速候选模型组合。', affects:['Router.default','SmartRouter.enabled','SmartRouter.candidates'], routerDefault:'sonnet', smartEnabled:true, smartCandidates:[{ model:'sonnet', description:'balanced default' },{ model:'haiku', description:'fast lightweight' }] },` +
    `  fast:{ label:'快速预设', description:'默认走轻量模型，并添加一条快速响应路由规则。', affects:['Router.default','SmartRouter.enabled','SmartRouter.rules'], routerDefault:'haiku', triggerEnabled:true, triggerRules:[{ name:'quick-response', enabled:true, priority:20, model:'haiku', patterns:[{ type:'exact', keywords:['快速处理','快速回答'] }] }] },` +
    `  governance:{ label:'治理预设', description:'打开治理增强与校验能力，并填入 summarizer/classifier/verifier 示例模型。', affects:['Governance.enabled','SmartRouter.sticky.alignment','SmartRouter.semantic','Governance.shadow'], governanceEnabled:true, governanceAlignmentEnabled:true, governanceSemanticEnabled:true, governanceShadowEnabled:true, governanceSummarizerModel:'sonnet', governanceClassifierModel:'sonnet', governanceVerifierModel:'haiku' }` +
    `};` +
    `const modelProviderTemplates=${toInlineScriptJson(getUiProviderTemplates())};` +
    `const defaultProviderTemplateKey='openrouter';` +
    `function esc(v){return String(v ?? '').replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));}` +
    `function pct(v){return (Number(v || 0) * 100).toFixed(1)+'%';}` +
    `function fmt(v){return Number(v || 0).toFixed(2);}` +
    `function shortTime(v){ const d=new Date(v); return d.toISOString().slice(11,16); }` +
    `function limitText(used,limit){ return Number.isFinite(limit) ? (String(used ?? 0)+' / '+String(limit)) : String(used ?? 0); }` +
    `function renderAuthQuotaTable(quota){` +
    `  const keys=Array.isArray(quota?.keys) ? quota.keys : [];` +
    `  if(!keys.length){ authQuotaTableBody.innerHTML='<tr><td colspan="6" class="muted">No managed keys configured</td></tr>'; return; }` +
    `  authQuotaTableBody.innerHTML=keys.map(item=>{` +
    `    const usage=item.usage || {};` +
    `    const quotaCfg=item.quota || {};` +
    `    const keyName=esc(item.label || item.id || '-')+'<div class="muted"><code>'+esc(item.id || '-')+'</code></div>';` +
    `    const statusClass=item.status === 'exhausted' ? 'critical' : (item.status === 'watch' ? 'warn' : 'info');` +
    `    const windowText=quotaCfg.window_seconds ? (esc(quotaCfg.window_seconds)+'s'+(usage.windowResetAt ? '<div class="muted">reset '+esc(String(usage.windowResetAt).replace('T',' ').replace('.000Z','Z'))+'</div>' : '<div class="muted">not started</div>')) : '-';` +
    `    return '<tr><td>'+keyName+'</td><td>'+esc((item.scopes || []).join(', ') || '-')+'</td><td><span class="pill '+statusClass+'">'+esc(item.status || '-')+'</span></td><td>'+esc(limitText(usage.requestsUsed,usage.requestLimit))+'</td><td>'+esc(limitText(usage.tokensUsed,usage.tokenLimit))+'</td><td>'+windowText+'</td></tr>';` +
    `  }).join('');` +
    `}` +
    `function renderModelPoolHealth(data){` +
    `  const summary=data?.summary || {};` +
    `  const pools=Array.isArray(data?.pools) ? data.pools : [];` +
    `  const statusClass=summary.open ? 'critical' : (summary.cooldown ? 'warn' : 'info');` +
    `  const averageLatency=Number.isFinite(summary.averageLatencyMs) ? (Number(summary.averageLatencyMs).toFixed(0)+' ms avg') : 'no latency samples';` +
    `  modelPoolHealthSummary.className='alert '+statusClass;` +
    `  modelPoolHealthSummary.innerHTML='<strong>Pool health: '+esc(summary.healthy || 0)+' healthy / '+esc(summary.cooldown || 0)+' cooldown / '+esc(summary.open || 0)+' open</strong><div class="muted">'+esc(summary.pools || 0)+' pools · '+esc(summary.endpoints || 0)+' endpoints · '+esc(averageLatency)+' · persisted endpoints '+esc(data?.persistedState?.endpoints || 0)+'</div>';` +
    `  const rows=[];` +
    `  pools.forEach(pool=>{` +
    `    (pool.endpoints || []).forEach(endpoint=>{` +
    `      const recovery=endpoint.circuitOpenUntil ? ('circuit opens until '+new Date(endpoint.circuitOpenUntil).toISOString()) : endpoint.cooldownUntil ? ('cooldown until '+new Date(endpoint.cooldownUntil).toISOString()) : '-';` +
    `      const latency=endpoint.latency ? (Number(endpoint.latency.averageMs || 0).toFixed(0)+' ms avg / '+esc(endpoint.latency.sampleCount || 0)+' samples') : '-';` +
    `      const endpointLabel='<code>'+esc(endpoint.id || '-')+'</code>'+(endpoint.active ? ' <span class="pill info">active</span>' : '')+'<div class="muted">'+esc(endpoint.providerName || '-')+' / '+esc(endpoint.upstreamServiceId || endpoint.upstreamBaseUrl || 'local')+'</div>';` +
    `      const statusCls=endpoint.status === 'open' ? 'critical' : (endpoint.status === 'cooldown' ? 'warn' : 'info');` +
    `      rows.push('<tr><td><code>'+esc(pool.modelId || '-')+'</code><div class="muted">'+esc(pool.strategy || '-')+'</div></td><td>'+endpointLabel+'</td><td><span class="pill '+statusCls+'">'+esc(endpoint.status || '-')+'</span></td><td>'+esc(latency)+'</td><td>'+esc(endpoint.failureCount || 0)+'<div class="muted">success '+esc(endpoint.successCount || 0)+'</div></td><td>'+esc(endpoint.lastSuccessAt ? new Date(endpoint.lastSuccessAt).toISOString() : '-')+'</td><td>'+esc(recovery)+'</td></tr>');` +
    `    });` +
    `  });` +
    `  modelPoolHealthTableBody.innerHTML=rows.length ? rows.join('') : '<tr><td colspan="7" class="muted">No registration model pools configured</td></tr>';` +
    `}` +
    `async function loadModelPoolHealth(){` +
    `  const res=await fetch('/api/models/pool-health');` +
    `  const data=await res.json();` +
    `  renderModelPoolHealth(data);` +
    `}` +
    `function renderRoleConnectionGuide(data){` +
    `  const listener=data.listener || {};` +
    `  const connection=data.clientConnection || {};` +
    `  const mode=data.runtimeMode || '-';` +
    `  const role=data.serviceRole || '-';` +
    `  const listenerText=listener.host ? (listener.host+':'+(listener.port || '-')+(listener.public ? ' (public)' : ' (local)')) : '-';` +
    `  const connectionText=connection.baseUrl ? (connection.baseUrl+' · '+(Array.isArray(connection.recommendedScopes) ? connection.recommendedScopes.join(' + ') : '')) : (connection.guidance || '-');` +
    `  listenerStatusSummary.textContent=listenerText;` +
    `  roleConnectionSummary.textContent=mode+' / '+role;` +
    `  listenerConnectionSummary.textContent=listenerText;` +
    `  clientConnectionSummary.textContent=connectionText || '-';` +
    `}` +
    `function setActiveSurface(surfaceName){` +
    `  surfacePanels.forEach((panel)=>{ panel.hidden=panel.dataset.surface !== surfaceName; });` +
    `  surfaceTabs.forEach((tab)=>{ const active=tab.dataset.surfaceTarget === surfaceName; tab.classList.toggle('active',active); tab.setAttribute('aria-selected', active ? 'true' : 'false'); });` +
    `}` +
    `function inferProviderTemplateKey(model){` +
    `  const explicit=String(model?.provider_template || '').trim();` +
    `  if(explicit && modelProviderTemplates[explicit]){ return explicit; }` +
    `  const api=String(model?.api || model?.api_base_url || '').trim().toLowerCase();` +
    `  const modelInterface=String(model?.interface || model?.protocol || '').trim().toLowerCase();` +
    `  const exactMatch=Object.entries(modelProviderTemplates).find(([,item])=>String(item.api || '').trim().toLowerCase()===api && String(item.interface || '').trim().toLowerCase()===modelInterface);` +
    `  if(exactMatch){ return exactMatch[0]; }` +
    `  if(api.includes('api.anthropic.com/v1/messages') || modelInterface === 'anthropic'){ return 'anthropic'; }` +
    `  if(api.includes('openrouter.ai')){ return 'openrouter'; }` +
    `  if(api.includes('deepseek.com')){ return 'deepseek'; }` +
    `  if(api.includes('siliconflow.cn')){ return 'siliconflow'; }` +
    `  if(api.includes('api.openai.com')){ return 'openai-compatible'; }` +
    `  return '';` +
    `}` +
    `function getProviderTemplateContext(model){` +
    `  const templateKey=inferProviderTemplateKey(model) || defaultProviderTemplateKey;` +
    `  return { templateKey, template:modelProviderTemplates[templateKey] || modelProviderTemplates[defaultProviderTemplateKey] || {} };` +
    `}` +
    `function createDraftModelFromTemplate(templateKey){` +
    `  const resolvedKey=(templateKey && modelProviderTemplates[templateKey]) ? templateKey : defaultProviderTemplateKey;` +
    `  const template=modelProviderTemplates[resolvedKey] || {};` +
    `  return { provider_template:resolvedKey, id:template.suggested_id || '', api:template.api || '', interface:template.interface || 'openai', model:template.default_model || '', thinking:template.default_thinking || 'auto' };` +
    `}` +
    `function getModelIdSuggestionsMarkup(idPrefix){` +
    `  return '<datalist id=\"'+idPrefix+'\">'+knownModelIds.map(modelId=>'<option value=\"'+esc(modelId)+'\"></option>').join('')+'</datalist>';` +
    `}` +
    `function resolvePresetModelId(seed){` +
    `  const source=String(seed || '').trim().toLowerCase();` +
    `  if(!source || !knownModelIds.length){ return seed; }` +
    `  if(knownModelIds.includes(seed)){ return seed; }` +
    `  const ranked=knownModelIds.map((modelId)=>{` +
    `    const target=String(modelId || '').toLowerCase();` +
    `    let score=0;` +
    `    if(target===source){ score+=100; }` +
    `    if(target.includes(source) || source.includes(target)){ score+=40; }` +
    `    source.split(/[^a-z0-9]+/).filter(Boolean).forEach((part)=>{ if(target.includes(part)){ score+=Math.min(part.length * 4, 24); } });` +
    `    return { modelId, score };` +
    `  }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score || a.modelId.localeCompare(b.modelId));` +
    `  return ranked.length ? ranked[0].modelId : seed;` +
    `}` +
    `function getTriggerPatternValidationHint(pattern){` +
    `  if((pattern?.type || 'exact') === 'regex'){` +
    `    return pattern?.pattern ? { level:'ok', message:'regex pattern 已配置' } : { level:'warn', message:'regex 模式需要填写 pattern' };` +
    `  }` +
    `  return Array.isArray(pattern?.keywords) && pattern.keywords.some((keyword)=>String(keyword || '').trim()) ? { level:'ok', message:'exact keywords 已配置' } : { level:'warn', message:'exact 模式至少需要一个 keyword' };` +
    `}` +
    `function getDraftSmartRouterConfig(config){` +
    `  const smart={ ...((config && config.SmartRouter) || {}) };` +
    `  const smartExplicit=config && Object.prototype.hasOwnProperty.call(config,'SmartRouter');` +
    `  const legacyIntentEnabled=Boolean(config?.TriggerRouter?.llm_intent_recognition);` +
    `  const legacyIntentModel=config?.TriggerRouter?.intent_model || '';` +
    `  if(!smart.analysis_scope && config?.TriggerRouter?.analysis_scope){ smart.analysis_scope=config.TriggerRouter.analysis_scope; }` +
    `  if((!Array.isArray(smart.rules) || !smart.rules.length) && Array.isArray(config?.TriggerRouter?.rules)){ smart.rules=config.TriggerRouter.rules; }` +
    `  if(!smart.semantic && (config?.Governance?.semantic || config?.TriggerRouter?.llm_intent_recognition)){ smart.semantic={ ...((config && config.Governance && config.Governance.semantic) || {}) }; if(config?.TriggerRouter?.llm_intent_recognition){ smart.semantic.enabled=true; smart.semantic.mode=smart.semantic.mode || 'classifier'; smart.semantic.classifier_model=smart.semantic.classifier_model || config.TriggerRouter.intent_model || ''; } }` +
    `  if(!smart.sticky && config?.Governance?.sticky){ smart.sticky={ ...(config.Governance.sticky || {}) }; }` +
    `  if(!smartExplicit && !smart.enabled && (config?.TriggerRouter?.enabled || smart.rules?.length || smart.router_model || smart.candidates?.length || smart.semantic || smart.sticky)){ smart.enabled=true; }` +
    `  if(smart.enabled){` +
    `    smart.analysis_scope=smart.analysis_scope || 'last_message';` +
    `    smart.semantic={ ...(smart.semantic || {}) };` +
    `    smart.semantic.enabled=smart.semantic.enabled !== undefined ? smart.semantic.enabled : true;` +
    `    smart.semantic.threshold=smart.semantic.threshold !== undefined ? smart.semantic.threshold : 0.2;` +
    `    if(legacyIntentEnabled){ smart.semantic.mode=smart.semantic.mode || 'classifier'; smart.semantic.classifier_model=smart.semantic.classifier_model || legacyIntentModel; }` +
    `    smart.sticky={ ...(smart.sticky || {}) };` +
    `    smart.sticky.enabled=smart.sticky.enabled !== undefined ? smart.sticky.enabled : true;` +
    `    smart.sticky.alignment={ ...((smart.sticky && smart.sticky.alignment) || {}) };` +
    `    smart.sticky.alignment.enabled=smart.sticky.alignment.enabled !== undefined ? smart.sticky.alignment.enabled : true;` +
    `    smart.sticky.alignment.summarizer_model=smart.sticky.alignment.summarizer_model || smart.router_model || config?.Router?.default || legacyIntentModel || '';` +
    `  }` +
    `  return smart;` +
    `}` +
    `function renderDraftSummary(config){` +
    `  const models=Array.isArray(config?.Models) ? config.Models : [];` +
    `  const smart=getDraftSmartRouterConfig(config);` +
    `  const triggerRules=Array.isArray(smart?.rules) ? smart.rules : [];` +
    `  const patternCount=triggerRules.reduce((sum,rule)=>sum + (Array.isArray(rule.patterns) ? rule.patterns.length : 0),0);` +
    `  const smartCandidates=Array.isArray(smart?.candidates) ? smart.candidates : [];` +
    `  const cascadeLevels=Array.isArray(config?.Governance?.cascade?.levels) ? config.Governance.cascade.levels : [];` +
    `  const modelRefCount=[config?.Router?.default, smart?.router_model, smart?.sticky?.alignment?.summarizer_model, smart?.semantic?.classifier_model, config?.Governance?.shadow?.verifier_model].filter(v=>typeof v === 'string' && v.trim()).length + triggerRules.filter(rule=>rule?.model).length + smartCandidates.filter(item=>item?.model).length + cascadeLevels.reduce((sum,level)=>sum + (level?.from ? 1 : 0) + (level?.to ? 1 : 0), 0);` +
    `  draftSummaryGrid.innerHTML=[` +
    "    ['Models', models.length]," +
    "    ['Routing rules', triggerRules.length]," +
    "    ['Patterns', patternCount]," +
    "    ['Smart candidates', smartCandidates.length]," +
    "    ['Cascade levels', cascadeLevels.length]," +
    "    ['Model refs', modelRefCount]" +
    `  ].map(([label,value])=>'<div class=\"stat\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `}` +
    `function updateStatusSummary(config){` +
    `  const models=Array.isArray(config?.Models) ? config.Models : [];` +
    `  modelCountStatus.textContent=String(models.length);` +
    `  routerDefaultStatus.textContent=config?.Router?.default || '-';` +
    `}` +
    `function renderDraftValidation(errors,warnings,issueReport){` +
    `  const errorList=Array.isArray(errors) ? errors.filter(Boolean) : [];` +
    `  const warningList=Array.isArray(warnings) ? warnings.filter(Boolean) : [];` +
    `  const contractIssues=Array.isArray(issueReport?.issues) ? issueReport.issues : [];` +
    `  if(!errorList.length && !warningList.length && !contractIssues.length){ draftValidationList.innerHTML='<div class="alert info"><strong>No validation issues</strong><div class="muted">当前草稿未发现集中展示的问题</div></div>'; return; }` +
    `  const extractPath=(text)=>{ const match=String(text).match(/^(Models(?:\\[[0-9]+\\])?(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|Router(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|TriggerRouter(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|SmartRouter(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|Governance(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?)/); return match ? match[1] : ''; };` +
    `  const sourceItems=contractIssues.length ? contractIssues.map(item=>({ text:String(item.message || ''), severity:item.severity==='error' ? 'error' : 'warning', path:item.path || '', action:item.action || '' })) : [...errorList.map(item=>({ text:String(item), severity:'error', path:'', action:'' })), ...warningList.map(item=>({ text:String(item), severity:'warning', path:'', action:'' }))];` +
    `  const grouped=sourceItems.reduce((acc,item)=>{` +
    `    const text=item.text;` +
    `    const path=item.path || extractPath(text);` +
    `    const bucket=path.startsWith('Models') || text.startsWith('Models') ? 'Models' : path.startsWith('Router') || text.startsWith('Router') ? 'Router' : path.startsWith('TriggerRouter') || text.startsWith('TriggerRouter') ? 'SmartRouter' : path.startsWith('SmartRouter') || text.startsWith('SmartRouter') ? 'SmartRouter' : (path.startsWith('Governance.sticky') || path.startsWith('Governance.semantic') || text.startsWith('Governance.sticky') || text.startsWith('Governance.semantic')) ? 'SmartRouter' : path.startsWith('Governance') || text.startsWith('Governance') ? 'Governance' : text.startsWith('JSON parse error') ? 'Draft JSON' : 'Other';` +
    `    acc[bucket]=acc[bucket] || [];` +
    `    acc[bucket].push({ text, path, severity:item.severity, action:item.action || '' });` +
    `    return acc;` +
    `  }, {});` +
    `  const errorCount=contractIssues.length ? contractIssues.filter(item=>item.severity==='error').length : errorList.length;` +
    `  const warningCount=contractIssues.length ? contractIssues.filter(item=>item.severity!=='error').length : warningList.length;` +
    `  const summary='<div class="alert info"><div class="row"><strong>Validation summary</strong><span class="pill">'+esc(errorCount)+' errors / '+esc(warningCount)+' warnings</span></div><div class="muted">'+(errorCount ? '请优先修复 errors，再决定是否接受 warnings。' : '当前无阻断错误，可按需处理 warnings。')+'</div></div>';` +
    `  draftValidationList.innerHTML=summary + Object.entries(grouped).map(([bucket,items])=>{ const hasError=items.some(item=>item.severity==='error'); const levelClass=hasError ? 'warn' : 'info'; const actionLabel=hasError ? 'repair first' : 'review before save'; return '<div class="alert '+levelClass+'"><div class="row"><strong>'+esc(bucket)+'</strong><span class="pill">'+esc(items.length)+' issues</span></div><div class="muted">'+esc(actionLabel)+'</div><div>'+items.slice(0,4).map(item=>'<div>'+(item.path ? ('<button type="button" class="pill" data-validation-path=\"'+esc(item.path)+'\">'+esc(item.path)+'</button> ') : '')+'<span class=\"pill\">'+esc(item.severity==='error' ? 'error' : 'warning')+'</span> '+esc(item.text)+(item.action ? ('<div class=\"muted\">Action: '+esc(item.action)+'</div>') : '')+'</div>').join('')+'</div></div>'; }).join('');` +
    `}` +
    `function getCapabilityWarningActionLabel(code){` +
    `  if(code==='thinking_ignored'){ return '移除 thinking'; }` +
    `  if(code==='tools_text_fallback' || code==='images_text_fallback'){ return '恢复默认 capability'; }` +
    `  return '';` +
    `}` +
    `function renderCapabilityWarnings(report){` +
    `  const entries=Array.isArray(report?.entries) ? report.entries : [];` +
    `  if(!entries.length){ capabilityWarningsList.innerHTML='<div class="alert info"><strong>No capability warnings</strong><div class="muted">当前 compiled models 未发现需要额外提示的能力降级</div></div>'; return; }` +
    `  const summary=report?.summary || {};` +
    `  capabilityWarningsList.innerHTML='<div class="alert info"><strong>Capability warning summary</strong><div class="muted">warn '+esc(summary.warn ?? 0)+' / info '+esc(summary.info ?? 0)+' / total '+esc(summary.total ?? entries.length)+'</div></div>' + entries.map(item=>{ const actionLabel=getCapabilityWarningActionLabel(item.code); return '<div class="alert '+esc(item.level === 'warn' ? 'warn' : 'info')+'"><div class="row"><strong>'+esc(item.code || item.level || 'warning')+'</strong><span class="pill">'+esc(item.modelId || '-').trim()+'</span></div><div>'+(item.path ? ('<button type="button" class="pill" data-validation-path=\"'+esc(item.path)+'\">'+esc(item.path)+'</button> ') : '')+esc(item.message || '')+'</div>'+(actionLabel ? ('<div class=\"row\" style=\"margin-top:.5rem\"><button type=\"button\" data-apply-warning-path=\"'+esc(item.path || '')+'\" data-apply-warning-code=\"'+esc(item.code || '')+'\">'+esc(actionLabel)+'</button></div>') : '')+'</div>'; }).join('');` +
    `}` +
    `function findValidationTarget(path){` +
    `  if(!path){ return null; }` +
    `  if(path.startsWith('Models')){ return modelsFormGrid; }` +
    `  if(path === 'Router.default'){ return draftRouterDefault; }` +
    `  if(path.startsWith('TriggerRouter.intent_model')){ return triggerIntentModel; }` +
    `  if(path.startsWith('TriggerRouter.rules[')){ return triggerRulesList; }` +
    `  if(path.startsWith('SmartRouter.router_model')){ return smartRouterModel; }` +
    `  if(path.startsWith('SmartRouter.candidates[')){ return smartCandidatesList; }` +
    `  if(path.startsWith('Governance.cascade.levels[')){ return governanceCascadeLevelsList; }` +
    `  if(path.startsWith('Governance.sticky.alignment')){ return governanceSummarizerModel; }` +
    `  if(path.startsWith('Governance.semantic')){ return governanceClassifierModel; }` +
    `  if(path.startsWith('Governance.shadow')){ return governanceVerifierModel; }` +
    `  if(path.startsWith('Governance')){ return governanceEnabled; }` +
    `  return null;` +
    `}` +
    `function jumpToValidationPath(path){` +
    `  const target=findValidationTarget(path);` +
    `  if(!target || typeof target.scrollIntoView !== 'function'){ return; }` +
    `  if(activeValidationHighlight && activeValidationHighlight.classList){ activeValidationHighlight.classList.remove('jump-highlight'); }` +
    `  target.scrollIntoView({ behavior:'smooth', block:'center' });` +
    `  if(target.classList){ target.classList.add('jump-highlight'); activeValidationHighlight=target; setTimeout(()=>{ if(target.classList){ target.classList.remove('jump-highlight'); if(activeValidationHighlight===target){ activeValidationHighlight=null; } } }, 1800); }` +
    `  if(typeof target.focus === 'function'){ target.focus({ preventScroll:true }); }` +
    `}` +
    `function renderDraftPresetModeHint(){` +
    `  const overwriteMode=draftPresetMode.value === 'replace';` +
    `  draftPresetModeHint.textContent=overwriteMode ? 'overwrite 会重置 SmartRouter / Governance 相关表单，再应用预设' : 'append / merge 会尽量保留当前草稿，仅补充 SmartRouter / Governance 相关字段';` +
    `}` +
    `function deriveActualAffectedAreas(preview){` +
    `  const areas=new Set();` +
    `  const diff=preview?.diff || {};` +
    `  const impact=preview?.referenceImpact || {};` +
    `  if((diff.providerChanges || []).length || (diff.modelChanges || []).length){ areas.add('Models'); }` +
    `  (impact.entries || []).forEach((entry)=>{` +
    `    const path=String(entry.path || '');` +
    `    if(path.startsWith('Router.')){ areas.add('Router'); }` +
    `    else if(path.startsWith('TriggerRouter.')){ areas.add('SmartRouter'); }` +
    `    else if(path.startsWith('SmartRouter.')){ areas.add('SmartRouter'); }` +
    `    else if(path.startsWith('Governance.sticky') || path.startsWith('Governance.semantic')){ areas.add('SmartRouter'); }` +
    `    else if(path.startsWith('Governance.')){ areas.add('Governance'); }` +
    `  });` +
    `  return Array.from(areas);` +
    `}` +
    `function renderDraftPreviewMeta(meta){` +
    `  if(!meta){ draftPreviewMeta.innerHTML='<div class="alert info"><strong>Draft preview mode</strong><div class="muted">当前显示为草稿编辑视图，预设 dry-run 会在这里提示影响范围。</div></div>'; return; }` +
    `  draftPreviewMeta.innerHTML='<div class="alert info"><strong>'+esc(meta.title || 'Preset dry-run')+'</strong><div>'+esc(meta.description || '')+'</div><div class="muted">模式：'+esc(meta.mode || '-')+' · 预设声明影响范围：'+esc((meta.affects || []).join(' / ') || '-')+'</div><div class="muted">实际预览命中区域：'+esc((meta.actualAffects || []).join(' / ') || '-')+'</div></div>';` +
    `}` +
    `function renderDraftPresetGuide(){` +
    `  draftPresetList.innerHTML=Object.entries(draftPresets).map(([key,preset])=>'<div class="alert info"><strong>'+esc(preset.label || key)+'</strong><div>'+esc(preset.description || '')+'</div><div class="muted">影响范围：'+esc((preset.affects || []).join(' / '))+'</div></div>').join('');` +
    `}` +
    `function updateTopLevelModelSuggestionLists(){` +
    `  const markup=knownModelIds.map(modelId=>'<option value=\"'+esc(modelId)+'\"></option>').join('');` +
    `  [topLevelTriggerIntentSuggestions,topLevelSmartRouterSuggestions,topLevelGovernanceSummarizerSuggestions,topLevelGovernanceClassifierSuggestions,topLevelGovernanceVerifierSuggestions].forEach(node=>{ if(node){ node.innerHTML=markup; } });` +
    `}` +
    `function renderModelsForm(models){` +
    `  const list=Array.isArray(models) ? models : [];` +
    `  draftModelsCount.value=String(list.length);` +
    `  if(!list.length){ modelsFormGrid.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No draft models loaded yet</span></div>'; return; }` +
    `  modelsFormGrid.innerHTML=list.map((model,index)=>{ const templateContext=getProviderTemplateContext(model); const template=templateContext.template; return '<div class="model-card" data-model-card=\"'+index+'\">' +` +
    `    '<div class="model-card-header"><strong>Model #'+(index+1)+'</strong><button type="button" data-remove-model=\"'+index+'\">删除</button></div>' +` +
    `    '<div class="model-card-grid">' +` +
    `      '<div><label>Provider template</label><div class="row"><select data-field=\"provider_template\" data-index=\"'+index+'\"><option value=\"\">custom</option>'+Object.entries(modelProviderTemplates).map(([key,item])=>'<option value=\"'+esc(key)+'\"'+(model.provider_template === key ? ' selected' : '')+'>'+esc(item.label)+'</option>').join('')+'</select><button type="button" data-apply-template=\"'+index+'\">应用</button></div></div>' +` +
    `      '<div><label>ID</label><input data-field=\"id\" data-index=\"'+index+'\" value=\"'+esc(model.id || '')+'\" placeholder=\"'+esc(template.suggested_id || 'sonnet')+'\"><div class="muted">Router.default 和路由规则引用这个 model id；建议模板：'+esc(template.label || templateContext.templateKey || 'custom')+'</div></div>' +` +
    `      '<div><label>Interface</label><select data-field=\"interface\" data-index=\"'+index+'\"><option value=\"openai\"'+(((model.interface || model.protocol || 'openai') === 'openai') ? ' selected' : '')+'>openai</option><option value=\"anthropic\"'+(((model.interface || model.protocol) === 'anthropic') ? ' selected' : '')+'>anthropic</option></select><div class="muted">新配置使用 interface；旧 protocol 会自动读取为兼容值。</div></div>' +` +
    `      '<div><label>Model</label><input data-field=\"model\" data-index=\"'+index+'\" list=\"modelSuggestions'+index+'\" value=\"'+esc(model.model || '')+'\" placeholder=\"'+esc(template.default_model || 'anthropic/claude-sonnet-4')+'\"><datalist id=\"modelSuggestions'+index+'\">'+((template.model_examples || []).map(item=>'<option value=\"'+esc(item)+'\"></option>').join(''))+'</datalist><div class="muted">上游真实模型名，例如：'+esc((template.model_examples || ['anthropic/claude-sonnet-4']).join(' / '))+'</div></div>' +` +
    `      '<div><label>API</label><input data-field=\"api\" data-index=\"'+index+'\" value=\"'+esc(model.api || model.api_base_url || '')+'\" placeholder=\"'+esc(template.api || 'https://...')+'\"><div class="muted">新配置使用 api；旧 api_base_url 仅用于兼容读取。</div></div>' +` +
    `      '<div><label>Key</label><input data-field=\"key\" data-index=\"'+index+'\" value=\"'+esc(model.key || model.api_key || '')+'\" placeholder=\"'+esc(template.key_placeholder || 'sk-...')+'\"><div class="muted">新配置使用 key；旧 api_key 仅用于兼容读取。</div></div>' +` +
    `      '<div><label>Thinking</label><select data-field=\"thinking_profile\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"off\"'+(((model.thinking === 'off') || model.thinking?.mode === 'off') ? ' selected' : '')+'>off</option><option value=\"auto\"'+(((model.thinking === 'auto') || model.thinking?.mode === 'auto') ? ' selected' : '')+'>auto</option><option value=\"on\"'+(((model.thinking === 'on') || (model.thinking?.mode === 'on' && !model.thinking?.effort)) ? ' selected' : '')+'>on</option><option value=\"low\"'+(((model.thinking === 'low') || (model.thinking?.mode === 'on' && model.thinking?.effort === 'low' && !model.thinking?.budget_tokens)) ? ' selected' : '')+'>low</option><option value=\"medium\"'+(((model.thinking === 'medium') || (model.thinking?.mode === 'on' && model.thinking?.effort === 'medium' && !model.thinking?.budget_tokens)) ? ' selected' : '')+'>medium</option><option value=\"high\"'+(((model.thinking === 'high') || (model.thinking?.mode === 'on' && model.thinking?.effort === 'high' && !model.thinking?.budget_tokens)) ? ' selected' : '')+'>high</option><option value=\"custom\"'+(((typeof model.thinking === 'object') && model.thinking && model.thinking.budget_tokens) ? ' selected' : '')+'>custom</option></select></div>' +` +
    `      '<div><label>Thinking mode</label><select data-field=\"thinking_mode\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"off\"'+(model.thinking?.mode === 'off' ? ' selected' : '')+'>off</option><option value=\"auto\"'+(model.thinking?.mode === 'auto' ? ' selected' : '')+'>auto</option><option value=\"on\"'+(model.thinking?.mode === 'on' ? ' selected' : '')+'>on</option></select></div>' +` +
    `      '<div><label>Thinking effort</label><select data-field=\"thinking_effort\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"low\"'+(model.thinking?.effort === 'low' ? ' selected' : '')+'>low</option><option value=\"medium\"'+(model.thinking?.effort === 'medium' ? ' selected' : '')+'>medium</option><option value=\"high\"'+(model.thinking?.effort === 'high' ? ' selected' : '')+'>high</option></select></div>' +` +
    `      '<div><label>Thinking budget</label><input data-field=\"thinking_budget_tokens\" data-index=\"'+index+'\" value=\"'+esc(model.thinking?.budget_tokens || '')+'\" placeholder=\"1024\"></div>' +` +
    `      '<div><label>Vendor hint</label><input data-field=\"vendor_hint\" data-index=\"'+index+'\" value=\"'+esc(model.metadata?.vendor_hint || '')+'\" placeholder=\"'+esc(template.vendor_hint || 'openrouter')+'\"></div>' +` +
    `      '<div><label>Context window</label><input data-field=\"context_window_tokens\" data-index=\"'+index+'\" value=\"'+esc(model.metadata?.context_window_tokens || '')+'\" placeholder=\"200000\"></div>' +` +
    `      '<div><label>Safe input</label><input data-field=\"safe_input_tokens\" data-index=\"'+index+'\" value=\"'+esc(model.metadata?.safe_input_tokens || '')+'\" placeholder=\"180000\"></div>' +` +
    `      '<div><label>Reasoning support</label><select data-field=\"supports_reasoning\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"true\"'+(model.metadata?.supports_reasoning === true ? ' selected' : '')+'>supported</option><option value=\"false\"'+(model.metadata?.supports_reasoning === false ? ' selected' : '')+'>disabled</option></select></div>' +` +
    `      '<div><label>Tool support</label><select data-field=\"supports_tools\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"true\"'+(model.metadata?.supports_tools === true ? ' selected' : '')+'>supported</option><option value=\"false\"'+(model.metadata?.supports_tools === false ? ' selected' : '')+'>disabled</option></select></div>' +` +
    `      '<div><label>Image support</label><select data-field=\"supports_images\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"true\"'+(model.metadata?.supports_images === true ? ' selected' : '')+'>supported</option><option value=\"false\"'+(model.metadata?.supports_images === false ? ' selected' : '')+'>disabled</option></select></div>' +` +
    `      '<div style=\"grid-column:1/-1\"><label>Metadata (advanced JSON)</label><textarea data-field=\"metadata\" data-index=\"'+index+'\" placeholder=\"{\\\"label\\\":\\\"Balanced profile\\\"}\">'+esc(model.metadata ? JSON.stringify(model.metadata, null, 2) : '')+'</textarea><div class="muted">普通 capability 建议优先使用上面的显式字段；这里保留给高级扩展元数据。</div></div>' +` +
    `    '</div>' +` +
    `  '</div>'; }).join('');` +
    `}` +
    `function extractModelsFromForm(){` +
    `  const cards=Array.from(modelsFormGrid.querySelectorAll('[data-model-card]'));` +
    `  return cards.map((card,index)=>{` +
    `    const read=(field)=>card.querySelector('[data-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
    `    const providerTemplate=(read('provider_template')?.value || '').trim();` +
    `    const metadataRaw=(read('metadata')?.value || '').trim();` +
    `    let metadata;` +
    `    if(metadataRaw){ metadata=JSON.parse(metadataRaw); } else { metadata={}; }` +
    `    const thinkingProfile=(read('thinking_profile')?.value || '').trim();` +
    `    const vendorHint=(read('vendor_hint')?.value || '').trim();` +
    `    const contextWindowTokens=(read('context_window_tokens')?.value || '').trim();` +
    `    const safeInputTokens=(read('safe_input_tokens')?.value || '').trim();` +
    `    const supportsReasoning=(read('supports_reasoning')?.value || '').trim();` +
    `    const supportsTools=(read('supports_tools')?.value || '').trim();` +
    `    const supportsImages=(read('supports_images')?.value || '').trim();` +
    `    const thinking={};` +
    `    const mode=(read('thinking_mode')?.value || '').trim();` +
    `    const effort=(read('thinking_effort')?.value || '').trim();` +
    `    const budget=(read('thinking_budget_tokens')?.value || '').trim();` +
    `    if(mode) thinking.mode=mode;` +
    `    if(effort) thinking.effort=effort;` +
    `    if(budget) thinking.budget_tokens=Number(budget);` +
    `    const model={` +
    `      id:(read('id')?.value || '').trim(),` +
    `      api:(read('api')?.value || '').trim(),` +
    `      key:(read('key')?.value || '').trim(),` +
    `      interface:(read('interface')?.value || '').trim(),` +
    `      model:(read('model')?.value || '').trim(),` +
    `    };` +
    `    if(vendorHint){ metadata.vendor_hint=vendorHint; } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'vendor_hint')){ delete metadata.vendor_hint; }` +
    `    if(contextWindowTokens){ metadata.context_window_tokens=Number(contextWindowTokens); } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'context_window_tokens')){ delete metadata.context_window_tokens; }` +
    `    if(safeInputTokens){ metadata.safe_input_tokens=Number(safeInputTokens); } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'safe_input_tokens')){ delete metadata.safe_input_tokens; }` +
    `    if(supportsReasoning){ metadata.supports_reasoning=supportsReasoning === 'true'; } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'supports_reasoning')){ delete metadata.supports_reasoning; }` +
    `    if(supportsTools){ metadata.supports_tools=supportsTools === 'true'; } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'supports_tools')){ delete metadata.supports_tools; }` +
    `    if(supportsImages){ metadata.supports_images=supportsImages === 'true'; } else if(metadata && Object.prototype.hasOwnProperty.call(metadata,'supports_images')){ delete metadata.supports_images; }` +
    `    if(providerTemplate){ model.provider_template=providerTemplate; }` +
    `    if(thinkingProfile && thinkingProfile !== 'custom'){ model.thinking=thinkingProfile; } else if(Object.keys(thinking).length){ model.thinking=thinking; }` +
    `    if(metadata !== undefined && Object.keys(metadata).length){ model.metadata=metadata; }` +
    `    return model;` +
    `  });` +
    `}` +
    `function applyProviderTemplate(index){` +
    `  const card=modelsFormGrid.querySelector('[data-model-card=\"'+index+'\"]');` +
    `  if(!card){ return; }` +
    `  const templateKey=(card.querySelector('[data-field=\"provider_template\"][data-index=\"'+index+'\"]')?.value || '').trim();` +
    `  const template=modelProviderTemplates[templateKey];` +
    `  if(!template){ return; }` +
    `  const modelInterface=card.querySelector('[data-field=\"interface\"][data-index=\"'+index+'\"]');` +
    `  const apiBaseUrl=card.querySelector('[data-field=\"api\"][data-index=\"'+index+'\"]');` +
    `  const modelInput=card.querySelector('[data-field=\"model\"][data-index=\"'+index+'\"]');` +
    `  if(modelInterface){ modelInterface.value=template.interface || template.protocol; }` +
    `  if(apiBaseUrl && !apiBaseUrl.value.trim()){ apiBaseUrl.value=template.api || template.api_base_url; } else if(apiBaseUrl){ apiBaseUrl.value=template.api || template.api_base_url; }` +
    `  if(modelInput){ modelInput.placeholder=template.default_model || modelInput.placeholder; if(!modelInput.value.trim() && template.default_model){ modelInput.value=template.default_model; } }` +
    `  const modelIdInput=card.querySelector('[data-field=\"id\"][data-index=\"'+index+'\"]');` +
    `  if(modelIdInput){ modelIdInput.placeholder=template.suggested_id || modelIdInput.placeholder; if(!modelIdInput.value.trim() && template.suggested_id){ modelIdInput.value=template.suggested_id; } }` +
    `  const keyInput=card.querySelector('[data-field=\"key\"][data-index=\"'+index+'\"]');` +
    `  if(keyInput && template.key_placeholder){ keyInput.placeholder=template.key_placeholder; }` +
    `  const vendorHintInput=card.querySelector('[data-field=\"vendor_hint\"][data-index=\"'+index+'\"]');` +
    `  if(vendorHintInput && template.vendor_hint){ vendorHintInput.placeholder=template.vendor_hint; }` +
    `  const thinkingProfile=card.querySelector('[data-field=\"thinking_profile\"][data-index=\"'+index+'\"]');` +
    `  if(thinkingProfile && !thinkingProfile.value && template.default_thinking){ thinkingProfile.value=template.default_thinking; }` +
    `  const nextModels=extractModelsFromForm();` +
    `  if(nextModels[index]){ nextModels[index]={ ...nextModels[index], provider_template: templateKey }; }` +
    `  renderModelsForm(nextModels);` +
    `}` +
    `function renderTriggerRulesList(rules){` +
    `  const list=Array.isArray(rules) ? rules : [];` +
    `  if(!list.length){ triggerRulesList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No routing rules yet</span></div>'; return; }` +
    `  triggerRulesList.innerHTML=list.map((rule,index)=>'<div class="list-item" data-trigger-rule=\"'+index+'\">' +` +
    `    '<div class="action-row"><strong>Rule #'+(index+1)+'</strong><button type="button" data-remove-trigger-rule=\"'+index+'\">删除</button></div>' +` +
    `    '<div class="list-item-grid">' +` +
    `      '<div><label>Name</label><input data-trigger-field=\"name\" data-index=\"'+index+'\" value=\"'+esc(rule.name || '')+'\"></div>' +` +
    `      '<div><label>Model</label><input data-trigger-field=\"model\" data-index=\"'+index+'\" list=\"triggerModelSuggestions'+index+'\" value=\"'+esc(rule.model || '')+'\">'+getModelIdSuggestionsMarkup('triggerModelSuggestions'+index)+'</div>' +` +
    `      '<div><label>Priority</label><input data-trigger-field=\"priority\" data-index=\"'+index+'\" value=\"'+esc(rule.priority ?? 10)+'\"></div>' +` +
    `      '<div><label><input type=\"checkbox\" data-trigger-field=\"enabled\" data-index=\"'+index+'\"'+(rule.enabled === false ? '' : ' checked')+'> Enabled</label></div>' +` +
    `      '<div style=\"grid-column:1/-1\"><label>Description</label><input data-trigger-field=\"description\" data-index=\"'+index+'\" value=\"'+esc(rule.description || '')+'\"></div>' +` +
    `    '</div>' +` +
    `    '<div class=\"action-row\" style=\"margin-top:.75rem\"><strong>Patterns</strong><button type=\"button\" data-add-trigger-pattern=\"'+index+'\">新增 Pattern</button></div>' +` +
    `    '<div class=\"list-editor\">'+(((rule.patterns || []).length ? rule.patterns : [{ type:'exact', keywords:[] }]).map((pattern,patternIndex)=>'<div class=\"list-item\" data-trigger-pattern=\"'+index+'-'+patternIndex+'\">' +` +
    `      '<div class=\"action-row\"><span class=\"muted\">Pattern #'+(patternIndex+1)+'</span><span class=\"pill\">'+esc(pattern.type || 'exact')+'</span><span class=\"muted\">'+esc(getTriggerPatternValidationHint(pattern).message)+'</span><button type=\"button\" data-remove-trigger-pattern=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\">删除</button></div>' +` +
    `      '<div class=\"list-item-grid\">' +` +
    `        '<div><label>Type</label><select data-trigger-pattern-field=\"type\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"><option value=\"exact\"'+(pattern.type !== 'regex' ? ' selected' : '')+'>exact</option><option value=\"regex\"'+(pattern.type === 'regex' ? ' selected' : '')+'>regex</option></select></div>' +` +
    `        '<div><label><input type=\"checkbox\" data-trigger-pattern-field=\"caseSensitive\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"'+(pattern.caseSensitive ? ' checked' : '')+'> Case sensitive</label></div>' +` +
    `        '<div style=\"grid-column:1/-1\"><div class=\"action-row\"><label>Keywords</label><button type=\"button\" data-add-trigger-keyword=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"'+(pattern.type === 'regex' ? ' disabled' : '')+'>新增 Keyword</button></div><div class=\"list-editor\">'+((((pattern.keywords || []).length ? pattern.keywords : ['']).map((keyword,keywordIndex)=>'<div class=\"list-item\" data-trigger-keyword=\"'+index+'-'+patternIndex+'-'+keywordIndex+'\"><div class=\"action-row\"><span class=\"muted\">Keyword #'+(keywordIndex+1)+'</span><button type=\"button\" data-remove-trigger-keyword=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" data-keyword-index=\"'+keywordIndex+'\"'+(pattern.type === 'regex' ? ' disabled' : '')+'>删除</button></div><input data-trigger-pattern-field=\"keyword_item\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" data-keyword-index=\"'+keywordIndex+'\" value=\"'+esc(keyword || '')+'\" placeholder=\"keyword\"'+(pattern.type === 'regex' ? ' disabled' : '')+'></div>')).join(''))+'</div><div class=\"muted\">'+(pattern.type === 'regex' ? 'regex 模式下忽略 keywords' : 'exact 模式下按关键词列表匹配')+'</div></div>' +` +
    `        '<div style=\"grid-column:1/-1\"><label>Regex pattern</label><input data-trigger-pattern-field=\"pattern\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" value=\"'+esc(pattern.pattern || '')+'\" placeholder=\"error|exception\"'+(pattern.type === 'regex' ? '' : ' disabled')+'><div class=\"muted\">'+(pattern.type === 'regex' ? 'regex 模式下使用正则表达式匹配' : 'exact 模式下忽略 regex pattern')+'</div></div>' +` +
    `      '</div>' +` +
    `    '</div>').join(''))+'</div>' +` +
    `  '</div>').join('');` +
    `}` +
    `function extractTriggerRulesFromForm(){` +
    `  return Array.from(triggerRulesList.querySelectorAll('[data-trigger-rule]')).map((card,index)=>{` +
    `    const read=(field)=>card.querySelector('[data-trigger-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
    `    const patterns=Array.from(card.querySelectorAll('[data-trigger-pattern]')).map((patternCard,patternIndex)=>{` +
    `      const patternRead=(field)=>patternCard.querySelector('[data-trigger-pattern-field=\"'+field+'\"][data-index=\"'+index+'\"][data-pattern-index=\"'+patternIndex+'\"]');` +
    `      const type=(patternRead('type')?.value || 'exact').trim();` +
    `      const pattern={ type, caseSensitive:Boolean(patternRead('caseSensitive')?.checked) };` +
    `      const keywords=Array.from(patternCard.querySelectorAll('[data-trigger-pattern-field=\"keyword_item\"][data-index=\"'+index+'\"][data-pattern-index=\"'+patternIndex+'\"]')).map((node)=>node.value.trim()).filter(Boolean);` +
    `      const regexPattern=(patternRead('pattern')?.value || '').trim();` +
    `      if(type === 'regex'){ if(regexPattern){ pattern.pattern=regexPattern; } } else if(keywords.length){ pattern.keywords=keywords; }` +
    `      return pattern;` +
    `    });` +
    `    const rule={ name:(read('name')?.value || '').trim(), model:(read('model')?.value || '').trim(), priority:Number(read('priority')?.value || 10), enabled:Boolean(read('enabled')?.checked), patterns };` +
    `    const description=(read('description')?.value || '').trim(); if(description){ rule.description=description; } return rule;` +
    `  });` +
    `}` +
    `function renderSmartCandidatesList(candidates){` +
    `  const list=Array.isArray(candidates) ? candidates : [];` +
    `  if(!list.length){ smartCandidatesList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No smart candidates yet</span></div>'; return; }` +
    `  smartCandidatesList.innerHTML=list.map((candidate,index)=>'<div class="list-item" data-smart-candidate=\"'+index+'\">' +` +
    `    '<div class="action-row"><strong>Candidate #'+(index+1)+'</strong><button type="button" data-remove-smart-candidate=\"'+index+'\">删除</button></div>' +` +
    `    '<div class="list-item-grid">' +` +
    `      '<div><label>Model</label><input data-smart-field=\"model\" data-index=\"'+index+'\" list=\"smartModelSuggestions'+index+'\" value=\"'+esc(candidate.model || '')+'\">'+getModelIdSuggestionsMarkup('smartModelSuggestions'+index)+'</div>' +` +
    `      '<div style=\"grid-column:1/-1\"><label>Description</label><input data-smart-field=\"description\" data-index=\"'+index+'\" value=\"'+esc(candidate.description || '')+'\"></div>' +` +
    `    '</div>' +` +
    `  '</div>').join('');` +
    `}` +
    `function extractSmartCandidatesFromForm(){` +
    `  return Array.from(smartCandidatesList.querySelectorAll('[data-smart-candidate]')).map((card,index)=>{` +
    `    const read=(field)=>card.querySelector('[data-smart-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
    `    return { model:(read('model')?.value || '').trim(), description:(read('description')?.value || '').trim() };` +
    `  });` +
    `}` +
    `function renderCascadeLevelsList(levels){` +
    `  const list=Array.isArray(levels) ? levels : [];` +
    `  if(!list.length){ governanceCascadeLevelsList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No cascade levels yet</span></div>'; return; }` +
    `  governanceCascadeLevelsList.innerHTML=list.map((level,index)=>'<div class="list-item" data-cascade-level=\"'+index+'\">' +` +
    `    '<div class="action-row"><strong>Level #'+(index+1)+'</strong><button type="button" data-remove-cascade-level=\"'+index+'\">删除</button></div>' +` +
    `    '<div class="list-item-grid">' +` +
    `      '<div><label>From</label><input data-cascade-field=\"from\" data-index=\"'+index+'\" list=\"cascadeFromSuggestions'+index+'\" value=\"'+esc(level.from || '')+'\">'+getModelIdSuggestionsMarkup('cascadeFromSuggestions'+index)+'</div>' +` +
    `      '<div><label>To</label><input data-cascade-field=\"to\" data-index=\"'+index+'\" list=\"cascadeToSuggestions'+index+'\" value=\"'+esc(level.to || '')+'\">'+getModelIdSuggestionsMarkup('cascadeToSuggestions'+index)+'</div>' +` +
    `      '<div style=\"grid-column:1/-1\"><label>Reason</label><input data-cascade-field=\"reason\" data-index=\"'+index+'\" value=\"'+esc(level.reason || '')+'\"></div>' +` +
    `    '</div>' +` +
    `  '</div>').join('');` +
    `}` +
    `function extractCascadeLevelsFromForm(){` +
    `  return Array.from(governanceCascadeLevelsList.querySelectorAll('[data-cascade-level]')).map((card,index)=>{` +
    `    const read=(field)=>card.querySelector('[data-cascade-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
    `    const level={ from:(read('from')?.value || '').trim(), to:(read('to')?.value || '').trim() };` +
    `    const reason=(read('reason')?.value || '').trim(); if(reason){ level.reason=reason; } return level;` +
    `  });` +
    `}` +
    `function buildDraftPayloadFromForm(){` +
      `  const payload=JSON.parse(JSON.stringify(currentDraftConfig || {}));` +
      `  payload.Models=extractModelsFromForm();` +
      `  const routerDefault=(draftRouterDefault.value || '').trim();` +
      `  if(routerDefault){ payload.Router={ ...(payload.Router || {}), default: routerDefault }; }` +
      `  else if(payload.Router){ delete payload.Router.default; if(!Object.keys(payload.Router).length){ delete payload.Router; } }` +
    `  const triggerRules=extractTriggerRulesFromForm();` +
    `  const smartCandidates=extractSmartCandidatesFromForm();` +
    `  const smartRouterEnabled=Boolean(smartEnabled.checked || triggerEnabled.checked || triggerIntentEnabled.checked || triggerIntentModel.value.trim() || triggerRules.length || smartRouterModel.value.trim() || smartCandidates.length || smartCacheTtl.value.trim() || smartMaxTokens.value.trim() || governanceAlignmentEnabled.checked || governanceSummarizerModel.value.trim() || governanceSemanticEnabled.checked || governanceClassifierModel.value.trim());` +
    `  if(smartRouterEnabled){ payload.SmartRouter={ ...(payload.SmartRouter || {}), enabled: true, analysis_scope: triggerAnalysisScope.value || payload.SmartRouter?.analysis_scope || 'last_message', router_model: smartRouterModel.value.trim(), fallback: smartFallback.value || 'default', candidates: smartCandidates, cache_ttl: smartCacheTtl.value.trim() ? Number(smartCacheTtl.value.trim()) : undefined, max_tokens: smartMaxTokens.value.trim() ? Number(smartMaxTokens.value.trim()) : undefined, rules: triggerRules, semantic:(governanceSemanticEnabled.checked || triggerIntentEnabled.checked || governanceClassifierModel.value.trim() || triggerIntentModel.value.trim()) ? { ...(((payload.SmartRouter || {}).semantic) || {}), enabled:Boolean(governanceSemanticEnabled.checked || triggerIntentEnabled.checked), mode:'classifier', classifier_model: governanceClassifierModel.value.trim() || triggerIntentModel.value.trim() } : undefined, sticky:(governanceAlignmentEnabled.checked || governanceSummarizerModel.value.trim()) ? { ...(((payload.SmartRouter || {}).sticky) || {}), enabled:true, alignment:{ ...((((payload.SmartRouter || {}).sticky || {}).alignment) || {}), enabled:Boolean(governanceAlignmentEnabled.checked), summarizer_model: governanceSummarizerModel.value.trim() } } : undefined }; } else { delete payload.SmartRouter; }` +
    `  delete payload.TriggerRouter;` +
    `  const cascadeLevels=extractCascadeLevelsFromForm();` +
    `  if(governanceEnabled.checked || governanceShadowEnabled.checked || governanceVerifierModel.value.trim() || cascadeLevels.length){ payload.Governance={ ...(payload.Governance || {}), enabled: governanceEnabled.checked, shadow:{ ...((payload.Governance && payload.Governance.shadow) || {}), enabled: governanceShadowEnabled.checked, verifier_model: governanceVerifierModel.value.trim() }, cascade:{ ...((payload.Governance && payload.Governance.cascade) || {}), enabled: Boolean(cascadeLevels.length), levels: cascadeLevels } }; } else { delete payload.Governance; }` +
    `  return payload;` +
    `}` +
    `function renderConfigControlForms(config){` +
    `  const smart=getDraftSmartRouterConfig(config);` +
    `  const trigger=config?.TriggerRouter || {};` +
    `  triggerEnabled.checked=Boolean(smart.enabled);` +
    `  triggerIntentEnabled.checked=Boolean(smart.semantic?.enabled && smart.semantic?.mode === 'classifier');` +
    `  triggerAnalysisScope.value=smart.analysis_scope || 'last_message';` +
    `  triggerIntentModel.value=smart.semantic?.classifier_model || trigger.intent_model || '';` +
    `  renderTriggerRulesList(smart.rules || trigger.rules || []);` +
    `  smartEnabled.checked=Boolean(smart.enabled);` +
    `  smartRouterModel.value=smart.router_model || '';` +
    `  smartFallback.value=smart.fallback || 'default';` +
    `  smartCacheTtl.value=smart.cache_ttl ?? '';` +
    `  smartMaxTokens.value=smart.max_tokens ?? '';` +
    `  renderSmartCandidatesList(smart.candidates || []);` +
    `  const governance=config?.Governance || {};` +
    `  governanceEnabled.checked=Boolean(governance.enabled);` +
    `  governanceAlignmentEnabled.checked=Boolean(smart.sticky?.alignment?.enabled);` +
    `  governanceSummarizerModel.value=smart.sticky?.alignment?.summarizer_model || '';` +
    `  governanceSemanticEnabled.checked=Boolean(smart.semantic?.enabled);` +
    `  governanceClassifierModel.value=smart.semantic?.classifier_model || '';` +
    `  governanceShadowEnabled.checked=Boolean(governance.shadow?.enabled);` +
    `  governanceVerifierModel.value=governance.shadow?.verifier_model || '';` +
    `  renderCascadeLevelsList(governance.cascade?.levels || []);` +
    `}` +
    `function syncDraftEditorFromForm(){` +
    `  try {` +
    `    const payload=buildDraftPayloadFromForm();` +
    `    currentDraftConfig=payload;` +
    `    configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `    renderDraftSummary(payload);` +
    `    renderDraftValidation([],[]);` +
    `    renderCapabilityWarnings();` +
    `    renderRouterSlotExplanation(withDraftCompiledData(payload));` +
    `    renderContextWindowGuide(withDraftCompiledData(payload));` +
    `    renderDraftPreviewMeta();` +
    `    draftPreviewStatus.textContent='已同步 Models 表单到 JSON 草稿';` +
    `  } catch (error) {` +
    `    draftPreviewStatus.textContent='同步失败：'+error.message;` +
    `  }` +
    `}` +
    `function applyReferenceSuggestion(path,modelId){` +
    `  if(!modelId){ return; }` +
    `  if(path==='Router.default'){ draftRouterDefault.value=modelId; syncDraftEditorFromForm(); draftPreviewStatus.textContent='已将建议模型应用到 Router.default'; return; }` +
    `  const payload=JSON.parse(JSON.stringify(currentDraftConfig || {}));` +
    `  const pathMatch=path.match(/^([^.\[]+)(?:\.(.+))?$/);` +
    `  if(!pathMatch){ draftPreviewStatus.textContent='暂不支持自动修复：'+path; return; }` +
    `  const tokens=path.replace(/\[(\d+)\]/g,'.$1').split('.');` +
    `  let cursor=payload;` +
    `  for(let i=0;i<tokens.length-1;i++){` +
    `    const token=tokens[i];` +
    `    const nextToken=tokens[i+1];` +
    `    if(cursor[token] === undefined){ cursor[token]=String(Number(nextToken))===nextToken ? [] : {}; }` +
    `    cursor=cursor[token];` +
    `  }` +
    `  cursor[tokens[tokens.length-1]]=modelId;` +
    `  currentDraftConfig=payload;` +
    `  if(payload.Router?.default){ draftRouterDefault.value=payload.Router.default; }` +
    `  renderConfigControlForms(payload);` +
    `  configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  renderDraftSummary(payload);` +
    `  renderDraftValidation([],[]);` +
    `  renderRouterSlotExplanation(withDraftCompiledData(payload));` +
    `  renderContextWindowGuide(withDraftCompiledData(payload));` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='已将建议模型应用到 '+path+'，可重新预览验证';` +
    `}` +
    `function applyContextWindowAction(action,modelId){` +
    `  if(action!=='set-long-context' || !modelId){ draftPreviewStatus.textContent='暂不支持该上下文窗口操作'; return; }` +
    `  const payload=buildDraftPayloadFromForm();` +
    `  payload.Router={ ...(payload.Router || {}), longContext:modelId };` +
    `  currentDraftConfig=payload;` +
    `  renderConfigControlForms(payload);` +
    `  draftRouterDefault.value=payload.Router?.default || '';` +
    `  configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  renderDraftSummary(payload);` +
    `  renderDraftValidation([],[]);` +
    `  renderCapabilityWarnings();` +
    `  renderRouterSlotExplanation(withDraftCompiledData(payload));` +
    `  renderContextWindowGuide(withDraftCompiledData(payload));` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='已将 Router.longContext 设置为 '+modelId+'，可重新预览验证';` +
    `}` +
    `function applyCapabilityWarningSuggestion(path,code){` +
    `  const payload=JSON.parse(JSON.stringify(currentDraftConfig || {}));` +
    `  const tokens=String(path || '').replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean);` +
    `  if(!tokens.length){ draftPreviewStatus.textContent='暂不支持自动修复该 warning'; return; }` +
    `  let cursor=payload;` +
    `  for(let i=0;i<tokens.length-1;i++){ if(cursor == null){ break; } cursor=cursor[tokens[i]]; }` +
    `  const lastToken=tokens[tokens.length-1];` +
    `  if(code==='thinking_ignored'){` +
    `    if(cursor && Object.prototype.hasOwnProperty.call(cursor,lastToken)){ delete cursor[lastToken]; }` +
    `  } else if(code==='tools_text_fallback' || code==='images_text_fallback'){` +
    `    if(cursor && Object.prototype.hasOwnProperty.call(cursor,lastToken)){ delete cursor[lastToken]; }` +
    `    if(cursor && !Object.keys(cursor).length){` +
    `      const parentTokens=tokens.slice(0,-1);` +
    `      const maybeMetadataKey=parentTokens[parentTokens.length-1];` +
    `      if(maybeMetadataKey==='metadata'){` +
    `        let parentCursor=payload;` +
    `        for(let i=0;i<parentTokens.length-1;i++){ if(parentCursor == null){ break; } parentCursor=parentCursor[parentTokens[i]]; }` +
    `        if(parentCursor && Object.prototype.hasOwnProperty.call(parentCursor,'metadata')){ delete parentCursor.metadata; }` +
    `      }` +
    `    }` +
    `  } else {` +
    `    draftPreviewStatus.textContent='暂不支持自动修复该 warning';` +
    `    return;` +
    `  }` +
    `  currentDraftConfig=payload;` +
    `  renderModelsForm(payload.Models || []);` +
    `  renderConfigControlForms(payload);` +
    `  draftRouterDefault.value=payload.Router?.default || '';` +
    `  configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  renderDraftSummary(payload);` +
    `  renderDraftValidation([],[]);` +
    `  renderCapabilityWarnings();` +
    `  renderRouterSlotExplanation(withDraftCompiledData(payload));` +
    `  renderContextWindowGuide(withDraftCompiledData(payload));` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='已应用 warning 修正：'+code+'，可重新预览验证';` +
    `}` +
    `function renderCompiledDiff(diff){` +
    `  const summary=diff?.summary || {};` +
    `  compiledDiffSummary.innerHTML=[` +
    "    ['Added providers', summary.addedProviders ?? 0]," +
    "    ['Removed providers', summary.removedProviders ?? 0]," +
    "    ['Changed providers', summary.changedProviders ?? 0]," +
    "    ['Added models', summary.addedModels ?? 0]," +
    "    ['Removed models', summary.removedModels ?? 0]," +
    "    ['Changed models', summary.changedModels ?? 0]" +
    `  ].map(([label,value])=>'<div class=\"diff-chip\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  const rows=[` +
    `    ...((diff?.providerChanges || []).map(item=>({ scope:'provider', key:item.name, type:item.type, fields:item.fields || [], target:item.after || item.before || {} }))),` +
    `    ...((diff?.modelChanges || []).map(item=>({ scope:'model', key:item.modelId, type:item.type, fields:item.fields || [], target:item.after || item.before || {} }))),` +
    `  ];` +
    `  compiledDiffTableBody.innerHTML=rows.length ? rows.map(item=>'<tr>' +` +
    `    '<td>'+esc(item.scope)+'</td>' +` +
    `    '<td>'+esc(item.type)+'</td>' +` +
    `    '<td><code>'+esc(item.key)+'</code></td>' +` +
    `    '<td>'+esc(item.fields.join(', ') || '-')+'</td>' +` +
    `    '<td><code>'+esc(item.target.providerName || item.target.name || '-')+'</code><div class="muted">'+esc(item.target.modelName || (item.target.models || []).join(', ') || '-')+'</div></td>' +` +
    `  '</tr>').join('') : '<tr><td colspan="5" class="muted">No compiled registry changes</td></tr>';` +
    `}` +
    `function renderReferenceImpact(impact){` +
    `  const summary=impact?.summary || {};` +
    `  referenceImpactSummary.innerHTML=[` +
    "    ['Total refs', summary.total ?? 0]," +
    "    ['modelId refs', summary.modelIdRefs ?? 0]," +
    "    ['Legacy refs', summary.legacyRefs ?? 0]," +
    "    ['Valid modelIds', summary.validModelIds ?? 0]," +
    "    ['Missing modelIds', summary.missingModelIds ?? 0]" +
    `  ].map(([label,value])=>'<div class=\"diff-chip\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  const entries=impact?.entries || [];` +
    `  referenceImpactTableBody.innerHTML=entries.length ? entries.map(item=>'<tr>' +` +
    `    '<td><code>'+esc(item.path)+'</code></td>' +` +
    `    '<td><code>'+esc(item.value)+'</code></td>' +` +
    `    '<td>'+esc(item.referenceType)+'</td>' +` +
    `    '<td>'+esc(item.status)+'</td>' +` +
    `    '<td><code>'+esc(item.resolvedTarget?.providerName || '-')+'</code><div class="muted">'+esc(item.resolvedTarget?.modelName || '-')+'</div></td>' +` +
    `    '<td>'+((item.suggestions || []).length ? item.suggestions.map(s=>'<div><code>'+esc(s.modelId)+'</code><div class="muted">'+esc(s.modelName || '-')+'</div><button type="button" data-apply-reference-path=\"'+esc(item.path)+'\" data-apply-reference-model=\"'+esc(s.modelId)+'\">应用建议</button></div>').join('') : '<span class="muted">-</span>')+'</td>' +` +
    `  '</tr>').join('') : '<tr><td colspan="6" class="muted">No model references found</td></tr>';` +
    `}` +
    `function getRouterSlotDefinitions(){` +
    `  return [` +
    `    { key:'default', label:'Default', when:'普通请求、规则未命中或其他槽位未配置时使用', required:true },` +
    `    { key:'think', label:'Thinking', when:'请求包含 thinking 时优先使用', required:false },` +
    `    { key:'longContext', label:'Long context', when:'输入超过阈值，或当前模型 safe_input_tokens 不够时使用', required:false },` +
    `    { key:'background', label:'Background', when:'Claude Code 轻量后台模型请求时使用', required:false },` +
    `    { key:'webSearch', label:'Web search', when:'请求包含 web_search 工具时使用', required:false },` +
    `  ];` +
    `}` +
    `function renderRouterSlotExplanation(data){` +
    `  const config=data?.normalizedConfig || { Router:(currentDraftConfig.Router && Object.keys(currentDraftConfig.Router).length ? currentDraftConfig.Router : (data?.router || {})) };` +
    `  const router=config.Router || {};` +
    `  const modelMap=data?.modelMap || {};` +
    `  const slots=getRouterSlotDefinitions();` +
    `  let configured=0;` +
    `  let resolved=0;` +
    `  let warnings=0;` +
    `  const defaultRef=String(router.default || '').trim();` +
    `  const defaultModel=defaultRef ? modelMap[defaultRef] : null;` +
    `  const rows=slots.map(slot=>{` +
    `    const ref=String(router[slot.key] || '').trim();` +
    `    const model=ref ? modelMap[ref] : null;` +
    `    const caps=model?.capabilities || {};` +
    `    const slotWarnings=[];` +
    `    if(ref){ configured+=1; }` +
    `    if(ref && model){ resolved+=1; }` +
    `    if(slot.required && !ref){ slotWarnings.push('必填槽位未配置'); }` +
    `    if(ref && !model){ slotWarnings.push('引用未解析到 Models[].id'); }` +
    `    if(slot.key==='think' && model && caps.thinking?.supported === false){ slotWarnings.push('目标模型声明不支持 reasoning'); }` +
    `    if(slot.key==='longContext' && model){` +
    `      if(!caps.contextWindowTokens){ slotWarnings.push('缺少 context_window_tokens'); }` +
    `      if(!caps.safeInputTokens){ slotWarnings.push('缺少 safe_input_tokens'); }` +
    `      if(defaultModel?.capabilities?.contextWindowTokens && caps.contextWindowTokens && caps.contextWindowTokens <= defaultModel.capabilities.contextWindowTokens){ slotWarnings.push('窗口不高于 default'); }` +
    `    }` +
    `    if(model && slot.key!=='longContext' && (!caps.contextWindowTokens || !caps.safeInputTokens)){ slotWarnings.push('缺少上下文窗口元数据'); }` +
    `    warnings+=slotWarnings.length;` +
    `    const target=model ? ('<code>'+esc(model.providerName || '-')+'</code><div class="muted">'+esc(model.modelName || '-')+'</div>') : '<span class="muted">-</span>';` +
    `    const capabilityParts=model ? [` +
    `      'thinking '+(caps.thinking?.supported === false ? 'off' : 'on'),` +
    `      'tools '+(caps.tools === false ? 'off' : 'on'),` +
    `      'images '+(caps.images === false ? 'off' : 'on'),` +
    `      caps.contextWindowTokens ? ('ctx '+caps.contextWindowTokens) : 'ctx ?',` +
    `      caps.safeInputTokens ? ('safe '+caps.safeInputTokens) : 'safe ?',` +
    `    ] : [];` +
    `    const warningText=slotWarnings.length ? slotWarnings.join('；') : (ref ? 'ok' : '未配置时回到 default');` +
    `    const warningClass=slotWarnings.length ? 'warn' : 'info';` +
    `    return '<tr>' +` +
    `      '<td><strong>'+esc(slot.label)+'</strong><div class="muted">Router.'+esc(slot.key)+'</div></td>' +` +
    `      '<td>'+esc(slot.when)+'</td>' +` +
    `      '<td>'+(ref ? '<code>'+esc(ref)+'</code>' : '<span class="muted">not configured</span>')+'</td>' +` +
    `      '<td>'+target+'</td>' +` +
    `      '<td>'+(capabilityParts.length ? capabilityParts.map(item=>'<span class="pill">'+esc(item)+'</span>').join(' ') : '<span class="muted">-</span>')+'</td>' +` +
    `      '<td><span class="pill '+warningClass+'">'+esc(warningText)+'</span></td>' +` +
    `    '</tr>';` +
    `  });` +
    `  routerSlotSummary.innerHTML=[['Configured slots',configured],['Resolved slots',resolved],['Warnings',warnings]].map(([label,value])=>'<div class="diff-chip"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  routerSlotTableBody.innerHTML=rows.join('');` +
    `}` +
    `function readModelMetadataNumber(model,key){` +
    `  const value=model?.metadata?.[key];` +
    `  return Number.isFinite(Number(value)) && Number(value)>0 ? Number(value) : undefined;` +
    `}` +
    `function getContextWindowEntries(data,config){` +
    `  const modelMap=data?.modelMap || {};` +
    `  const draftModels=Array.isArray(config?.Models) ? config.Models : [];` +
    `  if(draftModels.length){` +
    `    return draftModels.map(model=>{ const id=String(model?.id || '').trim(); const compiled=id ? modelMap[id] : null; const caps=compiled?.capabilities || {}; return { id, modelName:model?.model || compiled?.modelName || '-', contextWindowTokens:readModelMetadataNumber(model,'context_window_tokens') || caps.contextWindowTokens, safeInputTokens:readModelMetadataNumber(model,'safe_input_tokens') || caps.safeInputTokens }; }).filter(item=>item.id);` +
    `  }` +
    `  return Object.entries(modelMap).map(([id,model])=>({ id, modelName:model?.modelName || '-', contextWindowTokens:model?.capabilities?.contextWindowTokens, safeInputTokens:model?.capabilities?.safeInputTokens }));` +
    `}` +
    `function renderContextWindowGuide(data){` +
    `  const config=data?.normalizedConfig || currentDraftConfig || {};` +
    `  const router=config.Router || {};` +
    `  const entries=getContextWindowEntries(data,config);` +
    `  if(!entries.length){ contextWindowGuide.innerHTML='<div class="alert info"><strong>Context window guide</strong><div class="muted">当前草稿还没有可解析的 Models。</div></div>'; return; }` +
    `  const defaultRef=String(router.default || '').trim();` +
    `  const longRef=String(router.longContext || '').trim();` +
    `  const defaultEntry=entries.find(item=>item.id===defaultRef);` +
    `  const longEntry=entries.find(item=>item.id===longRef);` +
    `  const ranked=entries.filter(item=>item.contextWindowTokens).sort((a,b)=>(b.contextWindowTokens || 0)-(a.contextWindowTokens || 0));` +
    `  const best=ranked[0];` +
    `  const missingCount=entries.filter(item=>!item.contextWindowTokens || !item.safeInputTokens).length;` +
    `  const messages=[];` +
    `  let level='info';` +
    `  if(missingCount){ level='warn'; messages.push('有 '+missingCount+' 个模型缺少 context_window_tokens 或 safe_input_tokens，超大请求可能无法提前降级/切换。'); }` +
    `  if(entries.length>1 && !longRef){ level='warn'; messages.push('多模型配置未设置 Router.longContext，大上下文请求会继续使用已选模型。'); }` +
    `  if(longRef && !longEntry){ level='warn'; messages.push('Router.longContext 引用未解析到 Models[].id。'); }` +
    `  if(longEntry && (!longEntry.contextWindowTokens || !longEntry.safeInputTokens)){ level='warn'; messages.push('Router.longContext 缺少上下文窗口或安全输入元数据。'); }` +
    `  if(defaultEntry?.contextWindowTokens && longEntry?.contextWindowTokens && longEntry.contextWindowTokens <= defaultEntry.contextWindowTokens){ level='warn'; messages.push('Router.longContext 的窗口不高于 Router.default，可能无法提升大上下文体验。'); }` +
    `  if(!messages.length){ messages.push('当前上下文窗口元数据和 Router.longContext 配置可用于大上下文 fallback。'); }` +
    `  const canApplyBest=best?.id && best.id!==longRef && (!defaultEntry?.contextWindowTokens || (best.contextWindowTokens || 0)>defaultEntry.contextWindowTokens);` +
    `  const summaryRows=[['Default', defaultRef || '-'],['Default ctx', defaultEntry?.contextWindowTokens || '?'],['Long context', longRef || '-'],['Long ctx', longEntry?.contextWindowTokens || '?'],['Largest ctx', best ? (best.id+' / '+best.contextWindowTokens) : '-'],['Missing metadata', missingCount]];` +
    `  contextWindowGuide.innerHTML='<div class="alert '+level+'"><div class="row"><strong>Context window guide</strong>'+(best ? '<span class="pill">largest '+esc(best.id)+'</span>' : '')+'</div><div class="diff-summary">'+summaryRows.map(([label,value])=>'<div class="diff-chip"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+'</div><ul>'+messages.map(message=>'<li>'+esc(message)+'</li>').join('')+'</ul>'+(canApplyBest ? '<div class="row" style="margin-top:.5rem"><button type="button" data-context-action="set-long-context" data-model-id="'+esc(best.id)+'">设为 Router.longContext</button><span class="muted">'+esc(best.modelName || '')+'</span></div>' : '')+'</div>';` +
    `}` +
    `function getSmartCandidateGuideEntries(data,config){` +
    `  const modelMap=data?.modelMap || {};` +
    `  const draftModels=Array.isArray(config?.Models) ? config.Models : [];` +
    `  if(draftModels.length){ return draftModels.map(model=>{ const id=String(model?.id || '').trim(); const compiled=id ? modelMap[id] : null; const caps=compiled?.capabilities || {}; return { id, modelName:model?.model || compiled?.modelName || '-', contextWindowTokens:readModelMetadataNumber(model,'context_window_tokens') || caps.contextWindowTokens || 0, thinkingSupported:caps.thinking?.supported !== false }; }).filter(item=>item.id); }` +
    `  return Object.entries(modelMap).map(([id,model])=>({ id, modelName:model?.modelName || '-', contextWindowTokens:model?.capabilities?.contextWindowTokens || 0, thinkingSupported:model?.capabilities?.thinking?.supported !== false }));` +
    `}` +
    `function pickSmartCandidate(entries,role){` +
    `  const list=[...entries];` +
    `  const score=(item)=>{ const text=(item.id+' '+item.modelName).toLowerCase(); let value=0; if(role==='fast'){ if(/haiku|mini|flash|fast|lite|small/.test(text)){ value+=80; } value+=Math.max(0,50-Math.log10((item.contextWindowTokens || 1))*10); } else if(role==='deep'){ if(/opus|reasoner|thinking|o1|o3|gpt-5|sonnet/.test(text)){ value+=80; } if(item.thinkingSupported){ value+=20; } value+=Math.log10((item.contextWindowTokens || 1))*5; } else if(role==='long_context'){ value+=item.contextWindowTokens || 0; } else { if(/sonnet|gpt-4|gpt-5|default|balanced/.test(text)){ value+=80; } value+=Math.log10((item.contextWindowTokens || 1))*8; } return value; };` +
    `  return list.sort((a,b)=>score(b)-score(a) || a.id.localeCompare(b.id))[0];` +
    `}` +
    `function renderSmartCandidateGuide(data,summary){` +
    `  const config=data?.normalizedConfig || currentDraftConfig || {};` +
    `  const entries=getSmartCandidateGuideEntries(data,config);` +
    `  const candidates=Array.isArray(summary?.candidates) ? summary.candidates : [];` +
    `  const configured=new Set(candidates.map(candidate=>candidate.model?.ref).filter(Boolean));` +
    `  if(!entries.length){ smartCandidateGuide.innerHTML='<div class="alert info"><strong>Candidate guide</strong><div class="muted">当前草稿还没有可解析的 Models，先添加模型后再配置候选。</div></div>'; return; }` +
    `  const roles=[` +
    `    { key:'fast', label:'Fast', description:'高频轻量任务、后台请求和低延迟候选' },` +
    `    { key:'balanced', label:'Balanced', description:'默认日常编码、解释和中等复杂度任务' },` +
    `    { key:'deep', label:'Deep', description:'复杂推理、架构设计和需要更强模型的任务' },` +
    `    { key:'long_context', label:'Long context', description:'大上下文、长文件和超长会话兜底候选' },` +
    `  ];` +
    `  const rows=roles.map(role=>{ const picked=pickSmartCandidate(entries,role.key); const configuredRole=picked && configured.has(picked.id); const cls=configuredRole ? 'info' : 'warn'; const button=(!configuredRole && picked) ? '<button type="button" data-add-smart-candidate-suggestion="'+esc(picked.id)+'" data-description="'+esc(role.key+' candidate')+'">Add candidate</button>' : ''; return '<div class="alert '+cls+'"><div class="row"><strong>'+esc(role.label)+'</strong><span class="pill '+cls+'">'+esc(configuredRole ? 'configured' : 'suggested')+'</span></div><div>'+esc(role.description)+'</div><div class="muted">'+(picked ? ('<code>'+esc(picked.id)+'</code> · '+esc(picked.modelName || '-')+' · ctx '+esc(picked.contextWindowTokens || '?')) : 'no model suggestion')+'</div>'+(button ? '<div class="row" style="margin-top:.5rem">'+button+'</div>' : '')+'</div>'; });` +
    `  smartCandidateGuide.innerHTML='<div class="alert info"><strong>Candidate guide</strong><div class="muted">建议至少覆盖 fast / balanced / deep，需要大上下文时再加入 long-context 候选。</div></div>'+rows.join('');` +
    `}` +
    `function renderSmartRouterExplanation(data){` +
    `  const summary=data?.smartRouterExplanation || {};` +
    `  const rules=Array.isArray(summary.rules) ? summary.rules : [];` +
    `  const candidates=Array.isArray(summary.candidates) ? summary.candidates : [];` +
    `  const warnings=Array.isArray(summary.warnings) ? summary.warnings : [];` +
    `  const refLabel=(model)=>model?.ref ? ('<code>'+esc(model.ref)+'</code><div class="muted">'+esc(model.target?.providerName || model.status || '-')+' / '+esc(model.target?.modelName || '-')+'</div>') : '<span class="muted">-</span>';` +
    `  const switchRows=[['Enabled', summary.enabled ? 'true' : 'false'],['Rules', rules.length],['Candidates', candidates.length],['Router model', summary.routerModel?.ref || '-'],['Semantic', (summary.semantic?.enabled ? 'on' : 'off')+' / '+(summary.semantic?.mode || '-')],['Sticky', summary.sticky?.enabled ? 'on' : 'off'],['Alignment', summary.sticky?.alignment?.enabled ? 'on' : 'off'],['Fallback', summary.fallback || 'default'],['Warnings', warnings.length]];` +
    `  smartRouterExplanationSummary.innerHTML=switchRows.map(([label,value])=>'<div class="diff-chip"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  const order=Array.isArray(summary.routeOrder) ? summary.routeOrder : [];` +
    `  smartRouterRouteOrder.innerHTML='<div class="alert '+(warnings.length ? 'warn' : 'info')+'"><strong>Route order</strong><ol>'+order.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ol>'+(warnings.length ? '<ul>'+warnings.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>' : '<div class="muted">SmartRouter 配置引用已解析。</div>')+'</div>';` +
    `  smartRouterRulesTableBody.innerHTML=rules.length ? rules.map(rule=>{` +
    `    const patternText=(rule.patterns || []).map(pattern=>pattern.type==='exact' ? ('exact: '+(pattern.keywords || []).join(', ')) : ('regex: '+(pattern.pattern || '-'))).join('; ');` +
    `    const statusClass=rule.model?.status === 'resolved' ? 'info' : (rule.model?.status === 'legacy' ? 'warn' : 'critical');` +
    `    return '<tr>' +` +
    `      '<td>'+esc(rule.order || '-')+'<div class="muted">priority '+esc(rule.priority ?? 0)+'</div></td>' +` +
    `      '<td><strong>'+esc(rule.name || '-')+'</strong><div class="muted">'+esc(rule.description || '-')+'</div><span class="pill '+(rule.enabled ? 'info' : 'warn')+'">'+esc(rule.enabled ? 'enabled' : 'disabled')+'</span></td>' +` +
    `      '<td>'+refLabel(rule.model)+'<span class="pill '+statusClass+'">'+esc(rule.model?.status || '-')+'</span></td>' +` +
    `      '<td>'+esc(patternText || '-')+'</td>' +` +
    `      '<td>'+esc(rule.semantic?.enabled ? 'on' : 'off')+'<div class="muted">'+esc(rule.semantic?.prototype || '-')+'</div></td>' +` +
    `    '</tr>';` +
    `  }).join('') : '<tr><td colspan="5" class="muted">No SmartRouter rules configured</td></tr>';` +
    `  smartRouterCandidatesTableBody.innerHTML=candidates.length ? candidates.map(candidate=>{` +
    `    const statusClass=candidate.model?.status === 'resolved' ? 'info' : (candidate.model?.status === 'legacy' ? 'warn' : 'critical');` +
    `    return '<tr><td>'+esc(candidate.order || '-')+'</td><td>'+refLabel(candidate.model)+'</td><td>'+esc(candidate.description || '-')+'</td><td><span class="pill '+statusClass+'">'+esc(candidate.model?.status || '-')+'</span></td></tr>';` +
    `  }).join('') : '<tr><td colspan="4" class="muted">No SmartRouter candidates configured</td></tr>';` +
    `  renderSmartCandidateGuide(data,summary);` +
    `}` +
    `function renderCompiledModels(data){` +
    `  lastCompiledModelsData=data || null;` +
    `  const providers=Array.isArray(data.providers) ? data.providers : [];` +
    `  const modelMapEntries=Object.entries(data.modelMap || {});` +
    `  const modelPoolEntries=Object.entries(data.modelPools || {});` +
    `  const modelPoolEndpointCount=modelPoolEntries.reduce((sum,[_modelId,pool])=>sum+((pool.endpoints || []).length),0);` +
    `  knownModelIds=modelMapEntries.map(([modelId])=>modelId).sort();` +
    `  updateTopLevelModelSuggestionLists();` +
    `  renderCapabilityWarnings(data.capabilityWarnings);` +
    `  renderRouterSlotExplanation(data);` +
    `  renderContextWindowGuide(data);` +
    `  renderSmartRouterExplanation(data);` +
    `  compiledModelsStatus.textContent='已加载 '+providers.length+' 个 compiled provider / '+modelMapEntries.length+' 个 modelId 映射 / '+modelPoolEntries.length+' 个 model pool / '+modelPoolEndpointCount+' 个 pool endpoint';` +
    `  compiledProvidersTableBody.innerHTML=providers.length ? providers.map(provider=>'<tr>' +` +
    `    '<td><code>'+esc(provider.name)+'</code><div class="muted">'+esc(provider.api_base_url || '-')+'</div></td>' +` +
    `    '<td>'+esc(provider.transformer?.use?.[0] || '-')+'</td>' +` +
    `    '<td>'+esc((provider.models || []).join(', ') || '-')+'</td>' +` +
    `    '<td>'+esc(JSON.stringify(provider.transformer || {}))+'</td>' +` +
    `    '<td>'+esc(provider.has_api_key ? 'configured' : 'missing')+'</td>' +` +
    `  '</tr>').join('') : '<tr><td colspan="5" class="muted">No compiled providers</td></tr>';` +
    `  compiledModelMapTableBody.innerHTML=modelMapEntries.length ? modelMapEntries.map(([modelId,item])=>'<tr>' +` +
    `    '<td><code>'+esc(modelId)+'</code></td>' +` +
    `    '<td><code>'+esc(item.providerName || '-')+'</code><div class="muted">'+esc(item.modelName || '-')+'</div></td>' +` +
    `    '<td>'+esc(item.protocol || '-')+'</td>' +` +
    `    '<td>'+esc(item.compatibilityProfile || '-')+'</td>' +` +
    `    '<td>'+esc(item.dispatchFormat || '-')+'</td>' +` +
    `    '<td><code>'+esc(JSON.stringify(item.thinking || { mode: 'off' }))+'</code></td>' +` +
    `    '<td><code>'+esc(JSON.stringify(item.capabilities || {}))+'</code></td>' +` +
    `    '<td>'+esc(item.source || '-')+'</td>' +` +
    `  '</tr>').join('') : '<tr><td colspan="8" class="muted">No compiled model map</td></tr>';` +
    `  compiledModelPoolsTableBody.innerHTML=modelPoolEntries.length ? modelPoolEntries.map(([modelId,pool])=>{` +
    `    const endpoints=pool.endpoints || [];` +
    `    return '<tr>' +` +
    `      '<td><code>'+esc(modelId)+'</code></td>' +` +
    `      '<td>'+esc(pool.strategy || '-')+'</td>' +` +
    `      '<td><code>'+esc(pool.activeEndpointId || '-')+'</code></td>' +` +
    `      '<td>'+endpoints.map(endpoint=>{ const latency=endpoint.health?.latency; return '<div><code>'+esc(endpoint.id)+'</code><span class="muted"> priority '+esc(endpoint.priority)+' / '+esc(endpoint.enabled ? 'enabled' : 'disabled')+' / '+esc(endpoint.health?.status || 'healthy')+(latency ? ' / avg '+esc(Math.round(latency.averageMs))+'ms' : '')+'</span><div class="muted">'+esc(endpoint.upstreamServiceId || endpoint.api || '-')+'</div></div>'; }).join('')+'</td>' +` +
    `      '<td>'+((pool.warnings || []).length ? pool.warnings.map(w=>'<div class="warning-text">'+esc(w)+'</div>').join('') : '<span class="muted">-</span>')+'</td>' +` +
    `    '</tr>';` +
    `  }).join('') : '<tr><td colspan="5" class="muted">No compiled model pools</td></tr>';` +
    `  if(data.diff){ renderCompiledDiff(data.diff); }` +
    `  if(data.referenceImpact){ renderReferenceImpact(data.referenceImpact); }` +
    `  renderConfigControlForms(currentDraftConfig);` +
    `}` +
    `async function loadConfigDraft(){` +
    `  draftPreviewStatus.textContent='加载当前配置中...';` +
    `  const res=await fetch('/api/config');` +
    `  const data=await res.json();` +
    `  currentDraftConfig=data || {};` +
    `  renderModelsForm(currentDraftConfig.Models || []);` +
    `  renderConfigControlForms(currentDraftConfig);` +
    `  draftRouterDefault.value=currentDraftConfig.Router?.default || '';` +
    `  configDraftEditor.value=JSON.stringify(data,null,2);` +
    `  renderDraftSummary(currentDraftConfig);` +
    `  updateStatusSummary(currentDraftConfig);` +
    `  renderDraftValidation([],[]);` +
    `  renderCapabilityWarnings();` +
    `  renderRouterSlotExplanation(withDraftCompiledData(currentDraftConfig));` +
    `  renderContextWindowGuide(withDraftCompiledData(currentDraftConfig));` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='已载入当前配置，可通过 Models 表单或 JSON 草稿编辑';` +
    `}` +
    `async function previewConfigDraft(){` +
    `  let payload;` +
    `  try {` +
    `    payload=buildDraftPayloadFromForm();` +
    `    configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  } catch (error) {` +
    `    renderDraftValidation(['JSON parse error: '+error.message],[]);` +
    `    renderCapabilityWarnings();` +
    `    renderContextWindowGuide(lastCompiledModelsData);` +
    `    renderDraftPreviewMeta();` +
    `    draftPreviewStatus.textContent='草稿解析失败：'+error.message;` +
    `    return;` +
    `  }` +
    `  draftPreviewStatus.textContent='预览编译结果中...';` +
    `  const res=await fetch('/api/models/compiled/preview',{` +
    `    method:'POST',` +
    `    headers:{'Content-Type':'application/json'},` +
    `    body:JSON.stringify(payload)` +
    `  });` +
    `  const data=await res.json();` +
    `  if(!res.ok){` +
    `    draftPreviewStatus.textContent='预览失败：'+((data.errors || []).join('; ') || data.message || 'unknown error');` +
    `    renderDraftValidation(data.errors || [data.message || 'unknown error'], data.warnings || [], data.issueReport);` +
    `    renderCapabilityWarnings(data.capabilityWarnings);` +
    `    renderContextWindowGuide(withDraftCompiledData(payload));` +
    `    renderCompiledDiff();` +
    `    renderReferenceImpact(data.referenceImpact);` +
    `    renderDraftPreviewMeta();` +
    `    return;` +
    `  }` +
    `  renderDraftValidation([], data.warnings || [], data.issueReport);` +
    `  renderCompiledModels(data);` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='预览完成：已按草稿配置刷新 compiled models';` +
    `}` +
    `async function loadServiceStatus(){` +
    `  serviceReadyStatus.textContent='checking';` +
    `  try {` +
    `    const [serviceRes,remoteRes]=await Promise.all([fetch('/api/service-info'),fetch('/api/remote-status')]);` +
    `    const data=await serviceRes.json();` +
    `    const remoteData=await remoteRes.json();` +
    `    serviceReadyStatus.textContent=data.ready ? 'ready' : 'not ready';` +
    `    servicePortStatus.textContent=data.port || '-';` +
    `    serviceModeStatus.textContent=data.runtimeMode || '-';` +
    `    serviceRoleStatus.textContent=data.serviceRole || '-';` +
    `    renderRoleConnectionGuide(data);` +
    `    const auth=data.auth || {};` +
    `    const managed=auth.managedKeys || {};` +
    `    const quota=auth.quota || {};` +
    `    const quotaText=Number.isFinite(quota.requestsUsed) ? (' · quota '+quota.requestsUsed+' req'+(quota.windowResetAt ? ' · reset '+String(quota.windowResetAt).replace('T',' ').replace('.000Z','Z') : '')) : '';` +
    `    authStatusSummary.textContent=auth.required ? ((auth.bootstrapConfigured ? 'bootstrap' : 'managed')+' · '+(managed.active ?? 0)+' active'+quotaText) : 'not configured';` +
    `    renderAuthQuotaTable(quota);` +
    `    const security=data.security || {};` +
    `    const issues=Array.isArray(security.issues) ? security.issues : [];` +
    `    securityStatusSummary.textContent=security.status || '-';` +
    `    securitySummary.className='alert '+((security.status === 'critical') ? 'critical' : (security.status === 'warning' ? 'warn' : 'info'));` +
    `    securitySummary.innerHTML='<strong>Security: '+esc(security.status || '-')+'</strong><div>'+esc(issues[0]?.message || '当前服务未发现明显鉴权暴露风险')+'</div>'+ (issues.length ? '<ul class="mini-list">'+issues.map(issue=>'<li>'+esc(issue.action || issue.code)+'</li>').join('')+'</ul>' : '');` +
    `    const registration=data.registration || {};` +
    `    registrationStatusSummary.textContent=registration.enabled ? ((registration.models ?? 0)+' models / '+(registration.upstreamServices ?? 0)+' upstream') : 'disabled';` +
    `    const remote=remoteData.remote || {};` +
    `    remoteStatusSummary.textContent=remote.enabled ? ((remote.ready ? 'ready' : (remote.reachable ? 'reachable' : 'unreachable'))+' · '+(remote.baseUrl || '-')) : 'disabled';` +
    `    const remoteRegistration=remoteData.remoteRegistration || {};` +
    `    const remoteRegistrationSummary=remoteRegistration.summary || {};` +
    `    remoteRegistrationStatusSummary.textContent=remoteRegistration.enabled ? (remoteRegistration.available ? (remoteRegistration.registrationEnabled ? ((remoteRegistrationSummary.models ?? 0)+' remote models / '+(remoteRegistrationSummary.upstreamServices ?? 0)+' upstream') : 'remote registration disabled') : ('unavailable · '+(remoteRegistration.error || remoteRegistration.baseUrl || '-'))) : 'disabled';` +
    `    if(remoteData.compiledModels){ modelCountStatus.textContent=remoteData.compiledModels.modelCount ?? modelCountStatus.textContent; }` +
    `    try { await loadModelPoolHealth(); } catch (_poolError) { modelPoolHealthSummary.className='alert warn'; modelPoolHealthSummary.innerHTML='<strong>Pool health unavailable</strong><div class="muted">无法加载模型池健康状态</div>'; }` +
    `  } catch (_error) {` +
    `    serviceReadyStatus.textContent='unreachable';` +
    `    remoteStatusSummary.textContent='unknown';` +
    `    securityStatusSummary.textContent='unknown';` +
    `    modelPoolHealthSummary.className='alert warn';` +
    `    modelPoolHealthSummary.innerHTML='<strong>Pool health unavailable</strong><div class="muted">无法加载模型池健康状态</div>';` +
    `  }` +
    `}` +
    `async function saveConfigDraft(){` +
    `  let payload;` +
    `  try {` +
    `    payload=buildDraftPayloadFromForm();` +
    `    configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  } catch (error) {` +
    `    renderDraftValidation(['JSON parse error: '+error.message],[]);` +
    `    renderCapabilityWarnings();` +
    `    renderContextWindowGuide(lastCompiledModelsData);` +
    `    draftPreviewStatus.textContent='保存失败：'+error.message;` +
    `    return;` +
    `  }` +
    `  draftPreviewStatus.textContent='保存配置中...';` +
    `  const res=await fetch('/api/config',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });` +
    `  const data=await res.json();` +
    `  renderDraftValidation(data.errors || [], data.warnings || [], data.issueReport);` +
    `  if(!res.ok){` +
    `    draftPreviewStatus.textContent='保存失败：'+((data.errors || []).join('; ') || data.message || 'unknown error');` +
    `    return;` +
    `  }` +
    `  currentDraftConfig=payload;` +
    `  await loadCompiledModels();` +
    `  draftPreviewStatus.textContent='已保存配置'+((data.warnings || []).length ? ('（含 '+data.warnings.length+' 条 warning）') : '');` +
    `}` +
    `function addDraftModel(){` +
    `  const nextModels=extractModelsFromForm();` +
    `  nextModels.push(createDraftModelFromTemplate(defaultProviderTemplateKey));` +
    `  renderModelsForm(nextModels);` +
    `  syncDraftEditorFromForm();` +
    `}` +
    `function addTriggerRule(){ const next=extractTriggerRulesFromForm(); next.push({ name:'', enabled:true, priority:10, model:'', patterns:[{ type:'exact', keywords:[] }] }); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
    `function addTriggerPattern(ruleIndex){ const next=extractTriggerRulesFromForm(); if(!next[ruleIndex]){ return; } next[ruleIndex].patterns = Array.isArray(next[ruleIndex].patterns) ? next[ruleIndex].patterns : []; next[ruleIndex].patterns.push({ type:'exact', keywords:[] }); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
    `function addTriggerKeyword(ruleIndex,patternIndex){ const next=extractTriggerRulesFromForm(); if(!next[ruleIndex] || !next[ruleIndex].patterns || !next[ruleIndex].patterns[patternIndex]){ return; } const pattern=next[ruleIndex].patterns[patternIndex]; pattern.keywords=Array.isArray(pattern.keywords) ? pattern.keywords : []; pattern.keywords.push(''); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
    `function addSmartCandidate(){ const next=extractSmartCandidatesFromForm(); next.push({ model:'', description:'' }); renderSmartCandidatesList(next); syncDraftEditorFromForm(); }` +
    `function addSmartCandidateSuggestion(modelId,description){ const id=String(modelId || '').trim(); if(!id){ return; } const next=extractSmartCandidatesFromForm(); if(!next.some(item=>item.model===id)){ next.push({ model:id, description:description || 'guided candidate' }); } renderSmartCandidatesList(next); syncDraftEditorFromForm(); renderSmartCandidateGuide(withDraftCompiledData(currentDraftConfig), { candidates: next.map((item,index)=>({ order:index+1, description:item.description, model:{ ref:item.model, status:'resolved' } })) }); }` +
    `function addCascadeLevel(){ const next=extractCascadeLevelsFromForm(); next.push({ from:'', to:'' }); renderCascadeLevelsList(next); syncDraftEditorFromForm(); }` +
    `modelsFormGrid.addEventListener('input',()=>syncDraftEditorFromForm());` +
    `modelsFormGrid.addEventListener('change',()=>syncDraftEditorFromForm());` +
    `modelsFormGrid.addEventListener('click',(e)=>{ const applyBtn=e.target.closest('button[data-apply-template]'); if(applyBtn){ const applyIndex=Number(applyBtn.dataset.applyTemplate); applyProviderTemplate(applyIndex); syncDraftEditorFromForm(); return; } const btn=e.target.closest('button[data-remove-model]'); if(!btn){ return; } const removeIndex=Number(btn.dataset.removeModel); const nextModels=extractModelsFromForm().filter((_,index)=>index!==removeIndex); renderModelsForm(nextModels); syncDraftEditorFromForm(); });` +
    `triggerRulesList.addEventListener('input',()=>syncDraftEditorFromForm());` +
    `triggerRulesList.addEventListener('change',()=>syncDraftEditorFromForm());` +
    `triggerRulesList.addEventListener('click',(e)=>{ const addKeywordBtn=e.target.closest('button[data-add-trigger-keyword]'); if(addKeywordBtn){ addTriggerKeyword(Number(addKeywordBtn.dataset.addTriggerKeyword), Number(addKeywordBtn.dataset.patternIndex)); return; } const removeKeywordBtn=e.target.closest('button[data-remove-trigger-keyword]'); if(removeKeywordBtn){ const ruleIndex=Number(removeKeywordBtn.dataset.removeTriggerKeyword); const patternIndex=Number(removeKeywordBtn.dataset.patternIndex); const keywordIndex=Number(removeKeywordBtn.dataset.keywordIndex); const next=extractTriggerRulesFromForm(); if(next[ruleIndex] && next[ruleIndex].patterns && next[ruleIndex].patterns[patternIndex]){ const pattern=next[ruleIndex].patterns[patternIndex]; pattern.keywords=(pattern.keywords || []).filter((_,index)=>index!==keywordIndex); if(!pattern.keywords.length){ pattern.keywords=['']; } renderTriggerRulesList(next); syncDraftEditorFromForm(); } return; } const addBtn=e.target.closest('button[data-add-trigger-pattern]'); if(addBtn){ addTriggerPattern(Number(addBtn.dataset.addTriggerPattern)); return; } const removePatternBtn=e.target.closest('button[data-remove-trigger-pattern]'); if(removePatternBtn){ const ruleIndex=Number(removePatternBtn.dataset.removeTriggerPattern); const patternIndex=Number(removePatternBtn.dataset.patternIndex); const next=extractTriggerRulesFromForm(); if(next[ruleIndex]){ next[ruleIndex].patterns=(next[ruleIndex].patterns || []).filter((_,index)=>index!==patternIndex); if(!next[ruleIndex].patterns.length){ next[ruleIndex].patterns=[{ type:'exact', keywords:[] }]; } renderTriggerRulesList(next); syncDraftEditorFromForm(); } return; } const btn=e.target.closest('button[data-remove-trigger-rule]'); if(!btn){ return; } const next=extractTriggerRulesFromForm().filter((_,index)=>index!==Number(btn.dataset.removeTriggerRule)); renderTriggerRulesList(next); syncDraftEditorFromForm(); });` +
    `smartCandidatesList.addEventListener('input',()=>syncDraftEditorFromForm());` +
    `smartCandidatesList.addEventListener('change',()=>syncDraftEditorFromForm());` +
    `smartCandidatesList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-remove-smart-candidate]'); if(!btn){ return; } const next=extractSmartCandidatesFromForm().filter((_,index)=>index!==Number(btn.dataset.removeSmartCandidate)); renderSmartCandidatesList(next); syncDraftEditorFromForm(); });` +
    `smartCandidateGuide.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-add-smart-candidate-suggestion]'); if(!btn){ return; } addSmartCandidateSuggestion(btn.dataset.addSmartCandidateSuggestion, btn.dataset.description); });` +
    `governanceCascadeLevelsList.addEventListener('input',()=>syncDraftEditorFromForm());` +
    `governanceCascadeLevelsList.addEventListener('change',()=>syncDraftEditorFromForm());` +
    `governanceCascadeLevelsList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-remove-cascade-level]'); if(!btn){ return; } const next=extractCascadeLevelsFromForm().filter((_,index)=>index!==Number(btn.dataset.removeCascadeLevel)); renderCascadeLevelsList(next); syncDraftEditorFromForm(); });` +
    `referenceImpactTableBody.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-apply-reference-path]'); if(!btn){ return; } applyReferenceSuggestion(btn.dataset.applyReferencePath, btn.dataset.applyReferenceModel); });` +
    `draftValidationList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-validation-path]'); if(!btn){ return; } jumpToValidationPath(btn.dataset.validationPath); });` +
    `capabilityWarningsList.addEventListener('click',(e)=>{ const applyBtn=e.target.closest('button[data-apply-warning-path]'); if(applyBtn){ applyCapabilityWarningSuggestion(applyBtn.dataset.applyWarningPath, applyBtn.dataset.applyWarningCode); return; } const btn=e.target.closest('button[data-validation-path]'); if(!btn){ return; } jumpToValidationPath(btn.dataset.validationPath); });` +
    `contextWindowGuide.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-context-action]'); if(!btn){ return; } applyContextWindowAction(btn.dataset.contextAction, btn.dataset.modelId); });` +
    `healthSummary.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-health-action]'); if(btn){ applyHealthAction(btn.dataset.healthAction); } });` +
    `draftRouterDefault.addEventListener('input',syncDraftEditorFromForm);` +
    `[triggerEnabled,triggerIntentEnabled,triggerAnalysisScope,triggerIntentModel,smartEnabled,smartRouterModel,smartFallback,smartCacheTtl,smartMaxTokens,governanceEnabled,governanceAlignmentEnabled,governanceSummarizerModel,governanceSemanticEnabled,governanceClassifierModel,governanceShadowEnabled,governanceVerifierModel].forEach(el=>{ el.addEventListener('input',syncDraftEditorFromForm); el.addEventListener('change',syncDraftEditorFromForm); });` +
    `surfaceTabs.forEach((tab)=>tab.addEventListener('click',()=>setActiveSurface(tab.dataset.surfaceTarget || 'user')));` +
    `setActiveSurface('user');` +
    `function renderMetrics(metrics,health,outcome){` +
    `  metricsGrid.innerHTML=[` +
    "    ['Health', health?.status || 'idle'], " +
    "    ['Recent traces', metrics.totalTraces ?? 0]," +
    "    ['Sticky hit rate', pct(metrics.stickyHitRate)]," +
    "    ['Cascade rate', pct(metrics.cascadeTriggeredRate)]," +
    "    ['Shadow rate', pct(metrics.shadowCheckedRate)]," +
    "    ['Alignment rate', pct(metrics.alignmentUsedRate)]," +
    "    ['Model switch rate', pct(outcome?.modelSwitchRate)]," +
    "    ['Alignment on switch', pct(outcome?.alignmentOnSwitchRate)]," +
    "    ['Context fallback', pct(outcome?.contextWindowFallbackRate)]," +
    "    ['Context exceeded', pct(outcome?.contextWindowExceededRate)]," +
    "    ['Avg latency', fmt(metrics.averageLatencyMs)+' ms']" +
    `  ].map(([label,value])=>'<div class=\"stat\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `}` +
    `function buildPresetPayload(presetName){` +
    `  const preset=draftPresets[presetName];` +
    `  if(!preset){ return null; }` +
    `  const overwriteMode=draftPresetMode.value === 'replace';` +
    `  const payload=buildDraftPayloadFromForm();` +
    `  if(overwriteMode){ delete payload.TriggerRouter; delete payload.SmartRouter; delete payload.Governance; }` +
    `  if(preset.routerDefault){ payload.Router={ ...(payload.Router || {}), default: resolvePresetModelId(preset.routerDefault) }; }` +
    `  if(preset.triggerEnabled !== undefined || preset.triggerRules){ payload.SmartRouter={ ...(payload.SmartRouter || {}), enabled: preset.triggerEnabled !== undefined ? Boolean(preset.triggerEnabled) : Boolean(payload.SmartRouter?.enabled), analysis_scope: payload.SmartRouter?.analysis_scope || 'last_message', router_model: payload.SmartRouter?.router_model || '', fallback: payload.SmartRouter?.fallback || 'default', candidates: payload.SmartRouter?.candidates || [], cache_ttl: payload.SmartRouter?.cache_ttl, max_tokens: payload.SmartRouter?.max_tokens, rules: preset.triggerRules ? preset.triggerRules.map(rule=>({ ...rule, model: resolvePresetModelId(rule.model) })) : (payload.SmartRouter?.rules || []) }; delete payload.TriggerRouter; }` +
    `  if(preset.smartEnabled !== undefined || preset.smartCandidates){ payload.SmartRouter={ ...(payload.SmartRouter || {}), enabled: preset.smartEnabled !== undefined ? Boolean(preset.smartEnabled) : Boolean(payload.SmartRouter?.enabled), router_model: payload.SmartRouter?.router_model || '', fallback: payload.SmartRouter?.fallback || 'default', candidates: preset.smartCandidates ? preset.smartCandidates.map(item=>({ ...item, model: resolvePresetModelId(item.model) })) : (payload.SmartRouter?.candidates || []), cache_ttl: payload.SmartRouter?.cache_ttl, max_tokens: payload.SmartRouter?.max_tokens, rules: payload.SmartRouter?.rules || [] }; }` +
    `  if(preset.governanceEnabled !== undefined || preset.governanceAlignmentEnabled !== undefined || preset.governanceSemanticEnabled !== undefined || preset.governanceShadowEnabled !== undefined || preset.governanceSummarizerModel !== undefined || preset.governanceClassifierModel !== undefined || preset.governanceVerifierModel !== undefined){ payload.SmartRouter={ ...(payload.SmartRouter || {}), enabled: payload.SmartRouter?.enabled !== undefined ? Boolean(payload.SmartRouter?.enabled) : Boolean(preset.governanceEnabled), sticky:{ ...((payload.SmartRouter && payload.SmartRouter.sticky) || {}), enabled: preset.governanceAlignmentEnabled !== undefined ? Boolean(preset.governanceAlignmentEnabled) : Boolean(payload.SmartRouter?.sticky?.enabled), alignment:{ ...(((payload.SmartRouter && payload.SmartRouter.sticky && payload.SmartRouter.sticky.alignment) || {})), enabled: preset.governanceAlignmentEnabled !== undefined ? Boolean(preset.governanceAlignmentEnabled) : Boolean(payload.SmartRouter?.sticky?.alignment?.enabled), summarizer_model: preset.governanceSummarizerModel !== undefined ? resolvePresetModelId(preset.governanceSummarizerModel) : (payload.SmartRouter?.sticky?.alignment?.summarizer_model || '') } }, semantic:{ ...((payload.SmartRouter && payload.SmartRouter.semantic) || {}), enabled: preset.governanceSemanticEnabled !== undefined ? Boolean(preset.governanceSemanticEnabled) : Boolean(payload.SmartRouter?.semantic?.enabled), mode:(payload.SmartRouter?.semantic?.mode || 'classifier'), classifier_model: preset.governanceClassifierModel !== undefined ? resolvePresetModelId(preset.governanceClassifierModel) : (payload.SmartRouter?.semantic?.classifier_model || '') } }; payload.Governance={ ...(payload.Governance || {}), enabled: preset.governanceEnabled !== undefined ? Boolean(preset.governanceEnabled) : Boolean(payload.Governance?.enabled), shadow:{ ...((payload.Governance && payload.Governance.shadow) || {}), enabled: preset.governanceShadowEnabled !== undefined ? Boolean(preset.governanceShadowEnabled) : Boolean(payload.Governance?.shadow?.enabled), verifier_model: preset.governanceVerifierModel !== undefined ? resolvePresetModelId(preset.governanceVerifierModel) : (payload.Governance?.shadow?.verifier_model || '') } }; }` +
    `  return payload;` +
    `}` +
    `function applyDraftPreset(presetName){` +
    `  const payload=buildPresetPayload(presetName);` +
    `  if(!payload){ return; }` +
    `  currentDraftConfig=payload;` +
    `  renderModelsForm(payload.Models || []);` +
    `  renderConfigControlForms(payload);` +
    `  draftRouterDefault.value=payload.Router?.default || '';` +
    `  configDraftEditor.value=JSON.stringify(payload,null,2);` +
    `  renderDraftSummary(payload);` +
    `  renderDraftValidation([],[]);` +
    `  renderCapabilityWarnings();` +
    `  renderRouterSlotExplanation(withDraftCompiledData(payload));` +
    `  renderContextWindowGuide(withDraftCompiledData(payload));` +
    `  renderDraftPreviewMeta();` +
    `  draftPreviewStatus.textContent='已应用预设：'+presetName+'（'+(draftPresetMode.value === 'replace' ? 'overwrite' : 'append / merge')+'）';` +
    `}` +
    `async function previewDraftPreset(presetName){` +
    `  const payload=buildPresetPayload(presetName);` +
    `  if(!payload){ return; }` +
    `  const preset=draftPresets[presetName];` +
    `  const modeLabel=draftPresetMode.value === 'replace' ? 'overwrite' : 'append / merge';` +
    `  renderDraftPreviewMeta({ title:'Preset dry-run', description:(preset?.label || presetName)+' 仅预览，不会写回当前草稿。', affects:preset?.affects || [], actualAffects:[], mode:modeLabel });` +
    `  draftPreviewStatus.textContent='预览预设中：'+presetName;` +
    `  const res=await fetch('/api/models/compiled/preview',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });` +
    `  const data=await res.json();` +
    `  if(!res.ok){ renderDraftValidation(data.errors || [data.message || 'unknown error'], data.warnings || [], data.issueReport); renderCapabilityWarnings(data.capabilityWarnings); renderCompiledDiff(); renderReferenceImpact(data.referenceImpact); renderDraftPreviewMeta({ title:'Preset dry-run', description:(preset?.label || presetName)+' 预览失败，以下为当前预览尝试命中的区域。', affects:preset?.affects || [], actualAffects:deriveActualAffectedAreas(data), mode:modeLabel }); draftPreviewStatus.textContent='预设预览失败：'+((data.errors || []).join('; ') || data.message || 'unknown error'); return; }` +
    `  renderDraftValidation([], data.warnings || [], data.issueReport);` +
    `  renderCompiledModels(data);` +
    `  renderDraftPreviewMeta({ title:'Preset dry-run', description:(preset?.label || presetName)+' 仅预览，不会写回当前草稿。', affects:preset?.affects || [], actualAffects:deriveActualAffectedAreas(data), mode:modeLabel });` +
    `  draftPreviewStatus.textContent='已预览预设：'+presetName+'（未写回草稿）';` +
    `}` +
    `function renderRanking(target,entries,emptyLabel){` +
    `  if(!entries || !entries.length){ target.innerHTML='<li><span class="muted">'+esc(emptyLabel)+'</span><strong>0</strong></li>'; return; }` +
    `  target.innerHTML=entries.map(item=>'<li><span><code>'+esc(item.key)+'</code></span><strong>'+esc(item.count)+' · '+esc(pct(item.rate))+'</strong></li>').join('');` +
    `}` +
    `function renderOutcomeGroups(target,entries,emptyLabel){` +
    `  if(!entries || !entries.length){ target.innerHTML='<li><span class="muted">'+esc(emptyLabel)+'</span><strong>0</strong></li>'; return; }` +
    `  target.innerHTML=entries.map(item=>'<li><span><code>'+esc(item.key)+'</code><span class="muted"> · '+esc(item.totalTraces)+' traces</span></span><strong>switch '+esc(pct(item.modelSwitchRate))+' · align '+esc(pct(item.alignmentOnSwitchRate))+' · cascade '+esc(pct(item.cascadeAfterSwitchRate))+' · '+esc(fmt(item.averageLatencyMs))+' ms</strong></li>').join('');` +
    `}` +
    `function renderRoutingTuning(items){` +
    `  if(!items || !items.length){ routingTuningList.innerHTML='<li><span class="muted">No routing tuning recommendations</span><strong>healthy</strong></li>'; return; }` +
    `  routingTuningList.innerHTML=items.map(item=>{` +
    `    const suggestions=Array.isArray(item.configSuggestions) ? item.configSuggestions : [];` +
    `    const suggestionHtml=suggestions.length ? '<div class="muted">config: '+suggestions.map(s=>'<code>'+esc(s.path || '-')+'</code>'+(s.suggestedValue !== undefined ? ' = '+esc(s.suggestedValue) : '')+' — '+esc(s.reason || '')).join('<br>')+'</div>' : '';` +
    `    return '<li><span><span class="pill '+esc(item.severity === 'critical' ? 'critical' : (item.severity === 'warn' ? 'warn' : 'info'))+'">'+esc(item.severity || 'info')+'</span> <strong>'+esc(item.code || '-')+'</strong><div class="muted">'+esc(item.message || '')+'</div><div class="muted">'+esc(item.evidence || '')+'</div>'+suggestionHtml+'</span><strong>'+esc(item.action || '')+'</strong></li>';` +
    `  }).join('');` +
    `}` +
    `function renderQualityEvidence(summary){` +
    `  const items=summary?.samples || [];` +
    `  qualityEvidenceSummary.innerHTML=[['Samples',summary?.totalSamples || 0],['Risk',summary?.failureSamples || 0],['Improvement',summary?.improvementSamples || 0],['Speed risk',summary?.speedRiskSamples || 0]].map(([label,value])=>'<div class="stat"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  if(!items.length){ qualityEvidenceList.innerHTML='<li><span class="muted">No quality evidence samples</span><strong>0</strong></li>'; return; }` +
    `  qualityEvidenceList.innerHTML=items.map(item=>'<li><span><span class="pill '+esc(item.severity === 'critical' ? 'critical' : (item.severity === 'warn' ? 'warn' : 'info'))+'">'+esc(item.severity || 'info')+'</span> <strong>'+esc(item.type || '-')+'</strong><div class="muted">'+esc(item.requestId || '')+' · '+esc((item.routeReason || []).join(' / '))+'</div><div class="muted">'+esc(item.evidence || '')+'</div></span><strong>'+esc(item.action || '')+'</strong></li>').join('');` +
    `}` +
    `function renderTaskComparison(summary){` +
    `  const items=summary?.comparisons || [];` +
    `  taskComparisonSummary.innerHTML=[['Tasks',summary?.totalComparedTasks || 0],['Traces',summary?.totalComparedTraces || 0]].map(([label,value])=>'<div class="stat"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  if(!items.length){ taskComparisonList.innerHTML='<li><span class="muted">No comparable task samples</span><strong>0</strong></li>'; return; }` +
    `  taskComparisonList.innerHTML=items.map(item=>'<li><span><strong>'+esc(item.taskKey || '-')+'</strong><div class="muted">best '+esc(item.bestModel || '-')+' · baseline '+esc(item.baselineModel || '-')+' · fastest '+esc(item.fastestModel || '-')+'</div><div class="muted">failure lift '+esc(pct(item.failureRateDelta || 0))+' · latency lift '+esc(fmt(item.latencyDeltaMs || 0))+' ms · models '+esc(item.modelCount || 0)+'</div></span><strong>'+esc(item.totalTraces || 0)+' traces</strong></li>').join('');` +
    `}` +
    `function renderBenchmarkSummary(taskComparison,qualityEvidence){` +
    `  const bestQuality=taskComparison?.bestQualityLiftTask;` +
    `  const bestSpeed=taskComparison?.bestSpeedLiftTask;` +
    `  benchmarkSummary.innerHTML=[` +
    `    ['Comparable tasks',taskComparison?.totalComparedTasks || 0],` +
    `    ['Evidence samples',qualityEvidence?.totalSamples || 0],` +
    `    ['Best quality lift',bestQuality ? pct(bestQuality.failureRateDelta || 0) : '-'],` +
    `    ['Best speed lift',bestSpeed ? (fmt(bestSpeed.latencyDeltaMs || 0)+' ms') : '-']` +
    `  ].map(([label,value])=>'<div class="stat"><span class="muted">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
    `  const actions=[];` +
    `  if((taskComparison?.totalComparedTasks || 0)===0){ actions.push(['Collect comparable traces','Send the same task class through at least two final models, then refresh metrics.']); }` +
    `  if((qualityEvidence?.totalSamples || 0)===0){ actions.push(['Collect quality evidence','Enable cascade, shadow, context-window or model-pool signals so routing wins and risks become visible.']); }` +
    `  actions.push(['Run fixed benchmark','ctr eval --tasks && ctr eval --run --models "sonnet;haiku" --json']);` +
    `  actions.push(['Add calibration','Attach humanScore or judgeScore to ctr eval input results before treating rubric scores as release evidence.']);` +
    `  benchmarkActionList.innerHTML=actions.map(([title,detail])=>'<li><span><strong>'+esc(title)+'</strong><div class="muted">'+esc(detail)+'</div></span><strong>benchmark</strong></li>').join('');` +
    `}` +
    `function renderRouteDecisionSummaries(items){` +
    `  const decisions=Array.isArray(items) ? items.slice(0,5) : [];` +
    `  if(!decisions.length){ routeDecisionSummaryList.innerHTML='<li><span class="muted">No recent route decisions</span><strong>0</strong></li>'; return; }` +
    `  routeDecisionSummaryList.innerHTML=decisions.map(item=>{` +
    `    const meta=[item.sourceLabel || item.source || '-', item.ruleName ? ('rule '+item.ruleName) : '', item.semanticIntent ? ('intent '+item.semanticIntent) : '', item.confidenceLabel || '', item.latencyMs !== undefined ? (fmt(item.latencyMs)+' ms') : ''].filter(Boolean).join(' · ');` +
    `    const fallback=item.fallbackReason ? '<div class="muted">fallback: '+esc(item.fallbackReason)+'</div>' : '';` +
    `    return '<li><span><strong>'+esc(item.headline || item.requestId || '-')+'</strong><div class="muted">'+esc(meta)+'</div>'+fallback+'</span><button type="button" data-request="'+esc(item.requestId || '')+'">View</button></li>';` +
    `  }).join('');` +
    `}` +
    `function renderSwitchContinuitySummaries(items){` +
    `  const summaries=Array.isArray(items) ? items.slice(0,5) : [];` +
    `  if(!summaries.length){ switchContinuitySummaryList.innerHTML='<li><span class="muted">No recent switch continuity</span><strong>0</strong></li>'; return; }` +
    `  switchContinuitySummaryList.innerHTML=summaries.map(item=>{` +
    `    const cls=item.status === 'critical' ? 'critical' : (item.status === 'watch' ? 'warn' : 'info');` +
    `    const meta=[item.transition || (item.finalModel || '-'), item.sourceLabel || item.source || '-', item.alignmentUsed ? 'aligned' : '', item.cascadeTriggered ? 'cascade' : '', item.latencyMs !== undefined ? (fmt(item.latencyMs)+' ms') : ''].filter(Boolean).join(' · ');` +
    `    const action=item.action ? '<div class="muted">'+esc(item.action)+'</div>' : '';` +
    `    return '<li><span><span class="pill '+esc(cls)+'">'+esc(item.status || 'unknown')+'</span> <strong>'+esc(item.headline || item.requestId || '-')+'</strong><div class="muted">'+esc(meta)+'</div>'+action+'</span><button type="button" data-request="'+esc(item.requestId || '')+'">View</button></li>';` +
    `  }).join('');` +
    `}` +
    `function renderAnomalies(anomalies,health){` +
    `  const status=health?.status || 'idle';` +
    `  const message=health?.message || 'No governance traces yet.';` +
    `  const actions=Array.isArray(health?.actions) ? health.actions : [];` +
    `  healthSummary.className='alert '+esc(status === 'critical' ? 'critical' : (status === 'watch' ? 'warn' : 'info'));` +
    `  healthSummary.innerHTML='<strong>Health: '+esc(status)+'</strong><div>'+esc(message)+'</div>'+ (actions.length ? '<ul class="mini-list">'+actions.map(action=>'<li><button type="button" data-health-action="'+esc(action)+'">'+esc(action)+'</button></li>').join('')+'</ul>' : '');` +
    `  if(!anomalies || !anomalies.length){ anomalyList.innerHTML='<div class="alert info"><strong>No active alerts</strong><div class="muted">当前窗口未发现明显治理异常</div></div>'; return; }` +
    `  anomalyList.innerHTML=anomalies.map(item=>'<div class="alert '+esc(item.severity || 'info')+'"><strong>'+esc(item.type)+'</strong><div>'+esc(item.message)+'</div></div>').join('');` +
    `}` +
    `function applyHealthAction(action){` +
    `  const text=String(action || '').toLowerCase();` +
    `  const routeReasonInput=document.getElementById('routeReason');` +
    `  const cascadeSelect=document.getElementById('cascadeTriggered');` +
    `  const shadowSelect=document.getElementById('shadowChecked');` +
    `  if(text.includes('cascade')){ cascadeSelect.value='true'; shadowSelect.value=''; routeReasonInput.value=''; detailHint.textContent='Health action: filtered cascade traces'; }` +
    `  else if(text.includes('shadow')){ shadowSelect.value='true'; cascadeSelect.value=''; routeReasonInput.value=''; detailHint.textContent='Health action: filtered shadow traces'; }` +
    `  else { cascadeSelect.value=''; shadowSelect.value=''; routeReasonInput.value=''; detailHint.textContent='Health action: showing recent traces'; }` +
    `  loadTraces();` +
    `  document.getElementById('traceTable').scrollIntoView({ behavior:'smooth', block:'start' });` +
    `}` +
    `function renderBuckets(report){` +
    `  const buckets=report.buckets || [];` +
    `  const windowMs=Number(report.windowMs || 0);` +
    `  bucketHint.textContent=windowMs ? ('最近 '+Math.round(windowMs / 60000)+' 分钟，共 '+(report.bucketCount || buckets.length || 0)+' 桶') : '当前未启用时间窗';` +
    `  if(!buckets.length){ bucketGrid.innerHTML='<div class="stat"><span class="muted">No bucket data</span><strong>0</strong></div>'; return; }` +
    `  bucketGrid.innerHTML=buckets.map(bucket=>` +
    "    '<div class=\"stat\">'+"
    + "'<span class=\"muted\">'+esc(shortTime(bucket.bucketStart))+' - '+esc(shortTime(bucket.bucketEnd))+'</span>'+"
    + "'<strong>'+esc(bucket.metrics.totalTraces)+'</strong>'+"
    + "'<div class=\"muted\">sticky '+esc(pct(bucket.metrics.stickyHitRate))+' / cascade '+esc(pct(bucket.metrics.cascadeTriggeredRate))+'</div>'+"
    + "'</div>'"
    + `).join('');` +
    `}` +
    `function renderTrendTable(report){` +
    `  const buckets=report.buckets || [];` +
    `  if(!buckets.length){ trendTableBody.innerHTML='<tr><td colspan="6" class="muted">No trend data</td></tr>'; return; }` +
    `  trendTableBody.innerHTML=buckets.map(bucket=>'<tr>' +` +
    `    '<td>'+esc(shortTime(bucket.bucketStart))+' - '+esc(shortTime(bucket.bucketEnd))+'</td>' +` +
    `    '<td>'+esc(bucket.metrics.totalTraces)+'</td>' +` +
    `    '<td>'+esc(pct(bucket.metrics.stickyHitRate))+'</td>' +` +
    `    '<td>'+esc(pct(bucket.metrics.cascadeTriggeredRate))+'</td>' +` +
    `    '<td>'+esc(pct(bucket.metrics.shadowCheckedRate))+'</td>' +` +
    `    '<td>'+esc(pct(bucket.metrics.alignmentUsedRate))+'</td>' +` +
    `  '</tr>').join('');` +
    `}` +
    `function renderExportHistory(data){` +
    `  const exports=(data.exports || []);` +
    `  const schedules=(data.schedules || []);` +
    `  exportTableBody.innerHTML=exports.length ? exports.map(item=>'<tr><td><code>'+esc(item.id)+'</code></td><td>'+esc(item.kind)+'</td><td>'+esc(item.format)+'</td><td>'+esc(new Date(item.createdAt).toISOString())+'</td></tr>').join('') : '<tr><td colspan="4" class="muted">No exports yet</td></tr>';` +
    `  scheduleTableBody.innerHTML=schedules.length ? schedules.map(item=>'<tr><td><code>'+esc(item.id)+'</code></td><td>'+esc(item.intervalMs)+' ms</td><td>'+esc(item.format)+'</td><td>'+esc(item.lastRunAt ? new Date(item.lastRunAt).toISOString() : '-')+'</td></tr>').join('') : '<tr><td colspan="4" class="muted">No schedules yet</td></tr>';` +
    `}` +
    `function renderArchives(data){` +
    `  const archives=(data.archives || []);` +
    `  archiveTableBody.innerHTML=archives.length ? archives.map(item=>'<tr><td><code>'+esc(item.file)+'</code></td><td>'+esc(item.startedAt ? new Date(item.startedAt).toISOString().slice(0,10) : '-')+' ~ '+esc(item.endedAt ? new Date(item.endedAt).toISOString().slice(0,10) : '-')+'</td><td>'+esc(item.traceCount)+'</td><td>'+esc(item.compressed ? 'yes' : 'no')+'</td></tr>').join('') : '<tr><td colspan="4" class="muted">No archives found</td></tr>';` +
    `}` +
    `async function loadCompiledModels(){` +
    `  compiledModelsStatus.textContent='加载 compiled models 中...';` +
    `  const res=await fetch('/api/models/compiled');` +
    `  const data=await res.json();` +
    `  renderDraftValidation([], data.warnings || [], data.issueReport);` +
    `  renderCompiledModels(data);` +
    `  renderCompiledDiff();` +
    `  renderReferenceImpact();` +
    `}` +
    `async function loadTraces(){` +
    `  const requestId=document.getElementById('requestId').value.trim();` +
    `  const sessionKey=document.getElementById('sessionKey').value.trim();` +
    `  const routeReason=document.getElementById('routeReason').value.trim();` +
    `  const cascadeTriggered=document.getElementById('cascadeTriggered').value;` +
    `  const shadowChecked=document.getElementById('shadowChecked').value;` +
    `  const windowMs=document.getElementById('windowMs').value;` +
    `  const minSampleSize=document.getElementById('minSampleSize').value.trim();` +
    `  const cascadeWarnRate=document.getElementById('cascadeWarnRate').value.trim();` +
    `  const shadowWarnRate=document.getElementById('shadowWarnRate').value.trim();` +
    `  const latencyWarnMs=document.getElementById('latencyWarnMs').value.trim();` +
    `  const limit=document.getElementById('limit').value.trim();` +
    `  const params=new URLSearchParams();` +
    `  if(requestId) params.set('requestId',requestId);` +
    `  if(sessionKey) params.set('sessionKey',sessionKey);` +
    `  if(routeReason) params.set('routeReason',routeReason);` +
    `  if(cascadeTriggered) params.set('cascadeTriggered',cascadeTriggered);` +
    `  if(shadowChecked) params.set('shadowChecked',shadowChecked);` +
    `  if(windowMs) params.set('windowMs',windowMs);` +
    `  if(minSampleSize) params.set('minSampleSize',minSampleSize);` +
    `  if(cascadeWarnRate) params.set('cascadeWarnRate',cascadeWarnRate);` +
    `  if(shadowWarnRate) params.set('shadowWarnRate',shadowWarnRate);` +
    `  if(latencyWarnMs) params.set('latencyWarnMs',latencyWarnMs);` +
    `  params.set('bucketCount','6');` +
    `  if(limit) params.set('limit',limit);` +
    `  tbody.innerHTML='<tr><td colspan="6" class="muted">加载中...</td></tr>';` +
    `  const query=params.toString()?('?'+params.toString()):'';` +
    `  const [traceRes,metricsRes,healthRes]=await Promise.all([` +
    `    fetch('/api/governance/traces'+query),` +
    `    fetch('/api/governance/metrics'+query),` +
    `    fetch('/api/governance/health'+query)` +
    `  ]);` +
    `  const data=await traceRes.json();` +
    `  const metricsData=await metricsRes.json();` +
    `  const healthData=await healthRes.json();` +
    `  const health=healthData.health || metricsData.health;` +
    `  renderMetrics(metricsData.metrics || {},health,metricsData.outcome || {});` +
    `  renderBuckets(metricsData || {});` +
    `  renderAnomalies(metricsData.anomalies || [],health);` +
    `  renderRoutingTuning(health?.routingTuning || []);` +
    `  renderQualityEvidence(metricsData.qualityEvidence || {});` +
    `  renderTaskComparison(metricsData.taskComparison || {});` +
    `  renderBenchmarkSummary(metricsData.taskComparison || {},metricsData.qualityEvidence || {});` +
    `  renderRanking(routeRanking,metricsData.topRouteReasons || [],'No routes');` +
    `  renderRanking(modelRanking,metricsData.topFinalModels || [],'No models');` +
    `  renderRanking(intentRanking,metricsData.topSemanticIntents || [],'No intents');` +
    `  renderOutcomeGroups(routeOutcomeRanking,metricsData.outcome?.byRouteReason || [],'No route outcomes');` +
    `  renderOutcomeGroups(modelOutcomeRanking,metricsData.outcome?.byFinalModel || [],'No model outcomes');` +
    `  renderOutcomeGroups(intentOutcomeRanking,metricsData.outcome?.bySemanticIntent || [],'No intent outcomes');` +
    `  renderTrendTable(metricsData || {});` +
    `  const traces=data.traces || [];` +
    `  renderRouteDecisionSummaries(data.routeDecisions || traces.map(t=>t.decisionSummary).filter(Boolean));` +
    `  renderSwitchContinuitySummaries(data.switchContinuity || traces.map(t=>t.switchSummary).filter(Boolean));` +
    `  if(!traces.length){ tbody.innerHTML='<tr><td colspan="6" class="muted">暂无 trace</td></tr>'; return; }` +
    `  tbody.innerHTML=traces.map(t=>` +
    "    `<tr>`+" +
    "      `<td><code>${esc(t.requestId)}</code></td>`+" +
    "      `<td>${t.sessionKey ? `<span class=\"pill\">${esc(t.sessionKey)}</span>` : '<span class=\"muted\">-</span>'}</td>`+" +
    "      `<td><code>${esc(t.finalModel || '')}</code></td>`+" +
    "      `<td>${(t.routeReason || []).map(r=>`<span class=\"pill\">${esc(r)}</span>`).join(' ')}</td>`+" +
    "      `<td>${esc(t.latencyMs ?? '')}</td>`+" +
    "      `<td><button data-request=\"${esc(t.requestId)}\">View</button></td>`+" +
    "    `</tr>`" +
    `  ).join('');` +
    `}` +
    `async function loadDetail(requestId){` +
    `  const res=await fetch('/api/governance/traces/'+encodeURIComponent(requestId));` +
    `  const data=await res.json();` +
    `  detailHint.textContent='当前查看：'+requestId;` +
    `  detail.textContent=JSON.stringify(data,null,2);` +
    `}` +
    `async function loadExports(){` +
    `  const res=await fetch('/api/governance/metrics/exports');` +
    `  renderExportHistory(await res.json());` +
    `}` +
    `async function createSnapshot(){` +
    `  snapshotStatus.textContent='创建快照中...';` +
    `  const res=await fetch('/api/governance/metrics/snapshots',{` +
    `    method:'POST',` +
    `    headers:{'Content-Type':'application/json'},` +
    `    body:JSON.stringify({ format: document.getElementById('snapshotFormat').value, windowMs: Number(document.getElementById('windowMs').value || 0) || undefined })` +
    `  });` +
    `  const data=await res.json();` +
    `  snapshotStatus.textContent=res.ok ? ('已创建：'+data.export.id) : ('创建失败：'+(data.message || 'unknown error'));` +
    `  if(res.ok) await loadExports();` +
    `}` +
    `async function loadArchives(){` +
    `  archiveStatus.textContent='加载归档中...';` +
    `  const params=new URLSearchParams();` +
    `  const archiveDate=document.getElementById('archiveDate').value.trim();` +
    `  const archivePage=document.getElementById('archivePage').value.trim();` +
    `  const archivePageSize=document.getElementById('archivePageSize').value.trim();` +
    `  if(archiveDate) params.set('date',archiveDate);` +
    `  if(archivePage) params.set('page',archivePage);` +
    `  if(archivePageSize) params.set('pageSize',archivePageSize);` +
    `  const res=await fetch('/api/governance/archives'+(params.toString()?('?'+params.toString()):''));` +
    `  const data=await res.json();` +
    `  renderArchives(data);` +
    `  archiveStatus.textContent='归档加载完成';` +
    `}` +
    `async function saveThresholds(){` +
    `  const payload={` +
    `    min_sample_size:Number(document.getElementById('minSampleSize').value || 0),` +
    `    cascade_warn_rate:Number(document.getElementById('cascadeWarnRate').value || 0),` +
    `    shadow_warn_rate:Number(document.getElementById('shadowWarnRate').value || 0),` +
    `    latency_warn_ms:Number(document.getElementById('latencyWarnMs').value || 0)` +
    `  };` +
    `  saveThresholdsStatus.textContent='保存中...';` +
    `  const res=await fetch('/api/governance/observability/anomaly-thresholds',{` +
    `    method:'POST',` +
    `    headers:{'Content-Type':'application/json'},` +
    `    body:JSON.stringify(payload)` +
    `  });` +
    `  const data=await res.json();` +
    `  if(!res.ok){ saveThresholdsStatus.textContent='保存失败：'+(data.message || 'unknown error'); return; }` +
    `  saveThresholdsStatus.textContent='已保存到配置文件';` +
    `}` +
    `document.getElementById('refreshBtn').addEventListener('click',loadTraces);` +
    `document.getElementById('loadConfigDraftHeroBtn').addEventListener('click',loadConfigDraft);` +
    `document.getElementById('previewConfigDraftHeroBtn').addEventListener('click',previewConfigDraft);` +
    `document.getElementById('refreshStatusHeroBtn').addEventListener('click',loadServiceStatus);` +
    `document.getElementById('loadConfigDraftBtn').addEventListener('click',loadConfigDraft);` +
    `document.getElementById('addModelDraftBtn').addEventListener('click',addDraftModel);` +
    `document.getElementById('applyBalancedPresetBtn').addEventListener('click',()=>applyDraftPreset('balanced'));` +
    `document.getElementById('previewBalancedPresetBtn').addEventListener('click',()=>previewDraftPreset('balanced'));` +
    `document.getElementById('applyFastPresetBtn').addEventListener('click',()=>applyDraftPreset('fast'));` +
    `document.getElementById('previewFastPresetBtn').addEventListener('click',()=>previewDraftPreset('fast'));` +
    `document.getElementById('applyGovernancePresetBtn').addEventListener('click',()=>applyDraftPreset('governance'));` +
    `document.getElementById('previewGovernancePresetBtn').addEventListener('click',()=>previewDraftPreset('governance'));` +
    `document.getElementById('addTriggerRuleBtn').addEventListener('click',addTriggerRule);` +
    `document.getElementById('addSmartCandidateBtn').addEventListener('click',addSmartCandidate);` +
    `document.getElementById('addCascadeLevelBtn').addEventListener('click',addCascadeLevel);` +
    `document.getElementById('syncDraftJsonBtn').addEventListener('click',syncDraftEditorFromForm);` +
    `document.getElementById('previewConfigDraftBtn').addEventListener('click',previewConfigDraft);` +
    `document.getElementById('saveConfigDraftBtn').addEventListener('click',saveConfigDraft);` +
    `draftPresetMode.addEventListener('change',renderDraftPresetModeHint);` +
    `document.getElementById('createSnapshotBtn').addEventListener('click',createSnapshot);` +
    `document.getElementById('loadArchivesBtn').addEventListener('click',loadArchives);` +
    `document.getElementById('saveThresholdsBtn').addEventListener('click',saveThresholds);` +
    `routeDecisionSummaryList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-request]'); if(btn && btn.dataset.request){ loadDetail(btn.dataset.request); } });` +
    `switchContinuitySummaryList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-request]'); if(btn && btn.dataset.request){ loadDetail(btn.dataset.request); } });` +
    `tbody.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-request]'); if(btn){ loadDetail(btn.dataset.request); } });` +
    `renderDraftPresetGuide();` +
    `renderDraftPresetModeHint();` +
    `renderDraftPreviewMeta();` +
    `loadServiceStatus();` +
    `loadConfigDraft();` +
    `loadCompiledModels();` +
    `loadExports();` +
    `loadArchives();` +
    `loadTraces();` +
    `</script>` +
    `</body></html>`
  );
}
