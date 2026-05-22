import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export interface IOfflineEvaluationTask {
  id: string;
  intent: string;
  routeScenario?: 'default' | 'think' | 'long_context' | 'background' | 'rule_hit' | 'candidate_selection' | 'server_ops' | 'pool_health';
  prompt: string;
  category?: string;
  expectedOutput?: string;
  minQualityScore?: number;
  minOutputChars?: number;
  maxLatencyMs?: number;
  requiredKeywords?: string[];
  forbiddenPatterns?: string[];
  requiresCodeBlock?: boolean;
  qualityDimensions?: IOfflineEvaluationDimension[];
}

export interface IOfflineEvaluationDimension {
  id: string;
  label?: string;
  weight?: number;
  minScore?: number;
  minOutputChars?: number;
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
  humanScore?: number;
  judgeScore?: number;
  judgeError?: string;
  calibrationNotes?: string;
  judgeFindings?: string[];
}

export interface IOfflineEvaluationRun {
  taskId: string;
  intent: string;
  routeScenario: string;
  model: string;
  passed: boolean;
  qualityScore: number;
  speedScore: number;
  latencyMs?: number;
  dimensionScores: IOfflineEvaluationDimensionScore[];
  calibration?: IOfflineEvaluationCalibration;
  findings: string[];
}

export interface IOfflineEvaluationCalibration {
  humanScore?: number;
  judgeScore?: number;
  averageScore?: number;
  deltaFromQuality?: number;
  notes?: string;
  findings: string[];
}

export interface IOfflineEvaluationDimensionScore {
  id: string;
  label: string;
  score: number;
  weight: number;
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
  averageDimensionScores: Record<string, number>;
}

export interface IOfflineEvaluationCalibrationSummary {
  calibratedRuns: number;
  averageHumanScore: number;
  averageJudgeScore: number;
  averageCalibrationScore: number;
  averageRubricDelta: number;
  highDisagreementRuns: Array<{
    taskId: string;
    model: string;
    qualityScore: number;
    calibrationScore: number;
    deltaFromQuality: number;
    findings: string[];
  }>;
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
  averageDimensionScores: Record<string, number>;
  calibrationSummary: IOfflineEvaluationCalibrationSummary;
  bestRunsByTask: IOfflineEvaluationRun[];
  byTask: IOfflineEvaluationGroup[];
  byRouteScenario: IOfflineEvaluationGroup[];
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
  judgeModel?: string;
  judgeMaxTokens?: number;
  tasks?: IOfflineEvaluationTask[];
  fetchFn?: typeof fetch;
}

export interface IOfflineTaskBenchmarkResult {
  inputs: IOfflineEvaluationInput[];
  report: IOfflineTaskEvaluationReport;
}

export interface IBenchmarkHistoryModelSummary {
  model: string;
  totalRuns: number;
  passRate: number;
  averageQualityScore: number;
  averageSpeedScore: number;
  averageLatencyMs: number;
}

export interface IBenchmarkHistoryEntry {
  id: string;
  createdAt: string;
  source: 'input' | 'run' | 'judge' | 'unknown';
  label?: string;
  totalTasks: number;
  totalRuns: number;
  evaluatedRuns: number;
  passRate: number;
  averageQualityScore: number;
  averageSpeedScore: number;
  averageLatencyMs: number;
  calibratedRuns: number;
  averageCalibrationScore: number;
  averageRubricDelta: number;
  models: IBenchmarkHistoryModelSummary[];
  bestRunsByTask: Array<{
    taskId: string;
    model: string;
    qualityScore: number;
    speedScore: number;
    latencyMs?: number;
    passed: boolean;
  }>;
}

export interface IBenchmarkHistorySummary {
  totalEntries: number;
  latest?: IBenchmarkHistoryEntry;
  previous?: IBenchmarkHistoryEntry;
  trends: {
    passRateDelta: number;
    qualityDelta: number;
    speedDelta: number;
    latencyDeltaMs: number;
    calibrationDelta: number;
  };
  topModels: IBenchmarkHistoryModelSummary[];
  entries: IBenchmarkHistoryEntry[];
}

export interface IBenchmarkHistoryAppendOptions {
  historyFile: string;
  source?: IBenchmarkHistoryEntry['source'];
  label?: string;
  maxEntries?: number;
  now?: Date;
}

export interface IOfflineTaskJudgeOptions {
  inputs: IOfflineEvaluationInput[];
  judgeModel: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  concurrency?: number;
  maxTokens?: number;
  tasks?: IOfflineEvaluationTask[];
  fetchFn?: typeof fetch;
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
    if (record.judgeError !== undefined && record.judgeError !== null && typeof record.judgeError !== 'string') {
      throw new Error(`第 ${index + 1} 条评测结果的 judgeError 必须是字符串。`);
    }
    if (
      record.latencyMs !== undefined
      && (typeof record.latencyMs !== 'number' || !Number.isFinite(record.latencyMs) || record.latencyMs < 0)
    ) {
      throw new Error(`第 ${index + 1} 条评测结果的 latencyMs 必须是非负数字。`);
    }

    const humanScore = parseOptionalUnitScore(record.humanScore, `第 ${index + 1} 条评测结果的 humanScore`);
    const judgeScore = parseOptionalUnitScore(record.judgeScore, `第 ${index + 1} 条评测结果的 judgeScore`);
    if (record.calibrationNotes !== undefined && record.calibrationNotes !== null && typeof record.calibrationNotes !== 'string') {
      throw new Error(`第 ${index + 1} 条评测结果的 calibrationNotes 必须是字符串。`);
    }
    if (
      record.judgeFindings !== undefined && record.judgeFindings !== null &&
      (!Array.isArray(record.judgeFindings) || record.judgeFindings.some((item) => typeof item !== 'string'))
    ) {
      throw new Error(`第 ${index + 1} 条评测结果的 judgeFindings 必须是字符串数组。`);
    }

    return {
      taskId: record.taskId.trim(),
      model: record.model.trim(),
      output: record.output,
      error: record.error,
      latencyMs: record.latencyMs,
      humanScore,
      judgeScore,
      judgeError: typeof record.judgeError === 'string' ? record.judgeError : undefined,
      calibrationNotes: typeof record.calibrationNotes === 'string' ? record.calibrationNotes : undefined,
      judgeFindings: Array.isArray(record.judgeFindings) ? record.judgeFindings : undefined,
    };
  });
}

export const DEFAULT_OFFLINE_EVALUATION_TASKS: IOfflineEvaluationTask[] = [
  {
    id: 'quick_status',
    intent: 'quick_reply',
    routeScenario: 'default',
    category: 'daily_default',
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
    routeScenario: 'think',
    category: 'thinking',
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
    routeScenario: 'candidate_selection',
    category: 'smart_candidate',
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
    routeScenario: 'long_context',
    category: 'continuity',
    prompt: 'Triage a long conversation and preserve the user goal, constraints, and open blockers.',
    expectedOutput: 'A continuity-preserving summary with goal, constraints, and blockers.',
    maxLatencyMs: 3200,
    minOutputChars: 180,
    requiredKeywords: ['goal', 'constraint', 'blocker'],
    forbiddenPatterns: ['lost context', 'cannot access previous'],
  },
  {
    id: 'background_maintenance',
    intent: 'background',
    routeScenario: 'background',
    category: 'background',
    prompt: 'Prepare a quiet background maintenance status note with current status, next action, and monitoring scope.',
    expectedOutput: 'A short background maintenance note that names status, next action, and monitoring scope.',
    maxLatencyMs: 1200,
    minOutputChars: 80,
    requiredKeywords: ['status', 'next', 'scope'],
    forbiddenPatterns: ['TODO', 'placeholder', 'wake the user'],
  },
  {
    id: 'smart_rule_review',
    intent: 'review',
    routeScenario: 'rule_hit',
    category: 'smart_rule',
    prompt: 'Review a small code change that should be caught by a SmartRouter review rule; include risk, test, and rollout notes.',
    expectedOutput: 'A review-focused answer with risk, test, and rollout notes.',
    maxLatencyMs: 1800,
    minOutputChars: 120,
    requiredKeywords: ['risk', 'test', 'rollout'],
    forbiddenPatterns: ['TODO', 'placeholder'],
  },
  {
    id: 'auth_deployment_plan',
    intent: 'security',
    routeScenario: 'server_ops',
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
    routeScenario: 'pool_health',
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

function parseOptionalUnitScore(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} 必须是 0 到 1 之间的数字。`);
  }
  return Number(value.toFixed(4));
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

function normalizeDimensionId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'quality';
}

function qualityDimensionsForTask(task: IOfflineEvaluationTask): IOfflineEvaluationDimension[] {
  if (Array.isArray(task.qualityDimensions) && task.qualityDimensions.length) {
    return task.qualityDimensions.map((dimension) => ({
      ...dimension,
      id: normalizeDimensionId(dimension.id),
    }));
  }

  const dimensions: IOfflineEvaluationDimension[] = [];
  if ((task.requiredKeywords ?? []).length) {
    dimensions.push({
      id: 'semantic_coverage',
      label: 'Semantic coverage',
      weight: 0.45,
      minScore: 0.7,
      requiredKeywords: task.requiredKeywords,
    });
  }
  if ((task.minOutputChars ?? 0) > 0) {
    dimensions.push({
      id: 'completeness',
      label: 'Completeness',
      weight: 0.25,
      minScore: 0.7,
      minOutputChars: task.minOutputChars,
    });
  }
  if (task.requiresCodeBlock) {
    dimensions.push({
      id: 'deliverable_format',
      label: 'Deliverable format',
      weight: 0.2,
      minScore: 1,
      requiresCodeBlock: true,
    });
  }
  if ((task.forbiddenPatterns ?? []).length) {
    dimensions.push({
      id: 'safety_hygiene',
      label: 'Safety and hygiene',
      weight: 0.1,
      minScore: 1,
      forbiddenPatterns: task.forbiddenPatterns,
    });
  }

  return dimensions;
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

function extractFirstJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const payload = JSON.parse(text.slice(start, index + 1));
          return payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload as Record<string, unknown>
            : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

function parseJudgeResult(text: string): { judgeScore: number; calibrationNotes?: string; judgeFindings?: string[] } | undefined {
  const payload = extractFirstJsonObject(text);
  if (!payload) {
    return undefined;
  }

  const rawScore = payload.score ?? payload.judgeScore;
  const score = typeof rawScore === 'number'
    ? rawScore
    : typeof rawScore === 'string' && rawScore.trim()
      ? Number(rawScore)
      : Number.NaN;
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    return undefined;
  }

  const rawFindings = payload.findings ?? payload.judgeFindings;
  const judgeFindings = Array.isArray(rawFindings)
    ? rawFindings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : typeof rawFindings === 'string' && rawFindings.trim()
      ? [rawFindings.trim()]
      : undefined;
  const rawNotes = payload.notes ?? payload.calibrationNotes;

  return {
    judgeScore: Number(score.toFixed(4)),
    calibrationNotes: typeof rawNotes === 'string' && rawNotes.trim() ? rawNotes.trim() : undefined,
    judgeFindings,
  };
}

function evaluateDimension(
  dimension: IOfflineEvaluationDimension,
  output: string,
  normalized: string
): IOfflineEvaluationDimensionScore {
  const findings: string[] = [];
  const weight = Number.isFinite(dimension.weight) && (dimension.weight ?? 0) > 0 ? dimension.weight! : 1;
  let score = 1;

  if ((dimension.minOutputChars ?? 0) > 0 && output.trim().length < (dimension.minOutputChars ?? 0)) {
    findings.push(`output_too_short:${output.trim().length}/${dimension.minOutputChars}`);
    score -= 0.25;
  }

  const requiredKeywords = dimension.requiredKeywords ?? [];
  const missingKeywords = requiredKeywords.filter((keyword) => !normalized.includes(keyword.toLowerCase()));
  if (missingKeywords.length) {
    findings.push(`missing_keywords:${missingKeywords.join('|')}`);
    score -= 0.6 * rate(missingKeywords.length, Math.max(requiredKeywords.length, 1));
  }

  if (dimension.requiresCodeBlock && !includesCodeBlock(output)) {
    findings.push('missing_code_block');
    score -= 0.25;
  }

  const forbiddenMatches = (dimension.forbiddenPatterns ?? []).filter((pattern) => normalized.includes(pattern.toLowerCase()));
  if (forbiddenMatches.length) {
    findings.push(`forbidden_patterns:${forbiddenMatches.join('|')}`);
    score -= 0.5;
  }

  return {
    id: normalizeDimensionId(dimension.id),
    label: dimension.label ?? dimension.id,
    score: clamp(score),
    weight,
    findings,
  };
}

function weightedAverageDimensionScore(scores: IOfflineEvaluationDimensionScore[]): number {
  const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0);
  if (!scores.length || totalWeight <= 0) {
    return 1;
  }

  return clamp(scores.reduce((sum, score) => sum + score.score * score.weight, 0) / totalWeight);
}

function averageDimensionScores(runs: IOfflineEvaluationRun[]): Record<string, number> {
  const grouped: Record<string, number[]> = {};
  for (const run of runs) {
    for (const dimension of run.dimensionScores) {
      grouped[dimension.id] ??= [];
      grouped[dimension.id].push(dimension.score);
    }
  }

  return Object.fromEntries(
    Object.entries(grouped)
      .map(([id, values]) => [id, average(values)])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function buildCalibration(input: IOfflineEvaluationInput, qualityScore: number): IOfflineEvaluationCalibration | undefined {
  const scores = [input.humanScore, input.judgeScore].filter((value): value is number => typeof value === 'number');
  const findings = [...(input.judgeFindings ?? [])];
  if (!scores.length && !input.calibrationNotes && !findings.length) {
    return undefined;
  }

  const averageScore = scores.length ? average(scores) : undefined;
  const deltaFromQuality = averageScore === undefined
    ? undefined
    : Number((averageScore - qualityScore).toFixed(4));
  if (deltaFromQuality !== undefined && Math.abs(deltaFromQuality) >= 0.25) {
    findings.push(`calibration_disagreement:${deltaFromQuality}`);
  }

  return {
    humanScore: input.humanScore,
    judgeScore: input.judgeScore,
    averageScore,
    deltaFromQuality,
    notes: input.calibrationNotes,
    findings,
  };
}

function evaluateRun(task: IOfflineEvaluationTask, input: IOfflineEvaluationInput): IOfflineEvaluationRun {
  const findings: string[] = [];
  const output = input.output ?? '';
  const normalized = normalizeText(output);
  const minQualityScore = task.minQualityScore ?? 0.7;
  let qualityScore = 1;
  let dimensionsPassed = true;

  if (input.error) {
    findings.push(`runner_error:${input.error}`);
    qualityScore = 0;
  }
  if (input.judgeError) {
    findings.push(`judge_error:${input.judgeError}`);
  }

  const dimensions = qualityDimensionsForTask(task);
  const dimensionScores = dimensions.map((dimension) => evaluateDimension(dimension, output, normalized));
  for (const dimension of dimensionScores) {
    const sourceDimension = dimensions.find((item) => normalizeDimensionId(item.id) === dimension.id);
    const minScore = sourceDimension?.minScore ?? 0.7;
    if (dimension.score < minScore) {
      dimensionsPassed = false;
      findings.push(`dimension_below_threshold:${dimension.id}:${dimension.score}/${minScore}`);
    }
    for (const finding of dimension.findings) {
      findings.push(`dimension_${dimension.id}:${finding}`);
    }
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

  const finalQualityScore = clamp(Math.min(qualityScore, weightedAverageDimensionScore(dimensionScores)));
  const calibration = buildCalibration(input, finalQualityScore);
  if (calibration) {
    for (const finding of calibration.findings) {
      findings.push(`calibration:${finding}`);
    }
  }
  return {
    taskId: task.id,
    intent: task.intent,
    routeScenario: task.routeScenario ?? task.category ?? task.intent,
    model: input.model,
    passed: !input.error && dimensionsPassed && finalQualityScore >= minQualityScore,
    qualityScore: finalQualityScore,
    speedScore,
    latencyMs,
    dimensionScores,
    calibration,
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
    averageDimensionScores: averageDimensionScores(runs),
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

function summarizeCalibration(runs: IOfflineEvaluationRun[]): IOfflineEvaluationCalibrationSummary {
  const calibratedRuns = runs.filter((run) => run.calibration);
  const humanScores = calibratedRuns
    .map((run) => run.calibration?.humanScore)
    .filter((value): value is number => typeof value === 'number');
  const judgeScores = calibratedRuns
    .map((run) => run.calibration?.judgeScore)
    .filter((value): value is number => typeof value === 'number');
  const averageScores = calibratedRuns
    .map((run) => run.calibration?.averageScore)
    .filter((value): value is number => typeof value === 'number');
  const deltas = calibratedRuns
    .map((run) => run.calibration?.deltaFromQuality)
    .filter((value): value is number => typeof value === 'number');
  const highDisagreementRuns = calibratedRuns
    .filter((run) => Math.abs(run.calibration?.deltaFromQuality ?? 0) >= 0.25)
    .map((run) => ({
      taskId: run.taskId,
      model: run.model,
      qualityScore: run.qualityScore,
      calibrationScore: run.calibration?.averageScore ?? 0,
      deltaFromQuality: run.calibration?.deltaFromQuality ?? 0,
      findings: run.calibration?.findings ?? [],
    }));

  return {
    calibratedRuns: calibratedRuns.length,
    averageHumanScore: average(humanScores),
    averageJudgeScore: average(judgeScores),
    averageCalibrationScore: average(averageScores),
    averageRubricDelta: average(deltas),
    highDisagreementRuns,
  };
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
    averageDimensionScores: averageDimensionScores(runs),
    calibrationSummary: summarizeCalibration(runs),
    bestRunsByTask,
    byTask: groupRuns(runs, (run) => run.taskId),
    byRouteScenario: groupRuns(runs, (run) => run.routeScenario),
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

function buildJudgePrompt(task: IOfflineEvaluationTask, input: IOfflineEvaluationInput): string {
  return [
    'You are judging a Claude Trigger Router fixed-task benchmark result.',
    'Return only compact JSON with this exact shape:',
    '{"score":0.0,"findings":["short finding"],"notes":"short rationale"}',
    'Score must be a number from 0 to 1. Do not include markdown.',
    '',
    `Task id: ${task.id}`,
    `Intent: ${task.intent}`,
    `Expected output: ${task.expectedOutput ?? 'A complete answer that satisfies the task prompt.'}`,
    `Prompt: ${task.prompt}`,
    `Candidate model: ${input.model}`,
    '',
    'Candidate output:',
    input.output ?? '',
  ].join('\n');
}

async function runJudgeJob(
  task: IOfflineEvaluationTask | undefined,
  input: IOfflineEvaluationInput,
  options: Required<Pick<IOfflineTaskJudgeOptions, 'baseUrl' | 'timeoutMs' | 'maxTokens' | 'judgeModel'>> & {
    apiKey?: string;
    fetchFn: typeof fetch;
  }
): Promise<IOfflineEvaluationInput> {
  if (input.error) {
    return input;
  }
  if (!task) {
    return {
      ...input,
      judgeError: 'unknown_task',
    };
  }
  if (!input.output?.trim()) {
    return {
      ...input,
      judgeError: 'missing_output',
    };
  }

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
        model: options.judgeModel,
        max_tokens: options.maxTokens,
        stream: false,
        metadata: {
          ctr_eval_judge_task_id: task.id,
          ctr_eval_judge_model: options.judgeModel,
          ctr_eval_judge_target_model: input.model,
        },
        messages: [
          {
            role: 'user',
            content: buildJudgePrompt(task, input),
          },
        ],
      }),
      ...(options.timeoutMs > 0 ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    });
    if (!response.ok) {
      return {
        ...input,
        judgeError: `http_${response.status}`,
      };
    }

    const payload = await response.json();
    const parsed = parseJudgeResult(extractResponseText(payload));
    if (!parsed) {
      return {
        ...input,
        judgeError: 'invalid_response',
      };
    }

    return {
      ...input,
      judgeError: undefined,
      judgeScore: parsed.judgeScore,
      calibrationNotes: parsed.calibrationNotes ?? input.calibrationNotes,
      judgeFindings: parsed.judgeFindings ?? input.judgeFindings,
    };
  } catch (error: any) {
    return {
      ...input,
      judgeError: error?.name === 'TimeoutError' ? 'timeout' : (error?.message || 'request_failed'),
    };
  }
}

export async function runOfflineTaskJudge(options: IOfflineTaskJudgeOptions): Promise<IOfflineTaskBenchmarkResult> {
  const tasks = options.tasks ?? DEFAULT_OFFLINE_EVALUATION_TASKS;
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const judgeModel = options.judgeModel.trim();
  if (!judgeModel) {
    throw new Error('LLM 裁判需要 judgeModel。');
  }
  if (!options.baseUrl?.trim()) {
    throw new Error('LLM 裁判需要 baseUrl。');
  }

  const inputs: IOfflineEvaluationInput[] = new Array(options.inputs.length);
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 2), 8));
  const sharedOptions = {
    judgeModel,
    baseUrl: options.baseUrl.trim(),
    apiKey: options.apiKey?.trim() || undefined,
    timeoutMs: Math.max(0, Math.floor(options.timeoutMs ?? 30000)),
    maxTokens: Math.max(1, Math.floor(options.maxTokens ?? 256)),
    fetchFn: options.fetchFn ?? fetch,
  };

  async function worker() {
    while (nextIndex < options.inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const input = options.inputs[currentIndex];
      inputs[currentIndex] = await runJudgeJob(taskMap.get(input.taskId), input, sharedOptions);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, options.inputs.length) }, () => worker()));
  return {
    inputs,
    report: runOfflineTaskEvaluation(inputs, tasks),
  };
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
  if (options.judgeModel?.trim()) {
    return runOfflineTaskJudge({
      inputs,
      tasks,
      judgeModel: options.judgeModel,
      baseUrl: sharedOptions.baseUrl,
      apiKey: sharedOptions.apiKey,
      timeoutMs: sharedOptions.timeoutMs,
      concurrency,
      maxTokens: options.judgeMaxTokens ?? 256,
      fetchFn: sharedOptions.fetchFn,
    });
  }

  return {
    inputs,
    report: runOfflineTaskEvaluation(inputs, tasks),
  };
}

function roundMetric(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4));
}

function buildHistoryEntry(
  report: IOfflineTaskEvaluationReport,
  options: Omit<IBenchmarkHistoryAppendOptions, 'historyFile'>
): IBenchmarkHistoryEntry {
  const createdAt = (options.now ?? new Date()).toISOString();
  const id = `bench_${createdAt.replace(/\D/g, '')}_${report.evaluatedRuns}`;

  return {
    id,
    createdAt,
    source: options.source ?? 'unknown',
    label: options.label?.trim() || undefined,
    totalTasks: report.totalTasks,
    totalRuns: report.totalRuns,
    evaluatedRuns: report.evaluatedRuns,
    passRate: roundMetric(report.passRate),
    averageQualityScore: roundMetric(report.averageQualityScore),
    averageSpeedScore: roundMetric(report.averageSpeedScore),
    averageLatencyMs: roundMetric(report.averageLatencyMs),
    calibratedRuns: report.calibrationSummary.calibratedRuns,
    averageCalibrationScore: roundMetric(report.calibrationSummary.averageCalibrationScore),
    averageRubricDelta: roundMetric(report.calibrationSummary.averageRubricDelta),
    models: report.byModel.map((item) => ({
      model: item.key,
      totalRuns: item.totalRuns,
      passRate: roundMetric(item.passRate),
      averageQualityScore: roundMetric(item.averageQualityScore),
      averageSpeedScore: roundMetric(item.averageSpeedScore),
      averageLatencyMs: roundMetric(item.averageLatencyMs),
    })),
    bestRunsByTask: report.bestRunsByTask.map((run) => ({
      taskId: run.taskId,
      model: run.model,
      qualityScore: roundMetric(run.qualityScore),
      speedScore: roundMetric(run.speedScore),
      latencyMs: run.latencyMs,
      passed: run.passed,
    })),
  };
}

function parseBenchmarkHistoryPayload(payload: unknown): IBenchmarkHistoryEntry[] {
  const rawEntries = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as { entries?: unknown }).entries)
      ? (payload as { entries: unknown[] }).entries
      : [];

  return rawEntries
    .filter((entry): entry is IBenchmarkHistoryEntry => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const candidate = entry as Partial<IBenchmarkHistoryEntry>;
      return Boolean(
        typeof candidate.id === 'string' &&
        typeof candidate.createdAt === 'string' &&
        typeof candidate.evaluatedRuns === 'number'
      );
    })
    .map((entry) => ({
      ...entry,
      source: entry.source ?? 'unknown',
      totalRuns: typeof entry.totalRuns === 'number' ? entry.totalRuns : entry.evaluatedRuns,
      models: Array.isArray(entry.models) ? entry.models : [],
      bestRunsByTask: Array.isArray(entry.bestRunsByTask) ? entry.bestRunsByTask : [],
    }));
}

export function readBenchmarkHistory(historyFile: string): IBenchmarkHistoryEntry[] {
  if (!existsSync(historyFile)) {
    return [];
  }

  const content = readFileSync(historyFile, 'utf-8').trim();
  if (!content) {
    return [];
  }

  return parseBenchmarkHistoryPayload(JSON.parse(content));
}

export function appendBenchmarkHistory(
  report: IOfflineTaskEvaluationReport,
  options: IBenchmarkHistoryAppendOptions
): IBenchmarkHistoryEntry {
  const entry = buildHistoryEntry(report, options);
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 50));
  const existing = readBenchmarkHistory(options.historyFile);
  const entries = [...existing, entry].slice(-maxEntries);
  mkdirSync(dirname(options.historyFile), { recursive: true });
  writeFileSync(options.historyFile, JSON.stringify({ version: 1, entries }, null, 2), 'utf-8');
  return entry;
}

export function summarizeBenchmarkHistory(entries: IBenchmarkHistoryEntry[]): IBenchmarkHistorySummary {
  const ordered = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = ordered.at(-1);
  const previous = ordered.at(-2);
  const topModels = latest
    ? [...latest.models].sort((a, b) => {
      const qualityDelta = b.averageQualityScore - a.averageQualityScore;
      if (qualityDelta !== 0) {
        return qualityDelta;
      }
      return a.averageLatencyMs - b.averageLatencyMs;
    }).slice(0, 5)
    : [];

  return {
    totalEntries: ordered.length,
    latest,
    previous,
    trends: {
      passRateDelta: latest && previous ? roundMetric(latest.passRate - previous.passRate) : 0,
      qualityDelta: latest && previous ? roundMetric(latest.averageQualityScore - previous.averageQualityScore) : 0,
      speedDelta: latest && previous ? roundMetric(latest.averageSpeedScore - previous.averageSpeedScore) : 0,
      latencyDeltaMs: latest && previous ? roundMetric(latest.averageLatencyMs - previous.averageLatencyMs) : 0,
      calibrationDelta: latest && previous ? roundMetric(latest.averageCalibrationScore - previous.averageCalibrationScore) : 0,
    },
    topModels,
    entries: ordered,
  };
}

function signedMetric(value: number, digits = 2): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}`;
}

export function formatBenchmarkHistorySummary(summary: IBenchmarkHistorySummary): string {
  const lines = ['Benchmark history'];
  if (!summary.latest) {
    lines.push('No benchmark history yet. Run ctr eval --input results.json --save-history or ctr eval --run --models "sonnet;haiku" --save-history.');
    return lines.join('\n');
  }

  const latest = summary.latest;
  lines.push(`Entries: ${summary.totalEntries}`);
  lines.push(`Latest: ${latest.createdAt}${latest.label ? ` (${latest.label})` : ''}, source=${latest.source}, runs=${latest.evaluatedRuns}/${latest.totalRuns}`);
  lines.push(`Latest score: pass ${(latest.passRate * 100).toFixed(1)}%, quality ${latest.averageQualityScore.toFixed(2)}, speed ${latest.averageSpeedScore.toFixed(2)}, latency ${latest.averageLatencyMs} ms`);

  if (summary.previous) {
    lines.push(
      `Trend vs previous: pass ${signedMetric(summary.trends.passRateDelta * 100, 1)}pp, quality ${signedMetric(summary.trends.qualityDelta)}, speed ${signedMetric(summary.trends.speedDelta)}, latency ${signedMetric(summary.trends.latencyDeltaMs, 0)} ms`
    );
  } else {
    lines.push('Trend vs previous: waiting for another saved run');
  }

  if (summary.topModels.length) {
    lines.push('Top models in latest run:');
    for (const model of summary.topModels) {
      lines.push(`- ${model.model}: quality ${model.averageQualityScore.toFixed(2)}, pass ${(model.passRate * 100).toFixed(1)}%, latency ${model.averageLatencyMs} ms`);
    }
  }

  return lines.join('\n');
}

export function buildOfflineTaskManifest(tasks: IOfflineEvaluationTask[] = DEFAULT_OFFLINE_EVALUATION_TASKS) {
  return {
    version: 1,
    description: 'Fixed task set for repeatable Claude Trigger Router model-combination evaluation.',
    tasks: tasks.map((task) => ({
      id: task.id,
      intent: task.intent,
      routeScenario: task.routeScenario ?? task.category ?? task.intent,
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
        qualityDimensions: qualityDimensionsForTask(task).map((dimension) => ({
          id: normalizeDimensionId(dimension.id),
          label: dimension.label ?? dimension.id,
          weight: dimension.weight ?? 1,
          minScore: dimension.minScore ?? 0.7,
          minOutputChars: dimension.minOutputChars,
          requiredKeywords: dimension.requiredKeywords ?? [],
          forbiddenPatterns: dimension.forbiddenPatterns ?? [],
          requiresCodeBlock: Boolean(dimension.requiresCodeBlock),
        })),
      },
      resultTemplate: {
        taskId: task.id,
        model: '<provider,model>',
        output: '<model output>',
        latencyMs: 0,
        humanScore: null,
        judgeScore: null,
        calibrationNotes: null,
        judgeFindings: [],
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
    lines.push(`  Dimensions: ${qualityDimensionsForTask(task).map((dimension) => normalizeDimensionId(dimension.id)).join('|') || '-'}`);
  }

  return lines.join('\n');
}

function formatDimensionSummary(scores: Record<string, number>): string {
  const entries = Object.entries(scores);
  if (!entries.length) {
    return '-';
  }

  return entries.map(([id, score]) => `${id}=${score.toFixed(2)}`).join(', ');
}

export function formatOfflineTaskEvaluationReport(report: IOfflineTaskEvaluationReport): string {
  const lines = [
    'Offline routing evaluation',
    `Tasks: ${report.totalTasks}, runs: ${report.evaluatedRuns}/${report.totalRuns}, passRate: ${(report.passRate * 100).toFixed(1)}%`,
    `Average quality: ${report.averageQualityScore.toFixed(2)}, speed: ${report.averageSpeedScore.toFixed(2)}, latency: ${report.averageLatencyMs} ms`,
  ];

  const dimensions = Object.entries(report.averageDimensionScores);
  if (dimensions.length) {
    lines.push(`Average dimensions: ${formatDimensionSummary(report.averageDimensionScores)}`);
  }

  if (report.calibrationSummary.calibratedRuns) {
    lines.push(
      `Calibration: ${report.calibrationSummary.calibratedRuns} runs, human ${report.calibrationSummary.averageHumanScore.toFixed(2)}, judge ${report.calibrationSummary.averageJudgeScore.toFixed(2)}, delta ${report.calibrationSummary.averageRubricDelta.toFixed(2)}`
    );
  } else {
    lines.push('Calibration: none (add humanScore or judgeScore to compare rubric with human/LLM judge)');
  }

  if (report.missingTaskIds.length) {
    lines.push(`Missing task ids: ${report.missingTaskIds.join(', ')}`);
  }

  lines.push('By model:');
  for (const item of report.byModel) {
    lines.push(`- ${item.key}: pass ${(item.passRate * 100).toFixed(1)}%, quality ${item.averageQualityScore.toFixed(2)}, latency ${item.averageLatencyMs} ms, dimensions ${formatDimensionSummary(item.averageDimensionScores)}`);
  }

  lines.push('By route scenario:');
  for (const item of report.byRouteScenario) {
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

  if (report.calibrationSummary.highDisagreementRuns.length) {
    lines.push('Calibration disagreements:');
    for (const run of report.calibrationSummary.highDisagreementRuns) {
      lines.push(`- ${run.taskId} -> ${run.model}: rubric ${run.qualityScore.toFixed(2)}, calibration ${run.calibrationScore.toFixed(2)}, delta ${run.deltaFromQuality.toFixed(2)}`);
    }
  }

  return lines.join('\n');
}
