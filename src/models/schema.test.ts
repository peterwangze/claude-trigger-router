import { describe, expect, it } from 'vitest';

import { getModelApi, inferInterfaceFromApiEndpoint, normalizeApiEndpoint, normalizeModelEndpointConfig } from './schema';

describe('model schema endpoint normalization', () => {
  it('appends chat/completions for openai-compatible endpoints that stop at /v1', () => {
    expect(
      normalizeApiEndpoint('http://127.0.0.1:11434/v1', 'openai')
    ).toBe('http://127.0.0.1:11434/v1/chat/completions');
  });

  it('appends v1/chat/completions for openai-compatible root endpoints', () => {
    expect(
      normalizeApiEndpoint('https://api.openai.com', 'openai')
    ).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('keeps explicit openai-compatible chat/completions endpoints unchanged', () => {
    expect(
      normalizeApiEndpoint('https://example.com/openai/v1/chat/completions', 'openai')
    ).toBe('https://example.com/openai/v1/chat/completions');
  });

  it('appends v1/messages for anthropic root endpoints', () => {
    expect(
      normalizeApiEndpoint('https://api.anthropic.com', 'anthropic')
    ).toBe('https://api.anthropic.com/v1/messages');
  });

  it('infers anthropic interface from a bare anthropic host endpoint', () => {
    expect(
      inferInterfaceFromApiEndpoint('https://api.anthropic.com')
    ).toBe('anthropic');
  });

  it('infers anthropic interface from a bare local host when the model name is Claude and no openai path is present', () => {
    expect(
      inferInterfaceFromApiEndpoint('http://127.0.0.1:8080/v1', 'claude-sonnet-4-5')
    ).toBe('anthropic');
  });

  it('preserves query strings while normalizing endpoint paths', () => {
    expect(
      normalizeApiEndpoint('https://example.com/openai/v1?key=test', 'openai')
    ).toBe('https://example.com/openai/v1/chat/completions?key=test');
  });

  it('uses the normalized endpoint when reading a model config', () => {
    expect(
      getModelApi({
        interface: 'openai',
        api: 'http://127.0.0.1:8080/v1',
      } as any)
    ).toBe('http://127.0.0.1:8080/v1/chat/completions');
  });

  it('writes normalized endpoint aliases back into the normalized model config', () => {
    expect(
      normalizeModelEndpointConfig({
        id: 'local_model',
        interface: 'openai',
        api: 'http://127.0.0.1:8080/v1',
        key: 'sk-local',
        model: 'gpt-4.1',
      } as any)
    ).toEqual(
      expect.objectContaining({
        api: 'http://127.0.0.1:8080/v1/chat/completions',
        api_base_url: 'http://127.0.0.1:8080/v1/chat/completions',
      })
    );
  });
});
