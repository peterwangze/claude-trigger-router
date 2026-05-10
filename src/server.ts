/**
 * Server
 *
 * Fastify 服务器配置
 */

import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile, normalizeAndValidateConfig, deriveRuntimeSmartRouterConfig } from "./utils";
import { log } from "./utils/log";
import { probeRemoteRegistrationStatus, probeRemoteServiceStatus, SERVICE_NAME } from "./service-health";
import {
  governanceTraceStore,
  getGovernanceMetricsReport,
  exportGovernanceMetricsReport,
  governanceMetricsExportStore,
  buildGovernanceHealthSummary,
} from "./governance";
import { buildModelRegistry, collectCapabilityWarnings } from "./models/compile";
import { IModelPoolEndpointHealthSnapshot, modelPoolHealthStore } from "./models/pool-health";
import { toExternalModelConfig } from "./models/schema";
import { buildValidationIssueReport } from "./utils/validation-contract";
import { renderWorkbenchHtml } from "./ui/workbench";
import {
  authAuditStore,
  authQuotaUsageStore,
  createManagedApiKey,
  extractApiKeyFromHeaders,
  listManagedApiKeys,
  managedApiKeySummary,
  sanitizeManagedApiKey,
  validateManagedApiKeyQuota,
  validateManagedApiKeyScopes,
  verifyApiKey,
} from "./auth/api-keys";

type CompiledProviderView = {
  name: string;
  api_base_url: string;
  models: string[];
  transformer: any;
  has_api_key: boolean;
};

type CompiledRegistryView = {
  providers: CompiledProviderView[];
  modelMap: Record<string, any>;
  modelPools: Record<string, any>;
};

type ModelReferenceEntry = {
  path: string;
  value: string;
  referenceType: "modelId" | "legacy";
};

function toCompiledRegistryView(config: any): CompiledRegistryView {
  const registry = buildModelRegistry(config ?? {});
  return {
    providers: registry.providers.map((provider) => ({
      name: provider.name,
      api_base_url: provider.api_base_url,
      models: provider.models,
      transformer: provider.transformer,
      has_api_key: Boolean(provider.api_key),
    })),
    modelMap: registry.modelMap,
    modelPools: registry.modelPools,
  };
}

function collectModelReferences(config: any): ModelReferenceEntry[] {
  const refs: ModelReferenceEntry[] = [];
  const normalizedConfig = normalizeAndValidateConfig(config ?? {}).config;
  const runtimeSmartRouterConfig = deriveRuntimeSmartRouterConfig(normalizedConfig);
  const pushRef = (path: string, value: any) => {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }
    refs.push({
      path,
      value,
      referenceType: value.includes(",") ? "legacy" : "modelId",
    });
  };

  pushRef("Router.default", normalizedConfig?.Router?.default);
  pushRef("SmartRouter.router_model", runtimeSmartRouterConfig?.router_model);
  runtimeSmartRouterConfig?.rules?.forEach((rule: any, index: number) => {
    pushRef(`SmartRouter.rules[${index}].model`, rule?.model);
  });
  runtimeSmartRouterConfig?.candidates?.forEach((candidate: any, index: number) => {
    pushRef(`SmartRouter.candidates[${index}].model`, candidate?.model);
  });
  pushRef("SmartRouter.sticky.alignment.summarizer_model", runtimeSmartRouterConfig?.sticky?.alignment?.summarizer_model);
  pushRef("SmartRouter.semantic.classifier_model", runtimeSmartRouterConfig?.semantic?.classifier_model);
  normalizedConfig?.Governance?.cascade?.levels?.forEach((level: any, index: number) => {
    pushRef(`Governance.cascade.levels[${index}].from`, level?.from);
    pushRef(`Governance.cascade.levels[${index}].to`, level?.to);
  });
  pushRef("Governance.shadow.verifier_model", normalizedConfig?.Governance?.shadow?.verifier_model);

  return refs;
}

function buildServiceInfo(rawConfig: any) {
  const normalized = normalizeAndValidateConfig(rawConfig ?? {}).config;
  const runtime = normalized.Runtime ?? {};
  const remoteService = runtime.remote_service ?? {};
  const registration = normalized.Registration ?? {};
  const runtimeMode = runtime.mode ?? "local";
  const managedKeys = listManagedApiKeys(normalized);
  const authSummary = managedApiKeySummary(normalized);
  const host = rawConfig?.HOST ?? normalized.HOST;
  const port = rawConfig?.PORT ?? normalized.PORT;
  const listenerHost = String(host ?? "").trim() || "127.0.0.1";
  const publicHost = ["0.0.0.0", "::", "[::]"].includes(String(host ?? "").trim());
  const hasBootstrapAuth = Boolean(normalized.APIKEY);
  const hasManagedAuthRecords = authSummary.total > 0;
  const hasActiveManagedAuth = authSummary.active > 0;
  const authRequired = hasBootstrapAuth || hasManagedAuthRecords;
  const listenerBaseUrl = publicHost
    ? `http://<server-host>:${port}`
    : `http://${listenerHost}:${port}`;
  const localBaseUrl = `http://127.0.0.1:${port}`;
  const securityIssues: Array<{
    code: string;
    severity: "critical" | "warning";
    message: string;
    action: string;
  }> = [];
  if (!authRequired && (publicHost || runtimeMode !== "local")) {
    securityIssues.push({
      code: "server_without_auth",
      severity: "critical",
      message: "Server/cloud or public listener is running without API key authentication.",
      action: "Set APIKEY or create an active managed admin/client key before exposing this service.",
    });
  }
  if (authRequired && hasBootstrapAuth && authSummary.total === 0 && runtimeMode !== "local") {
    securityIssues.push({
      code: "bootstrap_only_auth",
      severity: "warning",
      message: "Only the bootstrap APIKEY is configured for a server/cloud role.",
      action: "Create managed client keys for remote users and keep APIKEY for administration.",
    });
  }
  if (!hasBootstrapAuth && hasManagedAuthRecords && !hasActiveManagedAuth) {
    securityIssues.push({
      code: "managed_auth_without_active_key",
      severity: "warning",
      message: "Managed API key records exist, but none are active.",
      action: "Create an active managed admin/client key or configure APIKEY before relying on this service.",
    });
  }
  const quotaSummary = authQuotaUsageStore.summary();
  const quotaKeys = managedKeys.map((key) => {
    const usage = authQuotaUsageStore.snapshotForKey(key.id, key.quota);
    const requestLimit = usage?.requestLimit;
    const tokenLimit = usage?.tokenLimit;
    const requestRatio = requestLimit ? usage.requestsUsed / requestLimit : 0;
    const tokenRatio = tokenLimit ? usage.tokensUsed / tokenLimit : 0;
    const exhausted = (requestLimit !== undefined && usage.requestsUsed >= requestLimit)
      || (tokenLimit !== undefined && usage.tokensUsed >= tokenLimit);
    const nearLimit = !exhausted && (requestRatio >= 0.8 || tokenRatio >= 0.8);
    return {
      id: key.id,
      label: key.label,
      scopes: key.scopes,
      active: key.active,
      quota: key.quota,
      usage,
      status: !usage
        ? "unlimited"
        : !key.active
          ? "inactive"
          : exhausted
            ? "exhausted"
            : nearLimit
              ? "watch"
              : "ok",
    };
  });

  return {
    service: SERVICE_NAME,
    ready: true,
    host,
    port,
    runtimeMode,
    serviceRole: runtimeMode === "local" ? "local_agent" : "router_service",
    listener: {
      host: listenerHost,
      port,
      public: publicHost,
      localUrl: localBaseUrl,
      advertisedUrl: listenerBaseUrl,
    },
    remoteEnabled: Boolean(remoteService.enabled),
    remoteService: {
      enabled: Boolean(remoteService.enabled),
      baseUrl: remoteService.base_url || "",
      authTokenConfigured: Boolean(remoteService.auth_token),
    },
    clientConnection: runtimeMode === "local" && remoteService.enabled
      ? {
          role: "remote_client",
          baseUrl: remoteService.base_url || "",
          authTokenConfigured: Boolean(remoteService.auth_token),
          recommendedScopes: ["client", "read-only"],
          guidance: "Local CTR forwards model calls to Runtime.remote_service.base_url with a managed client + read-only key from the server maintainer.",
        }
      : runtimeMode === "local"
        ? {
            role: "local_user",
            baseUrl: localBaseUrl,
            authTokenConfigured: authRequired,
            recommendedScopes: [],
            guidance: "Local Claude Code can use the local router URL; authentication is optional unless configured.",
          }
        : {
            role: "remote_user",
            baseUrl: listenerBaseUrl,
            authTokenConfigured: authRequired,
            recommendedScopes: ["client", "read-only"],
            guidance: "Remote clients should set ANTHROPIC_BASE_URL to this service and use a managed client + read-only key.",
          },
    registration: {
      enabled: Boolean(registration.enabled),
      models: Array.isArray(registration.models) ? registration.models.length : 0,
      upstreamServices: Array.isArray(registration.upstream_services) ? registration.upstream_services.length : 0,
    },
    auth: {
      required: authRequired,
      bootstrapConfigured: Boolean(normalized.APIKEY),
      managedKeys: authSummary,
      audit: authAuditStore.summary(),
      quota: {
        ...quotaSummary,
        keys: quotaKeys,
      },
    },
    security: {
      status: securityIssues.some((issue) => issue.severity === "critical")
        ? "critical"
        : securityIssues.length > 0
          ? "warning"
          : "ok",
      publicHost,
      issues: securityIssues,
    },
  };
}

function buildRegistrationInfo(rawConfig: any) {
  const normalizedResult = normalizeAndValidateConfig(rawConfig ?? {});
  const registration = normalizedResult.config.Registration ?? {};
  const models = Array.isArray(registration.models) ? registration.models : [];
  const upstreamServices = Array.isArray(registration.upstream_services) ? registration.upstream_services : [];

  return {
    enabled: Boolean(registration.enabled),
    summary: {
      models: models.length,
      upstreamServices: upstreamServices.length,
    },
    models: models.map((model: any) => ({
      id: model.id,
      model: model.model,
      interface: model.interface ?? model.protocol,
      apiConfigured: Boolean(model.api ?? model.api_base_url),
      keyConfigured: Boolean(model.key ?? model.api_key),
    })),
    upstreamServices: upstreamServices.map((service: any) => ({
      id: service.id,
      baseUrl: service.base_url,
      authTokenConfigured: Boolean(service.auth_token),
    })),
    issueReport: buildValidationIssueReport({
      errors: normalizedResult.errors,
      warnings: normalizedResult.warnings,
    }),
  };
}

function buildModelPoolHealthReport(rawConfig: any) {
  const normalizedResult = normalizeAndValidateConfig(rawConfig ?? {});
  const normalized = normalizedResult.config;
  const registry = buildModelRegistry(normalized);
  const pools = Object.values(registry.modelPools ?? {}).map((pool: any) => {
    const endpoints = (pool.endpoints ?? []).map((endpoint: any) => {
      const health: IModelPoolEndpointHealthSnapshot = modelPoolHealthStore.getSnapshot(pool.modelId, endpoint.id);
      return {
        id: endpoint.id,
        modelId: pool.modelId,
        providerName: endpoint.providerName,
        modelName: endpoint.modelName,
        upstreamServiceId: endpoint.upstreamServiceId,
        upstreamBaseUrl: endpoint.upstreamBaseUrl,
        priority: endpoint.priority,
        enabled: endpoint.enabled,
        active: endpoint.id === pool.activeEndpointId,
        status: health.status,
        failureCount: health.failureCount,
        successCount: health.successCount,
        lastFailureAt: health.lastFailureAt,
        lastSuccessAt: health.lastSuccessAt,
        cooldownUntil: health.cooldownUntil,
        circuitOpenUntil: health.circuitOpenUntil,
        latency: health.latency,
      };
    });
    return {
      modelId: pool.modelId,
      strategy: pool.strategy,
      activeEndpointId: pool.activeEndpointId,
      endpoints,
      warnings: pool.warnings ?? [],
    };
  });
  const endpoints = pools.flatMap((pool) => pool.endpoints);
  const statusCounts = endpoints.reduce<Record<string, number>>((counts, endpoint) => {
    counts[endpoint.status] = (counts[endpoint.status] ?? 0) + 1;
    return counts;
  }, {});
  const latencySamples = endpoints
    .map((endpoint) => endpoint.latency?.averageMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const persistence = modelPoolHealthStore.exportForPersistence();

  return {
    generatedAt: new Date().toISOString(),
    persistedState: {
      updatedAt: persistence.updatedAt,
      endpoints: persistence.endpoints.length,
    },
    summary: {
      pools: pools.length,
      endpoints: endpoints.length,
      healthy: statusCounts.healthy ?? 0,
      cooldown: statusCounts.cooldown ?? 0,
      open: statusCounts.open ?? 0,
      averageLatencyMs: latencySamples.length
        ? latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length
        : undefined,
    },
    pools,
    warnings: normalizedResult.warnings,
  };
}

function summarizeCompiledModels(normalized: any) {
  const compiled = toCompiledRegistryView(normalized);
  const capabilityWarnings = collectCapabilityWarnings(normalized);
  const modelEntries = Object.values(compiled.modelMap ?? {});
  const modelPoolEntries = Object.values(compiled.modelPools ?? {});
  const modelPoolEndpoints = modelPoolEntries.flatMap((pool: any) => pool.endpoints ?? []);

  return {
    providerCount: compiled.providers.length,
    modelCount: modelEntries.length,
    modelPoolCount: modelPoolEntries.length,
    modelPoolEndpointCount: modelPoolEndpoints.length,
    capabilities: {
      reasoning: modelEntries.filter((item: any) => item.capabilities?.thinking?.supported !== false).length,
      tools: modelEntries.filter((item: any) => item.capabilities?.tools !== false).length,
      images: modelEntries.filter((item: any) => item.capabilities?.images !== false).length,
      warningCount: capabilityWarnings.summary.total,
      warnCount: capabilityWarnings.summary.warn,
      infoCount: capabilityWarnings.summary.info,
    },
  };
}

function summarizeGovernanceAlerts(report: ReturnType<typeof getGovernanceMetricsReport>) {
  return {
    healthStatus: report.health?.status ?? "idle",
    totalTraces: report.metrics.totalTraces,
    alertCount: report.anomalies.length,
    warnCount: report.anomalies.filter((item) => item.severity === "warn").length,
    criticalCount: report.anomalies.filter((item) => item.severity === "critical").length,
  };
}

function scoreModelIdSuggestion(source: string, candidateId: string, candidate: any) {
  const sourceText = String(source || "").toLowerCase();
  const candidateText = `${candidateId} ${candidate?.modelName || ""}`.toLowerCase();
  let score = 0;

  if (candidateId.toLowerCase() === sourceText) {
    score += 100;
  }
  if (candidateId.toLowerCase().includes(sourceText) || sourceText.includes(candidateId.toLowerCase())) {
    score += 40;
  }

  const sourceParts = sourceText.split(/[^a-z0-9]+/).filter(Boolean);
  sourceParts.forEach((part) => {
    if (candidateText.includes(part)) {
      score += Math.min(part.length * 3, 18);
    }
  });

  return score;
}

function suggestModelReferences(value: string, nextCompiled: CompiledRegistryView) {
  return Object.entries(nextCompiled.modelMap ?? {})
    .map(([modelId, item]) => ({
      modelId,
      providerName: item.providerName,
      modelName: item.modelName,
      protocol: item.protocol,
      score: scoreModelIdSuggestion(value, modelId, item),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId))
    .slice(0, 3)
    .map(({ score, ...item }) => item);
}

function analyzeModelReferenceImpact(config: any, nextCompiled: CompiledRegistryView) {
  const references = collectModelReferences(config);
  const entries = references.map((ref) => {
    const resolved = ref.referenceType === "modelId" ? nextCompiled.modelMap?.[ref.value] : null;
    const suggestions = ref.referenceType === "modelId" && !resolved
      ? suggestModelReferences(ref.value, nextCompiled)
      : [];
    return {
      ...ref,
      status: ref.referenceType === "modelId"
        ? (resolved ? "valid" : "missing")
        : "legacy",
      resolvedTarget: resolved
        ? {
            providerName: resolved.providerName,
            modelName: resolved.modelName,
            protocol: resolved.protocol,
          }
        : null,
      suggestions,
    };
  });

  return {
    entries,
    summary: {
      total: entries.length,
      modelIdRefs: entries.filter((entry) => entry.referenceType === "modelId").length,
      legacyRefs: entries.filter((entry) => entry.referenceType === "legacy").length,
      validModelIds: entries.filter((entry) => entry.referenceType === "modelId" && entry.status === "valid").length,
      missingModelIds: entries.filter((entry) => entry.referenceType === "modelId" && entry.status === "missing").length,
    },
  };
}

function summarizeSmartRouterExplanation(normalized: any, compiled: CompiledRegistryView) {
  const smartRouter = deriveRuntimeSmartRouterConfig(normalized, normalized) ?? {};
  const modelMap = compiled.modelMap ?? {};
  const resolveRef = (ref: any) => {
    const value = typeof ref === "string" ? ref.trim() : "";
    const resolved = value ? modelMap[value] : undefined;
    return {
      ref: value,
      status: !value ? "empty" : (resolved ? "resolved" : (value.includes(",") ? "legacy" : "missing")),
      target: resolved
        ? {
            providerName: resolved.providerName,
            modelName: resolved.modelName,
            protocol: resolved.protocol,
          }
        : null,
    };
  };
  const rules = [...(smartRouter.rules ?? [])]
    .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((rule: any, index: number) => {
      const patterns = Array.isArray(rule.patterns) ? rule.patterns : [];
      return {
        order: index + 1,
        name: rule.name ?? "",
        enabled: rule.enabled !== false,
        priority: rule.priority ?? 0,
        description: rule.description ?? "",
        model: resolveRef(rule.model),
        patternCount: patterns.length,
        patterns: patterns.map((pattern: any) => ({
          type: pattern.type ?? "",
          keywords: Array.isArray(pattern.keywords) ? pattern.keywords : [],
          pattern: pattern.pattern ?? "",
        })),
        semantic: {
          enabled: rule.semantic_profile?.enabled !== false,
          prototype: rule.semantic_profile?.prototype ?? rule.description ?? "",
          threshold: rule.semantic_profile?.threshold,
        },
      };
    });
  const candidates = (smartRouter.candidates ?? []).map((candidate: any, index: number) => ({
    order: index + 1,
    model: resolveRef(candidate.model),
    description: candidate.description ?? "",
  }));
  const routerModel = resolveRef(smartRouter.router_model);
  const alignmentSummarizer = resolveRef(smartRouter.sticky?.alignment?.summarizer_model);
  const classifierModel = resolveRef(smartRouter.semantic?.classifier_model);
  const warnings: string[] = [];

  if (smartRouter.enabled && rules.length === 0) {
    warnings.push("SmartRouter enabled but no explicit rules are configured.");
  }
  if (smartRouter.enabled && smartRouter.router_model && candidates.length < 2) {
    warnings.push("router_model is configured but fewer than 2 candidates are available.");
  }
  if (routerModel.status === "missing") {
    warnings.push(`SmartRouter.router_model "${routerModel.ref}" does not resolve to Models[].id.`);
  }
  rules.forEach((rule: any) => {
    if (rule.model.status === "missing") {
      warnings.push(`SmartRouter rule "${rule.name}" model "${rule.model.ref}" does not resolve to Models[].id.`);
    }
  });
  candidates.forEach((candidate: any) => {
    if (candidate.model.status === "missing") {
      warnings.push(`SmartRouter candidate "${candidate.model.ref}" does not resolve to Models[].id.`);
    }
  });
  if (smartRouter.semantic?.enabled && smartRouter.semantic?.mode === "classifier" && classifierModel.status === "empty") {
    warnings.push("Semantic classifier mode is enabled but classifier_model is empty.");
  }
  if (smartRouter.sticky?.alignment?.enabled && alignmentSummarizer.status === "empty") {
    warnings.push("Sticky alignment is enabled but summarizer_model is empty.");
  }

  return {
    enabled: Boolean(smartRouter.enabled),
    analysisScope: smartRouter.analysis_scope ?? "last_message",
    routeOrder: [
      "1. explicit rules by priority",
      "2. semantic match when enabled",
      "3. router_model candidates when configured",
      "4. sticky correction for session continuity",
      `5. fallback ${smartRouter.fallback ?? "default"}`,
    ],
    rules,
    routerModel,
    candidates,
    fallback: smartRouter.fallback ?? "default",
    cacheTtl: smartRouter.cache_ttl,
    maxTokens: smartRouter.max_tokens,
    semantic: {
      enabled: Boolean(smartRouter.semantic?.enabled),
      mode: smartRouter.semantic?.mode ?? "embedding",
      threshold: smartRouter.semantic?.threshold,
      classifierModel,
      prototypeCount: Object.keys(smartRouter.semantic?.prototypes ?? {}).length,
    },
    sticky: {
      enabled: Boolean(smartRouter.sticky?.enabled),
      sessionTtlMs: smartRouter.sticky?.session_ttl_ms,
      fingerprintSimilarityThreshold: smartRouter.sticky?.fingerprint_similarity_threshold,
      breakOnExplicitRoute: Boolean(smartRouter.sticky?.break_on_explicit_route),
      alignment: {
        enabled: Boolean(smartRouter.sticky?.alignment?.enabled),
        summarizerModel: alignmentSummarizer,
        maxSummaryTokens: smartRouter.sticky?.alignment?.max_summary_tokens,
      },
    },
    warnings,
  };
}

function projectConfiguredBranch(raw: any, normalized: any): any {
  if (raw === undefined) {
    return undefined;
  }

  if (raw === null || normalized === null) {
    return normalized;
  }

  if (Array.isArray(raw)) {
    return normalized;
  }

  if (typeof raw !== "object" || typeof normalized !== "object") {
    return normalized;
  }

  const result: Record<string, unknown> = {};
  Object.keys(raw).forEach((key) => {
    if (normalized[key] === undefined) {
      return;
    }
    result[key] = projectConfiguredBranch(raw[key], normalized[key]);
  });
  return result;
}

function mergeSmartRouterProjection(target: Record<string, unknown>, patch: Record<string, unknown> | undefined) {
  if (!patch || !Object.keys(patch).length) {
    return target;
  }

  return {
    ...target,
    ...patch,
    semantic: patch.semantic
      ? {
          ...((target.semantic as Record<string, unknown>) || {}),
          ...(patch.semantic as Record<string, unknown>),
        }
      : target.semantic,
    sticky: patch.sticky
      ? {
          ...((target.sticky as Record<string, unknown>) || {}),
          ...(patch.sticky as Record<string, unknown>),
          alignment: (patch.sticky as any)?.alignment
            ? {
                ...(((target.sticky as any)?.alignment as Record<string, unknown>) || {}),
                ...((patch.sticky as any).alignment as Record<string, unknown>),
              }
            : (target.sticky as any)?.alignment,
        }
      : target.sticky,
  };
}

function buildPersistedConfig(rawConfig: any, normalizedConfig: any) {
  const persisted = {
    HOST: normalizedConfig.HOST,
    PORT: normalizedConfig.PORT,
    LOG: normalizedConfig.LOG,
    LOG_LEVEL: normalizedConfig.LOG_LEVEL,
    API_TIMEOUT_MS: normalizedConfig.API_TIMEOUT_MS,
    NON_INTERACTIVE_MODE: normalizedConfig.NON_INTERACTIVE_MODE,
    APIKEY: normalizedConfig.APIKEY,
    PROXY_URL: normalizedConfig.PROXY_URL,
    CUSTOM_ROUTER_PATH: normalizedConfig.CUSTOM_ROUTER_PATH,
    Providers: normalizedConfig.Providers,
    Models: normalizedConfig.Models,
    Router: normalizedConfig.Router,
  } as Record<string, unknown>;

  const runtimeSmartRouter = deriveRuntimeSmartRouterConfig(normalizedConfig, rawConfig);
  let smartRouterProjection = projectConfiguredBranch(rawConfig?.SmartRouter, runtimeSmartRouter) ?? {};
  const runtimeProjection = projectConfiguredBranch(rawConfig?.Runtime, normalizedConfig.Runtime);
  if (runtimeProjection && typeof runtimeProjection === "object" && Object.keys(runtimeProjection).length > 0) {
    persisted.Runtime = runtimeProjection;
  }

  const registrationProjection = projectConfiguredBranch(rawConfig?.Registration, normalizedConfig.Registration);
  if (
    registrationProjection &&
    typeof registrationProjection === "object" &&
    Object.keys(registrationProjection).length > 0
  ) {
    persisted.Registration = registrationProjection;
  }

  const authProjection = projectConfiguredBranch(rawConfig?.Auth, normalizedConfig.Auth);
  if (
    authProjection &&
    typeof authProjection === "object" &&
    Object.keys(authProjection).length > 0
  ) {
    persisted.Auth = authProjection;
  }

  if (rawConfig?.TriggerRouter) {
    smartRouterProjection = mergeSmartRouterProjection(smartRouterProjection, {
      ...(rawConfig.TriggerRouter.enabled !== undefined ? { enabled: runtimeSmartRouter.enabled } : {}),
      ...(rawConfig.TriggerRouter.analysis_scope !== undefined ? { analysis_scope: runtimeSmartRouter.analysis_scope } : {}),
      ...(rawConfig.TriggerRouter.rules !== undefined ? { rules: runtimeSmartRouter.rules } : {}),
      ...((rawConfig.TriggerRouter.llm_intent_recognition !== undefined || rawConfig.TriggerRouter.intent_model !== undefined)
        ? {
            semantic: {
              enabled: runtimeSmartRouter.semantic?.enabled,
              mode: runtimeSmartRouter.semantic?.mode,
              classifier_model: runtimeSmartRouter.semantic?.classifier_model,
            },
          }
        : {}),
    });
  }

  if (rawConfig?.Governance?.sticky) {
    smartRouterProjection = mergeSmartRouterProjection(
      smartRouterProjection,
      { sticky: projectConfiguredBranch(rawConfig.Governance.sticky, runtimeSmartRouter.sticky) }
    );
  }

  if (rawConfig?.Governance?.semantic) {
    smartRouterProjection = mergeSmartRouterProjection(
      smartRouterProjection,
      { semantic: projectConfiguredBranch(rawConfig.Governance.semantic, runtimeSmartRouter.semantic) }
    );
  }

  if (Object.keys(smartRouterProjection).length > 0) {
    persisted.SmartRouter = smartRouterProjection;
  }

  const governanceProjection = projectConfiguredBranch(rawConfig?.Governance, normalizedConfig?.Governance);
  if (governanceProjection && typeof governanceProjection === "object") {
    delete governanceProjection.sticky;
    delete governanceProjection.semantic;
    if (Object.keys(governanceProjection).length > 0) {
      persisted.Governance = governanceProjection;
    }
  }

  return persisted;
}

function denyAuth(reply: any, statusCode: number, reason: string) {
  reply.code(statusCode);
  return {
    success: false,
    message: statusCode === 403 ? "Forbidden" : "Unauthorized",
    reason,
  };
}

function requireAdminAuth(req: any, reply: any, authConfig: any) {
  const verification = verifyApiKey(
    authConfig ?? {},
    extractApiKeyFromHeaders(req?.headers ?? {}),
    "admin"
  );
  const auditBase = {
    required: "admin" as const,
    method: req?.method,
    path: req?.url,
    requestId: req?.id,
  };

  if (verification.ok) {
    authAuditStore.add({
      ...auditBase,
      outcome: "allowed",
      source: verification.source,
      keyId: verification.keyId,
      scopes: verification.scopes,
      statusCode: 200,
    });
    return null;
  }

  authAuditStore.add({
    ...auditBase,
    outcome: "denied",
    source: verification.source,
    keyId: verification.keyId,
    reason: verification.reason ?? "invalid",
    statusCode: verification.reason === "insufficient_scope" ? 403 : 401,
  });
  return denyAuth(
    reply,
    verification.reason === "insufficient_scope" ? 403 : 401,
    verification.reason ?? "invalid"
  );
}

function buildDraftConfigView(config: any) {
  const normalizedConfig = normalizeAndValidateConfig(config ?? {}).config as any;
  const runtimeSmartRouterConfig = deriveRuntimeSmartRouterConfig(normalizedConfig);
  const draftConfig = {
    ...normalizedConfig,
    Models: Array.isArray(normalizedConfig.Models)
      ? normalizedConfig.Models.map((item: any) => toExternalModelConfig(item))
      : normalizedConfig.Models,
    SmartRouter: runtimeSmartRouterConfig,
  } as any;

  delete draftConfig.TriggerRouter;

  if (draftConfig.Governance) {
    const projectedGovernance = {
      ...draftConfig.Governance,
    };
    delete projectedGovernance.sticky;
    delete projectedGovernance.semantic;

    const hasResidualGovernance = Boolean(
      projectedGovernance.shadow ||
      projectedGovernance.cascade ||
      projectedGovernance.observability
    );

    if (!hasResidualGovernance) {
      delete draftConfig.Governance;
    } else {
      projectedGovernance.enabled = Boolean(
        projectedGovernance.enabled &&
        hasResidualGovernance
      );
      draftConfig.Governance = projectedGovernance;
    }
  }

  return draftConfig;
}

function diffCompiledRegistry(base: CompiledRegistryView, next: CompiledRegistryView) {
  const providerNames = Array.from(new Set([
    ...base.providers.map((item) => item.name),
    ...next.providers.map((item) => item.name),
  ])).sort();
  const baseProviders = new Map(base.providers.map((item) => [item.name, item]));
  const nextProviders = new Map(next.providers.map((item) => [item.name, item]));
  const providerChanges = providerNames.flatMap((name) => {
    const before = baseProviders.get(name);
    const after = nextProviders.get(name);
    if (!before && after) {
      return [{ type: "added", name, before: null, after, fields: ["provider"] }];
    }
    if (before && !after) {
      return [{ type: "removed", name, before, after: null, fields: ["provider"] }];
    }
    const fields = [
      before?.api_base_url !== after?.api_base_url ? "api_base_url" : null,
      JSON.stringify(before?.models ?? []) !== JSON.stringify(after?.models ?? []) ? "models" : null,
      JSON.stringify(before?.transformer ?? {}) !== JSON.stringify(after?.transformer ?? {}) ? "transformer" : null,
      before?.has_api_key !== after?.has_api_key ? "has_api_key" : null,
    ].filter(Boolean);
    return fields.length ? [{ type: "changed", name, before, after, fields }] : [];
  });

  const modelIds = Array.from(new Set([
    ...Object.keys(base.modelMap ?? {}),
    ...Object.keys(next.modelMap ?? {}),
  ])).sort();
  const modelChanges = modelIds.flatMap((modelId) => {
    const before = base.modelMap?.[modelId];
    const after = next.modelMap?.[modelId];
    if (!before && after) {
      return [{ type: "added", modelId, before: null, after, fields: ["model"] }];
    }
    if (before && !after) {
      return [{ type: "removed", modelId, before, after: null, fields: ["model"] }];
    }
    const fields = [
      before?.providerName !== after?.providerName ? "providerName" : null,
      before?.modelName !== after?.modelName ? "modelName" : null,
      before?.protocol !== after?.protocol ? "protocol" : null,
      before?.compatibilityProfile !== after?.compatibilityProfile ? "compatibilityProfile" : null,
      before?.dispatchFormat !== after?.dispatchFormat ? "dispatchFormat" : null,
      JSON.stringify(before?.thinking ?? {}) !== JSON.stringify(after?.thinking ?? {}) ? "thinking" : null,
      JSON.stringify(before?.capabilities ?? {}) !== JSON.stringify(after?.capabilities ?? {}) ? "capabilities" : null,
      before?.source !== after?.source ? "source" : null,
    ].filter(Boolean);
    return fields.length ? [{ type: "changed", modelId, before, after, fields }] : [];
  });

  return {
    providerChanges,
    modelChanges,
    summary: {
      addedProviders: providerChanges.filter((item) => item.type === "added").length,
      removedProviders: providerChanges.filter((item) => item.type === "removed").length,
      changedProviders: providerChanges.filter((item) => item.type === "changed").length,
      addedModels: modelChanges.filter((item) => item.type === "added").length,
      removedModels: modelChanges.filter((item) => item.type === "removed").length,
      changedModels: modelChanges.filter((item) => item.type === "changed").length,
    },
  };
}

/**
 * 创建服务器
 */
export const createServer = (config: any): Server => {
  const server = new Server(config);
  const configuredThresholds = config.initialConfig?.Governance?.observability?.anomaly_thresholds ?? {};
  const readActiveConfig = async () => {
    try {
      const currentConfig = await readConfigFile();
      if (
        currentConfig &&
        typeof currentConfig === "object" &&
        Object.keys(currentConfig).length > 0
      ) {
        return currentConfig;
      }
    } catch {
      // Fall back to the startup snapshot when no persisted config is readable yet.
    }
    return config.initialConfig ?? {};
  };

  const readGovernanceMetricsQuery = (query: any) => {
    const limit = query?.limit ? Number(query.limit) : undefined;
    const windowMs = query?.windowMs ? Number(query.windowMs) : undefined;
    const bucketCount = query?.bucketCount ? Number(query.bucketCount) : undefined;
    const now = query?.now ? Number(query.now) : undefined;
    const cascadeTriggered = query?.cascadeTriggered === undefined
      ? undefined
      : String(query.cascadeTriggered).toLowerCase() === 'true';
    const shadowChecked = query?.shadowChecked === undefined
      ? undefined
      : String(query.shadowChecked).toLowerCase() === 'true';

    return {
      requestId: query?.requestId,
      sessionKey: query?.sessionKey,
      routeReason: query?.routeReason,
      cascadeTriggered,
      shadowChecked,
      limit: Number.isFinite(limit) ? limit : undefined,
      windowMs: Number.isFinite(windowMs) ? windowMs : undefined,
      bucketCount: Number.isFinite(bucketCount) ? bucketCount : undefined,
      now: Number.isFinite(now) ? now : undefined,
      anomalyThresholds: {
        minSampleSize: query?.minSampleSize ? Number(query.minSampleSize) : configuredThresholds.min_sample_size,
        cascadeWarnRate: query?.cascadeWarnRate ? Number(query.cascadeWarnRate) : configuredThresholds.cascade_warn_rate,
        cascadeCriticalRate: query?.cascadeCriticalRate ? Number(query.cascadeCriticalRate) : configuredThresholds.cascade_critical_rate,
        shadowWarnRate: query?.shadowWarnRate ? Number(query.shadowWarnRate) : configuredThresholds.shadow_warn_rate,
        shadowCriticalRate: query?.shadowCriticalRate ? Number(query.shadowCriticalRate) : configuredThresholds.shadow_critical_rate,
        latencyWarnMs: query?.latencyWarnMs ? Number(query.latencyWarnMs) : configuredThresholds.latency_warn_ms,
        latencyCriticalMs: query?.latencyCriticalMs ? Number(query.latencyCriticalMs) : configuredThresholds.latency_critical_ms,
        spikeWarnRate: query?.spikeWarnRate ? Number(query.spikeWarnRate) : configuredThresholds.spike_warn_rate,
        spikeDeltaRate: query?.spikeDeltaRate ? Number(query.spikeDeltaRate) : configuredThresholds.spike_delta_rate,
      },
    };
  };

  // 读取配置 API
  server.app.get("/api/config", async (req: any, reply: any) => {
    return buildDraftConfigView(await readConfigFile());
  });

  server.app.get("/api/models/compiled", async () => {
    const normalizedResult = normalizeAndValidateConfig(await readActiveConfig());
    const normalized = normalizedResult.config;
    const compiled = toCompiledRegistryView(normalized);
    const capabilityWarnings = collectCapabilityWarnings(normalized);
    return {
      ...compiled,
      router: normalized.Router ?? {},
      smartRouterExplanation: summarizeSmartRouterExplanation(normalized, compiled),
      capabilityWarnings,
      warnings: normalizedResult.warnings,
      issueReport: buildValidationIssueReport({
        errors: normalizedResult.errors,
        warnings: normalizedResult.warnings,
        capabilityWarnings,
      }),
    };
  });

  server.app.get("/api/models/pool-health", async () => {
    return buildModelPoolHealthReport(await readActiveConfig());
  });

  server.app.post("/api/models/compiled/preview", async (req: any, reply: any) => {
    const rawConfig = req.body ?? {};
    let rawCompiled: CompiledRegistryView | null = null;
    try {
      rawCompiled = toCompiledRegistryView(rawConfig);
    } catch (_error) {
      rawCompiled = null;
    }

    const result = normalizeAndValidateConfig(rawConfig);
    const capabilityWarnings = rawCompiled ? collectCapabilityWarnings(rawConfig) : undefined;
    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid configuration preview",
        errors: result.errors,
        referenceImpact: rawCompiled ? analyzeModelReferenceImpact(rawConfig, rawCompiled) : undefined,
        capabilityWarnings,
        warnings: result.warnings,
        issueReport: buildValidationIssueReport({
          errors: result.errors,
          warnings: result.warnings,
          capabilityWarnings,
        }),
      };
    }

    const currentCompiled = toCompiledRegistryView(await readActiveConfig());
    const previewCompiled = toCompiledRegistryView(result.config);
    const previewCapabilityWarnings = collectCapabilityWarnings(result.config);
    return {
      success: true,
      providers: previewCompiled.providers,
      modelMap: previewCompiled.modelMap,
      modelPools: previewCompiled.modelPools,
      smartRouterExplanation: summarizeSmartRouterExplanation(result.config, previewCompiled),
      normalizedConfig: buildDraftConfigView(result.config),
      diff: diffCompiledRegistry(currentCompiled, previewCompiled),
      referenceImpact: analyzeModelReferenceImpact(result.config, previewCompiled),
      capabilityWarnings: previewCapabilityWarnings,
      warnings: result.warnings,
      issueReport: buildValidationIssueReport({
        warnings: result.warnings,
        capabilityWarnings: previewCapabilityWarnings,
      }),
    };
  });

  server.app.get("/api/health", async () => {
    return {
      service: SERVICE_NAME,
      ready: true,
      port: config.initialConfig?.PORT,
    };
  });

  server.app.get("/api/service-info", async () => {
    let currentConfig: any;
    try {
      currentConfig = await readConfigFile();
    } catch {
      currentConfig = undefined;
    }
    const serviceInfoConfig = currentConfig && Object.keys(currentConfig).length > 0
      ? { ...(config.initialConfig ?? {}), ...currentConfig }
      : (config.initialConfig ?? {});
    return buildServiceInfo(serviceInfoConfig);
  });

  server.app.get("/api/registration", async () => {
    return buildRegistrationInfo(config.initialConfig ?? {});
  });

  server.app.get("/api/auth/keys", async (req: any, reply: any) => {
    const currentConfig = await readConfigFile();
    const denied = requireAdminAuth(req, reply, currentConfig);
    if (denied) {
      return denied;
    }

    const normalized = normalizeAndValidateConfig(currentConfig ?? {}).config;
    return {
      keys: listManagedApiKeys(normalized),
      summary: managedApiKeySummary(normalized),
    };
  });

  server.app.get("/api/auth/audit", async (req: any, reply: any) => {
    const currentConfig = await readConfigFile();
    const denied = requireAdminAuth(req, reply, currentConfig);
    if (denied) {
      return denied;
    }

    const limit = Number(req.query?.limit ?? 50);
    return {
      events: authAuditStore.list(Number.isFinite(limit) ? limit : 50),
      summary: authAuditStore.summary(),
    };
  });

  server.app.post("/api/auth/keys", async (req: any, reply: any) => {
    const currentConfig = await readConfigFile();
    const denied = requireAdminAuth(req, reply, currentConfig);
    if (denied) {
      return denied;
    }

    const scopeErrors = validateManagedApiKeyScopes(req.body?.scopes);
    const quotaErrors = validateManagedApiKeyQuota(req.body?.quota);
    const inputErrors = [...scopeErrors, ...quotaErrors];
    if (inputErrors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid managed API key input",
        errors: inputErrors,
      };
    }

    if (req.body?.expiresAt !== undefined && Number.isNaN(Date.parse(String(req.body.expiresAt)))) {
      reply.code(400);
      return {
        success: false,
        message: "expiresAt must be an ISO date string when provided",
      };
    }

    const created = createManagedApiKey({
      label: req.body?.label,
      scopes: req.body?.scopes,
      expiresAt: req.body?.expiresAt,
      quota: req.body?.quota,
    });
    const nextConfig = {
      ...(currentConfig ?? {}),
      Auth: {
        ...(currentConfig?.Auth ?? {}),
        managed_keys: [
          ...(currentConfig?.Auth?.managed_keys ?? []),
          created.record,
        ],
      },
    };
    const result = normalizeAndValidateConfig(nextConfig);
    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid auth key configuration",
        errors: result.errors,
      };
    }

    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }
    await writeConfigFile(buildPersistedConfig(nextConfig, result.config));

    return {
      success: true,
      key: sanitizeManagedApiKey(created.record),
      secret: created.secret,
      message: "Managed API key created. Store the secret now; it will not be shown again.",
    };
  });

  server.app.post("/api/auth/keys/:id/revoke", async (req: any, reply: any) => {
    const currentConfig = await readConfigFile();
    const denied = requireAdminAuth(req, reply, currentConfig);
    if (denied) {
      return denied;
    }

    const keyId = String(req.params?.id ?? "").trim();
    const managedKeys = currentConfig?.Auth?.managed_keys ?? [];
    const keyIndex = managedKeys.findIndex((key: any) => key.id === keyId);
    if (keyIndex < 0) {
      reply.code(404);
      return {
        success: false,
        message: "Managed API key not found",
      };
    }

    const revokedAt = new Date().toISOString();
    const nextKeys = managedKeys.map((key: any, index: number) => index === keyIndex
      ? { ...key, revoked_at: key.revoked_at ?? revokedAt }
      : key
    );
    const nextConfig = {
      ...(currentConfig ?? {}),
      Auth: {
        ...(currentConfig?.Auth ?? {}),
        managed_keys: nextKeys,
      },
    };
    const result = normalizeAndValidateConfig(nextConfig);
    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid auth key configuration",
        errors: result.errors,
      };
    }

    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }
    await writeConfigFile(buildPersistedConfig(nextConfig, result.config));

    return {
      success: true,
      key: sanitizeManagedApiKey(nextKeys[keyIndex]),
    };
  });

  server.app.get("/api/remote-status", async (req: any) => {
    const normalizedResult = normalizeAndValidateConfig(config.initialConfig ?? {});
    const normalized = normalizedResult.config;
    const [remote, remoteRegistration] = await Promise.all([
      probeRemoteServiceStatus(normalized.Runtime?.remote_service),
      probeRemoteRegistrationStatus(normalized.Runtime?.remote_service),
    ]);
    const governanceReport = getGovernanceMetricsReport(readGovernanceMetricsQuery(req.query ?? {}));

    return {
      service: SERVICE_NAME,
      ready: true,
      runtimeMode: normalized.Runtime?.mode ?? "local",
      remote,
      remoteRegistration,
      compiledModels: summarizeCompiledModels(normalized),
      governance: summarizeGovernanceAlerts(governanceReport),
      issueReport: buildValidationIssueReport({
        errors: normalizedResult.errors,
        warnings: normalizedResult.warnings,
      }),
    };
  });

  server.app.get("/api/governance/traces", async (req: any) => {
    const limit = req.query?.limit ? Number(req.query.limit) : undefined;
    const cascadeTriggered = req.query?.cascadeTriggered === undefined
      ? undefined
      : String(req.query.cascadeTriggered).toLowerCase() === 'true';
    const shadowChecked = req.query?.shadowChecked === undefined
      ? undefined
      : String(req.query.shadowChecked).toLowerCase() === 'true';
    return {
      traces: governanceTraceStore.list({
        requestId: req.query?.requestId,
        sessionKey: req.query?.sessionKey,
        routeReason: req.query?.routeReason,
        cascadeTriggered,
        shadowChecked,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
    };
  });

  server.app.get("/api/governance/metrics", async (req: any) => {
    return {
      ...getGovernanceMetricsReport(readGovernanceMetricsQuery(req.query)),
    };
  });

  server.app.get("/api/governance/health", async (req: any) => {
    const report = getGovernanceMetricsReport(readGovernanceMetricsQuery(req.query));
    return {
      health: report.health ?? buildGovernanceHealthSummary({
        metrics: report.metrics,
        anomalies: report.anomalies,
        topRouteReasons: report.topRouteReasons,
        topFinalModels: report.topFinalModels,
        outcome: report.outcome,
      }),
      metrics: report.metrics,
      outcome: report.outcome,
      anomalies: report.anomalies,
      topRouteReasons: report.topRouteReasons,
      topFinalModels: report.topFinalModels,
      topSemanticIntents: report.topSemanticIntents,
      windowMs: report.windowMs,
      windowStart: report.windowStart,
      windowEnd: report.windowEnd,
    };
  });

  server.app.get("/api/governance/metrics/export", async (req: any, reply: any) => {
    const format = String(req.query?.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
    const report = getGovernanceMetricsReport(readGovernanceMetricsQuery(req.query));
    const content = exportGovernanceMetricsReport(report, format);

    reply.header(
      'Content-Type',
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8'
    );
    reply.header(
      'Content-Disposition',
      `attachment; filename="governance-metrics.${format}"`
    );
    return reply.send(content);
  });

  server.app.get("/api/governance/metrics/exports", async () => {
    return {
      exports: governanceMetricsExportStore.listHistory(),
      schedules: governanceMetricsExportStore.listSchedules(),
    };
  });

  server.app.post("/api/governance/metrics/snapshots", async (req: any) => {
    const format = String(req.body?.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
    const result = governanceMetricsExportStore.createSnapshot(
      readGovernanceMetricsQuery(req.body ?? {}),
      format,
      'manual'
    );

    return {
      success: true,
      export: result.record,
    };
  });

  server.app.post("/api/governance/metrics/schedules", async (req: any, reply: any) => {
    const intervalMs = Number(req.body?.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
      reply.code(400);
      return {
        success: false,
        message: 'intervalMs must be at least 1000 ms',
      };
    }

    const format = String(req.body?.format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
    const schedule = governanceMetricsExportStore.startSchedule(
      intervalMs,
      readGovernanceMetricsQuery(req.body ?? {}),
      format
    );

    return {
      success: true,
      schedule,
    };
  });

  server.app.post("/api/governance/observability/anomaly-thresholds", async (req: any, reply: any) => {
    const currentConfig = await readConfigFile();
    const nextConfig = {
      ...currentConfig,
      Governance: {
        ...(currentConfig.Governance ?? { enabled: false }),
        observability: {
          ...(currentConfig.Governance?.observability ?? {}),
          anomaly_thresholds: {
            ...(currentConfig.Governance?.observability?.anomaly_thresholds ?? {}),
            ...(req.body ?? {}),
          },
        },
      },
    };

    const result = normalizeAndValidateConfig(nextConfig);
    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid anomaly threshold configuration",
        errors: result.errors,
      };
    }

    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(result.config);
    return {
      success: true,
      message: "Anomaly thresholds saved successfully",
      anomaly_thresholds: result.config.Governance?.observability?.anomaly_thresholds ?? {},
    };
  });

  server.app.get("/api/governance/traces/:requestId", async (req: any, reply: any) => {
    const trace = governanceTraceStore.get(req.params.requestId);
    if (!trace) {
      reply.code(404);
      return {
        success: false,
        message: "Governance trace not found",
      };
    }

    return trace;
  });

  server.app.get("/api/governance/archives", async (req: any) => {
    const limit = req.query?.limit ? Number(req.query.limit) : undefined;
    const page = req.query?.page ? Number(req.query.page) : undefined;
    const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : undefined;
    return {
      archives: governanceTraceStore.listArchives({
        date: req.query?.date,
        limit: Number.isFinite(limit) ? limit : undefined,
        page: Number.isFinite(page) ? page : undefined,
        pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      }),
    };
  });

  server.app.get("/api/governance/archives/:file", async (req: any, reply: any) => {
    const traces = governanceTraceStore.getArchivedTraces(req.params.file);
    if (!traces.length) {
      reply.code(404);
      return {
        success: false,
        message: 'Governance archive not found',
      };
    }

    return {
      file: req.params.file,
      traces,
    };
  });

  server.app.post("/api/governance/archives/:file/delete", async (req: any, reply: any) => {
    const deleted = governanceTraceStore.deleteArchive(req.params.file);
    if (!deleted) {
      reply.code(404);
      return {
        success: false,
        message: 'Governance archive not found',
      };
    }

    return {
      success: true,
      file: req.params.file,
    };
  });

  // 获取转换器列表
  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: [string, any]) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // 保存配置 API
  server.app.post("/api/config", async (req: any, reply: any) => {
    const result = normalizeAndValidateConfig(req.body ?? {});

    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid configuration",
        errors: result.errors,
        warnings: result.warnings,
        issueReport: buildValidationIssueReport({
          errors: result.errors,
          warnings: result.warnings,
        }),
      };
    }

    // 备份现有配置
    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(buildPersistedConfig(req.body ?? {}, result.config));
    return {
      success: true,
      message: "Config saved successfully",
      warnings: result.warnings,
      issueReport: buildValidationIssueReport({ warnings: result.warnings }),
    };
  });

  // 重启服务 API
  server.app.post("/api/restart", async (req: any, reply: any) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // 延迟重启以允许响应发送
    // 使用 __dirname 定位已编译的 cli.js（与 server.js 在同一目录）
    // 调用 start 而非 restart，避免递归的 stop→start 循环
    setTimeout(() => {
      const { spawn } = require("child_process");
      const { join } = require("path");
      const cliPath = join(__dirname, "cli.js");

      // 保持当前运行端口，避免重启后端口变回配置文件默认值
      const currentPort = config.initialConfig?.PORT;
      const restartArgs = [cliPath, "start", "--daemon"];
      if (currentPort) {
        restartArgs.push("--port", String(currentPort));
      }

      spawn(process.execPath, restartArgs, {
        detached: true,
        stdio: "ignore",
      }).unref();

      // 等待新进程启动后再退出当前进程
      setTimeout(() => process.exit(0), 500);
    }, 500);
  });

  // Web UI 入口（配置状态与治理观测工作台）
  server.app.get("/ui", async (_: any, reply: any) => {
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(renderWorkbenchHtml(config.initialConfig, configuredThresholds));
  });

  return server;
};
