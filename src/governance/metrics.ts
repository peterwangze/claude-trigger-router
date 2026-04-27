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
    averageLatencyMs: number;
    topRouteReason?: IGovernanceDistributionEntry;
    topFinalModel?: IGovernanceDistributionEntry;
  };
  actions: string[];
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
  anomalies: IGovernanceAnomaly[];
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

export function buildGovernanceHealthSummary(input: {
  metrics: IGovernanceMetrics;
  anomalies: IGovernanceAnomaly[];
  topRouteReasons?: IGovernanceDistributionEntry[];
  topFinalModels?: IGovernanceDistributionEntry[];
}): IGovernanceHealthSummary {
  const metrics = input.metrics;
  const anomalies = input.anomalies ?? [];
  const criticalCount = anomalies.filter((item) => item.severity === 'critical').length;
  const warnCount = anomalies.filter((item) => item.severity === 'warn').length;
  const alertCount = anomalies.length;

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
        averageLatencyMs: 0,
        topRouteReason: input.topRouteReasons?.[0],
        topFinalModel: input.topFinalModels?.[0],
      },
      actions: ['Send requests through the router to collect governance traces.'],
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
      averageLatencyMs: metrics.averageLatencyMs,
      topRouteReason: input.topRouteReasons?.[0],
      topFinalModel: input.topFinalModels?.[0],
    },
    actions: buildHealthActions(anomalies),
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
  const buckets = buildBuckets(limitedTraces, windowed.windowStart, windowed.windowEnd, bucketCount);
  const thresholds = normalizeAnomalyThresholds(options.anomalyThresholds);
  const topRouteReasons = buildTopEntries(metrics.routeReasonDistribution, limitedTraces.length);
  const topFinalModels = buildTopEntries(metrics.finalModelDistribution, limitedTraces.length);
  const topSemanticIntents = buildTopEntries(metrics.semanticIntentDistribution, limitedTraces.length);
  const anomalies = buildAnomalies(metrics, buckets, thresholds);

  return {
    windowMs: options.windowMs,
    bucketCount,
    windowStart: windowed.windowStart,
    windowEnd: windowed.windowEnd,
    metrics,
    buckets,
    topRouteReasons,
    topFinalModels,
    topSemanticIntents,
    anomalies,
    health: buildGovernanceHealthSummary({
      metrics,
      anomalies,
      topRouteReasons,
      topFinalModels,
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
  ];

  if (report.health) {
    lines.push(`summary,healthStatus,${report.health.status}`);
    lines.push(`summary,healthMessage,${report.health.message}`);
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
