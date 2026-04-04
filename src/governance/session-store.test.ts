import { describe, expect, it } from 'vitest';
import { SessionStateStore, createTaskFingerprint } from './session-store';

describe('SessionStateStore', () => {
  it('stores and retrieves session state', () => {
    const store = new SessionStateStore(1000);

    store.put('session-a', {
      preferredModel: 'openrouter,anthropic/claude-sonnet-4',
      lastSuccessfulModel: 'openrouter,anthropic/claude-sonnet-4',
      lastTaskFingerprint: 'fix bug',
    });

    expect(store.get('session-a')).toMatchObject({
      sessionKey: 'session-a',
      preferredModel: 'openrouter,anthropic/claude-sonnet-4',
      lastSuccessfulModel: 'openrouter,anthropic/claude-sonnet-4',
      lastTaskFingerprint: 'fix bug',
    });
  });

  it('expires session state after ttl', async () => {
    const store = new SessionStateStore(5);

    store.put('session-b', {
      preferredModel: 'provider,model-a',
      lastSuccessfulModel: 'provider,model-a',
      lastTaskFingerprint: 'same task',
    });

    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(store.get('session-b')).toBeUndefined();
  });

  it('clears all session state', () => {
    const store = new SessionStateStore(1000);

    store.put('session-c', {
      preferredModel: 'provider,model-a',
      lastSuccessfulModel: 'provider,model-a',
      lastTaskFingerprint: 'test',
    });
    store.clear();

    expect(store.get('session-c')).toBeUndefined();
  });
});

describe('createTaskFingerprint', () => {
  it('normalizes case and whitespace', () => {
    expect(createTaskFingerprint('  Fix   BUG  \n now ')).toBe('fix bug now');
  });

  it('returns undefined for empty text', () => {
    expect(createTaskFingerprint('   ')).toBeUndefined();
  });
});
