import { describe, expect, it } from 'vitest';

import { getRepairFields } from './repair';

describe('getRepairFields', () => {
  it('maps Router.default error to defaultModel only', () => {
    const result = getRepairFields(['Router.default is required']);

    expect(result).toEqual(['defaultModel']);
  });

  it('maps provider credential errors to provider repair fields', () => {
    const result = getRepairFields([
      'Providers[0].api_key is required',
      'Providers[0].api_base_url is required',
    ]);

    expect(result).toEqual(['apiKey', 'apiBaseUrl']);
  });

  it('maps Models alias credential errors to repair fields', () => {
    const result = getRepairFields([
      'Models[0].key is required',
      'Models[0].api is required',
    ]);

    expect(result).toEqual(['apiKey', 'apiBaseUrl']);
  });

  it('deduplicates repeated field mappings and preserves first-seen order', () => {
    const result = getRepairFields([
      'Providers[0].api_key is required',
      'Providers[1].api_key is required',
      'Router.default is required',
      'Providers[0].api_base_url is required',
      'Router.default is required',
    ]);

    expect(result).toEqual(['apiKey', 'defaultModel', 'apiBaseUrl']);
  });

  it('falls back to manualReview for unrecognized errors', () => {
    const result = getRepairFields(['SmartRouter.router_model is required when SmartRouter is enabled']);

    expect(result).toEqual(['manualReview']);
  });

  it('maps capability warnings to capabilityHints repair field', () => {
    const result = getRepairFields([
      'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.',
      'Models[0].metadata.supports_tools disables tools for model "restricted". Tool definitions and tool call/result blocks will fall back to plain text.',
      'Models[0].metadata.supports_images disables image input for model "restricted". Image blocks will fall back to plain text descriptions.',
    ]);

    expect(result).toEqual(['capabilityHints']);
  });
});
