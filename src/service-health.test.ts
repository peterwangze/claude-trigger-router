import { createServer } from 'http';
import { describe, expect, it, vi } from 'vitest';

import { isExpectedServiceHealth, isTcpPortOccupied, probeRemoteServiceStatus, SERVICE_HEALTH_PATH, SERVICE_INFO_PATH, SERVICE_NAME } from './service-health';

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
      remoteEnabled: false,
    });
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
