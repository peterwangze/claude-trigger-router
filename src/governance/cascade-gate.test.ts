import { describe, expect, it } from 'vitest';
import { decideCascadeEscalation, detectFailureEvidence, executeCascadeRetry } from './cascade-gate';

describe('detectFailureEvidence', () => {
  const config = {
    enabled: true,
    max_attempts: 2,
    triggers: {
      compile_failure: true,
      test_failure: true,
      placeholder_patterns: ['TODO', '...rest of code'],
    },
    levels: [],
  };

  it('detects empty response', () => {
    expect(detectFailureEvidence('', config)).toEqual([
      { type: 'empty_response', detail: 'Response payload is empty' },
    ]);
  });

  it('detects placeholder patterns and short responses', () => {
    const result = detectFailureEvidence('TODO', config);
    expect(result.some((item) => item.type === 'placeholder_pattern')).toBe(true);
    expect(result.some((item) => item.type === 'short_response')).toBe(true);
  });

  it('detects compile and test failure markers', () => {
    const result = detectFailureEvidence('Build failed due to TypeScript error. Test failed with AssertionError.', config);
    expect(result.some((item) => item.type === 'compile_failure')).toBe(true);
    expect(result.some((item) => item.type === 'test_failure')).toBe(true);
  });
});

describe('decideCascadeEscalation', () => {
  const config = {
    enabled: true,
    max_attempts: 2,
    levels: [
      { from: 'provider,model-a', to: 'provider,model-b', reasoning: 'high' },
    ],
  };

  it('returns escalation decision when evidence exists', () => {
    const decision = decideCascadeEscalation(
      'provider,model-a',
      [{ type: 'compile_failure', detail: 'compile failed' }],
      config,
      0
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.nextModel).toBe('provider,model-b');
  });

  it('does not escalate after max attempts', () => {
    const decision = decideCascadeEscalation(
      'provider,model-a',
      [{ type: 'compile_failure', detail: 'compile failed' }],
      config,
      2
    );

    expect(decision.shouldEscalate).toBe(false);
  });
});

describe('executeCascadeRetry', () => {
  it('replays the request with the next model and incremented attempt', async () => {
    let capturedBody: any;
    const fetchFn = async (_url: string, init?: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ content: [{ text: 'rescued response' }] }),
      } as any;
    };

    const result = await executeCascadeRetry(
      {
        model: 'provider,model-a',
        messages: [{ role: 'user', content: 'fix this' }],
        metadata: { ctr_cascade_attempt: 0 },
      },
      'provider,model-b',
      5678,
      undefined,
      undefined,
      fetchFn as any
    );

    expect(capturedBody.model).toBe('provider,model-b');
    expect(capturedBody.metadata.ctr_cascade_attempt).toBe(1);
    expect(result).toEqual({ content: [{ text: 'rescued response' }] });
  });
});
