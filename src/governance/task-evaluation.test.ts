import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendBenchmarkHistory,
  buildOfflineTaskManifest,
  DEFAULT_OFFLINE_EVALUATION_TASKS,
  formatBenchmarkHistorySummary,
  formatOfflineTaskEvaluationReport,
  formatOfflineTaskManifest,
  parseOfflineEvaluationInputs,
  readBenchmarkHistory,
  runOfflineTaskBenchmark,
  runOfflineTaskEvaluation,
  runOfflineTaskJudge,
  summarizeBenchmarkHistory,
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
        dimensionScores: expect.arrayContaining([
          expect.objectContaining({ id: 'semantic_coverage' }),
          expect.objectContaining({ id: 'deliverable_format' }),
        ]),
        findings: expect.arrayContaining([
          expect.stringContaining('dimension_below_threshold'),
          expect.stringContaining('output_too_short'),
          expect.stringContaining('missing_code_block'),
          expect.stringContaining('forbidden_patterns'),
        ]),
      }),
    ]));
    expect(report.averageDimensionScores).toEqual(expect.objectContaining({
      semantic_coverage: expect.any(Number),
    }));
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

  it('persists benchmark history without storing raw model outputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctr-benchmark-history-'));
    try {
      const historyFile = join(dir, 'benchmark-history.json');
      const firstReport = runOfflineTaskEvaluation([
        {
          taskId: 'quick_status',
          model: 'fast,haiku',
          latencyMs: 300,
          output: 'Status is ready. Next action is to keep monitoring the route.',
          humanScore: 0.9,
        },
      ]);
      const secondReport = runOfflineTaskEvaluation([
        {
          taskId: 'quick_status',
          model: 'fast,haiku',
          latencyMs: 220,
          output: 'Status is ready. Next action is to run the benchmark again.',
          humanScore: 1,
        },
      ]);

      appendBenchmarkHistory(firstReport, {
        historyFile,
        source: 'input',
        label: 'baseline',
        now: new Date('2026-05-20T00:00:00.000Z'),
      });
      const latest = appendBenchmarkHistory(secondReport, {
        historyFile,
        source: 'run',
        label: 'candidate',
        now: new Date('2026-05-21T00:00:00.000Z'),
      });

      const entries = readBenchmarkHistory(historyFile);
      expect(entries).toHaveLength(2);
      expect(entries[1]).toEqual(expect.objectContaining({
        id: latest.id,
        source: 'run',
        label: 'candidate',
        evaluatedRuns: 1,
        calibratedRuns: 1,
      }));
      expect(readFileSync(historyFile, 'utf-8')).not.toContain('Next action is to run the benchmark again');

      const summary = summarizeBenchmarkHistory(entries);
      expect(summary.trends.latencyDeltaMs).toBe(-80);
      expect(summary.topModels[0]).toEqual(expect.objectContaining({ model: 'fast,haiku' }));
      expect(formatBenchmarkHistorySummary(summary)).toContain('Trend vs previous');
      expect(formatBenchmarkHistorySummary(summary)).toContain('fast,haiku');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates operator supplied result files before scoring', () => {
    expect(parseOfflineEvaluationInputs({
      results: [
        {
          taskId: ' quick_status ',
          model: ' fast,haiku ',
          output: 'Status is ready. Next action is to continue.',
          latencyMs: 300,
          humanScore: 0.9,
          judgeScore: 0.8,
          judgeError: null,
          calibrationNotes: 'human approved',
          judgeFindings: ['clear_next_action'],
        },
      ],
    })).toEqual([
      {
        taskId: 'quick_status',
        model: 'fast,haiku',
        output: 'Status is ready. Next action is to continue.',
        latencyMs: 300,
        humanScore: 0.9,
        judgeScore: 0.8,
        calibrationNotes: 'human approved',
        judgeFindings: ['clear_next_action'],
      },
    ]);

    expect(() => parseOfflineEvaluationInputs([{ taskId: 'quick_status', latencyMs: -1 }])).toThrow('缺少 model');
    expect(() => parseOfflineEvaluationInputs({ results: [{ taskId: 'quick_status', model: 'fast', latencyMs: -1 }] })).toThrow('latencyMs 必须是非负数字');
    expect(() => parseOfflineEvaluationInputs({ results: [{ taskId: 'quick_status', model: 'fast', humanScore: 2 }] })).toThrow('humanScore 必须是 0 到 1');
    expect(() => parseOfflineEvaluationInputs({ results: [{ taskId: 'quick_status', model: 'fast', judgeError: 1 }] })).toThrow('judgeError 必须是字符串');
    expect(() => parseOfflineEvaluationInputs({ results: [{ taskId: 'quick_status', model: 'fast', judgeFindings: ['ok', 1] }] })).toThrow('judgeFindings 必须是字符串数组');
    expect(() => parseOfflineEvaluationInputs({ value: [] })).toThrow('评测输入必须是数组');
  });

  it('keeps null calibration template fields optional when copied into result inputs', () => {
    const inputs = parseOfflineEvaluationInputs({
      results: [
        {
          taskId: 'quick_status',
          model: 'fast,haiku',
          output: 'Status is ready. Next action is to continue monitoring.',
          latencyMs: 300,
          humanScore: null,
          judgeScore: null,
          calibrationNotes: null,
          judgeFindings: [],
        },
      ],
    });
    const report = runOfflineTaskEvaluation(inputs);

    expect(inputs[0]).toEqual(expect.objectContaining({
      humanScore: undefined,
      judgeScore: undefined,
      calibrationNotes: undefined,
      judgeFindings: [],
    }));
    expect(report.calibrationSummary.calibratedRuns).toBe(0);
    expect(report.runs[0].calibration).toBeUndefined();
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
    expect(output).toContain('Average dimensions:');
    expect(output).toContain('- fast,haiku: pass 0.0%');
    expect(output).toContain('semantic_coverage=0.40');
    expect(output).toContain('coding_fix -> fast,haiku');
    expect(output).toContain('latency_over_budget');
  });

  it('supports explicit quality dimensions that are stricter than legacy keywords', () => {
    const report = runOfflineTaskEvaluation([
      {
        taskId: 'strict_review',
        model: 'fast,haiku',
        latencyMs: 400,
        output: 'Risk is documented and the answer is otherwise fluent.',
      },
    ], [
      {
        id: 'strict_review',
        intent: 'architecture',
        prompt: 'Review a risky rollout.',
        requiredKeywords: ['risk'],
        minQualityScore: 0.9,
        qualityDimensions: [
          {
            id: 'risk coverage',
            label: 'Risk coverage',
            weight: 10,
            minScore: 1,
            requiredKeywords: ['risk'],
          },
          {
            id: 'rollback readiness',
            label: 'Rollback readiness',
            weight: 1,
            minScore: 1,
            requiredKeywords: ['rollback'],
          },
        ],
      },
    ]);

    expect(report.runs[0]).toEqual(expect.objectContaining({
      passed: false,
      qualityScore: 0.9455,
      dimensionScores: expect.arrayContaining([
        expect.objectContaining({
          id: 'risk_coverage',
          score: 1,
        }),
        expect.objectContaining({
          id: 'rollback_readiness',
          score: 0.4,
        }),
      ]),
      findings: expect.arrayContaining([
        'dimension_below_threshold:rollback_readiness:0.4/1',
        'dimension_rollback_readiness:missing_keywords:rollback',
      ]),
    }));
  });

  it('summarizes human and LLM judge calibration against deterministic rubric scores', () => {
    const report = runOfflineTaskEvaluation([
      {
        taskId: 'quick_status',
        model: 'fast,haiku',
        latencyMs: 250,
        output: 'Status is ready. Next action is to continue monitoring.',
        humanScore: 0.95,
        judgeScore: 0.9,
        calibrationNotes: 'human and judge both approved',
        judgeFindings: ['concise'],
      },
      {
        taskId: 'coding_fix',
        model: 'weak,model',
        latencyMs: 800,
        output: 'TODO placeholder',
        humanScore: 0.9,
        judgeScore: 0.8,
        judgeFindings: ['judge_accepts_concise_fix'],
      },
    ]);

    expect(report.calibrationSummary).toEqual(expect.objectContaining({
      calibratedRuns: 2,
      averageHumanScore: 0.925,
      averageJudgeScore: 0.85,
      averageCalibrationScore: 0.8875,
    }));
    expect(report.runs[0].calibration).toEqual(expect.objectContaining({
      averageScore: 0.925,
      notes: 'human and judge both approved',
      findings: expect.arrayContaining(['concise']),
    }));
    expect(report.calibrationSummary.highDisagreementRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: 'coding_fix',
        model: 'weak,model',
      }),
    ]));

    const output = formatOfflineTaskEvaluationReport(report);
    expect(output).toContain('Calibration: 2 runs');
    expect(output).toContain('Calibration disagreements:');
    expect(output).toContain('coding_fix -> weak,model');
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
          qualityDimensions: expect.arrayContaining([
            expect.objectContaining({ id: 'semantic_coverage' }),
          ]),
        }),
      }),
      expect.objectContaining({
        id: 'model_pool_incident',
        category: 'pool_health',
        resultTemplate: expect.objectContaining({
          taskId: 'model_pool_incident',
          model: '<provider,model>',
          humanScore: null,
          judgeScore: null,
          calibrationNotes: null,
          judgeFindings: [],
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
    expect(output).toContain('Dimensions:');
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

  it('runs an LLM judge over existing fixed task outputs and feeds calibration summary', async () => {
    const result = await runOfflineTaskJudge({
      baseUrl: 'http://127.0.0.1:5678',
      apiKey: 'client-key',
      judgeModel: 'judge,sonnet',
      inputs: [
        {
          taskId: 'quick_status',
          model: 'fast,haiku',
          latencyMs: 300,
          output: 'Status is ready. Next action is to keep monitoring.',
          judgeError: 'invalid_response',
        },
      ],
      fetchFn: async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('judge,sonnet');
        expect(body.metadata).toEqual(expect.objectContaining({
          ctr_eval_judge_task_id: 'quick_status',
          ctr_eval_judge_target_model: 'fast,haiku',
        }));
        expect(body.messages[0].content).toContain('Candidate output:');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{
              type: 'text',
              text: '{"score":"0.92","findings":["clear_next_action"],"notes":"good operational answer"}',
            }],
          }),
        } as Response;
      },
    });

    expect(result.inputs[0]).toEqual(expect.objectContaining({
      judgeScore: 0.92,
      judgeError: undefined,
      calibrationNotes: 'good operational answer',
      judgeFindings: ['clear_next_action'],
    }));
    expect(result.report.calibrationSummary).toEqual(expect.objectContaining({
      calibratedRuns: 1,
      averageJudgeScore: 0.92,
    }));
  });

  it('records LLM judge failures without treating them as calibration scores', async () => {
    const result = await runOfflineTaskJudge({
      baseUrl: 'http://127.0.0.1:5678',
      judgeModel: 'judge,sonnet',
      inputs: [
        {
          taskId: 'quick_status',
          model: 'fast,haiku',
          latencyMs: 300,
          output: 'Status is ready. Next action is to keep monitoring.',
        },
      ],
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'not json' }] }),
      } as Response),
    });

    expect(result.inputs[0]).toEqual(expect.objectContaining({
      judgeError: 'invalid_response',
    }));
    expect(result.report.calibrationSummary.calibratedRuns).toBe(0);
    expect(result.report.runs[0].findings).toEqual(expect.arrayContaining(['judge_error:invalid_response']));
  });

  it('can append LLM judge scores during automatic benchmark runs', async () => {
    const result = await runOfflineTaskBenchmark({
      baseUrl: 'http://127.0.0.1:5678',
      models: ['candidate'],
      judgeModel: 'judge',
      tasks: [DEFAULT_OFFLINE_EVALUATION_TASKS[0]],
      fetchFn: async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        if (body.metadata?.ctr_eval_judge_task_id) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: [{ type: 'text', text: '{"score":0.88,"findings":["solid"],"notes":"judge ok"}' }] }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [
              {
                type: 'text',
                text: 'Status is ready. Next action is to run the benchmark again.',
              },
            ],
          }),
        } as Response;
      },
    });

    expect(result.inputs[0]).toEqual(expect.objectContaining({
      model: 'candidate',
      judgeScore: 0.88,
    }));
    expect(result.report.calibrationSummary.averageJudgeScore).toBe(0.88);
  });
});
