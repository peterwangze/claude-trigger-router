export interface IOfflineEvaluationTask {
  id: string;
  intent: string;
  prompt: string;
  minQualityScore?: number;
  minOutputChars?: number;
  maxLatencyMs?: number;
  requiredKeywords?: string[];
  forbiddenPatterns?: string[];
  requiresCodeBlock?: boolean;
}

export interface IOfflineEvaluationInput {
  taskId: string;
  model: string;
  output?: string;
  latencyMs?: number;
  error?: string;
}

export interface IOfflineEvaluationRun {
  taskId: string;
  intent: string;
  model: string;
  passed: boolean;
  qualityScore: number;
  speedScore: number;
  latencyMs?: number;
  findings: string[];
}

export interface IOfflineEvaluationGroup {
  key: string;
  totalRuns: number;
  passedRuns: number;
  passRate: number;
  averageQualityScore: number;
  averageSpeedScore: number;
  averageLatencyMs: number;
}

export interface IOfflineTaskEvaluationReport {
  totalTasks: number;
  totalRuns: number;
  evaluatedRuns: number;
  missingTaskIds: string[];
  passRate: number;
  averageQualityScore: number;
  averageSpeedScore: number;
  averageLatencyMs: number;
  bestRunsByTask: IOfflineEvaluationRun[];
  byTask: IOfflineEvaluationGroup[];
  byModel: IOfflineEvaluationGroup[];
  runs: IOfflineEvaluationRun[];
}

export function parseOfflineEvaluationInputs(payload: unknown): IOfflineEvaluationInput[] {
  const rawResults = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : undefined;

  if (!rawResults) {
    throw new Error('评测输入必须是数组，或包含 results 数组字段的对象。');
  }

  return rawResults.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`第 ${index + 1} 条评测结果必须是对象。`);
    }

    const record = item as Record<string, unknown>;
    if (typeof record.taskId !== 'string' || !record.taskId.trim()) {
      throw new Error(`第 ${index + 1} 条评测结果缺少 taskId。`);
    }
    if (typeof record.model !== 'string' || !record.model.trim()) {
      throw new Error(`第 ${index + 1} 条评测结果缺少 model。`);
    }
    if (record.output !== undefined && typeof record.output !== 'string') {
      throw new Error(`第 ${index + 1} 条评测结果的 output 必须是字符串。`);
    }
    if (record.error !== undefined && typeof record.error !== 'string') {
      throw new Error(`第 ${index + 1} 条评测结果的 error 必须是字符串。`);
    }
    if (
      record.latencyMs !== undefined
      && (typeof record.latencyMs !== 'number' || !Number.isFinite(record.latencyMs) || record.latencyMs < 0)
    ) {
      throw new Error(`第 ${index + 1} 条评测结果的 latencyMs 必须是非负数字。`);
    }

    return {
      taskId: record.taskId.trim(),
      model: record.model.trim(),
      output: record.output,
      error: record.error,
      latencyMs: record.latencyMs,
    };
  });
}

export const DEFAULT_OFFLINE_EVALUATION_TASKS: IOfflineEvaluationTask[] = [
  {
    id: 'quick_status',
    intent: 'quick_reply',
    prompt: 'Summarize the current service status and next action in two concise sentences.',
    maxLatencyMs: 800,
    minOutputChars: 40,
    requiredKeywords: ['status', 'next'],
    forbiddenPatterns: ['TODO', 'placeholder', 'I cannot'],
  },
  {
    id: 'coding_fix',
    intent: 'coding',
    prompt: 'Fix a TypeScript regression and explain the changed behavior with a test plan.',
    maxLatencyMs: 1800,
    minOutputChars: 120,
    requiredKeywords: ['fix', 'test'],
    forbiddenPatterns: ['TODO', '...rest of code', 'placeholder'],
    requiresCodeBlock: true,
  },
  {
    id: 'architecture_review',
    intent: 'architecture',
    prompt: 'Review a router architecture change and list risks, tradeoffs, and rollout checks.',
    maxLatencyMs: 2600,
    minOutputChars: 160,
    requiredKeywords: ['risk', 'tradeoff', 'rollout'],
    forbiddenPatterns: ['TODO', 'placeholder'],
  },
  {
    id: 'long_context_triage',
    intent: 'long_context',
    prompt: 'Triage a long conversation and preserve the user goal, constraints, and open blockers.',
    maxLatencyMs: 3200,
    minOutputChars: 180,
    requiredKeywords: ['goal', 'constraint', 'blocker'],
    forbiddenPatterns: ['lost context', 'cannot access previous'],
  },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function rate(count: number, total: number): number {
  if (!total) {
    return 0;
  }

  return Number((count / total).toFixed(4));
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function includesCodeBlock(output: string): boolean {
  return /```[\s\S]*```/.test(output);
}

function evaluateRun(task: IOfflineEvaluationTask, input: IOfflineEvaluationInput): IOfflineEvaluationRun {
  const findings: string[] = [];
  const output = input.output ?? '';
  const normalized = normalizeText(output);
  const minQualityScore = task.minQualityScore ?? 0.7;
  let qualityScore = 1;

  if (input.error) {
    findings.push(`runner_error:${input.error}`);
    qualityScore = 0;
  }

  if ((task.minOutputChars ?? 0) > 0 && output.trim().length < (task.minOutputChars ?? 0)) {
    findings.push(`output_too_short:${output.trim().length}/${task.minOutputChars}`);
    qualityScore -= 0.25;
  }

  const requiredKeywords = task.requiredKeywords ?? [];
  const missingKeywords = requiredKeywords.filter((keyword) => !normalized.includes(keyword.toLowerCase()));
  if (missingKeywords.length) {
    findings.push(`missing_keywords:${missingKeywords.join('|')}`);
    qualityScore -= 0.35 * rate(missingKeywords.length, Math.max(requiredKeywords.length, 1));
  }

  if (task.requiresCodeBlock && !includesCodeBlock(output)) {
    findings.push('missing_code_block');
    qualityScore -= 0.25;
  }

  const forbiddenMatches = (task.forbiddenPatterns ?? []).filter((pattern) => normalized.includes(pattern.toLowerCase()));
  if (forbiddenMatches.length) {
    findings.push(`forbidden_patterns:${forbiddenMatches.join('|')}`);
    qualityScore -= 0.4;
  }

  const latencyMs = typeof input.latencyMs === 'number' ? input.latencyMs : undefined;
  const speedScore = latencyMs === undefined || !task.maxLatencyMs
    ? 0
    : clamp(1 - Math.max(0, latencyMs - task.maxLatencyMs) / task.maxLatencyMs);
  if (latencyMs !== undefined && task.maxLatencyMs && latencyMs > task.maxLatencyMs) {
    findings.push(`latency_over_budget:${latencyMs}/${task.maxLatencyMs}`);
  }

  const finalQualityScore = clamp(qualityScore);
  return {
    taskId: task.id,
    intent: task.intent,
    model: input.model,
    passed: !input.error && finalQualityScore >= minQualityScore,
    qualityScore: finalQualityScore,
    speedScore,
    latencyMs,
    findings,
  };
}

function summarizeGroup(key: string, runs: IOfflineEvaluationRun[]): IOfflineEvaluationGroup {
  const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => typeof value === 'number');
  return {
    key,
    totalRuns: runs.length,
    passedRuns: runs.filter((run) => run.passed).length,
    passRate: rate(runs.filter((run) => run.passed).length, runs.length),
    averageQualityScore: average(runs.map((run) => run.qualityScore)),
    averageSpeedScore: average(runs.map((run) => run.speedScore)),
    averageLatencyMs: latencies.length ? Number(average(latencies).toFixed(2)) : 0,
  };
}

function groupRuns(runs: IOfflineEvaluationRun[], keyFn: (run: IOfflineEvaluationRun) => string): IOfflineEvaluationGroup[] {
  const groups: Record<string, IOfflineEvaluationRun[]> = {};
  for (const run of runs) {
    const key = keyFn(run);
    groups[key] ??= [];
    groups[key].push(run);
  }

  return Object.entries(groups)
    .map(([key, groupRunsForKey]) => summarizeGroup(key, groupRunsForKey))
    .sort((left, right) => {
      if (right.passRate !== left.passRate) {
        return right.passRate - left.passRate;
      }
      if (right.averageQualityScore !== left.averageQualityScore) {
        return right.averageQualityScore - left.averageQualityScore;
      }
      return left.averageLatencyMs - right.averageLatencyMs;
    });
}

function bestRunForTask(taskId: string, runs: IOfflineEvaluationRun[]): IOfflineEvaluationRun | undefined {
  return runs
    .filter((run) => run.taskId === taskId)
    .sort((left, right) => {
      if (Number(right.passed) !== Number(left.passed)) {
        return Number(right.passed) - Number(left.passed);
      }
      if (right.qualityScore !== left.qualityScore) {
        return right.qualityScore - left.qualityScore;
      }
      if (right.speedScore !== left.speedScore) {
        return right.speedScore - left.speedScore;
      }
      return (left.latencyMs ?? Number.POSITIVE_INFINITY) - (right.latencyMs ?? Number.POSITIVE_INFINITY);
    })[0];
}

export function runOfflineTaskEvaluation(
  inputs: IOfflineEvaluationInput[],
  tasks: IOfflineEvaluationTask[] = DEFAULT_OFFLINE_EVALUATION_TASKS
): IOfflineTaskEvaluationReport {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const missingTaskIds = Array.from(new Set(inputs.map((input) => input.taskId).filter((taskId) => !taskMap.has(taskId))));
  const runs = inputs
    .map((input) => {
      const task = taskMap.get(input.taskId);
      return task ? evaluateRun(task, input) : undefined;
    })
    .filter((run): run is IOfflineEvaluationRun => Boolean(run));
  const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => typeof value === 'number');
  const bestRunsByTask = tasks
    .map((task) => bestRunForTask(task.id, runs))
    .filter((run): run is IOfflineEvaluationRun => Boolean(run));

  return {
    totalTasks: tasks.length,
    totalRuns: inputs.length,
    evaluatedRuns: runs.length,
    missingTaskIds,
    passRate: rate(runs.filter((run) => run.passed).length, runs.length),
    averageQualityScore: average(runs.map((run) => run.qualityScore)),
    averageSpeedScore: average(runs.map((run) => run.speedScore)),
    averageLatencyMs: latencies.length ? Number(average(latencies).toFixed(2)) : 0,
    bestRunsByTask,
    byTask: groupRuns(runs, (run) => run.taskId),
    byModel: groupRuns(runs, (run) => run.model),
    runs,
  };
}

export function formatOfflineTaskEvaluationReport(report: IOfflineTaskEvaluationReport): string {
  const lines = [
    'Offline routing evaluation',
    `Tasks: ${report.totalTasks}, runs: ${report.evaluatedRuns}/${report.totalRuns}, passRate: ${(report.passRate * 100).toFixed(1)}%`,
    `Average quality: ${report.averageQualityScore.toFixed(2)}, speed: ${report.averageSpeedScore.toFixed(2)}, latency: ${report.averageLatencyMs} ms`,
  ];

  if (report.missingTaskIds.length) {
    lines.push(`Missing task ids: ${report.missingTaskIds.join(', ')}`);
  }

  lines.push('By model:');
  for (const item of report.byModel) {
    lines.push(`- ${item.key}: pass ${(item.passRate * 100).toFixed(1)}%, quality ${item.averageQualityScore.toFixed(2)}, latency ${item.averageLatencyMs} ms`);
  }

  lines.push('Best runs by task:');
  for (const run of report.bestRunsByTask) {
    lines.push(`- ${run.taskId} -> ${run.model}: ${run.passed ? 'pass' : 'fail'}, quality ${run.qualityScore.toFixed(2)}, latency ${run.latencyMs ?? '-'} ms`);
  }

  const failedRuns = report.runs.filter((run) => !run.passed || run.findings.length);
  if (failedRuns.length) {
    lines.push('Findings:');
    for (const run of failedRuns) {
      lines.push(`- ${run.taskId} -> ${run.model}: ${run.findings.length ? run.findings.join(', ') : 'quality_below_threshold'}`);
    }
  }

  return lines.join('\n');
}
