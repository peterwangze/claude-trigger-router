export interface IGuardrailFinding {
  code: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
}

export interface IGuardrailReport {
  status: 'ok' | 'watch' | 'critical';
  findings: IGuardrailFinding[];
}

function report(findings: IGuardrailFinding[]): IGuardrailReport {
  return {
    status: findings.some((item) => item.severity === 'critical')
      ? 'critical'
      : findings.some((item) => item.severity === 'warn')
        ? 'watch'
        : 'ok',
    findings,
  };
}

function extractText(value: any): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractText).join('\n');
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.content === 'string' || Array.isArray(value.content)) {
      return extractText(value.content);
    }
  }
  return '';
}

export function inspectInputGuardrail(body: any): IGuardrailReport {
  const text = extractText(body?.messages).toLowerCase();
  const findings: IGuardrailFinding[] = [];
  if (/ignore (all )?(previous|prior) (instructions|system)/i.test(text)) {
    findings.push({
      code: 'prompt_injection_instruction_override',
      severity: 'warn',
      message: 'Input asks the model to ignore prior or system instructions.',
    });
  }
  if (/(api key|secret|token).{0,40}(print|show|exfiltrate|reveal|dump)|(print|show|exfiltrate|reveal|dump).{0,40}(api key|secret|token)/i.test(text)) {
    findings.push({
      code: 'secret_exfiltration_request',
      severity: 'critical',
      message: 'Input appears to request secret or token disclosure.',
    });
  }
  return report(findings);
}

export function inspectOutputGuardrail(payload: any): IGuardrailReport {
  const text = extractText(payload).toLowerCase();
  const findings: IGuardrailFinding[] = [];
  if (/\b(todo|placeholder|\.\.\.rest of code)\b/i.test(text)) {
    findings.push({
      code: 'placeholder_output',
      severity: 'warn',
      message: 'Output appears to contain placeholder text.',
    });
  }
  if (/\banalyzeimage error\b|\btool error\b|\btool execution error\b/i.test(text)) {
    findings.push({
      code: 'tool_result_error',
      severity: 'warn',
      message: 'Output or tool result indicates a tool execution failure.',
    });
  }
  if (/\bi cannot\b|\bi can't\b|\bnot able to\b/i.test(text)) {
    findings.push({
      code: 'refusal_or_incomplete_output',
      severity: 'info',
      message: 'Output may be a refusal or incomplete response.',
    });
  }
  return report(findings);
}
