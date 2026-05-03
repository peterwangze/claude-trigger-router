import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFLINE_EVALUATION_TASKS,
  formatOfflineTaskEvaluationReport,
  runOfflineTaskEvaluation,
} from './task-evaluation';

describe('offline task evaluation', () => {
  it('scores fixed task results with deterministic quality and speed rubric', () => {
    const report = runOfflineTaskEvaluation([
      {
        taskId: 'coding_fix',
        model: 'anthropic,sonnet',
        latencyMs: 1200,
        output: [
          'This fix updates the failing branch and adds a focused test plan.',
          '',
          '```ts',
          'expect(result).toBe(true);',
          '```',
        ].join('\n'),
      },
      {
        taskId: 'coding_fix',
        model: 'fast,haiku',
        latencyMs: 900,
        output: 'TODO placeholder',
      },
      {
        taskId: 'architecture_review',
        model: 'openrouter,opus',
        latencyMs: 2100,
        output: 'Risk: coupling. Tradeoff: latency. Rollout checks: staged canary, metrics, rollback plan.',
      },
      {
        taskId: 'unknown_task',
        model: 'openrouter,opus',
        latencyMs: 50,
        output: 'ignored',
      },
    ]);

    expect(report.totalTasks).toBe(DEFAULT_OFFLINE_EVALUATION_TASKS.length);
    expect(report.totalRuns).toBe(4);
    expect(report.evaluatedRuns).toBe(3);
    expect(report.missingTaskIds).toEqual(['unknown_task']);
    expect(report.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'anthropic,sonnet',
        totalRuns: 1,
        passedRuns: 1,
        passRate: 1,
      }),
      expect.objectContaining({
        key: 'fast,haiku',
        totalRuns: 1,
        passedRuns: 0,
        passRate: 0,
      }),
    ]));
    expect(report.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'coding_fix',
        model: 'fast,haiku',
        passed: false,
        findings: expect.arrayContaining([
          expect.stringContaining('output_too_short'),
          expect.stringContaining('missing_code_block'),
          expect.stringContaining('forbidden_patterns'),
        ]),
      }),
    ]));
    expect(report.bestRunsByTask).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'coding_fix',
        model: 'anthropic,sonnet',
        passed: true,
      }),
    ]));
  });

  it('formats a concise operator-facing report', () => {
    const report = runOfflineTaskEvaluation([
      {
        taskId: 'quick_status',
        model: 'fast,haiku',
        latencyMs: 300,
        output: 'Status is ready. Next action is to keep monitoring the route.',
      },
    ]);

    expect(formatOfflineTaskEvaluationReport(report)).toContain('Offline routing evaluation');
    expect(formatOfflineTaskEvaluationReport(report)).toContain('fast,haiku');
    expect(formatOfflineTaskEvaluationReport(report)).toContain('quick_status -> fast,haiku');
  });
});
