import { IGovernanceTrace } from './types';
import { governanceTraceStore } from './trace';

export interface IGovernanceMetricsFilters {
  requestId?: string;
  sessionKey?: string;
  routeReason?: string;
  cascadeTriggered?: boolean;
  shadowChecked?: boolean;
  limit?: number;
}

export interface IGovernanceMetricsWindowOptions extends IGovernanceMetricsFilters {
  windowMs?: number;
  bucketCount?: number;
  now?: number;
  anomalyThresholds?: Partial<IGovernanceAnomalyThresholds>;
}

export interface IGovernanceMetricsBucket {
  bucketStart: number;
  bucketEnd: number;
  label: string;
  metrics: IGovernanceMetrics;
}

export interface IGovernanceDistributionEntry {
  key: string;
  count: number;
  rate: number;
}

export interface IGovernanceAnomaly {
  type: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold?: number;
}

export type TGovernanceHealthStatus = 'idle' | 'healthy' | 'watch' | 'critical';
export type TGovernanceRoutingTuningSeverity = 'info' | 'warn' | 'critical';

export interface IGovernanceRoutingTuningRecommendation {
  code: string;
  severity: TGovernanceRoutingTuningSeverity;
  message: string;
  evidence: string;
  action: string;
  configSuggestions?: IGovernanceRoutingConfigSuggestion[];
}

export interface IGovernanceRoutingConfigSuggestion {
  path: string;
  suggestedValue?: string | number | boolean;
  reason: string;
}

export type TGovernanceQualityEvidenceType =
  | 'alignment_continuity'
  | 'cascade_failure'
  | 'context_window_guard'
  | 'model_pool_fallback'
  | 'shadow_verification'
  | 'slow_request';

export interface IGovernanceQualityEvidenceSample {
  requestId: string;
  type: TGovernanceQualityEvidenceType;
  severity: 'info' | 'warn' | 'critical';
  evidence: string;
  action: string;
  routeReason: string[];
  initialModel?: string;
  finalModel?: string;
  semanticIntent?: string;
  latencyMs?: number;
  startedAt: number;
}

export interface IGovernanceQualityEvidenceSummary {
  totalSamples: number;
  failureSamples: number;
  improvementSamples: number;
  speedRiskSamples: number;
  byType: IGovernanceDistributionEntry[];
  samples: IGovernanceQualityEvidenceSample[];
}

export interface IGovernanceGuardrailFindingSummary {
  code: string;
  severity: 'info' | 'warn' | 'critical';
  count: number;
  rate: number;
  action: string;
}

export interface IGovernanceGuardrailDirectionSummary {
  status: 'ok' | 'watch' | 'critical';
  totalFindings: number;
  criticalCount: number;
  warnCount: number;
  infoCount: number;
  byCode: IGovernanceGuardrailFindingSummary[];
}

export interface IGovernanceGuardrailMetricsSummary {
  input: IGovernanceGuardrailDirectionSummary;
  output: IGovernanceGuardrailDirectionSummary;
}

export interface IGovernanceTaskComparisonModelEntry {
  model: string;
  totalTraces: number;
  failureCount: number;
  failureRate: number;
  latencySampleCount: number;
  averageLatencyMs: number;
  alignmentUsedRate: number;
  cascadeTriggeredRate: number;
}

export interface IGovernanceTaskComparisonEntry {
  taskKey: string;
  totalTraces: number;
  modelCount: number;
  baselineModel: string;
  bestModel: string;
  fastestModel: string;
  failureRateDelta: number;
  latencyDeltaMs: number;
  models: IGovernanceTaskComparisonModelEntry[];
}

export interface IGovernanceTaskComparisonSummary {
  totalComparedTasks: number;
  totalComparedTraces: number;
  bestQualityLiftTask?: IGovernanceTaskComparisonEntry;
  bestSpeedLiftTask?: IGovernanceTaskComparisonEntry;
  comparisons: IGovernanceTaskComparisonEntry[];
}

export interface IGovernanceHealthSummary {
  status: TGovernanceHealthStatus;
  message: string;
  sampleSize: number;
  alertCount: number;
  warnCount: number;
  criticalCount: number;
  signals: {
    stickyHitRate: number;
    cascadeTriggeredRate: number;
    shadowCheckedRate: number;
    alignmentUsedRate: number;
    modelSwitchRate: number;
    alignmentOnSwitchRate: number;
    contextWindowFallbackRate: number;
    contextWindowExceededRate: number;
    averageLatencyMs: number;
    topRouteReason?: IGovernanceDistributionEntry;
    topFinalModel?: IGovernanceDistributionEntry;
  };
  actions: string[];
  routingTuning: IGovernanceRoutingTuningRecommendation[];
}

export interface IGovernanceAnomalyThresholds {
  minSampleSize: number;
  cascadeWarnRate: number;
  cascadeCriticalRate: number;
  shadowWarnRate: number;
  shadowCriticalRate: number;
  latencyWarnMs: number;
  latencyCriticalMs: number;
  spikeWarnRate: number;
  spikeDeltaRate: number;
}

export interface IGovernanceMetrics {
  totalTraces: number;
  stickyHitCount: number;
  stickyHitRate: number;
  alignmentUsedCount: number;
  alignmentUsedRate: number;
  cascadeTriggeredCount: number;
  cascadeTriggeredRate: number;
  shadowCheckedCount: number;
  shadowCheckedRate: number;
  averageLatencyMs: number;
  averageEstimatedCost: number;
  routeReasonDistribution: Record<string, number>;
  finalModelDistribution: Record<string, number>;
  semanticIntentDistribution: Record<string, number>;
}

export interface IGovernanceModelSwitchEntry {
  key: string;
  from?: string;
  to?: string;
  count: number;
  rate: number;
}

export interface IGovernanceRoutingOutcomeGroupEntry {
  key: string;
  totalTraces: number;
  rate: number;
  modelSwitchCount: number;
  modelSwitchRate: number;
  alignmentOnSwitchCount: number;
  alignmentOnSwitchRate: number;
  cascadeAfterSwitchCount: number;
  cascadeAfterSwitchRate: number;
  averageLatencyMs: number;
}

export interface IGovernanceRoutingOutcomeSummary {
  totalTraces: number;
  routedTraces: number;
  routedRate: number;
  modelSwitchCount: number;
  modelSwitchRate: number;
  stableModelCount: number;
  stableModelRate: number;
  alignmentOnSwitchCount: number;
  alignmentOnSwitchRate: number;
  cascadeAfterSwitchCount: number;
  cascadeAfterSwitchRate: number;
  contextWindowFallbackCount: number;
  contextWindowFallbackRate: number;
  contextWindowExceededCount: number;
  contextWindowExceededRate: number;
  averageLatencyByRouteReason: Record<string, number>;
  topModelSwitches: IGovernanceModelSwitchEntry[];
  byRouteReason: IGovernanceRoutingOutcomeGroupEntry[];
  byFinalModel: IGovernanceRoutingOutcomeGroupEntry[];
  bySemanticIntent: IGovernanceRoutingOutcomeGroupEntry[];
}

export type TGovernanceRoutingOutcomeScorecardScope =
  | 'route_reason'
  | 'final_model'
  | 'semantic_intent';

export type TGovernanceRoutingOutcomeScorecardStatus = 'stable' | 'watch' | 'critical';

export interface IGovernanceRoutingOutcomeScorecardItem {
  key: string;
  scope: TGovernanceRoutingOutcomeScorecardScope;
  status: TGovernanceRoutingOutcomeScorecardStatus;
  priorityScore: number;
  totalTraces: number;
  rate: number;
  modelSwitchRate: number;
  alignmentOnSwitchRate: number;
  cascadeAfterSwitchRate: number;
  averageLatencyMs: number;
  qualityRiskCount: number;
  evidence: string[];
  action: string;
  configPath?: string;
}

export interface IGovernanceRoutingOutcomeScorecardSummary {
  totalItems: number;
  criticalCount: number;
  watchCount: number;
  stableCount: number;
  topActions: string[];
  items: IGovernanceRoutingOutcomeScorecardItem[];
}

export interface IGovernanceMetricsReport {
  windowMs?: number;
  bucketCount: number;
  windowStart?: number;
  windowEnd?: number;
  metrics: IGovernanceMetrics;
  outcome: IGovernanceRoutingOutcomeSummary;
  outcomeScorecard: IGovernanceRoutingOutcomeScorecardSummary;
  buckets: IGovernanceMetricsBucket[];
  topRouteReasons: IGovernanceDistributionEntry[];
  topFinalModels: IGovernanceDistributionEntry[];
  topSemanticIntents: IGovernanceDistributionEntry[];
  anomalies: IGovernanceAnomaly[];
  guardrails: IGovernanceGuardrailMetricsSummary;
  qualityEvidence?: IGovernanceQualityEvidenceSummary;
  taskComparison?: IGovernanceTaskComparisonSummary;
  health?: IGovernanceHealthSummary;
}

export type TGovernanceMetricsExportFormat = 'json' | 'csv';

const DEFAULT_ANOMALY_THRESHOLDS: IGovernanceAnomalyThresholds = {
  minSampleSize: 3,
  cascadeWarnRate: 0.4,
  cascadeCriticalRate: 0.6,
  shadowWarnRate: 0.5,
  shadowCriticalRate: 0.7,
  latencyWarnMs: 1500,
  latencyCriticalMs: 3000,
  spikeWarnRate: 0.5,
  spikeDeltaRate: 0.3,
};

function normalizeAnomalyThresholds(
  input?: Partial<IGovernanceAnomalyThresholds>
): IGovernanceAnomalyThresholds {
  return {
    minSampleSize: input?.minSampleSize ?? DEFAULT_ANOMALY_THRESHOLDS.minSampleSize,
    cascadeWarnRate: input?.cascadeWarnRate ?? DEFAULT_ANOMALY_THRESHOLDS.cascadeWarnRate,
    cascadeCriticalRate: input?.cascadeCriticalRate ?? DEFAULT_ANOMALY_THRESHOLDS.cascadeCriticalRate,
    shadowWarnRate: input?.shadowWarnRate ?? DEFAULT_ANOMALY_THRESHOLDS.shadowWarnRate,
    shadowCriticalRate: input?.shadowCriticalRate ?? DEFAULT_ANOMALY_THRESHOLDS.shadowCriticalRate,
    latencyWarnMs: input?.latencyWarnMs ?? DEFAULT_ANOMALY_THRESHOLDS.latencyWarnMs,
    latencyCriticalMs: input?.latencyCriticalMs ?? DEFAULT_ANOMALY_THRESHOLDS.latencyCriticalMs,
    spikeWarnRate: input?.spikeWarnRate ?? DEFAULT_ANOMALY_THRESHOLDS.spikeWarnRate,
    spikeDeltaRate: input?.spikeDeltaRate ?? DEFAULT_ANOMALY_THRESHOLDS.spikeDeltaRate,
  };
}

function rate(count: number, total: number): number {
  if (!total) {
    return 0;
  }

  return Number((count / total).toFixed(4));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function increment(distribution: Record<string, number>, key?: string): void {
  if (!key) {
    return;
  }

  distribution[key] = (distribution[key] ?? 0) + 1;
}

function buildTopEntries(
  distribution: Record<string, number>,
  total: number,
  limit = 5
): IGovernanceDistributionEntry[] {
  return Object.entries(distribution)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      count,
      rate: rate(count, total),
    }));
}

function buildTopSwitchEntries(
  distribution: Record<string, { from?: string; to?: string; count: number }>,
  total: number,
  limit = 5
): IGovernanceModelSwitchEntry[] {
  return Object.values(distribution)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return `${left.from ?? ''}->${left.to ?? ''}`.localeCompare(`${right.from ?? ''}->${right.to ?? ''}`);
    })
    .slice(0, limit)
    .map((entry) => ({
      key: `${entry.from ?? '-'} -> ${entry.to ?? '-'}`,
      from: entry.from,
      to: entry.to,
      count: entry.count,
      rate: rate(entry.count, total),
    }));
}

type TOutcomeGroupAccumulator = {
  key: string;
  totalTraces: number;
  modelSwitchCount: number;
  alignmentOnSwitchCount: number;
  cascadeAfterSwitchCount: number;
  latencyValues: number[];
};

function addOutcomeGroup(
  groups: Record<string, TOutcomeGroupAccumulator>,
  key: string | undefined,
  trace: IGovernanceTrace
): void {
  if (!key) {
    return;
  }

  const switched = isModelSwitch(trace);
  const group = groups[key] ?? {
    key,
    totalTraces: 0,
    modelSwitchCount: 0,
    alignmentOnSwitchCount: 0,
    cascadeAfterSwitchCount: 0,
    latencyValues: [],
  };

  group.totalTraces += 1;
  group.modelSwitchCount += switched ? 1 : 0;
  group.alignmentOnSwitchCount += switched && trace.alignmentUsed ? 1 : 0;
  group.cascadeAfterSwitchCount += switched && trace.cascadeTriggered ? 1 : 0;
  if (typeof trace.latencyMs === 'number' && Number.isFinite(trace.latencyMs)) {
    group.latencyValues.push(trace.latencyMs);
  }
  groups[key] = group;
}

function buildOutcomeGroupEntries(
  groups: Record<string, TOutcomeGroupAccumulator>,
  totalTraces: number,
  limit = 5
): IGovernanceRoutingOutcomeGroupEntry[] {
  return Object.values(groups)
    .sort((left, right) => {
      if (right.totalTraces !== left.totalTraces) {
        return right.totalTraces - left.totalTraces;
      }
      return left.key.localeCompare(right.key);
    })
    .slice(0, limit)
    .map((group) => ({
      key: group.key,
      totalTraces: group.totalTraces,
      rate: rate(group.totalTraces, totalTraces),
      modelSwitchCount: group.modelSwitchCount,
      modelSwitchRate: rate(group.modelSwitchCount, group.totalTraces),
      alignmentOnSwitchCount: group.alignmentOnSwitchCount,
      alignmentOnSwitchRate: rate(group.alignmentOnSwitchCount, group.modelSwitchCount),
      cascadeAfterSwitchCount: group.cascadeAfterSwitchCount,
      cascadeAfterSwitchRate: rate(group.cascadeAfterSwitchCount, group.modelSwitchCount),
      averageLatencyMs: average(group.latencyValues),
    }));
}

function isRoutedTrace(trace: IGovernanceTrace): boolean {
  return trace.routeReason.some((reason) => reason !== 'request_received');
}

function isModelSwitch(trace: IGovernanceTrace): boolean {
  return Boolean(trace.initialModel && trace.finalModel && trace.initialModel !== trace.finalModel);
}

function hasRouteReasonPrefix(trace: IGovernanceTrace, prefix: string): boolean {
  return trace.routeReason.some((reason) => reason === prefix || reason.startsWith(`${prefix}:`));
}

function compactCsvEvidence(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/,/g, ';');
}

function classifyVerificationResult(value: string): 'info' | 'warn' {
  const normalized = value.toLowerCase();
  if (/\b(pass|passed|ok|clean|approved)\b/.test(normalized) || /no\s+(risk|issue|violation|error|failure|fail)/.test(normalized)) {
    return 'info';
  }

  return /fail|risk|unsafe|violation|missing|placeholder|error/.test(normalized) ? 'warn' : 'info';
}

function guardrailAction(code: string, direction: 'input' | 'output'): string {
  if (code === 'prompt_injection_instruction_override') {
    return 'Review prompt boundary wording and keep system/tool instructions out of user-editable templates.';
  }
  if (code === 'secret_exfiltration_request') {
    return 'Audit the client workflow and ensure secrets are never available in model-visible context.';
  }
  if (code === 'placeholder_output') {
    return 'Compare this route with a stronger or better instructed candidate before trusting the output.';
  }
  if (code === 'tool_result_error') {
    return 'Inspect tool capability guardrails and upstream tool execution logs for this route.';
  }
  if (code === 'refusal_or_incomplete_output') {
    return 'Check whether this route needs clearer task framing or a different model capability profile.';
  }
  return direction === 'input'
    ? 'Review input-side optimization rules for this recurring prompt pattern.'
    : 'Review output-side governance rules for this recurring response pattern.';
}

function buildGuardrailDirectionSummary(
  traces: IGovernanceTrace[],
  direction: 'input' | 'output'
): IGovernanceGuardrailDirectionSummary {
  const distribution: Record<string, { severity: 'info' | 'warn' | 'critical'; count: number }> = {};
  let totalFindings = 0;
  let criticalCount = 0;
  let warnCount = 0;
  let infoCount = 0;

  for (const trace of traces) {
    const report = direction === 'input' ? trace.inputGuardrail : trace.outputGuardrail;
    for (const finding of report?.findings ?? []) {
      totalFindings += 1;
      if (finding.severity === 'critical') {
        criticalCount += 1;
      } else if (finding.severity === 'warn') {
        warnCount += 1;
      } else {
        infoCount += 1;
      }
      const current = distribution[finding.code] ?? {
        severity: finding.severity as 'info' | 'warn' | 'critical',
        count: 0,
      };
      const severityRank = { critical: 0, warn: 1, info: 2 };
      const nextSeverity = severityRank[finding.severity as 'info' | 'warn' | 'critical'] < severityRank[current.severity]
        ? finding.severity as 'info' | 'warn' | 'critical'
        : current.severity;
      distribution[finding.code] = {
        severity: nextSeverity,
        count: current.count + 1,
      };
    }
  }

  const byCode = Object.entries(distribution)
    .map(([code, item]) => ({
      code,
      severity: item.severity,
      count: item.count,
      rate: rate(item.count, traces.length),
      action: guardrailAction(code, direction),
    }))
    .sort((left, right) => {
      const severityRank = { critical: 0, warn: 1, info: 2 };
      if (severityRank[left.severity] !== severityRank[right.severity]) {
        return severityRank[left.severity] - severityRank[right.severity];
      }
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.code.localeCompare(right.code);
    })
    .slice(0, 8);

  return {
    status: criticalCount > 0 ? 'critical' : warnCount > 0 ? 'watch' : 'ok',
    totalFindings,
    criticalCount,
    warnCount,
    infoCount,
    byCode,
  };
}

export function buildGuardrailMetricsSummary(traces: IGovernanceTrace[]): IGovernanceGuardrailMetricsSummary {
  return {
    input: buildGuardrailDirectionSummary(traces, 'input'),
    output: buildGuardrailDirectionSummary(traces, 'output'),
  };
}

function getTaskComparisonKey(trace: IGovernanceTrace): string | undefined {
  if (trace.semanticIntent) {
    return trace.semanticIntent;
  }

  const semanticReason = trace.routeReason.find((reason) =>
    reason.startsWith('semantic_match:') || reason.startsWith('semantic:intent:')
  );
  if (semanticReason) {
    if (semanticReason.startsWith('semantic:intent:')) {
      return semanticReason.slice('semantic:intent:'.length);
    }
    return semanticReason.slice('semantic_match:'.length);
  }

  return undefined;
}

function isTraceFailure(trace: IGovernanceTrace): boolean {
  return Boolean(
    trace.cascadeTriggered ||
      (trace.cascadeEvidence?.length ?? 0) > 0 ||
      trace.modelPoolFallbackTriggered ||
      hasRouteReasonPrefix(trace, 'context_window_exceeded') ||
      (trace.verificationResult && classifyVerificationResult(trace.verificationResult) === 'warn')
  );
}

function buildTaskComparisonSummary(traces: IGovernanceTrace[], limit = 5): IGovernanceTaskComparisonSummary {
  const tasks: Record<string, Record<string, {
    model: string;
    totalTraces: number;
    failureCount: number;
    alignmentUsedCount: number;
    cascadeTriggeredCount: number;
    latencyValues: number[];
  }>> = {};

  for (const trace of traces) {
    const taskKey = getTaskComparisonKey(trace);
    const model = trace.finalModel;
    if (!taskKey || !model) {
      continue;
    }

    tasks[taskKey] ??= {};
    tasks[taskKey][model] ??= {
      model,
      totalTraces: 0,
      failureCount: 0,
      alignmentUsedCount: 0,
      cascadeTriggeredCount: 0,
      latencyValues: [],
    };

    const item = tasks[taskKey][model];
    item.totalTraces += 1;
    item.failureCount += isTraceFailure(trace) ? 1 : 0;
    item.alignmentUsedCount += trace.alignmentUsed ? 1 : 0;
    item.cascadeTriggeredCount += trace.cascadeTriggered ? 1 : 0;
    if (typeof trace.latencyMs === 'number') {
      item.latencyValues.push(trace.latencyMs);
    }
  }

  const comparisons = Object.entries(tasks)
    .map(([taskKey, modelMap]) => {
      const models = Object.values(modelMap)
        .map((model) => ({
          model: model.model,
          totalTraces: model.totalTraces,
          failureCount: model.failureCount,
          failureRate: rate(model.failureCount, model.totalTraces),
          latencySampleCount: model.latencyValues.length,
          averageLatencyMs: average(model.latencyValues),
          alignmentUsedRate: rate(model.alignmentUsedCount, model.totalTraces),
          cascadeTriggeredRate: rate(model.cascadeTriggeredCount, model.totalTraces),
        }))
        .sort((left, right) => {
          if (left.failureRate !== right.failureRate) {
            return left.failureRate - right.failureRate;
          }
          if (Boolean(right.latencySampleCount) !== Boolean(left.latencySampleCount)) {
            return right.latencySampleCount - left.latencySampleCount;
          }
          if (left.averageLatencyMs !== right.averageLatencyMs) {
            return left.averageLatencyMs - right.averageLatencyMs;
          }
          return right.totalTraces - left.totalTraces;
        });
      const modelCount = models.length;
      const totalTraces = models.reduce((sum, model) => sum + model.totalTraces, 0);
      if (modelCount < 2 || totalTraces < 2) {
        return undefined;
      }

      const baseline = [...models].sort((left, right) => {
        if (right.totalTraces !== left.totalTraces) {
          return right.totalTraces - left.totalTraces;
        }
        return left.model.localeCompare(right.model);
      })[0];
      const best = models[0];
      const latencyModels = models.filter((model) => model.latencySampleCount > 0);
      const fastest = [...(latencyModels.length ? latencyModels : models)].sort((left, right) => {
        if (left.averageLatencyMs !== right.averageLatencyMs) {
          return left.averageLatencyMs - right.averageLatencyMs;
        }
        return left.failureRate - right.failureRate;
      })[0];
      const latencyDeltaMs = baseline.latencySampleCount > 0 && fastest.latencySampleCount > 0
        ? Number((baseline.averageLatencyMs - fastest.averageLatencyMs).toFixed(2))
        : 0;

      return {
        taskKey,
        totalTraces,
        modelCount,
        baselineModel: baseline.model,
        bestModel: best.model,
        fastestModel: fastest.model,
        failureRateDelta: Number((baseline.failureRate - best.failureRate).toFixed(4)),
        latencyDeltaMs,
        models,
      };
    })
    .filter((item): item is IGovernanceTaskComparisonEntry => Boolean(item))
    .sort((left, right) => {
      if (right.failureRateDelta !== left.failureRateDelta) {
        return right.failureRateDelta - left.failureRateDelta;
      }
      if (right.latencyDeltaMs !== left.latencyDeltaMs) {
        return right.latencyDeltaMs - left.latencyDeltaMs;
      }
      return right.totalTraces - left.totalTraces;
    });

  return {
    totalComparedTasks: comparisons.length,
    totalComparedTraces: comparisons.reduce((sum, item) => sum + item.totalTraces, 0),
    bestQualityLiftTask: comparisons.find((item) => item.failureRateDelta > 0),
    bestSpeedLiftTask: [...comparisons].sort((left, right) => right.latencyDeltaMs - left.latencyDeltaMs).find((item) => item.latencyDeltaMs > 0),
    comparisons: comparisons.slice(0, limit),
  };
}

function buildQualityEvidenceSummary(
  traces: IGovernanceTrace[],
  thresholds: IGovernanceAnomalyThresholds,
  limit = 8
): IGovernanceQualityEvidenceSummary {
  const samples: IGovernanceQualityEvidenceSample[] = [];
  const distribution: Record<string, number> = {};
  const addSample = (
    trace: IGovernanceTrace,
    type: TGovernanceQualityEvidenceType,
    severity: 'info' | 'warn' | 'critical',
    evidence: string,
    action: string
  ) => {
    distribution[type] = (distribution[type] ?? 0) + 1;
    samples.push({
      requestId: trace.requestId,
      type,
      severity,
      evidence,
      action,
      routeReason: [...trace.routeReason],
      initialModel: trace.initialModel,
      finalModel: trace.finalModel,
      semanticIntent: trace.semanticIntent,
      latencyMs: trace.latencyMs,
      startedAt: trace.startedAt,
    });
  };

  for (const trace of traces) {
    if (trace.cascadeTriggered || (trace.cascadeEvidence?.length ?? 0) > 0) {
      addSample(
        trace,
        'cascade_failure',
        trace.cascadeTriggered ? 'critical' : 'warn',
        trace.cascadeEvidence?.length ? trace.cascadeEvidence.join('; ') : 'Cascade retry was triggered.',
        'Review cascade evidence and compare the retry model output with the original model.'
      );
    }

    if (trace.modelPoolFallbackTriggered) {
      addSample(
        trace,
        'model_pool_fallback',
        'warn',
        trace.modelPoolFallbackEvidence || `${trace.modelPoolFallbackFromEndpoint ?? '-'} -> ${trace.modelPoolFallbackNextEndpoint ?? '-'}`,
        'Inspect model pool endpoint health before sending more traffic to this pool.'
      );
    }

    if (hasRouteReasonPrefix(trace, 'context_window_exceeded')) {
      addSample(
        trace,
        'context_window_guard',
        'critical',
        trace.routeReason.find((reason) => reason.startsWith('context_window_exceeded')) || 'context window exceeded',
        'Add model context metadata or route this task class to a larger context model.'
      );
    } else if (hasRouteReasonPrefix(trace, 'context_window_fallback')) {
      addSample(
        trace,
        'context_window_guard',
        'info',
        trace.routeReason.find((reason) => reason.startsWith('context_window_fallback')) || 'long-context fallback used',
        'Keep this as positive evidence that long-context fallback protected the request.'
      );
    }

    if (trace.shadowChecked && trace.verificationResult) {
      const severity = classifyVerificationResult(trace.verificationResult);
      addSample(
        trace,
        'shadow_verification',
        severity,
        trace.verificationResult,
        severity === 'warn'
          ? 'Review verifier findings before widening this route.'
          : 'Keep verifier pass as quality evidence for this route.'
      );
    }

    if (typeof trace.latencyMs === 'number' && trace.latencyMs >= thresholds.latencyWarnMs) {
      addSample(
        trace,
        'slow_request',
        trace.latencyMs >= thresholds.latencyCriticalMs ? 'critical' : 'warn',
        `latencyMs=${trace.latencyMs}`,
        'Compare this route with faster candidates before making it default traffic.'
      );
    }

    if (isModelSwitch(trace) && trace.alignmentUsed) {
      addSample(
        trace,
        'alignment_continuity',
        'info',
        `${trace.initialModel ?? '-'} -> ${trace.finalModel ?? '-'} with context alignment`,
        'Keep this as continuity evidence for model switching.'
      );
    }
  }

  const severityRank = { critical: 0, warn: 1, info: 2 };
  const rankedSamples = samples
    .sort((left, right) => {
      if (severityRank[left.severity] !== severityRank[right.severity]) {
        return severityRank[left.severity] - severityRank[right.severity];
      }
      return right.startedAt - left.startedAt;
    })
    .slice(0, limit);

  return {
    totalSamples: samples.length,
    failureSamples: samples.filter((sample) => sample.severity !== 'info').length,
    improvementSamples: samples.filter((sample) =>
      sample.type === 'alignment_continuity' ||
      (sample.type === 'context_window_guard' && sample.severity === 'info') ||
      (sample.type === 'shadow_verification' && sample.severity === 'info')
    ).length,
    speedRiskSamples: samples.filter((sample) => sample.type === 'slow_request').length,
    byType: buildTopEntries(distribution, samples.length, 8),
    samples: rankedSamples,
  };
}

export function summarizeRoutingOutcomes(traces: IGovernanceTrace[]): IGovernanceRoutingOutcomeSummary {
  const routedTraces = traces.filter(isRoutedTrace);
  const switchedTraces = traces.filter(isModelSwitch);
  const stableModelCount = traces.filter((trace) =>
    Boolean(trace.initialModel && trace.finalModel && trace.initialModel === trace.finalModel)
  ).length;
  const alignmentOnSwitchCount = switchedTraces.filter((trace) => trace.alignmentUsed).length;
  const cascadeAfterSwitchCount = switchedTraces.filter((trace) => trace.cascadeTriggered).length;
  const contextWindowFallbackCount = traces.filter((trace) => hasRouteReasonPrefix(trace, 'context_window_fallback')).length;
  const contextWindowExceededCount = traces.filter((trace) => hasRouteReasonPrefix(trace, 'context_window_exceeded')).length;
  const switchDistribution: Record<string, { from?: string; to?: string; count: number }> = {};
  const routeLatencyValues: Record<string, number[]> = {};
  const routeReasonGroups: Record<string, TOutcomeGroupAccumulator> = {};
  const finalModelGroups: Record<string, TOutcomeGroupAccumulator> = {};
  const semanticIntentGroups: Record<string, TOutcomeGroupAccumulator> = {};

  for (const trace of traces) {
    if (isModelSwitch(trace)) {
      const key = `${trace.initialModel} -> ${trace.finalModel}`;
      switchDistribution[key] = {
        from: trace.initialModel,
        to: trace.finalModel,
        count: (switchDistribution[key]?.count ?? 0) + 1,
      };
    }

    if (typeof trace.latencyMs === 'number' && Number.isFinite(trace.latencyMs)) {
      for (const reason of trace.routeReason.filter((item) => item !== 'request_received')) {
        routeLatencyValues[reason] = [...(routeLatencyValues[reason] ?? []), trace.latencyMs];
      }
    }

    for (const reason of trace.routeReason.filter((item) => item !== 'request_received')) {
      addOutcomeGroup(routeReasonGroups, reason, trace);
    }
    addOutcomeGroup(finalModelGroups, trace.finalModel, trace);
    addOutcomeGroup(semanticIntentGroups, trace.semanticIntent, trace);
  }

  const averageLatencyByRouteReason = Object.fromEntries(
    Object.entries(routeLatencyValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, values]) => [reason, average(values)])
  );

  return {
    totalTraces: traces.length,
    routedTraces: routedTraces.length,
    routedRate: rate(routedTraces.length, traces.length),
    modelSwitchCount: switchedTraces.length,
    modelSwitchRate: rate(switchedTraces.length, traces.length),
    stableModelCount,
    stableModelRate: rate(stableModelCount, traces.length),
    alignmentOnSwitchCount,
    alignmentOnSwitchRate: rate(alignmentOnSwitchCount, switchedTraces.length),
    cascadeAfterSwitchCount,
    cascadeAfterSwitchRate: rate(cascadeAfterSwitchCount, switchedTraces.length),
    contextWindowFallbackCount,
    contextWindowFallbackRate: rate(contextWindowFallbackCount, traces.length),
    contextWindowExceededCount,
    contextWindowExceededRate: rate(contextWindowExceededCount, traces.length),
    averageLatencyByRouteReason,
    topModelSwitches: buildTopSwitchEntries(switchDistribution, switchedTraces.length),
    byRouteReason: buildOutcomeGroupEntries(routeReasonGroups, traces.length),
    byFinalModel: buildOutcomeGroupEntries(finalModelGroups, traces.length),
    bySemanticIntent: buildOutcomeGroupEntries(semanticIntentGroups, traces.length),
  };
}

function averageRate(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function buildAnomalies(
  metrics: IGovernanceMetrics,
  buckets: IGovernanceMetricsBucket[],
  thresholds: IGovernanceAnomalyThresholds
): IGovernanceAnomaly[] {
  const anomalies: IGovernanceAnomaly[] = [];

  if (metrics.totalTraces >= thresholds.minSampleSize && metrics.cascadeTriggeredRate >= thresholds.cascadeWarnRate) {
    anomalies.push({
      type: 'cascade_rate_high',
      severity: metrics.cascadeTriggeredRate >= thresholds.cascadeCriticalRate ? 'critical' : 'warn',
      message: `Cascade trigger rate is elevated at ${(metrics.cascadeTriggeredRate * 100).toFixed(1)}%`,
      metric: 'cascadeTriggeredRate',
      value: metrics.cascadeTriggeredRate,
      threshold: thresholds.cascadeWarnRate,
    });
  }

  if (metrics.totalTraces >= thresholds.minSampleSize && metrics.shadowCheckedRate >= thresholds.shadowWarnRate) {
    anomalies.push({
      type: 'shadow_rate_high',
      severity: metrics.shadowCheckedRate >= thresholds.shadowCriticalRate ? 'critical' : 'warn',
      message: `Shadow supervision rate is elevated at ${(metrics.shadowCheckedRate * 100).toFixed(1)}%`,
      metric: 'shadowCheckedRate',
      value: metrics.shadowCheckedRate,
      threshold: thresholds.shadowWarnRate,
    });
  }

  if (metrics.totalTraces >= thresholds.minSampleSize && metrics.averageLatencyMs >= thresholds.latencyWarnMs) {
    anomalies.push({
      type: 'latency_high',
      severity: metrics.averageLatencyMs >= thresholds.latencyCriticalMs ? 'critical' : 'warn',
      message: `Average latency is elevated at ${metrics.averageLatencyMs.toFixed(0)} ms`,
      metric: 'averageLatencyMs',
      value: metrics.averageLatencyMs,
      threshold: thresholds.latencyWarnMs,
    });
  }

  if (buckets.length >= 2) {
    const latestBucket = buckets[buckets.length - 1];
    const previousBuckets = buckets.slice(0, -1).filter((bucket) => bucket.metrics.totalTraces > 0);
    if (latestBucket.metrics.totalTraces > 0 && previousBuckets.length > 0) {
      const previousCascadeAverage = averageRate(
        previousBuckets.map((bucket) => bucket.metrics.cascadeTriggeredRate)
      );
      if (latestBucket.metrics.cascadeTriggeredRate >= thresholds.spikeWarnRate &&
        latestBucket.metrics.cascadeTriggeredRate >= previousCascadeAverage + thresholds.spikeDeltaRate) {
        anomalies.push({
          type: 'cascade_spike',
          severity: 'warn',
          message: `Latest bucket cascade rate spiked to ${(latestBucket.metrics.cascadeTriggeredRate * 100).toFixed(1)}%`,
          metric: 'cascadeTriggeredRate',
          value: latestBucket.metrics.cascadeTriggeredRate,
          threshold: previousCascadeAverage,
        });
      }

      const previousShadowAverage = averageRate(
        previousBuckets.map((bucket) => bucket.metrics.shadowCheckedRate)
      );
      if (latestBucket.metrics.shadowCheckedRate >= thresholds.spikeWarnRate &&
        latestBucket.metrics.shadowCheckedRate >= previousShadowAverage + thresholds.spikeDeltaRate) {
        anomalies.push({
          type: 'shadow_spike',
          severity: 'warn',
          message: `Latest bucket shadow rate spiked to ${(latestBucket.metrics.shadowCheckedRate * 100).toFixed(1)}%`,
          metric: 'shadowCheckedRate',
          value: latestBucket.metrics.shadowCheckedRate,
          threshold: previousShadowAverage,
        });
      }
    }
  }

  return anomalies;
}

function buildHealthActions(anomalies: IGovernanceAnomaly[]): string[] {
  const actions = new Set<string>();

  for (const anomaly of anomalies) {
    if (anomaly.type.includes('cascade')) {
      actions.add('Review cascade triggers and recent failure evidence.');
    } else if (anomaly.type.includes('shadow')) {
      actions.add('Review shadow supervision findings and verifier sampling.');
    } else if (anomaly.type.includes('latency')) {
      actions.add('Inspect slow models or upstream latency before widening traffic.');
    }
  }

  if (!actions.size) {
    actions.add('Continue monitoring route and model distributions.');
  }

  return Array.from(actions);
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

function topOutcomeGroup(
  groups: IGovernanceRoutingOutcomeGroupEntry[],
  predicate: (group: IGovernanceRoutingOutcomeGroupEntry) => boolean
): IGovernanceRoutingOutcomeGroupEntry | undefined {
  return groups
    .filter(predicate)
    .sort((left, right) => {
      const leftScore = left.cascadeAfterSwitchRate + left.modelSwitchRate;
      const rightScore = right.cascadeAfterSwitchRate + right.modelSwitchRate;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      if (right.totalTraces !== left.totalTraces) {
        return right.totalTraces - left.totalTraces;
      }
      return left.key.localeCompare(right.key);
    })[0];
}

function topSlowOutcomeGroup(
  groups: IGovernanceRoutingOutcomeGroupEntry[]
): IGovernanceRoutingOutcomeGroupEntry | undefined {
  return groups
    .filter((group) => group.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyWarnMs)
    .sort((left, right) => {
      if (right.averageLatencyMs !== left.averageLatencyMs) {
        return right.averageLatencyMs - left.averageLatencyMs;
      }
      if (right.totalTraces !== left.totalTraces) {
        return right.totalTraces - left.totalTraces;
      }
      return left.key.localeCompare(right.key);
    })[0];
}

function smartRouterTargetPath(routeKey?: string): string {
  if (!routeKey) {
    return 'SmartRouter';
  }
  if (routeKey.startsWith('smart_rule:')) {
    const ruleName = routeKey.slice('smart_rule:'.length);
    return ruleName ? `SmartRouter.rules[name="${ruleName}"]` : 'SmartRouter.rules';
  }
  if (routeKey.startsWith('semantic_match:')) {
    const intent = routeKey.slice('semantic_match:'.length);
    return intent ? `SmartRouter.semantic.prototypes.${intent}` : 'SmartRouter.semantic';
  }
  if (routeKey.startsWith('semantic:intent:')) {
    const intent = routeKey.slice('semantic:intent:'.length);
    return intent ? `SmartRouter.semantic.prototypes.${intent}` : 'SmartRouter.semantic';
  }
  if (routeKey === 'smart_router') {
    return 'SmartRouter.candidates';
  }
  return 'SmartRouter.rules';
}

function buildRoutingTuningRecommendations(
  metrics: IGovernanceMetrics,
  outcome?: IGovernanceRoutingOutcomeSummary
): IGovernanceRoutingTuningRecommendation[] {
  if (!outcome || metrics.totalTraces === 0) {
    return [];
  }

  const recommendations: IGovernanceRoutingTuningRecommendation[] = [];

  if (outcome.routedTraces < DEFAULT_ANOMALY_THRESHOLDS.minSampleSize) {
    recommendations.push({
      code: 'collect_routing_samples',
      severity: 'info',
      message: 'Routing sample size is still small.',
      evidence: `routedTraces=${outcome.routedTraces}`,
      action: 'Collect at least 3 routed traces before changing routing policy.',
    });
  }

  if (outcome.contextWindowExceededCount > 0) {
    recommendations.push({
      code: 'context_window_exceeded',
      severity: 'critical',
      message: 'Some requests exceeded the selected model context window.',
      evidence: `contextWindowExceededRate=${percent(outcome.contextWindowExceededRate)}`,
      action: 'Review model context window metadata and Router.longContext coverage.',
      configSuggestions: [
        {
          path: 'Models[].metadata.context_window_tokens',
          reason: 'Fill context window metadata so CTR can detect oversize requests before sending them upstream.',
        },
        {
          path: 'Router.longContext',
          reason: 'Point long-context traffic to the largest safe model instead of letting small models receive oversized prompts.',
        },
      ],
    });
  } else if (outcome.contextWindowFallbackRate >= 0.3) {
    recommendations.push({
      code: 'context_window_fallback_high',
      severity: outcome.contextWindowFallbackRate >= 0.6 ? 'warn' : 'info',
      message: 'Long-context fallback is frequent enough to affect latency planning.',
      evidence: `contextWindowFallbackRate=${percent(outcome.contextWindowFallbackRate)}`,
      action: 'Monitor context window fallback rate and long-context model latency.',
      configSuggestions: [
        {
          path: 'SmartRouter.rules',
          reason: 'Add or raise an explicit long-context rule when the same task class repeatedly falls back after initial selection.',
        },
        {
          path: 'Router.longContext',
          reason: 'Keep the long-context route on a model with enough context and acceptable latency.',
        },
      ],
    });
  }

  const switchWithoutAlignment = topOutcomeGroup(outcome.byRouteReason, (group) =>
    group.modelSwitchCount > 0 &&
    group.modelSwitchRate >= 0.5 &&
    group.alignmentOnSwitchRate < 0.5
  );
  if (switchWithoutAlignment) {
    recommendations.push({
      code: 'switch_without_alignment',
      severity: 'warn',
      message: 'A high-switch route is not consistently using alignment.',
      evidence: `${switchWithoutAlignment.key}:switch=${percent(switchWithoutAlignment.modelSwitchRate)}:alignment=${percent(switchWithoutAlignment.alignmentOnSwitchRate)}`,
      action: 'Enable or tune SmartRouter sticky alignment for high-switch routes.',
      configSuggestions: [
        {
          path: 'SmartRouter.sticky.enabled',
          suggestedValue: true,
          reason: 'Keep related requests on a stable model unless an explicit route needs to break stickiness.',
        },
        {
          path: 'SmartRouter.sticky.alignment.enabled',
          suggestedValue: true,
          reason: 'Inject a compact handoff summary when a model switch is unavoidable.',
        },
      ],
    });
  }

  const cascadeAfterSwitch = topOutcomeGroup(outcome.byRouteReason, (group) =>
    group.cascadeAfterSwitchCount > 0 &&
    group.cascadeAfterSwitchRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeWarnRate
  );
  if (cascadeAfterSwitch || outcome.cascadeAfterSwitchRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeWarnRate) {
    const cascadeRate = cascadeAfterSwitch?.cascadeAfterSwitchRate ?? outcome.cascadeAfterSwitchRate;
    const severity = cascadeRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeCriticalRate
      ? 'critical'
      : 'warn';
    recommendations.push({
      code: 'switch_cascade_risk',
      severity,
      message: 'Model switches are followed by cascade retries often enough to review policy.',
      evidence: cascadeAfterSwitch
        ? `${cascadeAfterSwitch.key}:cascadeAfterSwitch=${percent(cascadeAfterSwitch.cascadeAfterSwitchRate)}`
        : `cascadeAfterSwitchRate=${percent(outcome.cascadeAfterSwitchRate)}`,
      action: 'Review high-cascade route groups before widening SmartRouter candidates.',
      configSuggestions: [
        {
          path: smartRouterTargetPath(cascadeAfterSwitch?.key),
          reason: 'Narrow this route or move its model directly to the retry target when cascade evidence repeatedly follows selection.',
        },
        {
          path: 'SmartRouter.candidates',
          reason: 'Remove or demote candidates that often need cascade retry for this route class.',
        },
      ],
    });
  }

  const slowRoute = topSlowOutcomeGroup(outcome.byRouteReason);
  if (slowRoute) {
    recommendations.push({
      code: 'slow_route_group',
      severity: slowRoute.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyCriticalMs ? 'critical' : 'warn',
      message: 'A route group is slower than the governance latency warning threshold.',
      evidence: `${slowRoute.key}:averageLatencyMs=${slowRoute.averageLatencyMs}`,
      action: 'Inspect slow route groups before making them default traffic.',
      configSuggestions: [
        {
          path: smartRouterTargetPath(slowRoute.key),
          reason: 'Route this slow task class to a faster model, lower the rule priority, or split the rule into fast and deep variants.',
        },
        {
          path: 'SmartRouter.candidates',
          reason: 'Prefer candidates with proven lower latency for frequent tasks, and reserve slower models for explicit deep-work rules.',
        },
      ],
    });
  }

  return recommendations.slice(0, 5);
}

function scorecardScopeLabel(scope: TGovernanceRoutingOutcomeScorecardScope): string {
  if (scope === 'route_reason') {
    return 'route';
  }
  if (scope === 'final_model') {
    return 'model';
  }
  return 'intent';
}

function matchingQualityRiskCount(
  scope: TGovernanceRoutingOutcomeScorecardScope,
  key: string,
  qualityEvidence?: IGovernanceQualityEvidenceSummary
): number {
  const samples = qualityEvidence?.samples ?? [];
  return samples.filter((sample) => {
    if (sample.severity === 'info') {
      return false;
    }
    if (scope === 'route_reason') {
      return sample.routeReason.includes(key);
    }
    if (scope === 'final_model') {
      return sample.finalModel === key;
    }
    return sample.semanticIntent === key;
  }).length;
}

function matchingTaskComparison(
  scope: TGovernanceRoutingOutcomeScorecardScope,
  key: string,
  taskComparison?: IGovernanceTaskComparisonSummary
): IGovernanceTaskComparisonEntry | undefined {
  if (scope !== 'semantic_intent') {
    return undefined;
  }
  return taskComparison?.comparisons.find((item) => item.taskKey === key);
}

function buildOutcomeScorecardAction(input: {
  group: IGovernanceRoutingOutcomeGroupEntry;
  scope: TGovernanceRoutingOutcomeScorecardScope;
  qualityRiskCount: number;
  taskComparison?: IGovernanceTaskComparisonEntry;
}): string {
  const keyLabel = `${scorecardScopeLabel(input.scope)} ${input.group.key}`;
  if (input.group.key.startsWith('context_window_exceeded')) {
    return `Review context metadata and Router.longContext for ${keyLabel}.`;
  }
  if (input.qualityRiskCount > 0 || input.group.cascadeAfterSwitchRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeWarnRate) {
    return `Inspect risk evidence before sending more traffic through ${keyLabel}.`;
  }
  if (input.group.modelSwitchRate >= 0.5 && input.group.alignmentOnSwitchRate < 0.5) {
    return `Enable or tune switch alignment for ${keyLabel}.`;
  }
  if (input.group.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyWarnMs) {
    return `Compare faster candidates before making ${keyLabel} the default path.`;
  }
  if (input.taskComparison?.failureRateDelta || input.taskComparison?.latencyDeltaMs) {
    return `Compare ${input.taskComparison.bestModel} against ${input.taskComparison.baselineModel} for ${keyLabel}.`;
  }
  return `Continue monitoring ${keyLabel}.`;
}

function buildOutcomeScorecardItem(input: {
  group: IGovernanceRoutingOutcomeGroupEntry;
  scope: TGovernanceRoutingOutcomeScorecardScope;
  qualityRiskCount: number;
  taskComparison?: IGovernanceTaskComparisonEntry;
}): IGovernanceRoutingOutcomeScorecardItem {
  const { group, scope, qualityRiskCount, taskComparison } = input;
  const latencyRisk = group.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyCriticalMs
    ? 1
    : group.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyWarnMs
      ? 0.5
      : 0;
  const switchContinuityRisk = group.modelSwitchRate > 0
    ? Math.max(0, group.modelSwitchRate - group.alignmentOnSwitchRate)
    : 0;
  const taskOpportunity = taskComparison && (taskComparison.failureRateDelta > 0 || taskComparison.latencyDeltaMs > 0)
    ? 1
    : 0;
  const priorityScore = Number((
    group.rate * 12 +
    group.modelSwitchRate * 18 +
    switchContinuityRisk * 18 +
    group.cascadeAfterSwitchRate * 26 +
    latencyRisk * 16 +
    Math.min(qualityRiskCount, 3) * 8 +
    taskOpportunity * 8
  ).toFixed(2));

  const status: TGovernanceRoutingOutcomeScorecardStatus =
    group.key.startsWith('context_window_exceeded') ||
    group.cascadeAfterSwitchRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeCriticalRate ||
    group.averageLatencyMs >= DEFAULT_ANOMALY_THRESHOLDS.latencyCriticalMs ||
    qualityRiskCount >= 2
      ? 'critical'
      : priorityScore >= 24 ||
          group.cascadeAfterSwitchRate >= DEFAULT_ANOMALY_THRESHOLDS.cascadeWarnRate ||
          qualityRiskCount > 0 ||
          latencyRisk > 0
        ? 'watch'
        : 'stable';

  const evidence = [
    `${group.totalTraces} trace${group.totalTraces === 1 ? '' : 's'} (${percent(group.rate)})`,
    `switch ${percent(group.modelSwitchRate)}`,
    `alignment ${percent(group.alignmentOnSwitchRate)}`,
    `cascade ${percent(group.cascadeAfterSwitchRate)}`,
    `latency ${group.averageLatencyMs} ms`,
  ];
  if (qualityRiskCount > 0) {
    evidence.push(`${qualityRiskCount} quality risk sample${qualityRiskCount === 1 ? '' : 's'}`);
  }
  if (taskComparison?.failureRateDelta || taskComparison?.latencyDeltaMs) {
    evidence.push(`best ${taskComparison.bestModel}, baseline ${taskComparison.baselineModel}`);
  }

  return {
    key: group.key,
    scope,
    status,
    priorityScore,
    totalTraces: group.totalTraces,
    rate: group.rate,
    modelSwitchRate: group.modelSwitchRate,
    alignmentOnSwitchRate: group.alignmentOnSwitchRate,
    cascadeAfterSwitchRate: group.cascadeAfterSwitchRate,
    averageLatencyMs: group.averageLatencyMs,
    qualityRiskCount,
    evidence,
    action: buildOutcomeScorecardAction({ group, scope, qualityRiskCount, taskComparison }),
    configPath: scope === 'route_reason' ? smartRouterTargetPath(group.key) : undefined,
  };
}

export function buildRoutingOutcomeScorecard(input: {
  outcome: IGovernanceRoutingOutcomeSummary;
  qualityEvidence?: IGovernanceQualityEvidenceSummary;
  taskComparison?: IGovernanceTaskComparisonSummary;
  limit?: number;
}): IGovernanceRoutingOutcomeScorecardSummary {
  const items = [
    ...input.outcome.byRouteReason.map((group) => ({ group, scope: 'route_reason' as const })),
    ...input.outcome.byFinalModel.map((group) => ({ group, scope: 'final_model' as const })),
    ...input.outcome.bySemanticIntent.map((group) => ({ group, scope: 'semantic_intent' as const })),
  ].map(({ group, scope }) => buildOutcomeScorecardItem({
    group,
    scope,
    qualityRiskCount: matchingQualityRiskCount(scope, group.key, input.qualityEvidence),
    taskComparison: matchingTaskComparison(scope, group.key, input.taskComparison),
  }));

  const statusRank: Record<TGovernanceRoutingOutcomeScorecardStatus, number> = {
    critical: 0,
    watch: 1,
    stable: 2,
  };
  const rankedItems = items.sort((left, right) => {
    if (statusRank[left.status] !== statusRank[right.status]) {
      return statusRank[left.status] - statusRank[right.status];
    }
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    if (right.totalTraces !== left.totalTraces) {
      return right.totalTraces - left.totalTraces;
    }
    return `${left.scope}:${left.key}`.localeCompare(`${right.scope}:${right.key}`);
  });
  const limitedItems = rankedItems.slice(0, input.limit ?? 8);

  return {
    totalItems: items.length,
    criticalCount: items.filter((item) => item.status === 'critical').length,
    watchCount: items.filter((item) => item.status === 'watch').length,
    stableCount: items.filter((item) => item.status === 'stable').length,
    topActions: Array.from(new Set(limitedItems
      .filter((item) => item.status !== 'stable')
      .map((item) => item.action))).slice(0, 5),
    items: limitedItems,
  };
}

export function buildGovernanceHealthSummary(input: {
  metrics: IGovernanceMetrics;
  anomalies: IGovernanceAnomaly[];
  topRouteReasons?: IGovernanceDistributionEntry[];
  topFinalModels?: IGovernanceDistributionEntry[];
  outcome?: IGovernanceRoutingOutcomeSummary;
}): IGovernanceHealthSummary {
  const metrics = input.metrics;
  const anomalies = input.anomalies ?? [];
  const criticalCount = anomalies.filter((item) => item.severity === 'critical').length;
  const warnCount = anomalies.filter((item) => item.severity === 'warn').length;
  const alertCount = anomalies.length;
  const routingTuning = buildRoutingTuningRecommendations(metrics, input.outcome);

  if (metrics.totalTraces === 0) {
    return {
      status: 'idle',
      message: 'No governance traces yet.',
      sampleSize: 0,
      alertCount: 0,
      warnCount: 0,
      criticalCount: 0,
      signals: {
        stickyHitRate: 0,
        cascadeTriggeredRate: 0,
        shadowCheckedRate: 0,
        alignmentUsedRate: 0,
        modelSwitchRate: 0,
        alignmentOnSwitchRate: 0,
        contextWindowFallbackRate: 0,
        contextWindowExceededRate: 0,
        averageLatencyMs: 0,
        topRouteReason: input.topRouteReasons?.[0],
        topFinalModel: input.topFinalModels?.[0],
      },
      actions: ['Send requests through the router to collect governance traces.'],
      routingTuning: [],
    };
  }

  const status: TGovernanceHealthStatus = criticalCount > 0
    ? 'critical'
    : warnCount > 0
      ? 'watch'
      : 'healthy';
  const alertVerb = alertCount === 1 ? 'needs' : 'need';
  const message = status === 'healthy'
    ? `Healthy over ${metrics.totalTraces} traces.`
    : `${alertCount} governance alert${alertCount === 1 ? '' : 's'} ${alertVerb} attention (${criticalCount} critical / ${warnCount} warning${warnCount === 1 ? '' : 's'}).`;
  const actions = new Set(buildHealthActions(anomalies));
  if (!anomalies.length && routingTuning.some((item) => item.severity !== 'info')) {
    actions.delete('Continue monitoring route and model distributions.');
  }
  if ((input.outcome?.contextWindowExceededCount ?? 0) > 0) {
    actions.add('Review model context window metadata and Router.longContext coverage.');
  } else if ((input.outcome?.contextWindowFallbackCount ?? 0) > 0) {
    actions.add('Monitor context window fallback rate and long-context model latency.');
  }
  for (const recommendation of routingTuning) {
    if (recommendation.severity !== 'info') {
      actions.add(recommendation.action);
    }
  }

  return {
    status,
    message,
    sampleSize: metrics.totalTraces,
    alertCount,
    warnCount,
    criticalCount,
    signals: {
      stickyHitRate: metrics.stickyHitRate,
      cascadeTriggeredRate: metrics.cascadeTriggeredRate,
      shadowCheckedRate: metrics.shadowCheckedRate,
      alignmentUsedRate: metrics.alignmentUsedRate,
      modelSwitchRate: input.outcome?.modelSwitchRate ?? 0,
      alignmentOnSwitchRate: input.outcome?.alignmentOnSwitchRate ?? 0,
      contextWindowFallbackRate: input.outcome?.contextWindowFallbackRate ?? 0,
      contextWindowExceededRate: input.outcome?.contextWindowExceededRate ?? 0,
      averageLatencyMs: metrics.averageLatencyMs,
      topRouteReason: input.topRouteReasons?.[0],
      topFinalModel: input.topFinalModels?.[0],
    },
    actions: Array.from(actions),
    routingTuning,
  };
}

export function summarizeGovernanceMetrics(traces: IGovernanceTrace[]): IGovernanceMetrics {
  const stickyHitCount = traces.filter((trace) => trace.stickyHit).length;
  const alignmentUsedCount = traces.filter((trace) => trace.alignmentUsed).length;
  const cascadeTriggeredCount = traces.filter((trace) => trace.cascadeTriggered).length;
  const shadowCheckedCount = traces.filter((trace) => trace.shadowChecked).length;
  const latencyValues = traces
    .map((trace) => trace.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const estimatedCostValues = traces
    .map((trace) => trace.estimatedCost)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const routeReasonDistribution: Record<string, number> = {};
  const finalModelDistribution: Record<string, number> = {};
  const semanticIntentDistribution: Record<string, number> = {};

  for (const trace of traces) {
    for (const reason of trace.routeReason) {
      increment(routeReasonDistribution, reason);
    }
    increment(finalModelDistribution, trace.finalModel);
    increment(semanticIntentDistribution, trace.semanticIntent);
  }

  return {
    totalTraces: traces.length,
    stickyHitCount,
    stickyHitRate: rate(stickyHitCount, traces.length),
    alignmentUsedCount,
    alignmentUsedRate: rate(alignmentUsedCount, traces.length),
    cascadeTriggeredCount,
    cascadeTriggeredRate: rate(cascadeTriggeredCount, traces.length),
    shadowCheckedCount,
    shadowCheckedRate: rate(shadowCheckedCount, traces.length),
    averageLatencyMs: average(latencyValues),
    averageEstimatedCost: average(estimatedCostValues),
    routeReasonDistribution,
    finalModelDistribution,
    semanticIntentDistribution,
  };
}

function buildBucketLabel(bucketStart: number, bucketEnd: number): string {
  return `${new Date(bucketStart).toISOString()}~${new Date(bucketEnd).toISOString()}`;
}

function filterTracesByWindow(
  traces: IGovernanceTrace[],
  options: IGovernanceMetricsWindowOptions
): { traces: IGovernanceTrace[]; windowStart?: number; windowEnd?: number } {
  if (!options.windowMs || options.windowMs <= 0) {
    return {
      traces,
      windowStart: traces.length ? Math.min(...traces.map((trace) => trace.startedAt)) : undefined,
      windowEnd: traces.length ? Math.max(...traces.map((trace) => trace.startedAt)) : undefined,
    };
  }

  const now = options.now ?? Date.now();
  const windowStart = now - options.windowMs;
  return {
    traces: traces.filter((trace) => trace.startedAt >= windowStart && trace.startedAt <= now),
    windowStart,
    windowEnd: now,
  };
}

function buildBuckets(
  traces: IGovernanceTrace[],
  windowStart: number | undefined,
  windowEnd: number | undefined,
  bucketCount: number
): IGovernanceMetricsBucket[] {
  if (
    windowStart === undefined ||
    windowEnd === undefined ||
    bucketCount <= 0 ||
    windowEnd <= windowStart
  ) {
    return [];
  }

  const bucketSize = Math.max(1, Math.ceil((windowEnd - windowStart) / bucketCount));
  const buckets: IGovernanceMetricsBucket[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = windowStart + (index * bucketSize);
    const bucketEnd = index === bucketCount - 1
      ? windowEnd
      : Math.min(windowEnd, bucketStart + bucketSize);
    const bucketTraces = traces.filter((trace) => {
      if (index === bucketCount - 1) {
        return trace.startedAt >= bucketStart && trace.startedAt <= bucketEnd;
      }
      return trace.startedAt >= bucketStart && trace.startedAt < bucketEnd;
    });

    buckets.push({
      bucketStart,
      bucketEnd,
      label: buildBucketLabel(bucketStart, bucketEnd),
      metrics: summarizeGovernanceMetrics(bucketTraces),
    });
  }

  return buckets;
}

export function getGovernanceMetricsReport(
  options: IGovernanceMetricsWindowOptions = {}
): IGovernanceMetricsReport {
  const baseTraces = governanceTraceStore.list({
    requestId: options.requestId,
    sessionKey: options.sessionKey,
    routeReason: options.routeReason,
    cascadeTriggered: options.cascadeTriggered,
    shadowChecked: options.shadowChecked,
  });
  const windowed = filterTracesByWindow(baseTraces, options);
  const limitedTraces = options.limit && options.limit > 0
    ? windowed.traces.slice(0, options.limit)
    : windowed.traces;
  const bucketCount = options.bucketCount && options.bucketCount > 0 ? options.bucketCount : 6;
  const metrics = summarizeGovernanceMetrics(limitedTraces);
  const outcome = summarizeRoutingOutcomes(limitedTraces);
  const buckets = buildBuckets(limitedTraces, windowed.windowStart, windowed.windowEnd, bucketCount);
  const thresholds = normalizeAnomalyThresholds(options.anomalyThresholds);
  const topRouteReasons = buildTopEntries(metrics.routeReasonDistribution, limitedTraces.length);
  const topFinalModels = buildTopEntries(metrics.finalModelDistribution, limitedTraces.length);
  const topSemanticIntents = buildTopEntries(metrics.semanticIntentDistribution, limitedTraces.length);
  const anomalies = buildAnomalies(metrics, buckets, thresholds);
  const guardrails = buildGuardrailMetricsSummary(limitedTraces);
  const qualityEvidence = buildQualityEvidenceSummary(limitedTraces, thresholds);
  const taskComparison = buildTaskComparisonSummary(limitedTraces);
  const outcomeScorecard = buildRoutingOutcomeScorecard({
    outcome,
    qualityEvidence,
    taskComparison,
  });

  return {
    windowMs: options.windowMs,
    bucketCount,
    windowStart: windowed.windowStart,
    windowEnd: windowed.windowEnd,
    metrics,
    outcome,
    outcomeScorecard,
    buckets,
    topRouteReasons,
    topFinalModels,
    topSemanticIntents,
    anomalies,
    guardrails,
    qualityEvidence,
    taskComparison,
    health: buildGovernanceHealthSummary({
      metrics,
      anomalies,
      topRouteReasons,
      topFinalModels,
      outcome,
    }),
  };
}

export function getGovernanceMetrics(
  options: IGovernanceMetricsWindowOptions = {}
): IGovernanceMetrics {
  return getGovernanceMetricsReport(options).metrics;
}

export function exportGovernanceMetricsReport(
  report: IGovernanceMetricsReport,
  format: TGovernanceMetricsExportFormat = 'json'
): string {
  if (format === 'json') {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [
    'section,key,value',
    `summary,totalTraces,${report.metrics.totalTraces}`,
    `summary,stickyHitRate,${report.metrics.stickyHitRate}`,
    `summary,cascadeTriggeredRate,${report.metrics.cascadeTriggeredRate}`,
    `summary,shadowCheckedRate,${report.metrics.shadowCheckedRate}`,
    `summary,alignmentUsedRate,${report.metrics.alignmentUsedRate}`,
    `summary,averageLatencyMs,${report.metrics.averageLatencyMs}`,
    `summary,averageEstimatedCost,${report.metrics.averageEstimatedCost}`,
    `outcome,routedRate,${report.outcome.routedRate}`,
    `outcome,modelSwitchRate,${report.outcome.modelSwitchRate}`,
    `outcome,alignmentOnSwitchRate,${report.outcome.alignmentOnSwitchRate}`,
    `outcome,cascadeAfterSwitchRate,${report.outcome.cascadeAfterSwitchRate}`,
    `outcome,contextWindowFallbackRate,${report.outcome.contextWindowFallbackRate}`,
    `outcome,contextWindowExceededRate,${report.outcome.contextWindowExceededRate}`,
    `outcomeScorecard,totalItems,${report.outcomeScorecard.totalItems}`,
    `outcomeScorecard,criticalCount,${report.outcomeScorecard.criticalCount}`,
    `outcomeScorecard,watchCount,${report.outcomeScorecard.watchCount}`,
  ];

  if (report.health) {
    lines.push(`summary,healthStatus,${report.health.status}`);
    lines.push(`summary,healthMessage,${report.health.message}`);
    for (const item of report.health.routingTuning ?? []) {
      lines.push(`routingTuning,${item.code},${item.severity}:${item.evidence}`);
    }
  }

  if (report.qualityEvidence) {
    lines.push(`qualityEvidence,totalSamples,${report.qualityEvidence.totalSamples}`);
    lines.push(`qualityEvidence,failureSamples,${report.qualityEvidence.failureSamples}`);
    lines.push(`qualityEvidence,improvementSamples,${report.qualityEvidence.improvementSamples}`);
    lines.push(`qualityEvidence,speedRiskSamples,${report.qualityEvidence.speedRiskSamples}`);
    for (const item of report.qualityEvidence.samples) {
      lines.push(`qualityEvidenceSample,${item.type},${item.severity}:${item.requestId}:${compactCsvEvidence(item.evidence)}`);
    }
  }

  lines.push(`guardrails,inputStatus,${report.guardrails.input.status}`);
  lines.push(`guardrails,inputFindings,${report.guardrails.input.totalFindings}`);
  lines.push(`guardrails,outputStatus,${report.guardrails.output.status}`);
  lines.push(`guardrails,outputFindings,${report.guardrails.output.totalFindings}`);
  for (const item of report.guardrails.input.byCode) {
    lines.push(`guardrailInput,${item.code},${item.severity}:${item.count}:${item.rate}`);
  }
  for (const item of report.guardrails.output.byCode) {
    lines.push(`guardrailOutput,${item.code},${item.severity}:${item.count}:${item.rate}`);
  }

  if (report.taskComparison) {
    lines.push(`taskComparison,totalComparedTasks,${report.taskComparison.totalComparedTasks}`);
    lines.push(`taskComparison,totalComparedTraces,${report.taskComparison.totalComparedTraces}`);
    for (const item of report.taskComparison.comparisons) {
      lines.push(`taskComparisonSample,${compactCsvEvidence(item.taskKey)},best=${compactCsvEvidence(item.bestModel)}:baseline=${compactCsvEvidence(item.baselineModel)}:failureRateDelta=${item.failureRateDelta}:latencyDeltaMs=${item.latencyDeltaMs}`);
    }
  }

  for (const anomaly of report.anomalies) {
    lines.push(`anomaly,${anomaly.type},${anomaly.severity}:${anomaly.value}`);
  }

  for (const item of report.topRouteReasons) {
    lines.push(`topRouteReason,${item.key},${item.count}:${item.rate}`);
  }

  for (const item of report.topFinalModels) {
    lines.push(`topFinalModel,${item.key},${item.count}:${item.rate}`);
  }

  for (const item of report.topSemanticIntents) {
    lines.push(`topSemanticIntent,${item.key},${item.count}:${item.rate}`);
  }

  for (const item of report.outcome.topModelSwitches) {
    lines.push(`topModelSwitch,${item.key},${item.count}:${item.rate}`);
  }

  for (const item of report.outcome.byRouteReason) {
    lines.push(`outcomeByRouteReason,${item.key},${item.totalTraces}:${item.modelSwitchRate}:${item.averageLatencyMs}`);
  }

  for (const item of report.outcome.byFinalModel) {
    lines.push(`outcomeByFinalModel,${item.key},${item.totalTraces}:${item.modelSwitchRate}:${item.averageLatencyMs}`);
  }

  for (const item of report.outcome.bySemanticIntent) {
    lines.push(`outcomeBySemanticIntent,${item.key},${item.totalTraces}:${item.modelSwitchRate}:${item.averageLatencyMs}`);
  }

  for (const item of report.outcomeScorecard.items) {
    lines.push(`outcomeScorecardItem,${item.scope}:${compactCsvEvidence(item.key)},${item.status}:${item.priorityScore}:${compactCsvEvidence(item.action)}`);
  }

  for (const bucket of report.buckets) {
    lines.push(
      `bucket,${bucket.label},${[
        bucket.metrics.totalTraces,
        bucket.metrics.stickyHitRate,
        bucket.metrics.cascadeTriggeredRate,
        bucket.metrics.shadowCheckedRate,
        bucket.metrics.alignmentUsedRate,
      ].join(':')}`
    );
  }

  return lines.join('\n');
}
