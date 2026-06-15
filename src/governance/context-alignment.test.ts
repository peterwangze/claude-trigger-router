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
      5678,
      fetchFn
    );

    expect(result).toBe('Continue fixing login flow and preserve current auth constraints.');
  });

  it('bounds long alignment context and uses a short independent timeout', async () => {
    let requestBody: any;
    let signal: AbortSignal | undefined;
    const fetchFn = async (_url: string, init: any) => {
      requestBody = JSON.parse(init.body);
      signal = init.signal;
      return {
        ok: true,
        json: async () => ({
          content: [{ text: 'Continue from the bounded tail.' }],
        }),
      } as any;
    };

    const result = await service.summarizeTransitionWithDiagnostics(
      `old context ${'x'.repeat(200)} important tail`,
      'provider,model-a',
      'provider,model-b',
      {
        enabled: true,
        summarizer_model: 'provider,summary',
        max_summary_tokens: 128,
        max_context_chars: 32,
      },
      5678,
      fetchFn,
      undefined,
      600000
    );

    expect(result.summary).toBe('Continue from the bounded tail.');
    expect(result.truncated).toBe(true);
    expect(result.boundedChars).toBe(32);
    expect(result.timeoutMs).toBe(30000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(requestBody)).toContain('important tail');
    expect(JSON.stringify(requestBody)).not.toContain('old context');
  });

  it('reports skip diagnostics when summarizer is missing', async () => {
    const result = await service.summarizeTransitionWithDiagnostics(
      'fix login flow',
      'provider,model-a',
      'provider,model-b',
      {
        enabled: true,
      }
    );

    expect(result.summary).toBeNull();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('missing_summarizer_model');
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
