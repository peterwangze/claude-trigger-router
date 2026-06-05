import { describe, expect, it } from 'vitest';
import { buildValidationIssueReport, formatValidationIssueReport } from './validation-contract';

describe('validation issue contract', () => {
  it('turns schema errors into actionable repair issues', () => {
    const report = buildValidationIssueReport({
      errors: [
        'Router.default is required',
        'Models[0].key is required',
      ],
    });

    expect(report.summary).toEqual({
      total: 2,
      error: 2,
      warning: 0,
      info: 0,
    });
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        source: 'schema',
        path: 'Router.default',
        action: expect.stringContaining('Router.default'),
      }),
      expect.objectContaining({
        severity: 'error',
        source: 'schema',
        path: 'Models[0].key',
        action: expect.stringContaining('API key'),
      }),
    ]);
  });

  it('deduplicates capability warning strings and structured warnings', () => {
    const warning = 'Models[0].thinking is configured, but model "restricted" disables reasoning. Runtime requests will ignore thinking.';
    const report = buildValidationIssueReport({
      warnings: [warning],
      capabilityWarnings: {
        entries: [
          {
            path: 'Models[0].thinking',
            modelId: 'restricted',
            level: 'warn',
            code: 'thinking_ignored',
            message: warning,
          },
          {
            path: 'Models[0].metadata.supports_tools',
            modelId: 'restricted',
            level: 'info',
            code: 'tools_text_fallback',
            message: 'Models[0].metadata.supports_tools disables tools for model "restricted". Tool definitions and tool call/result blocks will fall back to plain text.',
          },
        ],
        summary: {
          total: 2,
          warn: 1,
          info: 1,
        },
      },
    });

    expect(report.summary).toEqual({
      total: 2,
      error: 0,
      warning: 1,
      info: 1,
    });
    expect(formatValidationIssueReport(report)[0]).toContain('Action: Remove the thinking setting');
    expect(report.issues[1]).toEqual(
      expect.objectContaining({
        severity: 'info',
        path: 'Models[0].metadata.supports_tools',
        action: expect.stringContaining('Accept text fallback behavior'),
      })
    );
  });

  it('keeps info severity when only capability warning strings are available', () => {
    const report = buildValidationIssueReport({
      warnings: [
        'Models[0].metadata.supports_tools disables tools for model "restricted". Tool definitions and tool call/result blocks will fall back to plain text.',
        'Models[0].metadata.supports_images disables image input for model "restricted". Image blocks will fall back to plain text descriptions.',
        'Models[0].metadata.context_window_tokens is not set for model "restricted". Context guard cannot compare this model\'s full window before fallback.',
        'Models[0].metadata.safe_input_tokens is not set for model "restricted". Context guard cannot proactively switch oversized input to Router.longContext.',
      ],
    });

    expect(report.summary).toEqual({
      total: 4,
      error: 0,
      warning: 0,
      info: 4,
    });
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'info',
        path: 'Models[0].metadata.supports_tools',
      }),
      expect.objectContaining({
        severity: 'info',
        path: 'Models[0].metadata.supports_images',
      }),
      expect.objectContaining({
        severity: 'info',
        path: 'Models[0].metadata.context_window_tokens',
        action: expect.stringContaining('context window'),
      }),
      expect.objectContaining({
        severity: 'info',
        path: 'Models[0].metadata.safe_input_tokens',
        action: expect.stringContaining('safe input budget'),
      }),
    ]);
  });
});
