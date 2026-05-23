import type { TManagedApiKeyScope } from '../trigger/types';

export type TManagementRouteDomain =
  | 'auth'
  | 'benchmark'
  | 'config'
  | 'governance'
  | 'models'
  | 'runtime'
  | 'service'
  | 'ui';

export interface IManagementRouteContract {
  method: string;
  path: string;
  domain: TManagementRouteDomain;
  requiredScope: TManagedApiKeyScope;
  match?: 'exact' | 'prefix';
  pattern?: RegExp;
  sensitiveResponse?: boolean;
}

const readOnlyRoutes: IManagementRouteContract[] = [
  { method: 'GET', path: '/api/health', domain: 'service', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/service-info', domain: 'service', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/remote-status', domain: 'service', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/registration', domain: 'service', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/models/compiled', domain: 'models', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/models/pool-health', domain: 'models', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/transformers', domain: 'models', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/health', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/metrics', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/metrics/export', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/metrics/exports', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/traces', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/traces/', domain: 'governance', requiredScope: 'read-only', match: 'prefix' },
  { method: 'GET', path: '/api/governance/archives', domain: 'governance', requiredScope: 'read-only' },
  { method: 'GET', path: '/api/governance/archives/', domain: 'governance', requiredScope: 'read-only', match: 'prefix' },
  { method: 'GET', path: '/api/benchmark/history', domain: 'benchmark', requiredScope: 'read-only' },
];

const operatorRoutes: IManagementRouteContract[] = [
  { method: 'POST', path: '/api/restart', domain: 'runtime', requiredScope: 'operator' },
  { method: 'POST', path: '/api/models/pool-health/probe', domain: 'models', requiredScope: 'operator' },
  { method: 'POST', path: '/api/governance/metrics/snapshots', domain: 'governance', requiredScope: 'operator' },
  { method: 'POST', path: '/api/governance/metrics/schedules', domain: 'governance', requiredScope: 'operator' },
  { method: 'POST', path: '/api/governance/observability/anomaly-thresholds', domain: 'governance', requiredScope: 'operator' },
  {
    method: 'POST',
    path: '/api/governance/archives/:file/delete',
    domain: 'governance',
    requiredScope: 'operator',
    pattern: /^\/api\/governance\/archives\/[^/]+\/delete$/,
  },
];

const adminRoutes: IManagementRouteContract[] = [
  { method: 'GET', path: '/api/config', domain: 'config', requiredScope: 'admin', sensitiveResponse: true },
  { method: 'POST', path: '/api/config', domain: 'config', requiredScope: 'admin', sensitiveResponse: true },
  { method: 'POST', path: '/api/models/compiled/preview', domain: 'models', requiredScope: 'admin' },
  { method: 'GET', path: '/api/auth/keys', domain: 'auth', requiredScope: 'admin', sensitiveResponse: true },
  { method: 'GET', path: '/api/auth/audit', domain: 'auth', requiredScope: 'admin', sensitiveResponse: true },
  { method: 'POST', path: '/api/auth/keys', domain: 'auth', requiredScope: 'admin', sensitiveResponse: true },
  {
    method: 'POST',
    path: '/api/auth/keys/:id/revoke',
    domain: 'auth',
    requiredScope: 'admin',
    sensitiveResponse: true,
    pattern: /^\/api\/auth\/keys\/[^/]+\/revoke$/,
  },
  {
    method: 'POST',
    path: '/api/auth/keys/:id/rotate',
    domain: 'auth',
    requiredScope: 'admin',
    sensitiveResponse: true,
    pattern: /^\/api\/auth\/keys\/[^/]+\/rotate$/,
  },
  { method: 'POST', path: '/api/benchmark/calibration', domain: 'benchmark', requiredScope: 'admin' },
  { method: 'GET', path: '/ui', domain: 'ui', requiredScope: 'admin' },
];

export const MANAGEMENT_API_ROUTE_CONTRACTS: IManagementRouteContract[] = [
  ...readOnlyRoutes,
  ...operatorRoutes,
  ...adminRoutes,
];

function normalizePath(url: string | undefined): string {
  return String(url ?? '').split('?')[0] || '/';
}

function normalizeMethod(method: string | undefined): string {
  return String(method ?? 'GET').toUpperCase();
}

function matchesRoute(contract: IManagementRouteContract, method: string, path: string): boolean {
  if (contract.method !== method) {
    return false;
  }
  if (contract.pattern) {
    return contract.pattern.test(path);
  }
  if (contract.match === 'prefix') {
    return path.startsWith(contract.path);
  }
  return path === contract.path;
}

export function getManagementRouteContract(
  method: string | undefined,
  url: string | undefined
): IManagementRouteContract | undefined {
  const normalizedMethod = normalizeMethod(method);
  const path = normalizePath(url);
  return MANAGEMENT_API_ROUTE_CONTRACTS.find((contract) => matchesRoute(contract, normalizedMethod, path));
}

export function getRequiredScopeForRequest(
  method: string | undefined,
  url: string | undefined
): TManagedApiKeyScope {
  const path = normalizePath(url);
  if (path === '/v1/messages' || path === '/v1/chat/completions') {
    return 'client';
  }

  const contract = getManagementRouteContract(method, url);
  if (contract) {
    return contract.requiredScope;
  }

  return path.startsWith('/api/') || path === '/ui' ? 'admin' : 'client';
}
