import { describe, expect, it, vi } from 'vitest';

import { applyServiceAction, decideServiceAction } from './service';

describe('applyServiceAction', () => {
  it('performs a final health check after a successful start', async () => {
    const calls: string[] = [];

    await applyServiceAction({
      action: { kind: 'start' },
      executeStart: vi.fn().mockImplementation(async () => {
        calls.push('start');
      }),
      executeReload: vi.fn(),
      executeRestart: vi.fn(),
      verifyHealth: vi.fn().mockImplementation(async () => {
        calls.push('health');
        return true;
      }),
    });

    expect(calls).toEqual(['start', 'health']);
  });

  it('performs a final health check even when reusing an existing service', async () => {
    const calls: string[] = [];

    await applyServiceAction({
      action: { kind: 'reuse' },
      executeStart: vi.fn(),
      executeReload: vi.fn(),
      executeRestart: vi.fn(),
      verifyHealth: vi.fn().mockImplementation(async () => {
        calls.push('health');
        return true;
      }),
    });

    expect(calls).toEqual(['health']);
  });

  it('throws when the chosen service action fails before health verification', async () => {
    const verifyHealth = vi.fn();

    await expect(
      applyServiceAction({
        action: { kind: 'start' },
        executeStart: vi.fn().mockRejectedValue(new Error('start failed')),
        executeReload: vi.fn(),
        executeRestart: vi.fn(),
        verifyHealth,
      })
    ).rejects.toThrow('start failed');

    expect(verifyHealth).not.toHaveBeenCalled();
  });

  it('throws when the final health check fails', async () => {
    await expect(
      applyServiceAction({
        action: { kind: 'restart' },
        executeStart: vi.fn(),
        executeReload: vi.fn(),
        executeRestart: vi.fn().mockResolvedValue(undefined),
        verifyHealth: vi.fn().mockResolvedValue(false),
      })
    ).rejects.toThrow('service health check failed');
  });
});

describe('decideServiceAction', () => {
  it('does not reuse a healthy running service after config changes', () => {
    const result = decideServiceAction({
      configChanged: true,
      detectedService: { kind: 'self_healthy', port: 3456 },
      reloadSupported: false,
    });

    expect(result).toEqual({ kind: 'restart' });
  });

  it('reuses an already healthy service when config is unchanged', () => {
    const result = decideServiceAction({
      configChanged: false,
      detectedService: { kind: 'self_healthy', port: 3456 },
      reloadSupported: false,
    });

    expect(result).toEqual({ kind: 'reuse' });
  });

  it('starts the service when nothing is running on the target port', () => {
    expect(
      decideServiceAction({
        configChanged: false,
        detectedService: { kind: 'none' },
        reloadSupported: false,
      })
    ).toEqual({ kind: 'start' });

    expect(
      decideServiceAction({
        configChanged: true,
        detectedService: { kind: 'none' },
        reloadSupported: false,
      })
    ).toEqual({ kind: 'start' });
  });

  it('restarts when the existing service is unhealthy', () => {
    expect(
      decideServiceAction({
        configChanged: false,
        detectedService: { kind: 'self_unhealthy', port: 3456 },
        reloadSupported: false,
      })
    ).toEqual({ kind: 'restart' });

    expect(
      decideServiceAction({
        configChanged: true,
        detectedService: { kind: 'self_unhealthy', port: 3456 },
        reloadSupported: true,
      })
    ).toEqual({ kind: 'restart' });
  });

  it('reloads a healthy service after config changes when reload is supported', () => {
    const result = decideServiceAction({
      configChanged: true,
      detectedService: { kind: 'self_healthy', port: 3456 },
      reloadSupported: true,
    });

    expect(result).toEqual({ kind: 'reload' });
  });

  it('throws when another service occupies the target port', () => {
    expect(() =>
      decideServiceAction({
        configChanged: true,
        detectedService: { kind: 'non_self_occupied', port: 3456 },
        reloadSupported: false,
      })
    ).toThrow('target port is occupied by another service');
  });
});
