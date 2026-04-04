import { describe, expect, it } from 'vitest';
import { ContextAlignmentService } from './context-alignment';

describe('ContextAlignmentService', () => {
  const service = new ContextAlignmentService();

  it('returns null when alignment is disabled', async () => {
    const result = await service.summarizeTransition(
      'fix login flow',
      'provider,model-a',
      'provider,model-b',
      {
        enabled: false,
        summarizer_model: 'provider,summary',
      }
    );

    expect(result).toBeNull();
  });

  it('returns summary when loopback response succeeds', async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({
        content: [{ text: 'Continue fixing login flow and preserve current auth constraints.' }],
      }),
    }) as any;

    const result = await service.summarizeTransition(
      'fix login flow',
      'provider,model-a',
      'provider,model-b',
      {
        enabled: true,
        summarizer_model: 'provider,summary',
        max_summary_tokens: 128,
      },
      3456,
      fetchFn
    );

    expect(result).toBe('Continue fixing login flow and preserve current auth constraints.');
  });

  it('injects alignment summary ahead of existing system context', () => {
    const injected = service.injectAlignmentContext(
      [{ type: 'text', text: 'existing system prompt' }],
      'summary text',
      'provider,model-a',
      'provider,model-b'
    );

    expect(Array.isArray(injected)).toBe(true);
    expect(injected[0].text).toContain('summary text');
    expect(injected[1]).toEqual({ type: 'text', text: 'existing system prompt' });
  });
});
