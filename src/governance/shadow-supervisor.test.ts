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
});
