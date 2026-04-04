/**
 * Shadow Supervisor
 *
 * 第一阶段采用异步审计思路，但实现为请求完成前的轻量本地审查与 trace 记录。
 */

import { IShadowSupervisorConfig } from './types';
import { IFailureEvidence } from './cascade-gate';
import { logError, logWarn } from '../utils/log';

export interface IShadowAuditResult {
  triggered: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  findings: string[];
}

const SHADOW_VERIFIER_PROMPT = `You are a response quality auditor.
Inspect the assistant output and decide whether it is low quality, incomplete, placeholder-heavy, or suspiciously weak.

Response:
"""
{response}
"""

Return JSON only:
{
  "triggered": true,
  "riskLevel": "low|medium|high",
  "findings": ["short_reason"]
}

If no issue is found, return:
{
  "triggered": false,
  "findings": []
}`;

function extractText(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.content?.[0]?.text === 'string') return payload.content[0].text;
  if (typeof payload?.error?.message === 'string') return payload.error.message;
  return '';
}

export class ShadowSupervisor {
  private buildVerifierPrompt(text: string): string {
    return SHADOW_VERIFIER_PROMPT.replace('{response}', text);
  }

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

  toFailureEvidence(audit: IShadowAuditResult): IFailureEvidence[] {
    if (!audit.triggered) {
      return [];
    }

    return audit.findings.map((finding) => {
      switch (finding) {
        case 'empty_output':
          return { type: 'empty_response', detail: 'Shadow supervisor detected empty output' };
        case 'length_anomaly':
          return { type: 'short_response', detail: 'Shadow supervisor detected length anomaly' };
        case 'placeholder_pattern':
          return { type: 'placeholder_pattern', detail: 'Shadow supervisor detected placeholder pattern' };
        default:
          return { type: 'quality_risk', detail: `Shadow supervisor detected ${finding}` };
      }
    });
  }

  async inspectWithVerifier(
    payload: any,
    config: IShadowSupervisorConfig,
    port: number = 3456,
    fetchFn?: typeof fetch,
    apiKey?: string,
    timeoutMs?: number
  ): Promise<IShadowAuditResult> {
    const text = extractText(payload).trim();
    if (!config.enabled || !config.verifier_model || !text) {
      return this.inspect(payload, config);
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          model: config.verifier_model,
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: this.buildVerifierPrompt(text),
            },
          ],
        }),
        ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });

      if (!response.ok) {
        logWarn('[ShadowSupervisor] Verifier request failed:', response.status);
        return this.inspect(payload, config);
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        logWarn('[ShadowSupervisor] No JSON found in verifier response');
        return this.inspect(payload, config);
      }

      const parsed = JSON.parse(match[0]) as IShadowAuditResult;
      return {
        triggered: Boolean(parsed.triggered),
        riskLevel: parsed.riskLevel,
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      };
    } catch (error) {
      logError('[ShadowSupervisor] Verifier audit failed:', error);
      return this.inspect(payload, config);
    }
  }
}

export const shadowSupervisor = new ShadowSupervisor();
