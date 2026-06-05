export interface WorkbenchViewModel {
  modelsCount: number;
  routerDefault: unknown;
  displayPort: unknown;
  runtimeMode: string;
  serviceRole: string;
  remoteSummary: string;
  configuredHost: string;
  publicHost: boolean;
  listenerSummary: string;
  clientConnectionSummary: string;
  registrationSummary: string;
  authSummary: string;
  securitySummary: 'ok' | 'warning' | 'critical';
  userReadinessTone: 'ready' | 'watch' | 'critical';
  routeSetupTone: 'ready' | 'watch';
  maintainerTone: 'ready' | 'watch' | 'critical';
  remoteTone: 'ready' | 'watch' | 'muted';
}

export function deriveWorkbenchViewModel(rawInitialConfig: any): WorkbenchViewModel {
  const initialConfig = rawInitialConfig ?? {};
  const modelsCount = Array.isArray(initialConfig.Models) ? initialConfig.Models.length : 0;
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
  const registrationUpstreamServices = Array.isArray(registration.upstream_services)
    ? registration.upstream_services.length
    : 0;
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
  const authSummary = initialConfig.APIKEY || initialManagedKeys.length > 0
    ? `configured · ${initialActiveManagedKeys} active`
    : 'not configured';
  const securitySummary = (!initialConfig.APIKEY && initialManagedKeys.length === 0 && (runtimeMode !== 'local' || publicHost))
    ? 'critical'
    : (!initialConfig.APIKEY && initialManagedKeys.length > 0 && initialActiveManagedKeys === 0)
      ? 'warning'
      : 'ok';
  const userReadinessTone = modelsCount > 0 && routerDefault !== '-' && securitySummary !== 'critical'
    ? 'ready'
    : securitySummary === 'critical'
      ? 'critical'
      : 'watch';
  const routeSetupTone = modelsCount > 0 && routerDefault !== '-' ? 'ready' : 'watch';
  const maintainerTone = securitySummary === 'critical' ? 'critical' : (runtimeMode === 'local' ? 'ready' : 'watch');
  const remoteTone = runtimeMode === 'local' && !remoteService.enabled ? 'muted' : (remoteService.enabled ? 'watch' : 'ready');

  return {
    modelsCount,
    routerDefault,
    displayPort,
    runtimeMode,
    serviceRole,
    remoteSummary,
    configuredHost,
    publicHost,
    listenerSummary: `${configuredHost}:${displayPort}${publicHost ? ' (public)' : ' (local)'}`,
    clientConnectionSummary,
    registrationSummary,
    authSummary,
    securitySummary,
    userReadinessTone,
    routeSetupTone,
    maintainerTone,
    remoteTone,
  };
}
