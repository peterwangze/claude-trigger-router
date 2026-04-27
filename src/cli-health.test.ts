import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { probeServiceHealth, waitForService } from './service-health';

const mockFetch = vi.fn();
const originalFetch = global.fetch;

describe('service health probing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns false for non-router JSON responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ service: 'other-service', ready: true }),
    });

    await expect(probeServiceHealth(5678, 20)).resolves.toBe(false);
  });

  it('returns true only for expected router health signature', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ service: 'claude-trigger-router', ready: true, port: 5678 }),
    });

    await expect(probeServiceHealth(5678, 20)).resolves.toBe(true);
  });

  it('sends bearer auth when probing an authenticated local service', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ service: 'claude-trigger-router', ready: true, port: 5678 }),
    });

    await expect(probeServiceHealth(5678, 20, { apiKey: 'bootstrap-key' })).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:5678/api/health', expect.objectContaining({
      headers: {
        Authorization: 'Bearer bootstrap-key',
      },
    }));
  });

  it('passes auth options through waitForService polling', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ service: 'claude-trigger-router', ready: true, port: 5678 }),
    });

    await expect(waitForService(5678, 650, { apiKey: 'bootstrap-key' })).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:5678/api/health', expect.objectContaining({
      headers: {
        Authorization: 'Bearer bootstrap-key',
      },
    }));
  });

  it('waitForService keeps polling until the expected service appears', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ service: 'other-service', ready: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ service: 'claude-trigger-router', ready: true, port: 5678 }),
      });

    await expect(waitForService(5678, 650)).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
