import type { ISmartRouterCandidate } from '../trigger/types';
import { getGovernanceMetricsReport } from './metrics';

export type TAdaptiveRoutingMode = 'balanced' | 'quality' | 'speed';

export interface IRoutingAdvisorCandidateProfile {
  model: string;
  configuredDescription?: string;
  profileSource: 'history' | 'configured';
  totalTraces: number;
  failureRate: number;
  latencySampleCount: number;
  averageLatencyMs: number;
  alignmentUsedRate: number;
  cascadeTriggeredRate: number;
  bestQualityCount: number;
  fastestCount: number;
  taskKeys: string[];
  evidence: string[];
  score: number;
}

export interface IRoutingAdvisorSummary {
  totalTraces: number;
  totalComparedTasks: number;
  totalEvidenceSamples: number;
  routeMode: TAdaptiveRoutingMode;
  preferredModel?: string;
  qualityModel?: string;
  fastestModel?: string;
  candidateProfiles: IRoutingAdvisorCandidateProfile[];
  evidence: string[];
  signature: string;
}

interface IModelAccumulator {
  model: string;
  description?: string;
  totalTraces: number;
  failureWeight: number;
  latencySampleCount: number;
  latencyWeight: number;
  alignmentWeight: number;
  cascadeWeight: number;
  bestQualityCount: number;
  fastestCount: number;
  taskKeys: Set<string>;
}

export interface IBuildRoutingAdvisorSummaryInput {
  candidates: ISmartRouterCandidate[];
  historyLimit?: number;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function average(weight: number, total: number, digits = 4): number {
  if (!total) {
    return 0;
  }
  return round(weight / total, digits);
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function createAccumulator(candidate: ISmartRouterCandidate): IModelAccumulator {
  return {
    model: candidate.model,
    description: candidate.description,
    totalTraces: 0,
    failureWeight: 0,
    latencySampleCount: 0,
    latencyWeight: 0,
    alignmentWeight: 0,
    cascadeWeight: 0,
    bestQualityCount: 0,
    fastestCount: 0,
    taskKeys: new Set<string>(),
  };
}

function toCandidateProfile(acc: IModelAccumulator): IRoutingAdvisorCandidateProfile {
  const failureRate = average(acc.failureWeight, acc.totalTraces);
  const averageLatencyMs = acc.latencySampleCount
    ? round(acc.latencyWeight / acc.latencySampleCount, 2)
    : 0;
  const alignmentUsedRate = average(acc.alignmentWeight, acc.totalTraces);
  const cascadeTriggeredRate = average(acc.cascadeWeight, acc.totalTraces);
  const latencyPenalty = averageLatencyMs ? Math.min(2, averageLatencyMs / 3000) : 0;
  const score = round(
    acc.bestQualityCount * 4 +
      acc.fastestCount * 2 +
      (1 - failureRate) * 2 +
      alignmentUsedRate -
      cascadeTriggeredRate * 2 -
      latencyPenalty,
    4
  );
  const taskKeys = Array.from(acc.taskKeys).sort();
  const evidence = [
    acc.bestQualityCount ? `best quality on ${acc.bestQualityCount} compared task(s)` : undefined,
    acc.fastestCount ? `fastest on ${acc.fastestCount} compared task(s)` : undefined,
    acc.totalTraces ? `failure ${(failureRate * 100).toFixed(1)}% over ${acc.totalTraces} trace(s)` : undefined,
    averageLatencyMs ? `average latency ${averageLatencyMs}ms` : undefined,
  ].filter(Boolean) as string[];

  return {
    model: acc.model,
    configuredDescription: acc.description,
    profileSource: acc.totalTraces > 0 ? 'history' : 'configured',
    totalTraces: acc.totalTraces,
    failureRate,
    latencySampleCount: acc.latencySampleCount,
    averageLatencyMs,
    alignmentUsedRate,
    cascadeTriggeredRate,
    bestQualityCount: acc.bestQualityCount,
    fastestCount: acc.fastestCount,
    taskKeys,
    evidence,
    score,
  };
}

function profileRank(left: IRoutingAdvisorCandidateProfile, right: IRoutingAdvisorCandidateProfile): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (left.failureRate !== right.failureRate) {
    return left.failureRate - right.failureRate;
  }
  if (left.averageLatencyMs !== right.averageLatencyMs) {
    return left.averageLatencyMs - right.averageLatencyMs;
  }
  return left.model.localeCompare(right.model);
}

function buildSignature(summary: Pick<IRoutingAdvisorSummary, 'totalTraces' | 'totalComparedTasks' | 'candidateProfiles' | 'routeMode'>): string {
  return [
    summary.totalTraces,
    summary.totalComparedTasks,
    summary.routeMode,
    summary.candidateProfiles
      .map((profile) => `${profile.model}:${profile.totalTraces}:${profile.score}`)
      .join('|'),
  ].join(':');
}

export function buildRoutingAdvisorSummary(input: IBuildRoutingAdvisorSummaryInput): IRoutingAdvisorSummary | undefined {
  const candidates = input.candidates.filter((candidate) => candidate.model);
  if (candidates.length < 2) {
    return undefined;
  }

  const report = getGovernanceMetricsReport({
    limit: input.historyLimit && input.historyLimit > 0 ? input.historyLimit : 120,
  });
  const candidateModels = new Set(candidates.map((candidate) => candidate.model));
  const accumulators = new Map(candidates.map((candidate) => [candidate.model, createAccumulator(candidate)]));
  const comparisons = report.taskComparison?.comparisons ?? [];

  for (const comparison of comparisons) {
    for (const modelEntry of comparison.models) {
      if (!candidateModels.has(modelEntry.model)) {
        continue;
      }

      const acc = accumulators.get(modelEntry.model);
      if (!acc) {
        continue;
      }

      acc.totalTraces += modelEntry.totalTraces;
      acc.failureWeight += modelEntry.failureRate * modelEntry.totalTraces;
      if (modelEntry.latencySampleCount > 0) {
        acc.latencySampleCount += modelEntry.latencySampleCount;
        acc.latencyWeight += modelEntry.averageLatencyMs * modelEntry.latencySampleCount;
      }
      acc.alignmentWeight += modelEntry.alignmentUsedRate * modelEntry.totalTraces;
      acc.cascadeWeight += modelEntry.cascadeTriggeredRate * modelEntry.totalTraces;
      if (comparison.bestModel === modelEntry.model) {
        acc.bestQualityCount += 1;
      }
      if (comparison.fastestModel === modelEntry.model) {
        acc.fastestCount += 1;
      }
      acc.taskKeys.add(comparison.taskKey);
    }
  }

  const candidateProfiles = Array.from(accumulators.values())
    .map(toCandidateProfile)
    .sort(profileRank);
  const historicalProfiles = candidateProfiles.filter((profile) => profile.profileSource === 'history');
  const bestQuality = [...historicalProfiles].sort((left, right) => {
    if (right.bestQualityCount !== left.bestQualityCount) {
      return right.bestQualityCount - left.bestQualityCount;
    }
    return profileRank(left, right);
  })[0];
  const fastest = [...historicalProfiles].sort((left, right) => {
    if (right.fastestCount !== left.fastestCount) {
      return right.fastestCount - left.fastestCount;
    }
    if (left.averageLatencyMs !== right.averageLatencyMs) {
      return left.averageLatencyMs - right.averageLatencyMs;
    }
    return profileRank(left, right);
  })[0];
  const preferred = historicalProfiles[0];
  const qualityLift = report.taskComparison?.bestQualityLiftTask;
  const speedLift = report.taskComparison?.bestSpeedLiftTask;
  const routeMode: TAdaptiveRoutingMode =
    speedLift?.fastestModel && fastest?.model === speedLift.fastestModel
      ? 'speed'
      : qualityLift?.bestModel && bestQuality?.model === qualityLift.bestModel
        ? 'quality'
        : 'balanced';

  const evidence = [
    qualityLift
      ? `quality lift ${qualityLift.taskKey}: best=${qualityLift.bestModel}, baseline=${qualityLift.baselineModel}, failureDelta=${qualityLift.failureRateDelta}`
      : undefined,
    speedLift
      ? `speed lift ${speedLift.taskKey}: fastest=${speedLift.fastestModel}, latencyDeltaMs=${speedLift.latencyDeltaMs}`
      : undefined,
    report.qualityEvidence?.totalSamples
      ? `quality evidence samples=${report.qualityEvidence.totalSamples}, risks=${report.qualityEvidence.failureSamples}, speedRisks=${report.qualityEvidence.speedRiskSamples}`
      : undefined,
    preferred
      ? `preferred candidate ${preferred.model}: score=${preferred.score}, ${preferred.evidence.join('; ')}`
      : undefined,
  ].filter(Boolean).map((item) => compact(item as string));

  if (!historicalProfiles.length && evidence.length === 0) {
    return undefined;
  }

  const summary: IRoutingAdvisorSummary = {
    totalTraces: report.metrics.totalTraces,
    totalComparedTasks: report.taskComparison?.totalComparedTasks ?? 0,
    totalEvidenceSamples: report.qualityEvidence?.totalSamples ?? 0,
    routeMode,
    preferredModel: preferred?.model,
    qualityModel: bestQuality?.model,
    fastestModel: fastest?.model,
    candidateProfiles,
    evidence,
    signature: '',
  };
  return {
    ...summary,
    signature: buildSignature(summary),
  };
}

export function orderCandidatesByRoutingAdvisor(
  candidates: ISmartRouterCandidate[],
  summary: IRoutingAdvisorSummary | undefined
): ISmartRouterCandidate[] {
  if (!summary?.candidateProfiles.length) {
    return candidates;
  }

  const rank = new Map(summary.candidateProfiles.map((profile, index) => [profile.model, index]));
  return [...candidates].sort((left, right) => {
    const leftRank = rank.get(left.model);
    const rightRank = rank.get(right.model);
    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank;
    }
    if (leftRank !== undefined) {
      return -1;
    }
    if (rightRank !== undefined) {
      return 1;
    }
    return 0;
  });
}

export function formatRoutingAdvisorPromptSection(summary: IRoutingAdvisorSummary): string {
  const lines = [
    `Mode: ${summary.routeMode}`,
    summary.preferredModel ? `Preferred model from recent evidence: ${summary.preferredModel}` : undefined,
    summary.qualityModel ? `Best quality model: ${summary.qualityModel}` : undefined,
    summary.fastestModel ? `Fastest model: ${summary.fastestModel}` : undefined,
    `Compared tasks: ${summary.totalComparedTasks}; traces: ${summary.totalTraces}; evidence samples: ${summary.totalEvidenceSamples}`,
    ...summary.evidence.slice(0, 4).map((item) => `- ${item}`),
    ...summary.candidateProfiles
      .filter((profile) => profile.profileSource === 'history')
      .slice(0, 5)
      .map((profile) =>
        `- ${profile.model}: score=${profile.score}, ${profile.evidence.join('; ') || 'no strong historical signal'}`
      ),
  ].filter(Boolean) as string[];

  return lines.join('\n');
}
