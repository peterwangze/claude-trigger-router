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

  it('throws when action is incompatible with a valid current config', () => {
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
        currentConfigAction: 'repair',
      })
    ).toThrow('invalid current config action');
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
