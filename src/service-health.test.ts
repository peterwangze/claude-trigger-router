import { describe, expect, it } from 'vitest';

import { isExpectedServiceHealth, SERVICE_HEALTH_PATH, SERVICE_NAME } from './service-health';

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
});
