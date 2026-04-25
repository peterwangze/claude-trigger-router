import type { ICompiledCapabilityWarningReport } from '../models/compile';

export type ValidationIssueSeverity = 'error' | 'warning' | 'info';
export type ValidationIssueSource = 'schema' | 'capability';

export interface IValidationIssue {
  severity: ValidationIssueSeverity;
  source: ValidationIssueSource;
  message: string;
  path?: string;
  code?: string;
  action: string;
}

export interface IValidationIssueReport {
  issues: IValidationIssue[];
  summary: {
    total: number;
    error: number;
    warning: number;
    info: number;
  };
}

function inferPath(message: string): string | undefined {
  const directPath = message.match(/^([A-Za-z][A-Za-z0-9]*(?:\[\d+\])?(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/);
  if (directPath) {
    return directPath[1];
  }
  return undefined;
}

function inferSchemaAction(message: string): string {
  if (message === 'Router.default is required') {
    return 'Set Router.default to one of the configured Models ids.';
  }
  if (message === 'Providers is required and must be a non-empty array') {
    return 'Add at least one model through Models or provide a legacy Providers entry.';
  }
  if (/^(Providers\[\d+\]\.api_key|Models\[\d+\]\.key) is required$/.test(message)) {
    return 'Fill in the API key for the referenced provider or model.';
  }
  if (/^(Providers\[\d+\]\.api_base_url|Models\[\d+\]\.api) is required$/.test(message)) {
    return 'Fill in the API endpoint URL for the referenced provider or model.';
  }
  if (/^Models\[\d+\]\.model is required$/.test(message)) {
    return 'Set the upstream model name used by this Models entry.';
  }
  if (/^Models\[\d+\]\.id is required$/.test(message)) {
    return 'Give this Models entry a stable model id, then reference it from Router.default.';
  }
  if (/is not a known model id/.test(message) || /references missing model/.test(message)) {
    return 'Change the reference to an existing Models id, or add the missing model entry.';
  }
  return 'Review the field, then repair the config before saving or starting the service.';
}

function inferCapabilityAction(code: string | undefined, message: string): string {
  if (code === 'thinking_ignored' || /^Models\[\d+\]\.thinking is configured/.test(message)) {
    return 'Remove the thinking setting for this model, or change metadata.supports_reasoning to true only if the endpoint supports reasoning.';
  }
  if (code === 'tools_text_fallback' || /^Models\[\d+\]\.metadata\.supports_tools/.test(message)) {
    return 'Accept text fallback behavior, or set metadata.supports_tools to true only for a tool-capable endpoint.';
  }
  if (code === 'images_text_fallback' || /^Models\[\d+\]\.metadata\.supports_images/.test(message)) {
    return 'Accept text fallback behavior, or set metadata.supports_images to true only for an image-capable endpoint.';
  }
  return 'Review the capability hint and decide whether the fallback behavior is acceptable.';
}

export function buildValidationIssueReport(input: {
  errors?: string[];
  warnings?: string[];
  capabilityWarnings?: ICompiledCapabilityWarningReport;
}): IValidationIssueReport {
  const issues: IValidationIssue[] = [];
  const capabilityEntries = input.capabilityWarnings?.entries ?? [];
  const capabilityKeys = new Set(
    capabilityEntries.map((warning) => `${warning.path ?? ''}\n${warning.message}`)
  );

  for (const message of input.errors ?? []) {
    if (!message) {
      continue;
    }
    issues.push({
      severity: 'error',
      source: 'schema',
      message,
      path: inferPath(message),
      action: inferSchemaAction(message),
    });
  }

  for (const message of input.warnings ?? []) {
    if (!message) {
      continue;
    }
    const path = inferPath(message);
    if (capabilityKeys.has(`${path ?? ''}\n${message}`)) {
      continue;
    }
    issues.push({
      severity: 'warning',
      source: 'capability',
      message,
      path,
      action: inferCapabilityAction(undefined, message),
    });
  }

  for (const warning of capabilityEntries) {
    if (!warning?.message) {
      continue;
    }
    if (issues.some((issue) => issue.message === warning.message && issue.path === warning.path)) {
      continue;
    }
    issues.push({
      severity: warning.level === 'warn' ? 'warning' : 'info',
      source: 'capability',
      message: warning.message,
      path: warning.path,
      code: warning.code,
      action: inferCapabilityAction(warning.code, warning.message),
    });
  }

  return {
    issues,
    summary: {
      total: issues.length,
      error: issues.filter((issue) => issue.severity === 'error').length,
      warning: issues.filter((issue) => issue.severity === 'warning').length,
      info: issues.filter((issue) => issue.severity === 'info').length,
    },
  };
}

export function formatValidationIssue(issue: IValidationIssue): string {
  const path = issue.path ? `${issue.path}: ` : '';
  return `[${issue.severity}] ${path}${issue.message} Action: ${issue.action}`;
}

export function formatValidationIssueReport(report: IValidationIssueReport): string[] {
  return report.issues.map((issue) => formatValidationIssue(issue));
}
