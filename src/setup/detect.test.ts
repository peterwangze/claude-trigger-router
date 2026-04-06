import { describe, expect, it, vi } from 'vitest';

import { detectSetupEnvironment } from './detect';

function createValidConfig() {
  return {
    Providers: [
      {
        name: 'openrouter',
        api_base_url: 'https://openrouter.ai/api/v1/chat/completions',
        api_key: 'sk-test',
        models: ['anthropic/claude-sonnet-4'],
      },
    ],
    Router: {
      default: 'openrouter,anthropic/claude-sonnet-4',
    },
  };
}

describe('detectSetupEnvironment', () => {
  it('returns missing when current config does not exist', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig.kind).toBe('missing');
    expect(result.legacyConfig.kind).toBe('missing');
    expect(result.detectedService.kind).toBe('none');
  });

  it('returns valid when current config parses and validates', async () => {
    const config = createValidConfig();

    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/config.yaml',
        format: 'yaml',
        config,
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig.kind).toBe('valid');
    if (result.currentConfig.kind === 'valid') {
      expect(result.currentConfig.path).toBe('/config.yaml');
      expect(result.currentConfig.config.Router.default).toBe('openrouter,anthropic/claude-sonnet-4');
      expect(result.currentConfig.errors).toEqual([]);
      expect(result.currentConfig.warnings).toEqual([]);
    }
  });

  it('returns invalid when current config parses but fails validation', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: {},
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig.kind).toBe('invalid');
    if (result.currentConfig.kind === 'invalid') {
      expect(result.currentConfig.errors).toContain('Providers is required and must be a non-empty array');
      expect(result.currentConfig.errors).toContain('Router.default is required');
      expect(result.currentConfig.warnings).toEqual([]);
    }
  });

  it('keeps non-fatal capability warnings on valid current config', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Models: [
            {
              id: 'restricted',
              api: 'https://api.example.com/v1/chat/completions',
              key: 'sk-test',
              interface: 'openai',
              model: 'vendor/text-only',
              thinking: 'high',
              metadata: {
                supports_reasoning: false,
              },
            },
          ],
          Router: {
            default: 'restricted',
          },
        },
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig.kind).toBe('valid');
    if (result.currentConfig.kind === 'valid') {
      expect(result.currentConfig.warnings).toEqual([
        'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
      ]);
    }
  });

  it('returns parse_error when current config cannot be parsed', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'parse_error',
        path: '/config.yaml',
        format: 'yaml',
        error: 'YAML parse error in /config.yaml: bad indentation',
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig).toEqual({
      kind: 'parse_error',
      path: '/config.yaml',
      format: 'yaml',
      error: 'YAML parse error in /config.yaml: bad indentation',
    });
  });

  it('keeps legacy config result when current and legacy configs both exist', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/config.yaml',
        format: 'yaml',
        config: createValidConfig(),
      }),
      readLegacyConfig: vi.fn().mockResolvedValue({
        kind: 'found',
        path: '/legacy/ccr.yaml',
        config: {
          Providers: [
            {
              name: 'legacy',
              api_base_url: 'https://legacy.example.com/v1/chat/completions',
              api_key: 'sk-legacy',
              models: ['legacy-model'],
            },
          ],
        },
      }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.currentConfig.kind).toBe('valid');
    expect(result.legacyConfig).toEqual({
      kind: 'found',
      path: '/legacy/ccr.yaml',
      config: {
        Providers: [
          {
            name: 'legacy',
            api_base_url: 'https://legacy.example.com/v1/chat/completions',
            api_key: 'sk-legacy',
            models: ['legacy-model'],
          },
        ],
      },
    });
  });

  it('returns legacy read errors without blocking detect result shape', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({
        kind: 'read_error',
        path: '/legacy/ccr.yaml',
        error: 'permission denied',
      }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.legacyConfig).toEqual({
      kind: 'read_error',
      path: '/legacy/ccr.yaml',
      error: 'permission denied',
    });
  });

  it('returns none when target port has no running service', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'none' }),
    });

    expect(result.detectedService).toEqual({ kind: 'none' });
  });

  it('returns self_healthy when target port already has this service', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_healthy', port: 3456 }),
    });

    expect(result.detectedService).toEqual({ kind: 'self_healthy', port: 3456 });
  });

  it('returns self_unhealthy when target port belongs to this service but health check fails', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'self_unhealthy', port: 3456 }),
    });

    expect(result.detectedService).toEqual({ kind: 'self_unhealthy', port: 3456 });
  });

  it('returns non_self_occupied when target port is occupied by another service', async () => {
    const result = await detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      readLegacyConfig: vi.fn().mockResolvedValue({ kind: 'missing' }),
      probeService: vi.fn().mockResolvedValue({ kind: 'non_self_occupied', port: 3456 }),
    });

    expect(result.detectedService).toEqual({ kind: 'non_self_occupied', port: 3456 });
  });

  it('runs current config, legacy config and service probes in parallel', async () => {
    let currentResolved = false;
    let legacyResolved = false;

    const resultPromise = detectSetupEnvironment({
      readCurrentConfig: vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => {
              currentResolved = true;
              resolve({ kind: 'missing' } as const);
            }, 20);
          })
      ),
      readLegacyConfig: vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => {
              legacyResolved = true;
              resolve({ kind: 'missing' } as const);
            }, 10);
          })
      ),
      probeService: vi.fn().mockImplementation(async () => {
        expect(currentResolved).toBe(false);
        expect(legacyResolved).toBe(false);
        return { kind: 'none' } as const;
      }),
    });

    await expect(resultPromise).resolves.toMatchObject({
      currentConfig: { kind: 'missing' },
      legacyConfig: { kind: 'missing' },
      detectedService: { kind: 'none' },
    });
  });
});
