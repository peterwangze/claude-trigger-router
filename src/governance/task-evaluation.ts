export interface IOfflineEvaluationTask {
  id: string;
  intent: string;
  prompt: string;
  category?: string;
  expectedOutput?: string;
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

export interface IOfflineTaskBenchmarkOptions {
  models: string[];
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  concurrency?: number;
  maxTokens?: number;
  tasks?: IOfflineEvaluationTask[];
  fetchFn?: typeof fetch;
}

export interface IOfflineTaskBenchmarkResult {
  inputs: IOfflineEvaluationInput[];
  report: IOfflineTaskEvaluationReport;
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
    category: 'speed',
    prompt: 'Summarize the current service status and next action in two concise sentences.',
    expectedOutput: 'A brief status summary with a concrete next action.',
    maxLatencyMs: 800,
    minOutputChars: 40,
    requiredKeywords: ['status', 'next'],
    forbiddenPatterns: ['TODO', 'placeholder', 'I cannot'],
  },
  {
    id: 'coding_fix',
    intent: 'coding',
    category: 'quality',
    prompt: 'Fix a TypeScript regression and explain the changed behavior with a test plan.',
    expectedOutput: 'A concise fix explanation, a TypeScript code block, and a focused test plan.',
    maxLatencyMs: 1800,
    minOutputChars: 120,
    requiredKeywords: ['fix', 'test'],
    forbiddenPatterns: ['TODO', '...rest of code', 'placeholder'],
    requiresCodeBlock: true,
  },
  {
    id: 'architecture_review',
    intent: 'architecture',
    category: 'quality',
    prompt: 'Review a router architecture change and list risks, tradeoffs, and rollout checks.',
    expectedOutput: 'A structured architecture review that names risks, tradeoffs, and rollout checks.',
    maxLatencyMs: 2600,
    minOutputChars: 160,
    requiredKeywords: ['risk', 'tradeoff', 'rollout'],
    forbiddenPatterns: ['TODO', 'placeholder'],
  },
  {
    id: 'long_context_triage',
    intent: 'long_context',
    category: 'continuity',
    prompt: 'Triage a long conversation and preserve the user goal, constraints, and open blockers.',
    expectedOutput: 'A continuity-preserving summary with goal, constraints, and blockers.',
    maxLatencyMs: 3200,
    minOutputChars: 180,
    requiredKeywords: ['goal', 'constraint', 'blocker'],
    forbiddenPatterns: ['lost context', 'cannot access previous'],
  },
  {
    id: 'auth_deployment_plan',
    intent: 'security',
    category: 'server_ops',
    prompt: 'Create a safe remote server deployment checklist for an LLM router with API key scope, rotation, audit, and rollback.',
    expectedOutput: 'An operator checklist covering scoped keys, rotation, audit, and rollback.',
    maxLatencyMs: 2600,
    minOutputChars: 180,
    requiredKeywords: ['scope', 'rotation', 'audit', 'rollback'],
    forbiddenPatterns: ['disable auth', 'share the admin key', 'placeholder'],
  },
  {
    id: 'model_pool_incident',
    intent: 'operations',
    category: 'pool_health',
    prompt: 'Diagnose a model pool incident where one endpoint is slow and another returns intermittent 5xx errors; propose routing actions.',
    expectedOutput: 'A pool health diagnosis with latency, 5xx, fallback or circuit breaker actions.',
    maxLatencyMs: 2200,
    minOutputChars: 160,
    requiredKeywords: ['latency', '5xx', 'fallback'],
    forbiddenPatterns: ['TODO', 'placeholder'],
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

function extractResponseText(payload: any): string {
  if (!payload) {
    return '';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }
  if (typeof payload.content === 'string') {
    return payload.content;
  }
  if (Array.isArray(payload.content)) {
    return extractContentText(payload.content);
  }
  if (Array.isArray(payload.choices)) {
    return payload.choices
      .map((choice: any) => extractContentText(choice?.message?.content ?? choice?.text ?? ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function extractContentText(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part?.text === 'string') {
        return part.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
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

async function runBenchmarkJob(
  task: IOfflineEvaluationTask,
  model: string,
  options: Required<Pick<IOfflineTaskBenchmarkOptions, 'baseUrl' | 'timeoutMs' | 'maxTokens'>> & {
    apiKey?: string;
    fetchFn: typeof fetch;
  }
): Promise<IOfflineEvaluationInput> {
  const startedAt = Date.now();
  const url = `${options.baseUrl.replace(/\/+$/, '')}/v1/messages`;
  try {
    const response = await options.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}`, 'x-api-key': options.apiKey } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens,
        stream: false,
        metadata: {
          ctr_eval_task_id: task.id,
          ctr_eval_intent: task.intent,
        },
        messages: [
          {
            role: 'user',
            content: task.prompt,
          },
        ],
      }),
      ...(options.timeoutMs > 0 ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        taskId: task.id,
        model,
        latencyMs,
        error: `http_${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      taskId: task.id,
      model,
      latencyMs,
      output: extractResponseText(payload),
    };
  } catch (error: any) {
    return {
      taskId: task.id,
      model,
      latencyMs: Date.now() - startedAt,
      error: error?.name === 'TimeoutError' ? 'timeout' : (error?.message || 'request_failed'),
    };
  }
}

export async function runOfflineTaskBenchmark(options: IOfflineTaskBenchmarkOptions): Promise<IOfflineTaskBenchmarkResult> {
  const tasks = options.tasks ?? DEFAULT_OFFLINE_EVALUATION_TASKS;
  const models = options.models.map((model) => model.trim()).filter(Boolean);
  if (!models.length) {
    throw new Error('至少需要提供一个模型用于自动评测。');
  }
  if (!options.baseUrl?.trim()) {
    throw new Error('自动评测需要 baseUrl。');
  }

  const jobs = tasks.flatMap((task) => models.map((model) => ({ task, model })));
  const inputs: IOfflineEvaluationInput[] = new Array(jobs.length);
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 2), 8));
  const sharedOptions = {
    baseUrl: options.baseUrl.trim(),
    apiKey: options.apiKey?.trim() || undefined,
    timeoutMs: Math.max(0, Math.floor(options.timeoutMs ?? 30000)),
    maxTokens: Math.max(1, Math.floor(options.maxTokens ?? 768)),
    fetchFn: options.fetchFn ?? fetch,
  };

  async function worker() {
    while (nextIndex < jobs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const job = jobs[currentIndex];
      inputs[currentIndex] = await runBenchmarkJob(job.task, job.model, sharedOptions);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return {
    inputs,
    report: runOfflineTaskEvaluation(inputs, tasks),
  };
}

export function buildOfflineTaskManifest(tasks: IOfflineEvaluationTask[] = DEFAULT_OFFLINE_EVALUATION_TASKS) {
  return {
    version: 1,
    description: 'Fixed task set for repeatable Claude Trigger Router model-combination evaluation.',
    tasks: tasks.map((task) => ({
      id: task.id,
      intent: task.intent,
      category: task.category ?? 'general',
      prompt: task.prompt,
      expectedOutput: task.expectedOutput ?? 'A complete answer that satisfies the task prompt.',
      rubric: {
        minQualityScore: task.minQualityScore ?? 0.7,
        minOutputChars: task.minOutputChars ?? 0,
        maxLatencyMs: task.maxLatencyMs,
        requiredKeywords: task.requiredKeywords ?? [],
        forbiddenPatterns: task.forbiddenPatterns ?? [],
        requiresCodeBlock: Boolean(task.requiresCodeBlock),
      },
      resultTemplate: {
        taskId: task.id,
        model: '<provider,model>',
        output: '<model output>',
        latencyMs: 0,
      },
    })),
  };
}

export function formatOfflineTaskManifest(tasks: IOfflineEvaluationTask[] = DEFAULT_OFFLINE_EVALUATION_TASKS): string {
  const lines = [
    'Offline evaluation tasks',
    `Total tasks: ${tasks.length}`,
  ];

  for (const task of tasks) {
    lines.push(`- ${task.id} [${task.intent}/${task.category ?? 'general'}]`);
    lines.push(`  Prompt: ${task.prompt}`);
    lines.push(`  Expected: ${task.expectedOutput ?? 'A complete answer that satisfies the task prompt.'}`);
    lines.push(`  Rubric: minQuality=${task.minQualityScore ?? 0.7}, minChars=${task.minOutputChars ?? 0}, maxLatencyMs=${task.maxLatencyMs ?? '-'}`);
    lines.push(`  Required: ${(task.requiredKeywords ?? []).join('|') || '-'}`);
    lines.push(`  Forbidden: ${(task.forbiddenPatterns ?? []).join('|') || '-'}`);
    lines.push(`  Requires code block: ${Boolean(task.requiresCodeBlock)}`);
  }

  return lines.join('\n');
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
