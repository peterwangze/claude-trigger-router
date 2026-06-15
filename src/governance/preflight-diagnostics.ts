import { IGovernanceTrace } from './types';

export type TPreflightStageStatus = 'completed' | 'skipped' | 'bypassed' | 'failed';

export interface IPreflightDiagnostics {
  startedAt: number;
  completedAt?: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolUseCount: number;
  toolResultCount: number;
  textCharCount: number;
  userTextCharCount: number;
  toolResultCharCount: number;
  systemCharCount: number;
  toolSchemaCharCount: number;
  stages: Array<{
    name: string;
    status: TPreflightStageStatus;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    detail?: Record<string, unknown>;
  }>;
}

function textLength(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function collectMessageStats(messages: unknown): Omit<
  IPreflightDiagnostics,
  'startedAt' | 'completedAt' | 'systemCharCount' | 'toolSchemaCharCount' | 'stages'
> {
  const stats = {
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    toolUseCount: 0,
    toolResultCount: 0,
    textCharCount: 0,
    userTextCharCount: 0,
    toolResultCharCount: 0,
  };

  if (!Array.isArray(messages)) {
    return stats;
  }

  for (const message of messages as any[]) {
    stats.messageCount += 1;
    if (message?.role === 'user') {
      stats.userMessageCount += 1;
    }
    if (message?.role === 'assistant') {
      stats.assistantMessageCount += 1;
    }

    const addText = (value: unknown, role?: string) => {
      const length = textLength(value);
      stats.textCharCount += length;
      if (role === 'user') {
        stats.userTextCharCount += length;
      }
      return length;
    };

    if (typeof message?.content === 'string') {
      addText(message.content, message.role);
      continue;
    }

    if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === 'text') {
          addText(part.text, message.role);
        } else if (part?.type === 'tool_use') {
          stats.toolUseCount += 1;
          addText(part.input, message.role);
        } else if (part?.type === 'tool_result') {
          stats.toolResultCount += 1;
          const length = addText(part.content, message.role);
          stats.toolResultCharCount += length;
        }
      }
    }
  }

  return stats;
}

function collectSystemChars(system: unknown): number {
  if (typeof system === 'string') {
    return system.length;
  }
  if (!Array.isArray(system)) {
    return 0;
  }
  return system.reduce((sum, item: any) => {
    if (item?.type !== 'text') {
      return sum;
    }
    if (typeof item.text === 'string') {
      return sum + item.text.length;
    }
    if (Array.isArray(item.text)) {
      return sum + item.text.reduce((innerSum: number, text: unknown) => innerSum + textLength(text), 0);
    }
    return sum;
  }, 0);
}

function collectToolSchemaChars(tools: unknown): number {
  if (!Array.isArray(tools)) {
    return 0;
  }
  return tools.reduce((sum, tool: any) => sum + textLength(tool?.name) + textLength(tool?.description) + textLength(tool?.input_schema), 0);
}

export function initializePreflightDiagnostics(req: any): IPreflightDiagnostics {
  const body = req?.body ?? {};
  const existing = req.preflightDiagnostics as IPreflightDiagnostics | undefined;
  if (existing) {
    return existing;
  }

  const diagnostics: IPreflightDiagnostics = {
    startedAt: Date.now(),
    ...collectMessageStats(body.messages),
    systemCharCount: collectSystemChars(body.system),
    toolSchemaCharCount: collectToolSchemaChars(body.tools),
    stages: [],
  };
  req.preflightDiagnostics = diagnostics;
  return diagnostics;
}

export function recordPreflightStage(
  req: any,
  name: string,
  status: TPreflightStageStatus,
  startedAt: number,
  detail?: Record<string, unknown>
): void {
  const diagnostics = initializePreflightDiagnostics(req);
  const completedAt = Date.now();
  diagnostics.completedAt = completedAt;
  diagnostics.stages.push({
    name,
    status,
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    ...(detail ? { detail } : {}),
  });
}

export function attachPreflightDiagnostics(req: any): void {
  if (!req?.governanceTrace || !req.preflightDiagnostics) {
    return;
  }
  const diagnostics = req.preflightDiagnostics as IPreflightDiagnostics;
  req.governanceTrace.preflightDiagnostics = {
    ...diagnostics,
    stages: diagnostics.stages.map((stage) => ({
      ...stage,
      detail: stage.detail ? { ...stage.detail } : undefined,
    })),
  };
}

export function summarizePreflightDiagnostics(
  trace: IGovernanceTrace
): Record<string, unknown> | undefined {
  const diagnostics = trace.preflightDiagnostics;
  if (!diagnostics) {
    return undefined;
  }

  return {
    messageCount: diagnostics.messageCount,
    userMessageCount: diagnostics.userMessageCount,
    assistantMessageCount: diagnostics.assistantMessageCount,
    toolUseCount: diagnostics.toolUseCount,
    toolResultCount: diagnostics.toolResultCount,
    textCharCount: diagnostics.textCharCount,
    userTextCharCount: diagnostics.userTextCharCount,
    toolResultCharCount: diagnostics.toolResultCharCount,
    systemCharCount: diagnostics.systemCharCount,
    toolSchemaCharCount: diagnostics.toolSchemaCharCount,
    stages: diagnostics.stages.map((stage) => ({
      name: stage.name,
      status: stage.status,
      durationMs: stage.durationMs,
      detail: stage.detail,
    })),
  };
}
