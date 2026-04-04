import { describe, expect, it } from 'vitest';
import { ShadowSupervisor } from './shadow-supervisor';

describe('ShadowSupervisor', () => {
  const supervisor = new ShadowSupervisor();

  it('returns not triggered when disabled', () => {
    expect(supervisor.inspect('TODO', { enabled: false })).toEqual({
      triggered: false,
      findings: [],
    });
  });

  it('detects placeholder pattern as high risk', () => {
    const result = supervisor.inspect('TODO: finish implementation', {
      enabled: true,
      checks: {
        placeholder_patterns: true,
      },
    });

    expect(result.triggered).toBe(true);
    expect(result.riskLevel).toBe('high');
    expect(result.findings).toContain('placeholder_pattern');
  });

  it('detects missing code block and short output', () => {
    const result = supervisor.inspect('function test() { return 1; }', {
      enabled: true,
      checks: {
        length_anomaly: true,
        missing_code_block: true,
      },
    });

    expect(result.triggered).toBe(true);
    expect(result.findings).toContain('missing_code_block');
  });

  it('uses verifier model result when configured', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              triggered: true,
              riskLevel: 'medium',
              findings: ['verifier_detected_low_quality'],
            }),
          },
        ],
      }),
    }) as any;

    const result = await supervisor.inspectWithVerifier(
      'This answer is suspicious',
      {
        enabled: true,
        verifier_model: 'glm,glm-5-air',
      },
      3456,
      fetchFn
    );

    expect(result.triggered).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.findings).toContain('verifier_detected_low_quality');
  });

  it('falls back to local checks when verifier fails', async () => {
    const fetchFn = async () => {
      throw new Error('network error');
    };

    const result = await supervisor.inspectWithVerifier(
      'TODO: finish implementation',
      {
        enabled: true,
        verifier_model: 'glm,glm-5-air',
        checks: {
          placeholder_patterns: true,
        },
      },
      3456,
      fetchFn as any
    );

    expect(result.triggered).toBe(true);
    expect(result.findings).toContain('placeholder_pattern');
  });
});
