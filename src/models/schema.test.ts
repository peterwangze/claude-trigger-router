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

  it('preserves a trailing slash on explicit openai-compatible endpoints', () => {
    expect(
      normalizeApiEndpoint('https://example.com/openai/v1/chat/completions/', 'openai')
    ).toBe('https://example.com/openai/v1/chat/completions/');
  });

  it('keeps custom openai-compatible operation endpoints unchanged', () => {
    expect(
      normalizeApiEndpoint('https://api.minimax.chat/v1/text/chatcompletion_v2', 'openai')
    ).toBe('https://api.minimax.chat/v1/text/chatcompletion_v2');
    expect(
      normalizeApiEndpoint('https://gateway.example.com/v1/responses?trace=1', 'openai')
    ).toBe('https://gateway.example.com/v1/responses?trace=1');
  });

  it('preserves a trailing slash on custom operation endpoints', () => {
    expect(
      normalizeApiEndpoint('https://gateway.example.com/llm/', 'openai')
    ).toBe('https://gateway.example.com/llm/');
  });

  it('preserves a trailing slash on loose custom operation endpoints', () => {
    expect(
      normalizeApiEndpoint('gateway.example.com/llm/?trace=1', 'openai')
    ).toBe('gateway.example.com/llm/?trace=1');
  });

  it('appends v1/messages for anthropic root endpoints', () => {
    expect(
      normalizeApiEndpoint('https://api.anthropic.com', 'anthropic')
    ).toBe('https://api.anthropic.com/v1/messages');
  });

  it('keeps custom anthropic-compatible operation endpoints unchanged', () => {
    expect(
      normalizeApiEndpoint('https://router.example.com/custom/anthropic/messages', 'anthropic')
    ).toBe('https://router.example.com/custom/anthropic/messages');
    expect(
      normalizeApiEndpoint('https://router.example.com/custom/claude', 'anthropic')
    ).toBe('https://router.example.com/custom/claude');
  });

  it('preserves a trailing slash on explicit anthropic-compatible endpoints', () => {
    expect(
      normalizeApiEndpoint('https://router.example.com/custom/anthropic/messages/', 'anthropic')
    ).toBe('https://router.example.com/custom/anthropic/messages/');
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
