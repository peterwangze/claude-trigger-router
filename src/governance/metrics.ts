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

export interface IGovernanceMetricsReport {
  windowMs?: number;
  bucketCount: number;
  windowStart?: number;
  windowEnd?: number;
  metrics: IGovernanceMetrics;
  buckets: IGovernanceMetricsBucket[];
  topRouteReasons: IGovernanceDistributionEntry[];
  topFinalModels: IGovernanceDistributionEntry[];
  topSemanticIntents: IGovernanceDistributionEntry[];
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

  return {
    windowMs: options.windowMs,
    bucketCount,
    windowStart: windowed.windowStart,
    windowEnd: windowed.windowEnd,
    metrics,
    buckets: buildBuckets(limitedTraces, windowed.windowStart, windowed.windowEnd, bucketCount),
    topRouteReasons: buildTopEntries(metrics.routeReasonDistribution, limitedTraces.length),
    topFinalModels: buildTopEntries(metrics.finalModelDistribution, limitedTraces.length),
    topSemanticIntents: buildTopEntries(metrics.semanticIntentDistribution, limitedTraces.length),
  };
}

export function getGovernanceMetrics(
  options: IGovernanceMetricsWindowOptions = {}
): IGovernanceMetrics {
  return getGovernanceMetricsReport(options).metrics;
}
