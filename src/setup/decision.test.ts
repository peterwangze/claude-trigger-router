import { describe, expect, it } from 'vitest';

import { ISetupEnvironmentDetectionResult } from './detect';
import { decideSetupBranch } from './decision';

function createDetectionResult(
  currentConfig: ISetupEnvironmentDetectionResult['currentConfig'],
  legacyConfig: ISetupEnvironmentDetectionResult['legacyConfig'] = { kind: 'missing' }
): ISetupEnvironmentDetectionResult {
  return {
    currentConfig,
    legacyConfig,
    detectedService: { kind: 'none' as const },
  };
}

function buildValidCurrentConfig(): ISetupEnvironmentDetectionResult['currentConfig'] {
  return {
    kind: 'valid',
    path: '/config.yaml',
    format: 'yaml',
    config: {
      Providers: [],
      Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
    },
    errors: [],
    warnings: [],
  };
}

function buildInvalidCurrentConfig(): ISetupEnvironmentDetectionResult['currentConfig'] {
  return {
    kind: 'invalid',
    path: '/config.yaml',
    format: 'yaml',
    config: {
      Providers: [],
      Router: { default: '' },
    },
    errors: ['Router.default is required'],
    warnings: [],
  };
}

function buildLegacyFound(): ISetupEnvironmentDetectionResult['legacyConfig'] {
  return {
    kind: 'found',
    path: '/legacy/ccr.yaml',
    config: { providers: [] },
  };
}

function buildLegacyReadError(): ISetupEnvironmentDetectionResult['legacyConfig'] {
  return {
    kind: 'read_error',
    path: '/legacy/ccr.yaml',
    error: 'permission denied',
  };
}

describe('decideSetupBranch', () => {
  it('prefers reusing a valid current config by default', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'valid',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        },
        errors: [],
        warnings: [],
      }),
      currentConfigAction: 'reuse',
    });

    expect(result).toEqual({ kind: 'reuse_current' });
  });

  it('chooses migrate_legacy when user chooses overwrite and confirms legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        {
          kind: 'valid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
          },
          errors: [],
          warnings: [],
        },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'overwrite',
      legacyConfigAction: 'migrate',
    });

    expect(result).toEqual({ kind: 'migrate_legacy' });
  });

  it('chooses fresh_init when user chooses overwrite but skips legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        {
          kind: 'valid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
          },
          errors: [],
          warnings: [],
        },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'overwrite',
      legacyConfigAction: 'skip',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('chooses fresh_init when user abandons a valid current config and no legacy config exists', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'valid',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        },
        errors: [],
        warnings: [],
      }),
      currentConfigAction: 'fresh',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('chooses fresh_init when user chooses overwrite and no legacy config exists', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'valid',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        },
        errors: [],
        warnings: [],
      }),
      currentConfigAction: 'overwrite',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('returns unparseable_current when current config cannot be parsed', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'parse_error',
        path: '/config.yaml',
        format: 'yaml',
        error: 'bad yaml',
      }),
      currentConfigAction: 'rebuild',
    });

    expect(result).toEqual({ kind: 'unparseable_current' });
  });

  it('returns repair_current when current config is invalid and user chooses repair', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'invalid',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: { default: '' },
        },
        errors: ['Router.default is required'],
        warnings: [],
      }),
      currentConfigAction: 'repair',
    });

    expect(result).toEqual({ kind: 'repair_current' });
  });

  it('returns migrate_legacy when current config is invalid and user chooses overwrite with legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        {
          kind: 'invalid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: '' },
          },
          errors: ['Router.default is required'],
          warnings: [],
        },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'overwrite',
      legacyConfigAction: 'migrate',
    });

    expect(result).toEqual({ kind: 'migrate_legacy' });
  });

  it('returns fresh_init when current config is invalid and user chooses overwrite without legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        {
          kind: 'invalid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: '' },
          },
          errors: ['Router.default is required'],
          warnings: [],
        },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'overwrite',
      legacyConfigAction: 'skip',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('returns fresh_init when no current config exists and no legacy config exists', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({ kind: 'missing' }),
      currentConfigAction: 'create',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('returns migrate_legacy when no current config exists and user chooses legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        { kind: 'missing' },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'create',
      legacyConfigAction: 'migrate',
    });

    expect(result).toEqual({ kind: 'migrate_legacy' });
  });

  it('returns fresh_init when no current config exists and user skips legacy migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        { kind: 'missing' },
        {
          kind: 'found',
          path: '/legacy/ccr.yaml',
          config: { providers: [] },
        }
      ),
      currentConfigAction: 'create',
      legacyConfigAction: 'skip',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('throws when legacy config exists but migration choice is not decided yet', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(
          { kind: 'missing' },
          {
            kind: 'found',
            path: '/legacy/ccr.yaml',
            config: { providers: [] },
          }
        ),
        currentConfigAction: 'create',
      })
    ).toThrow('legacy migration choice is required');
  });

  it('allows a valid current config to enter the repair branch for warning quick fixes', () => {
    expect(
      decideSetupBranch({
        detection: createDetectionResult({
          kind: 'valid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
          },
          errors: [],
          warnings: ['Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.'],
        }),
        currentConfigAction: 'repair',
      })
    ).toEqual({ kind: 'repair_current' });
  });

  it('throws when legacy config read failed but user has not chosen to skip yet', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(
          { kind: 'missing' },
          {
            kind: 'read_error',
            path: '/legacy/ccr.yaml',
            error: 'permission denied',
          }
        ),
        currentConfigAction: 'create',
      })
    ).toThrow('legacy read error must be acknowledged');
  });

  it('returns fresh_init when legacy config read failed and user explicitly skips migration', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult(
        { kind: 'missing' },
        {
          kind: 'read_error',
          path: '/legacy/ccr.yaml',
          error: 'permission denied',
        }
      ),
      currentConfigAction: 'create',
      legacyConfigAction: 'skip',
    });

    expect(result).toEqual({ kind: 'fresh_init' });
  });

  it('throws when overwrite reaches a legacy read error before user chooses skip', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(
          {
            kind: 'valid',
            path: '/config.yaml',
            format: 'yaml',
            config: {
              Providers: [],
              Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
            },
            errors: [],
            warnings: [],
          },
          {
            kind: 'read_error',
            path: '/legacy/ccr.yaml',
            error: 'permission denied',
          }
        ),
        currentConfigAction: 'overwrite',
      })
    ).toThrow('legacy read error must be acknowledged');
  });

  it.each([
    {
      name: 'missing + create + legacy found + skip',
      currentConfig: { kind: 'missing' } as const,
      currentConfigAction: 'create' as const,
      legacyConfig: buildLegacyFound(),
      legacyConfigAction: 'skip' as const,
    },
    {
      name: 'missing + create + legacy missing',
      currentConfig: { kind: 'missing' } as const,
      currentConfigAction: 'create' as const,
      legacyConfig: { kind: 'missing' } as const,
    },
    {
      name: 'missing + create + legacy read_error + skip',
      currentConfig: { kind: 'missing' } as const,
      currentConfigAction: 'create' as const,
      legacyConfig: buildLegacyReadError(),
      legacyConfigAction: 'skip' as const,
    },
    {
      name: 'valid + overwrite + legacy found + skip',
      currentConfig: buildValidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: buildLegacyFound(),
      legacyConfigAction: 'skip' as const,
    },
    {
      name: 'valid + overwrite + legacy missing',
      currentConfig: buildValidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: { kind: 'missing' } as const,
    },
    {
      name: 'valid + overwrite + legacy read_error + skip',
      currentConfig: buildValidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: buildLegacyReadError(),
      legacyConfigAction: 'skip' as const,
    },
    {
      name: 'invalid + overwrite + legacy found + skip',
      currentConfig: buildInvalidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: buildLegacyFound(),
      legacyConfigAction: 'skip' as const,
    },
    {
      name: 'invalid + overwrite + legacy missing',
      currentConfig: buildInvalidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: { kind: 'missing' } as const,
    },
    {
      name: 'invalid + overwrite + legacy read_error + skip',
      currentConfig: buildInvalidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
      legacyConfig: buildLegacyReadError(),
      legacyConfigAction: 'skip' as const,
    },
  ])('returns fresh_init only for $name', ({ currentConfig, currentConfigAction, legacyConfig, legacyConfigAction }) => {
    expect(
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, legacyConfig),
        currentConfigAction,
        legacyConfigAction,
      })
    ).toEqual({ kind: 'fresh_init' });
  });

  it.each([
    {
      name: 'missing + create',
      currentConfig: { kind: 'missing' } as const,
      currentConfigAction: 'create' as const,
    },
    {
      name: 'valid + overwrite',
      currentConfig: buildValidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
    },
    {
      name: 'invalid + overwrite',
      currentConfig: buildInvalidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
    },
  ])('keeps legacy flow boundaries stable for $name', ({ currentConfig, currentConfigAction }) => {
    expect(
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, buildLegacyFound()),
        currentConfigAction,
        legacyConfigAction: 'migrate',
      })
    ).toEqual({ kind: 'migrate_legacy' });

    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, buildLegacyFound()),
        currentConfigAction,
      })
    ).toThrow('legacy migration choice is required');

    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, buildLegacyReadError()),
        currentConfigAction,
      })
    ).toThrow('legacy read error must be acknowledged');

    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, buildLegacyReadError()),
        currentConfigAction,
        legacyConfigAction: 'migrate',
      })
    ).toThrow('legacy migration action is only valid when legacy config is found');

    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(currentConfig, { kind: 'missing' }),
        currentConfigAction,
        legacyConfigAction: 'skip',
      })
    ).toThrow('legacy migration action is only valid when legacy config is found');
  });

  it.each([
    {
      name: 'missing + create',
      currentConfig: { kind: 'missing' } as const,
      currentConfigAction: 'create' as const,
    },
    {
      name: 'valid + overwrite',
      currentConfig: buildValidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
    },
    {
      name: 'invalid + overwrite',
      currentConfig: buildInvalidCurrentConfig(),
      currentConfigAction: 'overwrite' as const,
    },
  ])('does not return fresh_init outside the allowed legacy outcomes for $name', ({ currentConfig, currentConfigAction }) => {
    const outcomes = [
      {
        label: 'legacy found + migrate',
        result: decideSetupBranch({
          detection: createDetectionResult(currentConfig, buildLegacyFound()),
          currentConfigAction,
          legacyConfigAction: 'migrate',
        }),
      },
      {
        label: 'legacy found without choice',
        result: () =>
          decideSetupBranch({
            detection: createDetectionResult(currentConfig, buildLegacyFound()),
            currentConfigAction,
          }),
      },
      {
        label: 'legacy read_error without acknowledgement',
        result: () =>
          decideSetupBranch({
            detection: createDetectionResult(currentConfig, buildLegacyReadError()),
            currentConfigAction,
          }),
      },
      {
        label: 'legacy read_error + migrate',
        result: () =>
          decideSetupBranch({
            detection: createDetectionResult(currentConfig, buildLegacyReadError()),
            currentConfigAction,
            legacyConfigAction: 'migrate',
          }),
      },
      {
        label: 'legacy missing + skip',
        result: () =>
          decideSetupBranch({
            detection: createDetectionResult(currentConfig, { kind: 'missing' }),
            currentConfigAction,
            legacyConfigAction: 'skip',
          }),
      },
    ];

    expect(outcomes[0].result).toEqual({ kind: 'migrate_legacy' });
    expect(() => outcomes[1].result()).toThrow('legacy migration choice is required');
    expect(() => outcomes[2].result()).toThrow('legacy read error must be acknowledged');
    expect(() => outcomes[3].result()).toThrow('legacy migration action is only valid when legacy config is found');
    expect(() => outcomes[4].result()).toThrow('legacy migration action is only valid when legacy config is found');
  });

  it('throws when legacy migration action is provided but no legacy config was found', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult({ kind: 'missing' }),
        currentConfigAction: 'create',
        legacyConfigAction: 'migrate',
      })
    ).toThrow('legacy migration action is only valid when legacy config is found');
  });

  it('throws when legacy migration action is provided for a legacy read error', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult(
          { kind: 'missing' },
          {
            kind: 'read_error',
            path: '/legacy/ccr.yaml',
            error: 'permission denied',
          }
        ),
        currentConfigAction: 'create',
        legacyConfigAction: 'migrate',
      })
    ).toThrow('legacy migration action is only valid when legacy config is found');
  });

  it('returns cancelled when user exits setup from valid current config prompt', () => {
    const result = decideSetupBranch({
      detection: createDetectionResult({
        kind: 'valid',
        path: '/config.yaml',
        format: 'yaml',
        config: {
          Providers: [],
          Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
        },
        errors: [],
        warnings: [],
      }),
      currentConfigAction: 'cancel',
    });

    expect(result).toEqual({ kind: 'cancelled' });
  });

  it('throws when cancel is combined with an unnecessary legacy choice', () => {
    expect(() =>
      decideSetupBranch({
        detection: createDetectionResult({
          kind: 'valid',
          path: '/config.yaml',
          format: 'yaml',
          config: {
            Providers: [],
            Router: { default: 'openrouter,anthropic/claude-sonnet-4' },
          },
          errors: [],
          warnings: [],
        }),
        currentConfigAction: 'cancel',
        legacyConfigAction: 'migrate',
      })
    ).toThrow('invalid legacy config action');
  });
});
