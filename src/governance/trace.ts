/**
 * Governance Trace Utilities
 *
 * 治理层链路追踪工具
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { LRUCache } from 'lru-cache';
import { dirname, join } from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { GOVERNANCE_TRACE_ARCHIVE_DIR, GOVERNANCE_TRACE_FILE } from '../constants';
import { IGovernanceTrace } from './types';
import { summarizePreflightDiagnostics } from './preflight-diagnostics';

export interface IGovernanceTraceStoreOptions {
  max?: number;
  ttlMs?: number;
  persistFile?: string;
  persistEnabled?: boolean;
  activePersistLimit?: number;
  archiveDir?: string;
  retainArchiveFiles?: number;
  compressArchives?: boolean;
  persistDebounceMs?: number;
}

export interface IGovernanceTraceArchiveRecord {
  file: string;
  filePath: string;
  traceCount: number;
  startedAt?: number;
  endedAt?: number;
  compressed: boolean;
}

function cloneTrace(trace: IGovernanceTrace): IGovernanceTrace {
  return {
    ...trace,
    routeReason: [...(trace.routeReason ?? [])],
    routeDecision: trace.routeDecision ? {
      ...trace.routeDecision,
      routingEvidence: trace.routeDecision.routingEvidence ? [...trace.routeDecision.routingEvidence] : undefined,
    } : undefined,
    handoffSummary: trace.handoffSummary ? {
      ...trace.handoffSummary,
      stages: trace.handoffSummary.stages.map((stage) => ({ ...stage })),
    } : undefined,
    inputGuardrail: trace.inputGuardrail ? {
      ...trace.inputGuardrail,
      findings: trace.inputGuardrail.findings.map((finding) => ({ ...finding })),
    } : undefined,
    outputGuardrail: trace.outputGuardrail ? {
      ...trace.outputGuardrail,
      findings: trace.outputGuardrail.findings.map((finding) => ({ ...finding })),
    } : undefined,
    spans: trace.spans ? trace.spans.map((span) => ({
      ...span,
      attributes: span.attributes ? { ...span.attributes } : undefined,
    })) : undefined,
    streamLifecycle: trace.streamLifecycle ? trace.streamLifecycle.map((entry) => ({
      ...entry,
      detail: entry.detail ? { ...entry.detail } : undefined,
    })) : undefined,
    preflightDiagnostics: trace.preflightDiagnostics ? {
      ...trace.preflightDiagnostics,
      stages: trace.preflightDiagnostics.stages.map((stage) => ({
        ...stage,
        detail: stage.detail ? { ...stage.detail } : undefined,
      })),
    } : undefined,
    cascadeEvidence: trace.cascadeEvidence ? [...trace.cascadeEvidence] : [],
  };
}

export class GovernanceTraceStore {
  private cache: LRUCache<string, IGovernanceTrace>;
  private persistFile?: string;
  private persistEnabled: boolean;
  private activePersistLimit: number;
  private archiveDir?: string;
  private retainArchiveFiles: number;
  private compressArchives: boolean;
  private persistDebounceMs: number;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: IGovernanceTraceStoreOptions = {}) {
    const max = options.max ?? 500;
    const ttlMs = options.ttlMs ?? 1000 * 60 * 60;
    this.cache = new LRUCache<string, IGovernanceTrace>({
      max,
      ttl: ttlMs,
    });
    this.persistFile = options.persistFile ?? GOVERNANCE_TRACE_FILE;
    this.persistEnabled = options.persistEnabled ?? process.env.NODE_ENV !== 'test';
    this.activePersistLimit = options.activePersistLimit ?? 200;
    this.archiveDir = options.archiveDir ?? GOVERNANCE_TRACE_ARCHIVE_DIR;
    this.retainArchiveFiles = options.retainArchiveFiles ?? 5;
    this.compressArchives = options.compressArchives ?? true;
    this.persistDebounceMs = options.persistDebounceMs ?? 25;
    this.loadFromDisk();
  }

  add(trace: IGovernanceTrace): void {
    this.cache.set(trace.requestId, cloneTrace(trace));
    this.schedulePersistToDisk();
  }

  get(requestId: string): IGovernanceTrace | undefined {
    return this.cache.get(requestId);
  }

  list(filters?: {
    requestId?: string;
    sessionKey?: string;
    routeReason?: string;
    cascadeTriggered?: boolean;
    shadowChecked?: boolean;
    limit?: number;
  }): IGovernanceTrace[] {
    let traces = Array.from(this.cache.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

    if (filters?.requestId) {
      traces = traces.filter((trace) => trace.requestId === filters.requestId);
    }

    if (filters?.sessionKey) {
      traces = traces.filter((trace) => trace.sessionKey === filters.sessionKey);
    }

    if (filters?.routeReason) {
      traces = traces.filter((trace) => trace.routeReason.includes(filters.routeReason!));
    }

    if (filters?.cascadeTriggered !== undefined) {
      traces = traces.filter((trace) => trace.cascadeTriggered === filters.cascadeTriggered);
    }

    if (filters?.shadowChecked !== undefined) {
      traces = traces.filter((trace) => trace.shadowChecked === filters.shadowChecked);
    }

    if (filters?.limit !== undefined && Number.isFinite(filters.limit) && filters.limit > 0) {
      traces = traces.slice(0, filters.limit);
    }

    return traces;
  }

  clear(): void {
    this.cache.clear();
    this.schedulePersistToDisk();
    this.clearArchives();
  }

  hydrate(traces: IGovernanceTrace[]): void {
    this.cache.clear();
    for (const trace of traces) {
      this.cache.set(trace.requestId, cloneTrace(trace));
    }
    this.schedulePersistToDisk();
  }

  async flushPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
      this.enqueuePersistToDisk();
    }
    await this.persistQueue;
  }

  listArchives(filters?: {
    date?: string;
    limit?: number;
    page?: number;
    pageSize?: number;
  }): IGovernanceTraceArchiveRecord[] {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return [];
    }

    let records = readdirSync(this.archiveDir)
      .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
      .sort()
      .reverse()
      .map((file) => this.readArchiveRecord(file))
      .filter((record): record is IGovernanceTraceArchiveRecord => Boolean(record));

    if (filters?.date) {
      records = records.filter((record) => {
        const started = record.startedAt ? new Date(record.startedAt).toISOString().slice(0, 10) : '';
        const ended = record.endedAt ? new Date(record.endedAt).toISOString().slice(0, 10) : '';
        return started === filters.date || ended === filters.date;
      });
    }

    const pageSize = filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : undefined;
    const page = filters?.page && filters.page > 0 ? filters.page : 1;

    if (pageSize) {
      const start = (page - 1) * pageSize;
      records = records.slice(start, start + pageSize);
    } else if (filters?.limit && filters.limit > 0) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  getArchivedTraces(file: string): IGovernanceTrace[] {
    if (!this.archiveDir) {
      return [];
    }

    const filePath = join(this.archiveDir, file);
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      return this.readArchiveFile(filePath);
    } catch {
      return [];
    }
  }

  deleteArchive(file: string): boolean {
    if (!this.archiveDir) {
      return false;
    }

    const filePath = join(this.archiveDir, file);
    if (!existsSync(filePath)) {
      return false;
    }

    rmSync(filePath, { force: true });
    return true;
  }

  private loadFromDisk(): void {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    try {
      const traces: IGovernanceTrace[] = [];

      if (existsSync(this.persistFile)) {
        const content = readFileSync(this.persistFile, 'utf-8');
        traces.push(...(JSON.parse(content) as IGovernanceTrace[]));
      }

      if (this.archiveDir && existsSync(this.archiveDir)) {
        const archiveFiles = readdirSync(this.archiveDir)
          .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
          .sort()
          .reverse();

        for (const file of archiveFiles) {
          traces.push(...this.readArchiveFile(join(this.archiveDir, file)));
        }
      }

      const deduped = new Map<string, IGovernanceTrace>();
      for (const trace of traces.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))) {
        if (!deduped.has(trace.requestId)) {
          deduped.set(trace.requestId, trace);
        }
      }

      for (const trace of Array.from(deduped.values()).slice(0, this.cache.max)) {
        this.cache.set(trace.requestId, cloneTrace(trace));
      }
    } catch {
      // Ignore persistence corruption and continue with in-memory mode.
    }
  }

  private schedulePersistToDisk(): void {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    if (this.persistTimer) {
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.enqueuePersistToDisk();
    }, this.persistDebounceMs);
    this.persistTimer.unref?.();
  }

  private enqueuePersistToDisk(): void {
    this.persistQueue = this.persistQueue
      .then(() => this.persistToDisk())
      .catch(() => undefined);
  }

  private async persistToDisk(): Promise<void> {
    if (!this.persistEnabled || !this.persistFile) {
      return;
    }

    try {
      await mkdir(dirname(this.persistFile), { recursive: true });
      const traces = Array.from(this.cache.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      const activeTraces = traces.slice(0, this.activePersistLimit);
      const archivedTraces = traces.slice(this.activePersistLimit);

      if (archivedTraces.length > 0 && this.archiveDir) {
        await this.writeArchive(archivedTraces);
        this.pruneArchives();
        this.cache.clear();
        for (const trace of activeTraces) {
          this.cache.set(trace.requestId, cloneTrace(trace));
        }
      }

      await writeFile(this.persistFile, JSON.stringify(activeTraces, null, 2), 'utf-8');
    } catch {
      // Keep runtime resilient even if local persistence fails.
    }
  }

  private async writeArchive(traces: IGovernanceTrace[]): Promise<void> {
    if (!this.archiveDir || traces.length === 0) {
      return;
    }

    await mkdir(this.archiveDir, { recursive: true });
    const filename = this.compressArchives
      ? `governance-traces-${Date.now()}.json.gz`
      : `governance-traces-${Date.now()}.json`;
    const filePath = join(this.archiveDir, filename);
    const content = JSON.stringify(traces, null, 2);
    if (this.compressArchives) {
      await writeFile(filePath, gzipSync(Buffer.from(content, 'utf-8')));
      return;
    }
    await writeFile(filePath, content, 'utf-8');
  }

  private readArchiveRecord(file: string): IGovernanceTraceArchiveRecord | null {
    if (!this.archiveDir) {
      return null;
    }

    const filePath = join(this.archiveDir, file);
    try {
      const traces = this.readArchiveFile(filePath);
      const startedAtValues = traces.map((trace) => trace.startedAt).filter((value) => typeof value === 'number');
      return {
        file,
        filePath,
        traceCount: traces.length,
        startedAt: startedAtValues.length ? Math.min(...startedAtValues) : undefined,
        endedAt: startedAtValues.length ? Math.max(...startedAtValues) : undefined,
        compressed: file.endsWith('.gz'),
      };
    } catch {
      return null;
    }
  }

  private pruneArchives(): void {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return;
    }

    const archiveFiles = readdirSync(this.archiveDir)
      .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
      .sort()
      .reverse();

    for (const file of archiveFiles.slice(this.retainArchiveFiles)) {
      rmSync(join(this.archiveDir, file), { force: true });
    }
  }

  private clearArchives(): void {
    if (!this.archiveDir || !existsSync(this.archiveDir)) {
      return;
    }

    for (const file of readdirSync(this.archiveDir).filter((item) => item.endsWith('.json') || item.endsWith('.json.gz'))) {
      rmSync(join(this.archiveDir, file), { force: true });
    }
  }

  private readArchiveFile(filePath: string): IGovernanceTrace[] {
    if (filePath.endsWith('.gz')) {
      const content = gunzipSync(readFileSync(filePath)).toString('utf-8');
      return JSON.parse(content) as IGovernanceTrace[];
    }
    return JSON.parse(readFileSync(filePath, 'utf-8')) as IGovernanceTrace[];
  }
}

export const governanceTraceStore = new GovernanceTraceStore();

export function createGovernanceTrace(
  input: Partial<IGovernanceTrace> = {}
): IGovernanceTrace {
  return {
    requestId: input.requestId ?? randomUUID(),
    sessionKey: input.sessionKey,
    initialModel: input.initialModel,
    finalModel: input.finalModel,
    routeReason: input.routeReason ? [...input.routeReason] : [],
    routeDecision: input.routeDecision ? { ...input.routeDecision } : undefined,
    handoffSummary: input.handoffSummary ? {
      ...input.handoffSummary,
      stages: input.handoffSummary.stages.map((stage) => ({ ...stage })),
    } : undefined,
    inputGuardrail: input.inputGuardrail ? {
      ...input.inputGuardrail,
      findings: input.inputGuardrail.findings.map((finding) => ({ ...finding })),
    } : undefined,
    outputGuardrail: input.outputGuardrail ? {
      ...input.outputGuardrail,
      findings: input.outputGuardrail.findings.map((finding) => ({ ...finding })),
    } : undefined,
    spans: input.spans ? input.spans.map((span) => ({
      ...span,
      attributes: span.attributes ? { ...span.attributes } : undefined,
    })) : undefined,
    streamLifecycle: input.streamLifecycle ? input.streamLifecycle.map((entry) => ({
      ...entry,
      detail: entry.detail ? { ...entry.detail } : undefined,
    })) : undefined,
    preflightDiagnostics: input.preflightDiagnostics ? {
      ...input.preflightDiagnostics,
      stages: input.preflightDiagnostics.stages.map((stage) => ({
        ...stage,
        detail: stage.detail ? { ...stage.detail } : undefined,
      })),
    } : undefined,
    stickyHit: input.stickyHit ?? false,
    alignmentUsed: input.alignmentUsed ?? false,
    semanticIntent: input.semanticIntent,
    cascadeTriggered: input.cascadeTriggered ?? false,
    cascadeEvidence: input.cascadeEvidence ? [...input.cascadeEvidence] : [],
    cascadeNextModel: input.cascadeNextModel,
    shadowChecked: input.shadowChecked ?? false,
    verificationResult: input.verificationResult,
    modelPoolFallbackTriggered: input.modelPoolFallbackTriggered,
    modelPoolFallbackFromEndpoint: input.modelPoolFallbackFromEndpoint,
    modelPoolFallbackNextEndpoint: input.modelPoolFallbackNextEndpoint,
    modelPoolFallbackEvidence: input.modelPoolFallbackEvidence,
    latencyMs: input.latencyMs,
    estimatedCost: input.estimatedCost,
    startedAt: input.startedAt ?? Date.now(),
    completedAt: input.completedAt,
  };
}

export function appendTraceReason(trace: IGovernanceTrace, reason: string): IGovernanceTrace {
  if (!trace.routeReason.includes(reason)) {
    trace.routeReason.push(reason);
  }
  return trace;
}

export function finalizeTrace(
  trace: IGovernanceTrace,
  overrides: Partial<IGovernanceTrace> = {}
): IGovernanceTrace {
  const completedAt = overrides.completedAt ?? Date.now();
  return {
    ...trace,
    ...overrides,
    routeReason: overrides.routeReason ? [...overrides.routeReason] : [...trace.routeReason],
    completedAt,
    latencyMs: overrides.latencyMs ?? Math.max(0, completedAt - trace.startedAt),
  };
}

export function summarizeRouteHandoffTrace(
  trace: IGovernanceTrace,
  pipelineEntries: Array<{ stage: string; status: string }> = []
): NonNullable<IGovernanceTrace['handoffSummary']> {
  const finalModel = trace.finalModel ?? trace.routeDecision?.model;
  const switched = Boolean(trace.initialModel && finalModel && trace.initialModel !== finalModel);
  const blocked = pipelineEntries.some((entry) => entry.status === 'failed')
    || trace.routeReason.includes('context_window_exceeded')
    || Boolean(trace.cascadeTriggered);
  const stages = pipelineEntries.map((entry) => ({
    stage: entry.stage,
    status: entry.status,
  }));
  const completedStages = stages.filter((entry) => entry.status === 'completed').map((entry) => entry.stage);
  const lastStage = stages.at(-1);
  const stageText = completedStages.length
    ? completedStages.join(' -> ')
    : lastStage
      ? `${lastStage.stage}:${lastStage.status}`
      : 'trace-only';
  const modelText = trace.initialModel && finalModel
    ? switched
      ? `${trace.initialModel} -> ${finalModel}`
      : `${finalModel}`
    : finalModel ?? trace.initialModel ?? 'unknown model';
  const headline = blocked
    ? `Route handoff needs review for ${modelText}; pipeline reached ${stageText}.`
    : `Route handoff completed for ${modelText}; pipeline reached ${stageText}.`;
  const action = blocked
    ? 'Review failed pipeline stages, context guard, cascade, or fallback evidence before widening this route.'
    : switched
      ? 'Compare continuity and latency before making this switching path broader.'
      : 'No handoff action needed unless this route should intentionally switch models.';

  return {
    headline,
    stages,
    initialModel: trace.initialModel,
    finalModel,
    switched,
    blocked,
    action,
  };
}

export function buildTraceSpansFromPipeline(
  trace: IGovernanceTrace,
  pipelineEntries: Array<{ stage: string; status: string; at?: number; detail?: Record<string, unknown> }> = []
): NonNullable<IGovernanceTrace['spans']> {
  const spans = pipelineEntries.map((entry, index) => {
    const next = pipelineEntries[index + 1];
    const startOffsetMs = typeof entry.at === 'number'
      ? Math.max(0, entry.at - trace.startedAt)
      : undefined;
    const durationMs = typeof entry.at === 'number' && typeof next?.at === 'number'
      ? Math.max(0, next.at - entry.at)
      : undefined;
    return {
      name: entry.stage,
      status: entry.status,
      ...(startOffsetMs !== undefined ? { startOffsetMs } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(entry.detail ? { attributes: { ...entry.detail } } : {}),
    };
  });

  if (trace.modelPoolFallbackTriggered || trace.routeReason.some((reason) => reason.startsWith('model_pool_fallback'))) {
    spans.push({
      name: 'model_pool_fallback',
      status: trace.routeReason.includes('model_pool_fallback_failed') ? 'failed' : 'completed',
      attributes: {
        fromEndpoint: trace.modelPoolFallbackFromEndpoint,
        nextEndpoint: trace.modelPoolFallbackNextEndpoint,
        evidence: trace.modelPoolFallbackEvidence,
      },
    });
  }

  if (trace.inputGuardrail?.findings.length) {
    spans.push({
      name: 'input_guardrail',
      status: trace.inputGuardrail.status,
      attributes: {
        findings: trace.inputGuardrail.findings.map((finding) => finding.code),
      },
    });
  }

  if (trace.outputGuardrail?.findings.length) {
    spans.push({
      name: 'output_guardrail',
      status: trace.outputGuardrail.status,
      attributes: {
        findings: trace.outputGuardrail.findings.map((finding) => finding.code),
      },
    });
  }

  if (trace.streamLifecycle?.length) {
    const finalEntry = [...trace.streamLifecycle].reverse().find((entry) => entry.event === 'finalize');
    const cancelEntry = [...trace.streamLifecycle].reverse().find((entry) => entry.event === 'client_cancel');
    const errorEntry = [...trace.streamLifecycle].reverse().find((entry) => entry.event === 'upstream_error');
    const startedAt = trace.streamLifecycle.find((entry) => typeof entry.at === 'number')?.at;
    const endedAt = finalEntry?.at ?? trace.streamLifecycle.at(-1)?.at;
    spans.push({
      name: 'stream_lifecycle',
      status: String(finalEntry?.detail?.status ?? errorEntry?.event ?? cancelEntry?.event ?? 'observed'),
      ...(typeof startedAt === 'number' ? { startOffsetMs: Math.max(0, startedAt - trace.startedAt) } : {}),
      ...(typeof startedAt === 'number' && typeof endedAt === 'number' ? { durationMs: Math.max(0, endedAt - startedAt) } : {}),
      attributes: {
        events: trace.streamLifecycle.map((entry) => entry.event),
        chunks: finalEntry?.detail?.chunks ?? errorEntry?.detail?.chunks ?? cancelEntry?.detail?.chunks,
        bytes: finalEntry?.detail?.bytes ?? errorEntry?.detail?.bytes ?? cancelEntry?.detail?.bytes,
        sawText: finalEntry?.detail?.sawText,
        streamError: finalEntry?.detail?.streamError ?? errorEntry?.detail?.message,
        cancelReason: cancelEntry?.detail?.reason,
      },
    });
  }

  if (trace.preflightDiagnostics?.stages.length) {
    const diagnostics = trace.preflightDiagnostics;
    spans.push({
      name: 'preflight_diagnostics',
      status: diagnostics.stages.some((stage) => stage.status === 'failed')
        ? 'failed'
        : diagnostics.stages.some((stage) => stage.status === 'skipped' || stage.status === 'bypassed')
          ? 'observed'
          : 'completed',
      startOffsetMs: Math.max(0, diagnostics.startedAt - trace.startedAt),
      ...(typeof diagnostics.completedAt === 'number'
        ? { durationMs: Math.max(0, diagnostics.completedAt - diagnostics.startedAt) }
        : {}),
      attributes: summarizePreflightDiagnostics(trace),
    });
  }

  return spans;
}

export function recordGovernanceTrace(trace: IGovernanceTrace): IGovernanceTrace {
  governanceTraceStore.add(trace);
  return trace;
}

function formatPercent(value?: number): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return `${Math.round(value * 100)}%`;
}

function firstReason(trace: IGovernanceTrace, prefix: string): string | undefined {
  return trace.routeReason.find((reason) => reason === prefix || reason.startsWith(`${prefix}:`));
}

function inferRouteSource(trace: IGovernanceTrace): string {
  if (trace.routeDecision?.source) {
    return trace.routeDecision.source;
  }
  if (firstReason(trace, 'smart_rule')) {
    return 'smart_rule';
  }
  if (firstReason(trace, 'semantic_match') || firstReason(trace, 'semantic:intent')) {
    return 'semantic_match';
  }
  if (trace.stickyHit || firstReason(trace, 'sticky_correction') || firstReason(trace, 'sticky')) {
    return 'sticky_correction';
  }
  if (firstReason(trace, 'smart_router')) {
    return 'smart_router';
  }
  if (firstReason(trace, 'context_window_fallback') || firstReason(trace, 'context_window_exceeded')) {
    return 'context_window_guard';
  }
  if (firstReason(trace, 'model_pool_fallback') || trace.modelPoolFallbackTriggered) {
    return 'model_pool_fallback';
  }
  if (trace.cascadeTriggered || firstReason(trace, 'cascade_gate')) {
    return 'cascade';
  }
  return 'basic_router';
}

function inferRuleName(trace: IGovernanceTrace): string | undefined {
  if (trace.routeDecision?.ruleName) {
    return trace.routeDecision.ruleName;
  }
  const ruleReason = firstReason(trace, 'smart_rule') ?? firstReason(trace, 'semantic_match');
  return ruleReason?.split(':').slice(1).join(':') || undefined;
}

function inferFallbackReason(trace: IGovernanceTrace): string | undefined {
  if (trace.routeDecision?.fallbackReason) {
    return trace.routeDecision.fallbackReason;
  }

  const contextFallback = firstReason(trace, 'context_window_fallback');
  if (contextFallback) {
    const transition = contextFallback.split(':').slice(1).join(':');
    return transition
      ? `Context window guard switched ${transition}.`
      : 'Context window guard switched to the long-context route.';
  }

  const contextExceeded = firstReason(trace, 'context_window_exceeded');
  if (contextExceeded) {
    const model = contextExceeded.split(':').slice(1).join(':');
    return model
      ? `Selected model "${model}" exceeded context limits and no long-context fallback fit.`
      : 'Selected model exceeded context limits and no long-context fallback fit.';
  }

  if (trace.modelPoolFallbackTriggered) {
    const from = trace.modelPoolFallbackFromEndpoint ?? 'current endpoint';
    const to = trace.modelPoolFallbackNextEndpoint ?? 'next endpoint';
    return `Model pool fallback moved from ${from} to ${to}${trace.modelPoolFallbackEvidence ? ` (${trace.modelPoolFallbackEvidence})` : ''}.`;
  }

  const poolFallback = firstReason(trace, 'model_pool_fallback');
  if (poolFallback) {
    const [, modelId, endpointId] = poolFallback.split(':');
    return modelId && endpointId
      ? `Model pool fallback tried endpoint "${endpointId}" for "${modelId}".`
      : 'Model pool fallback was attempted.';
  }

  if (trace.cascadeTriggered) {
    const evidence = trace.cascadeEvidence?.length ? `: ${trace.cascadeEvidence.join(', ')}` : '';
    return `Cascade retry was triggered${evidence}.`;
  }

  if (trace.routeReason.includes('smart_router:no_match')) {
    return 'SmartRouter did not match; request continued to the basic Router fallback path.';
  }

  return undefined;
}

export function summarizeRouteDecisionTrace(trace: IGovernanceTrace) {
  const source = inferRouteSource(trace);
  const ruleName = inferRuleName(trace);
  const confidence = trace.routeDecision?.confidence;
  const confidenceLabel = formatPercent(confidence);
  const finalModel = trace.finalModel ?? trace.routeDecision?.model;
  const fallbackReason = inferFallbackReason(trace);
  const collaborationMode = trace.routeDecision?.collaborationMode;
  const sourceLabels: Record<string, string> = {
    smart_rule: ruleName ? `SmartRouter rule "${ruleName}"` : 'SmartRouter rule',
    semantic_match: ruleName ? `Semantic match "${ruleName}"` : 'Semantic match',
    smart_router: 'SmartRouter candidate selection',
    no_match: 'SmartRouter no match',
    sticky_correction: 'Sticky routing',
    context_window_guard: 'Context window guard',
    model_pool_fallback: 'Model pool fallback',
    cascade: 'Cascade retry',
    basic_router: 'Basic Router',
  };
  const sourceLabel = sourceLabels[source] ?? source;
  const selectedText = finalModel ? ` selected ${finalModel}` : ' handled the request';
  const confidenceText = confidenceLabel ? ` with ${confidenceLabel} confidence` : '';
  const headline = `${sourceLabel}${selectedText}${confidenceText}.`;

  return {
    requestId: trace.requestId,
    sessionKey: trace.sessionKey,
    source,
    sourceLabel,
    ruleName,
    semanticIntent: trace.semanticIntent,
    confidence,
    confidenceLabel,
    routingMode: trace.routeDecision?.routingMode,
    collaborationMode,
    routingEvidence: trace.routeDecision?.routingEvidence ?? [],
    initialModel: trace.initialModel,
    finalModel,
    fallbackReason,
    routeReasons: [...trace.routeReason],
    headline,
    continuity: {
      stickyHit: trace.stickyHit,
      alignmentUsed: trace.alignmentUsed,
      cascadeTriggered: trace.cascadeTriggered,
      shadowChecked: trace.shadowChecked,
    },
    latencyMs: trace.latencyMs,
    startedAt: trace.startedAt,
    completedAt: trace.completedAt,
  };
}

export function summarizeSwitchContinuityTrace(trace: IGovernanceTrace) {
  const decision = summarizeRouteDecisionTrace(trace);
  const initialModel = trace.initialModel;
  const finalModel = trace.finalModel ?? trace.routeDecision?.model;
  const switched = Boolean(initialModel && finalModel && initialModel !== finalModel);
  const transition = initialModel && finalModel ? `${initialModel} -> ${finalModel}` : undefined;
  const hasModelPair = Boolean(initialModel && finalModel);
  let status: 'unknown' | 'stable' | 'aligned' | 'watch' | 'critical' = 'unknown';
  let headline = 'Model continuity is not available for this request.';
  let action = 'Record both initialModel and finalModel so users can tell whether model switching affected the response.';

  if (hasModelPair && !switched) {
    status = 'stable';
    headline = trace.stickyHit
      ? `Sticky routing kept the request on ${finalModel}.`
      : `Model stayed on ${finalModel}; no continuity handoff was needed.`;
    action = 'No action needed unless this route should intentionally explore stronger or faster candidates.';
  } else if (switched && trace.alignmentUsed && !trace.cascadeTriggered) {
    status = 'aligned';
    headline = `Model switched ${transition} with context alignment.`;
    action = 'Keep this as positive switching evidence; compare latency and output quality before widening the route.';
  } else if (switched && trace.alignmentUsed && trace.cascadeTriggered) {
    status = 'watch';
    headline = `Model switched ${transition} with alignment, but cascade retry still triggered.`;
    action = 'Review cascade evidence and consider narrowing this route or moving the task to the retry model directly.';
  } else if (switched && !trace.alignmentUsed && trace.cascadeTriggered) {
    status = 'critical';
    headline = `Model switched ${transition} without alignment and then triggered cascade retry.`;
    action = 'Enable or tune Governance.sticky.alignment before sending more traffic through this switching path.';
  } else if (switched) {
    status = 'watch';
    headline = `Model switched ${transition} without context alignment.`;
    action = 'Enable or tune Governance.sticky.alignment if this route can carry multi-turn or long-running work.';
  }

  const fallbackReason = decision.fallbackReason;
  const detail = [
    decision.sourceLabel,
    decision.ruleName ? `rule ${decision.ruleName}` : undefined,
    trace.semanticIntent ? `intent ${trace.semanticIntent}` : undefined,
    fallbackReason,
  ].filter((item): item is string => Boolean(item));

  return {
    requestId: trace.requestId,
    sessionKey: trace.sessionKey,
    status,
    switched,
    initialModel,
    finalModel,
    transition,
    source: decision.source,
    sourceLabel: decision.sourceLabel,
    ruleName: decision.ruleName,
    semanticIntent: trace.semanticIntent,
    stickyHit: trace.stickyHit,
    alignmentUsed: trace.alignmentUsed,
    cascadeTriggered: trace.cascadeTriggered,
    cascadeEvidence: trace.cascadeEvidence ? [...trace.cascadeEvidence] : undefined,
    fallbackReason,
    detail,
    headline,
    action,
    latencyMs: trace.latencyMs,
    startedAt: trace.startedAt,
    completedAt: trace.completedAt,
  };
}
