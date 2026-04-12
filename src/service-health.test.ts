import { createServer } from 'http';
import { describe, expect, it } from 'vitest';

import { isExpectedServiceHealth, isTcpPortOccupied, SERVICE_HEALTH_PATH, SERVICE_NAME } from './service-health';

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
