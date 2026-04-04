/**
 * Shadow Supervisor
 *
 * 第一阶段采用异步审计思路，但实现为请求完成前的轻量本地审查与 trace 记录。
 */

import { IShadowSupervisorConfig } from './types';

export interface IShadowAuditResult {
  triggered: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  findings: string[];
}

function extractText(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.content?.[0]?.text === 'string') return payload.content[0].text;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return '';
}

export class ShadowSupervisor {
  inspect(payload: any, config?: IShadowSupervisorConfig): IShadowAuditResult {
    if (!config?.enabled) {
      return { triggered: false, findings: [] };
    }

    const text = extractText(payload).trim();
    const findings: string[] = [];

    if (!text) {
      findings.push('empty_output');
    }

    if (config.checks?.placeholder_patterns) {
      if (/TODO|placeholder|\.\.\.rest of code/i.test(text)) {
        findings.push('placeholder_pattern');
      }
    }

    if (config.checks?.length_anomaly && text && text.length < 30) {
      findings.push('length_anomaly');
    }

    if (config.checks?.missing_code_block && /```/.test(text) === false && /function|class|const|let|var/i.test(text)) {
      findings.push('missing_code_block');
    }

    if (findings.length === 0) {
      return { triggered: false, findings: [] };
    }

    const riskLevel =
      findings.includes('placeholder_pattern') || findings.includes('empty_output')
        ? 'high'
        : findings.length > 1
          ? 'medium'
          : 'low';

    return {
      triggered: true,
      riskLevel,
      findings,
    };
  }
}

export const shadowSupervisor = new ShadowSupervisor();
