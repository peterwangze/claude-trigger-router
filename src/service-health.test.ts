import { createServer } from 'http';
import { describe, expect, it, vi } from 'vitest';

import {
  formatProbeError,
  isExpectedServiceHealth,
  isTcpPortOccupied,
  probeRemoteRegistrationStatus,
  probeRemoteServiceStatus,
  SERVICE_HEALTH_PATH,
  SERVICE_INFO_PATH,
  SERVICE_NAME,
  SERVICE_REGISTRATION_PATH,
} from './service-health';

describe('service health helpers', () => {
  it('accepts expected service signature', () => {
    expect(
      isExpectedServiceHealth({
        service: SERVICE_NAME,
        ready: true,
        port: 5678,
      })
    ).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(isExpectedServiceHealth(null)).toBe(false);
    expect(isExpectedServiceHealth('ok')).toBe(false);
  });

  it('rejects payload from other services', () => {
    expect(
      isExpectedServiceHealth({
        service: 'other-service',
        ready: true,
        port: 5678,
      })
    ).toBe(false);
  });

  it('exposes the dedicated health endpoint path', () => {
    expect(SERVICE_HEALTH_PATH).toBe('/api/health');
  });

  it('exposes the dedicated service info endpoint path', () => {
    expect(SERVICE_INFO_PATH).toBe('/api/service-info');
  });

  it('exposes the dedicated registration endpoint path', () => {
    expect(SERVICE_REGISTRATION_PATH).toBe('/api/registration');
  });

  it('formats probe timeout errors as operator-readable diagnostics', () => {
    expect(formatProbeError({ name: 'TimeoutError', message: 'The operation was aborted due to timeout' }, 'Remote service status probe'))
      .toBe('Remote service status probe timed out before a response was received');
    expect(formatProbeError({ name: 'AbortError', message: 'This operation was aborted' }, 'Model pool endpoint probe'))
      .toBe('Model pool endpoint probe timed out before a response was received');
    expect(formatProbeError(new Error('getaddrinfo ENOTFOUND router.example.com'), 'Remote service status probe'))
      .toBe('getaddrinfo ENOTFOUND router.example.com');
  });

  it('summarizes disabled remote service without probing network', async () => {
    const fetchFn = vi.fn();

    await expect(probeRemoteServiceStatus({ enabled: false }, 500, fetchFn as any)).resolves.toEqual({
      enabled: false,
      configured: false,
      reachable: false,
      ready: false,
      baseUrl: '',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('probes remote service info with bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        service: SERVICE_NAME,
        ready: true,
        runtimeMode: 'server',
        serviceRole: 'router_service',
        remoteEnabled: false,
      }),
    });

    const status = await probeRemoteServiceStatus({
      enabled: true,
      base_url: 'https://router.example.com/',
      auth_token: 'token-1',
    }, 500, fetchFn as any);

    expect(fetchFn).toHaveBeenCalledWith('https://router.example.com/api/service-info', expect.objectContaining({
      headers: {
        Authorization: 'Bearer token-1',
      },
    }));
    expect(status).toEqual({
      enabled: true,
      configured: true,
      reachable: true,
      ready: true,
      baseUrl: 'https://router.example.com',
      service: SERVICE_NAME,
      runtimeMode: 'server',
      serviceRole: 'router_service',
      remoteEnabled: false,
    });
  });

  it('returns a structured remote service timeout diagnostic', async () => {
    const fetchFn = vi.fn().mockRejectedValue({ name: 'TimeoutError', message: 'timeout' });

    const status = await probeRemoteServiceStatus({
      enabled: true,
      base_url: 'https://router.example.com/',
    }, 500, fetchFn as any);

    expect(status).toEqual(expect.objectContaining({
      reachable: false,
      ready: false,
      error: 'Remote service status probe timed out before a response was received',
    }));
  });

  it('probes remote registration summary with bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        summary: {
          models: 2,
          upstreamServices: 1,
        },
        models: [{ id: 'sonnet', keyConfigured: true }],
        upstreamServices: [{ id: 'edge-a', authTokenConfigured: true }],
        issueReport: {
          summary: {
            total: 0,
            error: 0,
            warning: 0,
            info: 0,
          },
        },
      }),
    });

    const status = await probeRemoteRegistrationStatus({
      enabled: true,
      base_url: 'https://router.example.com/',
      auth_token: 'token-1',
    }, 500, fetchFn as any);

    expect(fetchFn).toHaveBeenCalledWith('https://router.example.com/api/registration', expect.objectContaining({
      headers: {
        Authorization: 'Bearer token-1',
      },
    }));
    expect(status).toEqual({
      enabled: true,
      configured: true,
      reachable: true,
      available: true,
      baseUrl: 'https://router.example.com',
      registrationEnabled: true,
      summary: {
        models: 2,
        upstreamServices: 1,
      },
      models: [{ id: 'sonnet', keyConfigured: true }],
      upstreamServices: [{ id: 'edge-a', authTokenConfigured: true }],
      issueSummary: {
        total: 0,
        error: 0,
        warning: 0,
        info: 0,
      },
    });
  });

  it('keeps reachable remote registration distinct from disabled registration config', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        summary: {
          models: 0,
          upstreamServices: 0,
        },
        models: [],
        upstreamServices: [],
      }),
    });

    const status = await probeRemoteRegistrationStatus({
      enabled: true,
      base_url: 'https://router.example.com',
      auth_token: 'token-1',
    }, 500, fetchFn as any);

    expect(status).toEqual(expect.objectContaining({
      enabled: true,
      configured: true,
      reachable: true,
      available: true,
      registrationEnabled: false,
      summary: {
        models: 0,
        upstreamServices: 0,
      },
    }));
  });

  it('returns a structured remote registration timeout diagnostic', async () => {
    const fetchFn = vi.fn().mockRejectedValue({ name: 'AbortError', message: 'aborted' });

    const status = await probeRemoteRegistrationStatus({
      enabled: true,
      base_url: 'https://router.example.com',
    }, 500, fetchFn as any);

    expect(status).toEqual(expect.objectContaining({
      reachable: false,
      available: false,
      error: 'Remote registration probe timed out before a response was received',
    }));
  });

  it('detects whether a local tcp port is occupied', async () => {
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('failed to get test port'));
          return;
        }
        resolve(address.port);
      });
    });

    try {
      expect(await isTcpPortOccupied(port, 500)).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    expect(await isTcpPortOccupied(port, 500)).toBe(false);
  });
});
