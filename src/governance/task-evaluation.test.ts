import { describe, expect, it } from 'vitest';
import {
  buildOfflineTaskManifest,
  DEFAULT_OFFLINE_EVALUATION_TASKS,
  formatOfflineTaskEvaluationReport,
  formatOfflineTaskManifest,
  parseOfflineEvaluationInputs,
  runOfflineTaskBenchmark,
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

  it('validates operator supplied result files before scoring', () => {
    expect(parseOfflineEvaluationInputs({
      results: [
        {
          taskId: ' quick_status ',
          model: ' fast,haiku ',
          output: 'Status is ready. Next action is to continue.',
          latencyMs: 300,
        },
      ],
    })).toEqual([
      {
        taskId: 'quick_status',
        model: 'fast,haiku',
        output: 'Status is ready. Next action is to continue.',
        latencyMs: 300,
      },
    ]);

    expect(() => parseOfflineEvaluationInputs([{ taskId: 'quick_status', latencyMs: -1 }])).toThrow('缺少 model');
    expect(() => parseOfflineEvaluationInputs({ results: [{ taskId: 'quick_status', model: 'fast', latencyMs: -1 }] })).toThrow('latencyMs 必须是非负数字');
    expect(() => parseOfflineEvaluationInputs({ value: [] })).toThrow('评测输入必须是数组');
  });

  it('includes failing run findings in the operator report', () => {
    const report = runOfflineTaskEvaluation([
      {
        taskId: 'coding_fix',
        model: 'fast,haiku',
        latencyMs: 4000,
        output: 'TODO placeholder',
      },
    ]);

    const output = formatOfflineTaskEvaluationReport(report);
    expect(output).toContain('Findings:');
    expect(output).toContain('coding_fix -> fast,haiku');
    expect(output).toContain('latency_over_budget');
  });

  it('exports a stable fixed task manifest for repeatable benchmark runners', () => {
    const manifest = buildOfflineTaskManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.tasks.length).toBeGreaterThanOrEqual(6);
    expect(manifest.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'auth_deployment_plan',
        category: 'server_ops',
        rubric: expect.objectContaining({
          requiredKeywords: expect.arrayContaining(['scope', 'rotation', 'audit', 'rollback']),
        }),
      }),
      expect.objectContaining({
        id: 'model_pool_incident',
        category: 'pool_health',
        resultTemplate: expect.objectContaining({
          taskId: 'model_pool_incident',
          model: '<provider,model>',
        }),
      }),
    ]));
  });

  it('keeps custom task manifests backward compatible when optional metadata is absent', () => {
    const manifest = buildOfflineTaskManifest([
      {
        id: 'custom_task',
        intent: 'custom',
        prompt: 'Answer a custom prompt.',
      },
    ]);

    expect(manifest.tasks[0]).toEqual(expect.objectContaining({
      id: 'custom_task',
      category: 'general',
      expectedOutput: 'A complete answer that satisfies the task prompt.',
    }));
  });

  it('formats task prompts and rubrics for operators', () => {
    const output = formatOfflineTaskManifest();
    expect(output).toContain('Offline evaluation tasks');
    expect(output).toContain('auth_deployment_plan');
    expect(output).toContain('model_pool_incident');
    expect(output).toContain('Rubric:');
    expect(output).toContain('Required:');
    expect(output).toContain('Forbidden:');
    expect(output).toContain('Requires code block: true');
    expect(output).toContain('...rest of code');
  });

  it('runs fixed tasks against models and feeds the deterministic evaluator', async () => {
    const fetchFn = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: [
                `Status next for ${body.model}.`,
                'This fix includes a test plan, risk, tradeoff, rollout, goal, constraint and blocker.',
                'It covers scope, rotation, audit, rollback, latency, 5xx and fallback.',
                '```ts',
                'expect(true).toBe(true);',
                '```',
              ].join('\n'),
            },
          ],
        }),
      } as Response;
    };

    const result = await runOfflineTaskBenchmark({
      baseUrl: 'http://127.0.0.1:5678',
      apiKey: 'client-key',
      models: ['sonnet', 'haiku'],
      timeoutMs: 1000,
      concurrency: 2,
      maxTokens: 256,
      fetchFn,
    });

    expect(result.inputs).toHaveLength(DEFAULT_OFFLINE_EVALUATION_TASKS.length * 2);
    expect(result.report.byModel).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'sonnet', passedRuns: DEFAULT_OFFLINE_EVALUATION_TASKS.length }),
      expect.objectContaining({ key: 'haiku', passedRuns: DEFAULT_OFFLINE_EVALUATION_TASKS.length }),
    ]));
  });

  it('records failed automatic model calls as evaluation findings', async () => {
    const result = await runOfflineTaskBenchmark({
      baseUrl: 'http://127.0.0.1:5678',
      models: ['broken'],
      tasks: [DEFAULT_OFFLINE_EVALUATION_TASKS[0]],
      fetchFn: async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response),
    });

    expect(result.inputs[0]).toEqual(expect.objectContaining({
      taskId: 'quick_status',
      model: 'broken',
      error: 'http_503',
    }));
    expect(result.report.runs[0]).toEqual(expect.objectContaining({
      passed: false,
      findings: expect.arrayContaining(['runner_error:http_503']),
    }));
  });

  it('extracts OpenAI-compatible array content during automatic evaluation', async () => {
    const result = await runOfflineTaskBenchmark({
      baseUrl: 'http://127.0.0.1:5678',
      models: ['compatible'],
      tasks: [DEFAULT_OFFLINE_EVALUATION_TASKS[0]],
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: 'Status is ready.' },
                  { type: 'text', text: 'Next action is to run the benchmark again.' },
                ],
              },
            },
          ],
        }),
      } as Response),
    });

    expect(result.inputs[0]).toEqual(expect.objectContaining({
      output: 'Status is ready.\nNext action is to run the benchmark again.',
    }));
    expect(result.report.runs[0]).toEqual(expect.objectContaining({
      passed: true,
    }));
  });
});
