import { describe, expect, it } from 'vitest';
import {
  MANAGEMENT_API_ROUTE_CONTRACTS,
  getManagementRouteContract,
  getRequiredScopeForRequest,
} from './management-routes';

describe('management API route contracts', () => {
  it('keeps management route domains and scopes explicit', () => {
    expect(MANAGEMENT_API_ROUTE_CONTRACTS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'GET',
        path: '/api/service-info',
        domain: 'service',
        requiredScope: 'read-only',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/api/models/pool-health/probe',
        domain: 'models',
        requiredScope: 'operator',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/api/governance/routing-advisor',
        domain: 'governance',
        requiredScope: 'read-only',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/api/config',
        domain: 'config',
        requiredScope: 'admin',
        sensitiveResponse: true,
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/api/benchmark/calibration',
        domain: 'benchmark',
        requiredScope: 'admin',
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/ui',
        domain: 'ui',
        requiredScope: 'admin',
      }),
    ]));
  });

  it('matches dynamic governance and auth routes', () => {
    expect(getManagementRouteContract('GET', '/api/governance/traces/req-1')).toEqual(expect.objectContaining({
      domain: 'governance',
      requiredScope: 'read-only',
    }));
    expect(getManagementRouteContract('POST', '/api/governance/archives/2026-05-23.json/delete')).toEqual(expect.objectContaining({
      domain: 'governance',
      requiredScope: 'operator',
    }));
    expect(getManagementRouteContract('POST', '/api/auth/keys/key_123/rotate')).toEqual(expect.objectContaining({
      domain: 'auth',
      requiredScope: 'admin',
      sensitiveResponse: true,
    }));
  });

  it('derives the same scope contract used by auth middleware', () => {
    expect(getRequiredScopeForRequest('POST', '/v1/messages')).toBe('client');
    expect(getRequiredScopeForRequest('GET', '/api/models/pool-health?model=sonnet')).toBe('read-only');
    expect(getRequiredScopeForRequest('POST', '/api/governance/metrics/snapshots')).toBe('operator');
    expect(getRequiredScopeForRequest('POST', '/api/auth/keys/key_123/revoke')).toBe('admin');
    expect(getRequiredScopeForRequest('GET', '/api/config')).toBe('admin');
    expect(getRequiredScopeForRequest('GET', '/unknown')).toBe('client');
  });
});
