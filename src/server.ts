/**
 * Server
 *
 * Fastify 服务器配置
 */

import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile, normalizeAndValidateConfig } from "./utils";
import { log } from "./utils/log";
import { SERVICE_NAME } from "./service-health";
import {
  governanceTraceStore,
  getGovernanceMetricsReport,
  exportGovernanceMetricsReport,
  governanceMetricsExportStore,
} from "./governance";
import { buildModelRegistry } from "./models/compile";

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
  };
}

function collectModelReferences(config: any): ModelReferenceEntry[] {
  const refs: ModelReferenceEntry[] = [];
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

  pushRef("Router.default", config?.Router?.default);
  pushRef("TriggerRouter.intent_model", config?.TriggerRouter?.intent_model);
  config?.TriggerRouter?.rules?.forEach((rule: any, index: number) => {
    pushRef(`TriggerRouter.rules[${index}].model`, rule?.model);
  });
  pushRef("SmartRouter.router_model", config?.SmartRouter?.router_model);
  config?.SmartRouter?.candidates?.forEach((candidate: any, index: number) => {
    pushRef(`SmartRouter.candidates[${index}].model`, candidate?.model);
  });
  pushRef("Governance.sticky.alignment.summarizer_model", config?.Governance?.sticky?.alignment?.summarizer_model);
  config?.Governance?.cascade?.levels?.forEach((level: any, index: number) => {
    pushRef(`Governance.cascade.levels[${index}].from`, level?.from);
    pushRef(`Governance.cascade.levels[${index}].to`, level?.to);
  });
  pushRef("Governance.semantic.classifier_model", config?.Governance?.semantic?.classifier_model);
  pushRef("Governance.shadow.verifier_model", config?.Governance?.shadow?.verifier_model);

  return refs;
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
      JSON.stringify(before?.thinking ?? {}) !== JSON.stringify(after?.thinking ?? {}) ? "thinking" : null,
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
    return await readConfigFile();
  });

  server.app.get("/api/models/compiled", async () => {
    return toCompiledRegistryView(config.initialConfig ?? {});
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
    if (result.errors.length > 0) {
      reply.code(400);
      return {
        success: false,
        message: "Invalid configuration preview",
        errors: result.errors,
        referenceImpact: rawCompiled ? analyzeModelReferenceImpact(rawConfig, rawCompiled) : undefined,
      };
    }

    const currentCompiled = toCompiledRegistryView(config.initialConfig ?? {});
    const previewCompiled = toCompiledRegistryView(result.config);
    return {
      success: true,
      providers: previewCompiled.providers,
      modelMap: previewCompiled.modelMap,
      normalizedConfig: result.config,
      diff: diffCompiledRegistry(currentCompiled, previewCompiled),
      referenceImpact: analyzeModelReferenceImpact(result.config, previewCompiled),
    };
  });

  server.app.get("/api/health", async () => {
    return {
      service: SERVICE_NAME,
      ready: true,
      port: config.initialConfig?.PORT,
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
      };
    }

    // 备份现有配置
    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(result.config);
    return { success: true, message: "Config saved successfully" };
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

  // Web UI 入口（简易 governance trace 调试页）
  server.app.get("/ui", async (_: any, reply: any) => {
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claude Trigger Router</title>` +
      `<style>` +
      `body{font-family:ui-sans-serif,system-ui,sans-serif;padding:2rem;max-width:1100px;margin:0 auto;background:#f7f7f5;color:#1f2328}` +
      `.panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1rem}` +
      `.muted{color:#6b7280}` +
      `.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
      `.stat{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:.85rem}` +
      `.stat strong{display:block;font-size:1.1rem;margin-top:.25rem}` +
      `.subpanel{margin-top:1rem;padding-top:1rem;border-top:1px solid #e5e7eb}` +
      `.bucket-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem;margin-top:.75rem}` +
      `.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-top:1rem}` +
      `.mini-list{list-style:none;padding:0;margin:.75rem 0 0}` +
      `.mini-list li{display:flex;justify-content:space-between;gap:1rem;padding:.45rem 0;border-bottom:1px dashed #e5e7eb}` +
      `.mini-list li:last-child{border-bottom:none}` +
      `.action-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-top:.75rem}` +
      `.management-table{width:100%;margin-top:.75rem}` +
      `.management-table th,.management-table td{padding:.5rem;border-bottom:1px solid #e5e7eb;font-size:.92rem;vertical-align:top}` +
      `.alert-list{display:grid;gap:.75rem;margin-top:1rem}` +
      `.alert{border-radius:12px;padding:.85rem 1rem;border:1px solid}` +
      `.alert.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}` +
      `.alert.critical{background:#fef2f2;border-color:#fca5a5;color:#991b1b}` +
      `.alert.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}` +
      `.diff-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-top:.75rem}` +
      `.diff-chip{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:.75rem}` +
      `.diff-chip strong{display:block;font-size:1rem;margin-top:.2rem}` +
      `.models-form-grid{display:grid;gap:.75rem;margin-top:.75rem}` +
      `.model-card{border:1px solid #e5e7eb;border-radius:12px;padding:1rem;background:#fcfcfd}` +
      `.model-card-header{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.75rem}` +
      `.model-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
      `.model-card-grid textarea{min-height:84px;resize:vertical}` +
      `.list-editor{display:grid;gap:.75rem;margin-top:.75rem}` +
      `.list-item{border:1px solid #e5e7eb;border-radius:12px;padding:.85rem;background:#fcfcfd}` +
      `.list-item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}` +
      `.jump-highlight{outline:3px solid #f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15);transition:box-shadow .25s ease,outline-color .25s ease}` +
      `.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-top:1rem}` +
      `.control-grid label{display:block;font-size:.85rem;color:#6b7280;margin-bottom:.35rem}` +
      `.trend-table{width:100%;margin-top:.75rem}` +
      `.trend-table th,.trend-table td{padding:.45rem;border-bottom:1px solid #e5e7eb;font-size:.92rem}` +
      `.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}` +
      `input,select,button{font:inherit;padding:.55rem .75rem;border-radius:8px;border:1px solid #d1d5db}` +
      `button{background:#111827;color:#fff;border-color:#111827;cursor:pointer}` +
      `table{width:100%;border-collapse:collapse;margin-top:1rem}` +
      `th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid #e5e7eb;vertical-align:top}` +
      `code,pre{font-family:ui-monospace,SFMono-Regular,monospace}` +
      `pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:12px;overflow:auto}` +
      `.pill{display:inline-block;padding:.2rem .5rem;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:.8rem}` +
      `</style></head>` +
      `<body>` +
      `<h2>Claude Trigger Router</h2>` +
      `<p class="muted">简易 Governance Trace 调试页。可查看最近治理链路，按 requestId / sessionKey / routeReason 过滤，并按 cascade / shadow 状态筛选；治理 trace 现已支持本地持久化，重启后可继续查看近期窗口。</p>` +
      `<div class="panel">` +
      `<div class="row">` +
      `<input id="requestId" placeholder="requestId">` +
      `<input id="sessionKey" placeholder="sessionKey">` +
      `<input id="routeReason" placeholder="routeReason">` +
      `<select id="cascadeTriggered"><option value="">cascadeTriggered</option><option value="true">cascade=true</option><option value="false">cascade=false</option></select>` +
      `<select id="shadowChecked"><option value="">shadowChecked</option><option value="true">shadow=true</option><option value="false">shadow=false</option></select>` +
      `<select id="windowMs">` +
      `<option value="900000">15m window</option>` +
      `<option value="3600000" selected>1h window</option>` +
      `<option value="21600000">6h window</option>` +
      `<option value="86400000">24h window</option>` +
      `</select>` +
      `<input id="limit" placeholder="limit" value="20">` +
      `<button id="refreshBtn">刷新</button>` +
      `</div>` +
      `<div class="muted" style="margin-top:.75rem">数据源：<code>/api/models/compiled</code>、<code>/api/models/compiled/preview</code>、<code>/api/governance/traces</code>、<code>/api/governance/traces/:requestId</code>、<code>/api/governance/archives</code>、<code>/api/governance/metrics</code>、<code>/api/governance/metrics/export</code>、<code>/api/governance/metrics/exports</code></div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Draft Config Preview</strong><span class="muted">编辑当前配置草稿并即时预览 compiled models 结果，不落盘</span></div>` +
      `<div class="action-row">` +
      `<button id="loadConfigDraftBtn" type="button">载入当前配置</button>` +
      `<button id="addModelDraftBtn" type="button">新增 Model</button>` +
      `<button id="applyBalancedPresetBtn" type="button">应用平衡预设</button>` +
      `<button id="applyFastPresetBtn" type="button">应用快速预设</button>` +
      `<button id="applyGovernancePresetBtn" type="button">应用治理预设</button>` +
      `<button id="syncDraftJsonBtn" type="button">同步 JSON 草稿</button>` +
      `<button id="previewConfigDraftBtn" type="button">预览 compiled models</button>` +
      `<span id="draftPreviewStatus" class="muted">尚未预览配置草稿</span>` +
      `</div>` +
      `<div class="control-grid">` +
      `<div><label>Preset mode</label><select id="draftPresetMode"><option value="merge" selected>append / merge</option><option value="replace">overwrite</option></select></div>` +
      `<div><label>Mode guide</label><div id="draftPresetModeHint" class="muted">append / merge 会尽量保留当前草稿，仅补充预设相关字段</div></div>` +
      `</div>` +
      `<div id="draftPresetList" class="alert-list">` +
      `<div class="alert info"><strong>Preset guide</strong><div class="muted">选择预设前可先查看其会覆盖的区域与推荐用途</div></div>` +
      `</div>` +
      `<div id="draftSummaryGrid" class="stats">` +
      `<div class="stat"><span class="muted">Models</span><strong>0</strong></div>` +
      `<div class="stat"><span class="muted">Trigger rules</span><strong>0</strong></div>` +
      `<div class="stat"><span class="muted">Patterns</span><strong>0</strong></div>` +
      `<div class="stat"><span class="muted">Smart candidates</span><strong>0</strong></div>` +
      `<div class="stat"><span class="muted">Cascade levels</span><strong>0</strong></div>` +
      `<div class="stat"><span class="muted">Model refs</span><strong>0</strong></div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Validation Summary</strong><span class="muted">集中显示当前草稿的关键校验问题</span></div>` +
      `<div id="draftValidationList" class="alert-list">` +
      `<div class="alert info"><strong>No validation issues</strong><div class="muted">预览前会在这里汇总草稿问题</div></div>` +
      `</div>` +
      `</div>` +
      `<div class="control-grid">` +
      `<div><label>Router default (modelId)</label><input id="draftRouterDefault" placeholder="例如 sonnet"></div>` +
      `<div><label>Models count</label><input id="draftModelsCount" value="0" readonly></div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Routing Controls</strong><span class="muted">首批表单化编辑 TriggerRouter / SmartRouter / Governance 的核心引用</span></div>` +
      `<div class="detail-grid">` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>TriggerRouter</strong><span class="muted">规则路由与意图识别</span></div>` +
      `<div class="control-grid">` +
      `<div><label><input id="triggerEnabled" type="checkbox"> Enabled</label></div>` +
      `<div><label><input id="triggerIntentEnabled" type="checkbox"> Intent recognition</label></div>` +
      `<div><label>Analysis scope</label><select id="triggerAnalysisScope"><option value="last_message">last_message</option><option value="full_context">full_context</option></select></div>` +
      `<div><label>Intent model</label><input id="triggerIntentModel" list="topLevelTriggerIntentSuggestions" placeholder="modelId"><datalist id="topLevelTriggerIntentSuggestions"></datalist></div>` +
      `</div>` +
      `<div style="margin-top:.75rem"><div class="action-row"><label>Rules</label><button id="addTriggerRuleBtn" type="button">新增 Rule</button></div><div id="triggerRulesList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No trigger rules yet</span></div></div></div>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>SmartRouter</strong><span class="muted">智能候选选择</span></div>` +
      `<div class="control-grid">` +
      `<div><label><input id="smartEnabled" type="checkbox"> Enabled</label></div>` +
      `<div><label>Router model</label><input id="smartRouterModel" list="topLevelSmartRouterSuggestions" placeholder="modelId"><datalist id="topLevelSmartRouterSuggestions"></datalist></div>` +
      `<div><label>Fallback</label><select id="smartFallback"><option value="default">default</option><option value="skip">skip</option></select></div>` +
      `<div><label>Cache TTL</label><input id="smartCacheTtl" placeholder="600000"></div>` +
      `<div><label>Max tokens</label><input id="smartMaxTokens" placeholder="256"></div>` +
      `</div>` +
      `<div style="margin-top:.75rem"><div class="action-row"><label>Candidates</label><button id="addSmartCandidateBtn" type="button">新增 Candidate</button></div><div id="smartCandidatesList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No smart candidates yet</span></div></div></div>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Governance</strong><span class="muted">对齐、语义、影子校验与级联</span></div>` +
      `<div class="control-grid">` +
      `<div><label><input id="governanceEnabled" type="checkbox"> Enabled</label></div>` +
      `<div><label><input id="governanceAlignmentEnabled" type="checkbox"> Alignment</label></div>` +
      `<div><label>Summarizer model</label><input id="governanceSummarizerModel" list="topLevelGovernanceSummarizerSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceSummarizerSuggestions"></datalist></div>` +
      `<div><label><input id="governanceSemanticEnabled" type="checkbox"> Semantic</label></div>` +
      `<div><label>Classifier model</label><input id="governanceClassifierModel" list="topLevelGovernanceClassifierSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceClassifierSuggestions"></datalist></div>` +
      `<div><label><input id="governanceShadowEnabled" type="checkbox"> Shadow</label></div>` +
      `<div><label>Verifier model</label><input id="governanceVerifierModel" list="topLevelGovernanceVerifierSuggestions" placeholder="modelId"><datalist id="topLevelGovernanceVerifierSuggestions"></datalist></div>` +
      `</div>` +
      `<div style="margin-top:.75rem"><div class="action-row"><label>Cascade levels</label><button id="addCascadeLevelBtn" type="button">新增 Level</button></div><div id="governanceCascadeLevelsList" class="list-editor"><div class="panel" style="margin-bottom:0"><span class="muted">No cascade levels yet</span></div></div></div>` +
      `</div>` +
      `</div>` +
      `</div>` +
      `<div id="modelsFormGrid" class="models-form-grid">` +
      `<div class="panel" style="margin-bottom:0"><span class="muted">No draft models loaded yet</span></div>` +
      `</div>` +
      `<textarea id="configDraftEditor" style="width:100%;min-height:240px;margin-top:.75rem;padding:.75rem;border-radius:12px;border:1px solid #d1d5db;font:12px/1.5 ui-monospace,SFMono-Regular,monospace" spellcheck="false" placeholder='{"Models":[{"id":"sonnet","api_base_url":"https://...","api_key":"sk-...","protocol":"openai","model":"anthropic/claude-sonnet-4"}]}'></textarea>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Preview Diff</strong><span class="muted">对比当前运行配置与草稿配置的 compiled model 变化</span></div>` +
      `<div id="compiledDiffSummary" class="diff-summary">` +
      `<div class="diff-chip"><span class="muted">Added providers</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Removed providers</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Changed providers</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Added models</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Removed models</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Changed models</span><strong>0</strong></div>` +
      `</div>` +
      `<table id="compiledDiffTable" class="management-table">` +
      `<thead><tr><th>Scope</th><th>Type</th><th>Key</th><th>Changed fields</th><th>Target</th></tr></thead>` +
      `<tbody><tr><td colspan="5" class="muted">Preview a draft to inspect compiled registry changes</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Reference Impact</strong><span class="muted">分析 Router / TriggerRouter / Governance 等 modelId 引用是否仍然有效</span></div>` +
      `<div id="referenceImpactSummary" class="diff-summary">` +
      `<div class="diff-chip"><span class="muted">Total refs</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">modelId refs</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Legacy refs</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Valid modelIds</span><strong>0</strong></div>` +
      `<div class="diff-chip"><span class="muted">Missing modelIds</span><strong>0</strong></div>` +
      `</div>` +
      `<table id="referenceImpactTable" class="management-table">` +
      `<thead><tr><th>Path</th><th>Ref</th><th>Type</th><th>Status</th><th>Resolved target</th><th>Suggestions</th></tr></thead>` +
      `<tbody><tr><td colspan="6" class="muted">Preview a draft to inspect model reference impact</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Compiled Models</strong><span class="muted">查看 Models 编译后的 provider 与路由映射</span></div>` +
      `<div id="compiledModelsStatus" class="muted" style="margin-top:.75rem">加载 compiled models 中...</div>` +
      `<div class="detail-grid">` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Compiled providers</strong><span class="muted">内部 provider、模型列表与 transformer</span></div>` +
      `<table id="compiledProvidersTable" class="management-table">` +
      `<thead><tr><th>Provider</th><th>Interface</th><th>Models</th><th>Transformer</th><th>API key</th></tr></thead>` +
      `<tbody><tr><td colspan="5" class="muted">Loading compiled providers...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Model map</strong><span class="muted">modelId 到内部 provider/model 与 thinking 配置</span></div>` +
      `<table id="compiledModelMapTable" class="management-table">` +
      `<thead><tr><th>Model ID</th><th>Internal target</th><th>Protocol</th><th>Thinking</th><th>Source</th></tr></thead>` +
      `<tbody><tr><td colspan="5" class="muted">Loading model map...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `</div>` +
      `</div>` +
      `<div id="metricsGrid" class="stats">` +
      `<div class="stat"><span class="muted">Recent traces</span><strong>-</strong></div>` +
      `<div class="stat"><span class="muted">Sticky hit rate</span><strong>-</strong></div>` +
      `<div class="stat"><span class="muted">Cascade rate</span><strong>-</strong></div>` +
      `<div class="stat"><span class="muted">Shadow rate</span><strong>-</strong></div>` +
      `<div class="stat"><span class="muted">Alignment rate</span><strong>-</strong></div>` +
      `<div class="stat"><span class="muted">Avg latency</span><strong>-</strong></div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Anomaly alerts</strong><span class="muted">检测近期治理异常与突增</span></div>` +
      `<div id="anomalyList" class="alert-list">` +
      `<div class="alert info"><strong>No alerts yet</strong><div class="muted">等待治理指标加载</div></div>` +
      `</div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Anomaly tuning</strong><span class="muted">来自配置文件，可在此临时覆盖当前页面查询</span></div>` +
      `<div class="control-grid">` +
      `<div><label>Min sample</label><input id="minSampleSize" value="${configuredThresholds.min_sample_size ?? 3}"></div>` +
      `<div><label>Cascade warn</label><input id="cascadeWarnRate" value="${configuredThresholds.cascade_warn_rate ?? 0.4}"></div>` +
      `<div><label>Shadow warn</label><input id="shadowWarnRate" value="${configuredThresholds.shadow_warn_rate ?? 0.5}"></div>` +
      `<div><label>Latency warn ms</label><input id="latencyWarnMs" value="${configuredThresholds.latency_warn_ms ?? 1500}"></div>` +
      `</div>` +
      `<div class="row" style="margin-top:.75rem">` +
      `<button id="saveThresholdsBtn" type="button">保存阈值到配置</button>` +
      `<span id="saveThresholdsStatus" class="muted">当前仅作为页面查询参数；点击可写回配置文件</span>` +
      `</div>` +
      `</div>` +
      `<div class="subpanel">` +
      `<div class="row"><strong>Window buckets</strong><span id="bucketHint" class="muted">按时间窗查看近期治理趋势</span></div>` +
      `<div id="bucketGrid" class="bucket-grid">` +
      `<div class="stat"><span class="muted">Loading buckets</span><strong>-</strong></div>` +
      `</div>` +
      `</div>` +
      `<div class="detail-grid">` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Route ranking</strong><span class="muted">近期命中原因 Top 5</span></div>` +
      `<ul id="routeRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Model ranking</strong><span class="muted">近期最终模型 Top 5</span></div>` +
      `<ul id="modelRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Intent ranking</strong><span class="muted">近期语义意图 Top 5</span></div>` +
      `<ul id="intentRanking" class="mini-list"><li><span class="muted">Loading</span><strong>-</strong></li></ul>` +
      `</div>` +
      `<div class="panel" style="margin-bottom:0">` +
      `<div class="row"><strong>Trend detail</strong><span class="muted">每个 bucket 的详细命中率</span></div>` +
      `<table id="trendTable" class="trend-table">` +
      `<thead><tr><th>Bucket</th><th>Traces</th><th>Sticky</th><th>Cascade</th><th>Shadow</th><th>Alignment</th></tr></thead>` +
      `<tbody><tr><td colspan="6" class="muted">Loading...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `</div>` +
      `<table id="traceTable">` +
      `<thead><tr><th>Request</th><th>Session</th><th>Final Model</th><th>Reasons</th><th>Latency</th><th>Inspect</th></tr></thead>` +
      `<tbody><tr><td colspan="6" class="muted">加载中...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `<div class="panel">` +
      `<div class="row"><strong>Trace Detail</strong><span id="detailHint" class="muted">点击上表中的 View 查看详情</span></div>` +
      `<pre id="traceDetail">{}</pre>` +
      `</div>` +
      `<div class="panel">` +
      `<div class="row"><strong>Snapshot Management</strong><span class="muted">查看导出历史、定时任务，并手动创建快照</span></div>` +
      `<div class="action-row">` +
      `<select id="snapshotFormat"><option value="json">snapshot json</option><option value="csv">snapshot csv</option></select>` +
      `<button id="createSnapshotBtn" type="button">生成快照</button>` +
      `<span id="snapshotStatus" class="muted">尚未创建快照</span>` +
      `</div>` +
      `<table id="exportTable" class="management-table">` +
      `<thead><tr><th>Export</th><th>Kind</th><th>Format</th><th>Created</th></tr></thead>` +
      `<tbody><tr><td colspan="4" class="muted">Loading exports...</td></tr></tbody>` +
      `</table>` +
      `<table id="scheduleTable" class="management-table">` +
      `<thead><tr><th>Schedule</th><th>Interval</th><th>Format</th><th>Last run</th></tr></thead>` +
      `<tbody><tr><td colspan="4" class="muted">Loading schedules...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `<div class="panel">` +
      `<div class="row"><strong>Archive Management</strong><span class="muted">浏览压缩归档并查看分页结果</span></div>` +
      `<div class="action-row">` +
      `<input id="archiveDate" placeholder="YYYY-MM-DD">` +
      `<input id="archivePage" placeholder="page" value="1">` +
      `<input id="archivePageSize" placeholder="pageSize" value="5">` +
      `<button id="loadArchivesBtn" type="button">加载归档</button>` +
      `<span id="archiveStatus" class="muted">尚未加载归档</span>` +
      `</div>` +
      `<table id="archiveTable" class="management-table">` +
      `<thead><tr><th>Archive</th><th>Range</th><th>Count</th><th>Compressed</th></tr></thead>` +
      `<tbody><tr><td colspan="4" class="muted">Loading archives...</td></tr></tbody>` +
      `</table>` +
      `</div>` +
      `<div class="panel">` +
      `<p>其他管理 API：</p>` +
      `<ul>` +
      `<li><code>GET /api/config</code> — 读取当前配置</li>` +
      `<li><code>GET /api/models/compiled</code> — 查看 Models 编译后的内部 provider / model 映射</li>` +
      `<li><code>POST /api/models/compiled/preview</code> — 用配置草稿预览 compiled models 结果，不写回文件</li>` +
      `<li><code>POST /api/config</code> — 保存配置</li>` +
      `<li><code>GET /api/transformers</code> — 查看已加载 transformer</li>` +
      `<li><code>POST /api/restart</code> — 重启服务</li>` +
      `<li><code>GET /api/governance/archives</code> — 查看治理归档列表</li>` +
      `<li><code>GET /api/governance/archives/:file</code> — 查看归档内 traces</li>` +
      `<li><code>POST /api/governance/archives/:file/delete</code> — 删除指定归档</li>` +
      `<li><code>POST /api/governance/metrics/snapshots</code> — 生成一次治理指标快照</li>` +
      `<li><code>POST /api/governance/metrics/schedules</code> — 注册定时快照任务</li>` +
      `</ul>` +
      `</div>` +
      `<script>` +
      `const tbody=document.querySelector('#traceTable tbody');` +
      `const detail=document.getElementById('traceDetail');` +
      `const detailHint=document.getElementById('detailHint');` +
      `const draftPreviewStatus=document.getElementById('draftPreviewStatus');` +
      `const draftPresetMode=document.getElementById('draftPresetMode');` +
      `const draftPresetModeHint=document.getElementById('draftPresetModeHint');` +
      `const draftPresetList=document.getElementById('draftPresetList');` +
      `const draftValidationList=document.getElementById('draftValidationList');` +
      `const configDraftEditor=document.getElementById('configDraftEditor');` +
      `const draftSummaryGrid=document.getElementById('draftSummaryGrid');` +
      `const modelsFormGrid=document.getElementById('modelsFormGrid');` +
      `const draftRouterDefault=document.getElementById('draftRouterDefault');` +
      `const draftModelsCount=document.getElementById('draftModelsCount');` +
      `const triggerEnabled=document.getElementById('triggerEnabled');` +
      `const triggerIntentEnabled=document.getElementById('triggerIntentEnabled');` +
      `const triggerAnalysisScope=document.getElementById('triggerAnalysisScope');` +
      `const triggerIntentModel=document.getElementById('triggerIntentModel');` +
      `const triggerRulesList=document.getElementById('triggerRulesList');` +
      `const smartEnabled=document.getElementById('smartEnabled');` +
      `const smartRouterModel=document.getElementById('smartRouterModel');` +
      `const smartFallback=document.getElementById('smartFallback');` +
      `const smartCacheTtl=document.getElementById('smartCacheTtl');` +
      `const smartMaxTokens=document.getElementById('smartMaxTokens');` +
      `const smartCandidatesList=document.getElementById('smartCandidatesList');` +
      `const governanceEnabled=document.getElementById('governanceEnabled');` +
      `const governanceAlignmentEnabled=document.getElementById('governanceAlignmentEnabled');` +
      `const governanceSummarizerModel=document.getElementById('governanceSummarizerModel');` +
      `const governanceSemanticEnabled=document.getElementById('governanceSemanticEnabled');` +
      `const governanceClassifierModel=document.getElementById('governanceClassifierModel');` +
      `const governanceShadowEnabled=document.getElementById('governanceShadowEnabled');` +
      `const governanceVerifierModel=document.getElementById('governanceVerifierModel');` +
      `const governanceCascadeLevelsList=document.getElementById('governanceCascadeLevelsList');` +
      `const topLevelTriggerIntentSuggestions=document.getElementById('topLevelTriggerIntentSuggestions');` +
      `const topLevelSmartRouterSuggestions=document.getElementById('topLevelSmartRouterSuggestions');` +
      `const topLevelGovernanceSummarizerSuggestions=document.getElementById('topLevelGovernanceSummarizerSuggestions');` +
      `const topLevelGovernanceClassifierSuggestions=document.getElementById('topLevelGovernanceClassifierSuggestions');` +
      `const topLevelGovernanceVerifierSuggestions=document.getElementById('topLevelGovernanceVerifierSuggestions');` +
      `const compiledModelsStatus=document.getElementById('compiledModelsStatus');` +
      `const compiledDiffSummary=document.getElementById('compiledDiffSummary');` +
      `const compiledDiffTableBody=document.querySelector('#compiledDiffTable tbody');` +
      `const referenceImpactSummary=document.getElementById('referenceImpactSummary');` +
      `const referenceImpactTableBody=document.querySelector('#referenceImpactTable tbody');` +
      `const compiledProvidersTableBody=document.querySelector('#compiledProvidersTable tbody');` +
      `const compiledModelMapTableBody=document.querySelector('#compiledModelMapTable tbody');` +
      `const metricsGrid=document.getElementById('metricsGrid');` +
      `const bucketGrid=document.getElementById('bucketGrid');` +
      `const bucketHint=document.getElementById('bucketHint');` +
      `const routeRanking=document.getElementById('routeRanking');` +
      `const modelRanking=document.getElementById('modelRanking');` +
      `const intentRanking=document.getElementById('intentRanking');` +
      `const anomalyList=document.getElementById('anomalyList');` +
      `const saveThresholdsStatus=document.getElementById('saveThresholdsStatus');` +
      `const snapshotStatus=document.getElementById('snapshotStatus');` +
      `const archiveStatus=document.getElementById('archiveStatus');` +
      `const exportTableBody=document.querySelector('#exportTable tbody');` +
      `const scheduleTableBody=document.querySelector('#scheduleTable tbody');` +
      `const archiveTableBody=document.querySelector('#archiveTable tbody');` +
      `const trendTableBody=document.querySelector('#trendTable tbody');` +
      `let currentDraftConfig={};` +
      `let knownModelIds=[];` +
      `let activeValidationHighlight=null;` +
      `const draftPresets={` +
      `  balanced:{ label:'平衡预设', description:'启用 SmartRouter，并填充平衡/快速候选模型组合。', affects:['Router.default','SmartRouter.enabled','SmartRouter.candidates'], routerDefault:'sonnet', smartEnabled:true, smartCandidates:[{ model:'sonnet', description:'balanced default' },{ model:'haiku', description:'fast lightweight' }] },` +
      `  fast:{ label:'快速预设', description:'默认走轻量模型，并添加一条快速响应 TriggerRule。', affects:['Router.default','TriggerRouter.enabled','TriggerRouter.rules'], routerDefault:'haiku', triggerEnabled:true, triggerRules:[{ name:'quick-response', enabled:true, priority:20, model:'haiku', patterns:[{ type:'exact', keywords:['快速处理','快速回答'] }] }] },` +
      `  governance:{ label:'治理预设', description:'打开治理核心能力，并填入 summarizer/classifier/verifier 示例模型。', affects:['Governance.enabled','Governance.sticky.alignment','Governance.semantic','Governance.shadow'], governanceEnabled:true, governanceAlignmentEnabled:true, governanceSemanticEnabled:true, governanceShadowEnabled:true, governanceSummarizerModel:'sonnet', governanceClassifierModel:'sonnet', governanceVerifierModel:'haiku' }` +
      `};` +
      `const modelProviderTemplates={` +
      `  openai:{ label:'OpenAI', protocol:'openai', api_base_url:'https://api.openai.com/v1/chat/completions', default_model:'gpt-5', model_examples:['gpt-5','gpt-5-mini','gpt-4.1'] },` +
      `  anthropic:{ label:'Anthropic', protocol:'anthropic', api_base_url:'https://api.anthropic.com/v1/messages', default_model:'claude-sonnet-4-5', model_examples:['claude-sonnet-4-5','claude-opus-4-1','claude-3-5-haiku-latest'] },` +
      `  openrouter:{ label:'OpenRouter', protocol:'openai', api_base_url:'https://openrouter.ai/api/v1/chat/completions', default_model:'anthropic/claude-sonnet-4', model_examples:['anthropic/claude-sonnet-4','openai/gpt-5','google/gemini-2.5-pro'] },` +
      `  deepseek:{ label:'DeepSeek', protocol:'openai', api_base_url:'https://api.deepseek.com/chat/completions', default_model:'deepseek-chat', model_examples:['deepseek-chat','deepseek-reasoner'] },` +
      `  siliconflow:{ label:'SiliconFlow', protocol:'openai', api_base_url:'https://api.siliconflow.cn/v1/chat/completions', default_model:'Qwen/Qwen3-32B', model_examples:['Qwen/Qwen3-32B','deepseek-ai/DeepSeek-V3','THUDM/GLM-4-9B-Chat'] }` +
      `};` +
      `function esc(v){return String(v ?? '').replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));}` +
      `function pct(v){return (Number(v || 0) * 100).toFixed(1)+'%';}` +
      `function fmt(v){return Number(v || 0).toFixed(2);}` +
      `function shortTime(v){ const d=new Date(v); return d.toISOString().slice(11,16); }` +
      `function getModelIdSuggestionsMarkup(idPrefix){` +
      `  return '<datalist id=\"'+idPrefix+'\">'+knownModelIds.map(modelId=>'<option value=\"'+esc(modelId)+'\"></option>').join('')+'</datalist>';` +
      `}` +
      `function resolvePresetModelId(seed){` +
      `  const source=String(seed || '').trim().toLowerCase();` +
      `  if(!source || !knownModelIds.length){ return seed; }` +
      `  if(knownModelIds.includes(seed)){ return seed; }` +
      `  const ranked=knownModelIds.map((modelId)=>{` +
      `    const target=String(modelId || '').toLowerCase();` +
      `    let score=0;` +
      `    if(target===source){ score+=100; }` +
      `    if(target.includes(source) || source.includes(target)){ score+=40; }` +
      `    source.split(/[^a-z0-9]+/).filter(Boolean).forEach((part)=>{ if(target.includes(part)){ score+=Math.min(part.length * 4, 24); } });` +
      `    return { modelId, score };` +
      `  }).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score || a.modelId.localeCompare(b.modelId));` +
      `  return ranked.length ? ranked[0].modelId : seed;` +
      `}` +
      `function getTriggerPatternValidationHint(pattern){` +
      `  if((pattern?.type || 'exact') === 'regex'){` +
      `    return pattern?.pattern ? { level:'ok', message:'regex pattern 已配置' } : { level:'warn', message:'regex 模式需要填写 pattern' };` +
      `  }` +
      `  return Array.isArray(pattern?.keywords) && pattern.keywords.some((keyword)=>String(keyword || '').trim()) ? { level:'ok', message:'exact keywords 已配置' } : { level:'warn', message:'exact 模式至少需要一个 keyword' };` +
      `}` +
      `function renderDraftSummary(config){` +
      `  const models=Array.isArray(config?.Models) ? config.Models : [];` +
      `  const triggerRules=Array.isArray(config?.TriggerRouter?.rules) ? config.TriggerRouter.rules : [];` +
      `  const patternCount=triggerRules.reduce((sum,rule)=>sum + (Array.isArray(rule.patterns) ? rule.patterns.length : 0),0);` +
      `  const smartCandidates=Array.isArray(config?.SmartRouter?.candidates) ? config.SmartRouter.candidates : [];` +
      `  const cascadeLevels=Array.isArray(config?.Governance?.cascade?.levels) ? config.Governance.cascade.levels : [];` +
      `  const modelRefCount=[config?.Router?.default, config?.TriggerRouter?.intent_model, config?.SmartRouter?.router_model, config?.Governance?.sticky?.alignment?.summarizer_model, config?.Governance?.semantic?.classifier_model, config?.Governance?.shadow?.verifier_model].filter(v=>typeof v === 'string' && v.trim()).length + triggerRules.filter(rule=>rule?.model).length + smartCandidates.filter(item=>item?.model).length + cascadeLevels.reduce((sum,level)=>sum + (level?.from ? 1 : 0) + (level?.to ? 1 : 0), 0);` +
      `  draftSummaryGrid.innerHTML=[` +
      "    ['Models', models.length]," +
      "    ['Trigger rules', triggerRules.length]," +
      "    ['Patterns', patternCount]," +
      "    ['Smart candidates', smartCandidates.length]," +
      "    ['Cascade levels', cascadeLevels.length]," +
      "    ['Model refs', modelRefCount]" +
      `  ].map(([label,value])=>'<div class=\"stat\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
      `}` +
      `function renderDraftValidation(errors){` +
      `  const list=Array.isArray(errors) ? errors.filter(Boolean) : [];` +
      `  if(!list.length){ draftValidationList.innerHTML='<div class="alert info"><strong>No validation issues</strong><div class="muted">当前草稿未发现集中展示的问题</div></div>'; return; }` +
      `  const extractPath=(text)=>{ const match=String(text).match(/^(Models(?:\\[[0-9]+\\])?(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|Router(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|TriggerRouter(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|SmartRouter(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?|Governance(?:\\.[A-Za-z0-9_\\[\\]\\.]+)?)/); return match ? match[1] : ''; };` +
      `  const grouped=list.reduce((acc,item)=>{` +
      `    const text=String(item);` +
      `    const bucket=text.startsWith('Models') ? 'Models' : text.startsWith('Router') ? 'Router' : text.startsWith('TriggerRouter') ? 'TriggerRouter' : text.startsWith('SmartRouter') ? 'SmartRouter' : text.startsWith('Governance') ? 'Governance' : text.startsWith('JSON parse error') ? 'Draft JSON' : 'Other';` +
      `    acc[bucket]=acc[bucket] || [];` +
      `    acc[bucket].push({ text, path: extractPath(text) });` +
      `    return acc;` +
      `  }, {});` +
      `  draftValidationList.innerHTML=Object.entries(grouped).map(([bucket,items])=>'<div class="alert warn"><div class="row"><strong>'+esc(bucket)+'</strong><span class="pill">'+esc(items.length)+' issues</span></div><div>'+items.slice(0,4).map(item=>'<div>'+(item.path ? ('<button type="button" class="pill" data-validation-path=\"'+esc(item.path)+'\">'+esc(item.path)+'</button> ') : '')+esc(item.text)+'</div>').join('')+'</div></div>').join('');` +
      `}` +
      `function findValidationTarget(path){` +
      `  if(!path){ return null; }` +
      `  if(path.startsWith('Models')){ return modelsFormGrid; }` +
      `  if(path === 'Router.default'){ return draftRouterDefault; }` +
      `  if(path.startsWith('TriggerRouter.intent_model')){ return triggerIntentModel; }` +
      `  if(path.startsWith('TriggerRouter.rules[')){ return triggerRulesList; }` +
      `  if(path.startsWith('SmartRouter.router_model')){ return smartRouterModel; }` +
      `  if(path.startsWith('SmartRouter.candidates[')){ return smartCandidatesList; }` +
      `  if(path.startsWith('Governance.cascade.levels[')){ return governanceCascadeLevelsList; }` +
      `  if(path.startsWith('Governance.sticky.alignment')){ return governanceSummarizerModel; }` +
      `  if(path.startsWith('Governance.semantic')){ return governanceClassifierModel; }` +
      `  if(path.startsWith('Governance.shadow')){ return governanceVerifierModel; }` +
      `  if(path.startsWith('Governance')){ return governanceEnabled; }` +
      `  return null;` +
      `}` +
      `function jumpToValidationPath(path){` +
      `  const target=findValidationTarget(path);` +
      `  if(!target || typeof target.scrollIntoView !== 'function'){ return; }` +
      `  if(activeValidationHighlight && activeValidationHighlight.classList){ activeValidationHighlight.classList.remove('jump-highlight'); }` +
      `  target.scrollIntoView({ behavior:'smooth', block:'center' });` +
      `  if(target.classList){ target.classList.add('jump-highlight'); activeValidationHighlight=target; setTimeout(()=>{ if(target.classList){ target.classList.remove('jump-highlight'); if(activeValidationHighlight===target){ activeValidationHighlight=null; } } }, 1800); }` +
      `  if(typeof target.focus === 'function'){ target.focus({ preventScroll:true }); }` +
      `}` +
      `function renderDraftPresetModeHint(){` +
      `  const overwriteMode=draftPresetMode.value === 'replace';` +
      `  draftPresetModeHint.textContent=overwriteMode ? 'overwrite 会重置 TriggerRouter / SmartRouter / Governance 相关表单，再应用预设' : 'append / merge 会尽量保留当前草稿，仅补充预设相关字段';` +
      `}` +
      `function renderDraftPresetGuide(){` +
      `  draftPresetList.innerHTML=Object.entries(draftPresets).map(([key,preset])=>'<div class="alert info"><strong>'+esc(preset.label || key)+'</strong><div>'+esc(preset.description || '')+'</div><div class="muted">影响范围：'+esc((preset.affects || []).join(' / '))+'</div></div>').join('');` +
      `}` +
      `function updateTopLevelModelSuggestionLists(){` +
      `  const markup=knownModelIds.map(modelId=>'<option value=\"'+esc(modelId)+'\"></option>').join('');` +
      `  [topLevelTriggerIntentSuggestions,topLevelSmartRouterSuggestions,topLevelGovernanceSummarizerSuggestions,topLevelGovernanceClassifierSuggestions,topLevelGovernanceVerifierSuggestions].forEach(node=>{ if(node){ node.innerHTML=markup; } });` +
      `}` +
      `function renderModelsForm(models){` +
      `  const list=Array.isArray(models) ? models : [];` +
      `  draftModelsCount.value=String(list.length);` +
      `  if(!list.length){ modelsFormGrid.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No draft models loaded yet</span></div>'; return; }` +
      `  modelsFormGrid.innerHTML=list.map((model,index)=>'<div class="model-card" data-model-card=\"'+index+'\">' +` +
      `    '<div class="model-card-header"><strong>Model #'+(index+1)+'</strong><button type="button" data-remove-model=\"'+index+'\">删除</button></div>' +` +
      `    '<div class="model-card-grid">' +` +
      `      '<div><label>Provider template</label><div class="row"><select data-field=\"provider_template\" data-index=\"'+index+'\"><option value=\"\">custom</option>'+Object.entries(modelProviderTemplates).map(([key,item])=>'<option value=\"'+esc(key)+'\"'+(model.provider_template === key ? ' selected' : '')+'>'+esc(item.label)+'</option>').join('')+'</select><button type="button" data-apply-template=\"'+index+'\">应用</button></div></div>' +` +
      `      '<div><label>ID</label><input data-field=\"id\" data-index=\"'+index+'\" value=\"'+esc(model.id || '')+'\" placeholder=\"sonnet\"></div>' +` +
      `      '<div><label>Protocol</label><select data-field=\"protocol\" data-index=\"'+index+'\"><option value=\"openai\"'+((model.protocol || 'openai') === 'openai' ? ' selected' : '')+'>openai</option><option value=\"anthropic\"'+(model.protocol === 'anthropic' ? ' selected' : '')+'>anthropic</option></select></div>' +` +
      `      '<div><label>Model</label><input data-field=\"model\" data-index=\"'+index+'\" list=\"modelSuggestions'+index+'\" value=\"'+esc(model.model || '')+'\" placeholder=\"'+esc(modelProviderTemplates[model.provider_template || 'openrouter']?.default_model || 'anthropic/claude-sonnet-4')+'\"><datalist id=\"modelSuggestions'+index+'\">'+((modelProviderTemplates[model.provider_template || '']?.model_examples || []).map(item=>'<option value=\"'+esc(item)+'\"></option>').join(''))+'</datalist><div class="muted">例如：'+esc((modelProviderTemplates[model.provider_template || '']?.model_examples || ['anthropic/claude-sonnet-4']).join(' / '))+'</div></div>' +` +
      `      '<div><label>API base URL</label><input data-field=\"api_base_url\" data-index=\"'+index+'\" value=\"'+esc(model.api_base_url || '')+'\" placeholder=\"https://...\"></div>' +` +
      `      '<div><label>API key</label><input data-field=\"api_key\" data-index=\"'+index+'\" value=\"'+esc(model.api_key || '')+'\" placeholder=\"sk-...\"></div>' +` +
      `      '<div><label>Thinking mode</label><select data-field=\"thinking_mode\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"off\"'+(model.thinking?.mode === 'off' ? ' selected' : '')+'>off</option><option value=\"auto\"'+(model.thinking?.mode === 'auto' ? ' selected' : '')+'>auto</option><option value=\"on\"'+(model.thinking?.mode === 'on' ? ' selected' : '')+'>on</option></select></div>' +` +
      `      '<div><label>Thinking effort</label><select data-field=\"thinking_effort\" data-index=\"'+index+'\"><option value=\"\">default</option><option value=\"low\"'+(model.thinking?.effort === 'low' ? ' selected' : '')+'>low</option><option value=\"medium\"'+(model.thinking?.effort === 'medium' ? ' selected' : '')+'>medium</option><option value=\"high\"'+(model.thinking?.effort === 'high' ? ' selected' : '')+'>high</option></select></div>' +` +
      `      '<div><label>Thinking budget</label><input data-field=\"thinking_budget_tokens\" data-index=\"'+index+'\" value=\"'+esc(model.thinking?.budget_tokens || '')+'\" placeholder=\"1024\"></div>' +` +
      `      '<div style=\"grid-column:1/-1\"><label>Metadata (JSON)</label><textarea data-field=\"metadata\" data-index=\"'+index+'\" placeholder=\"{\\\"vendor\\\":\\\"openrouter\\\"}\">'+esc(model.metadata ? JSON.stringify(model.metadata, null, 2) : '')+'</textarea></div>' +` +
      `    '</div>' +` +
      `  '</div>').join('');` +
      `}` +
      `function extractModelsFromForm(){` +
      `  const cards=Array.from(modelsFormGrid.querySelectorAll('[data-model-card]'));` +
      `  return cards.map((card,index)=>{` +
      `    const read=(field)=>card.querySelector('[data-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
      `    const providerTemplate=(read('provider_template')?.value || '').trim();` +
      `    const metadataRaw=(read('metadata')?.value || '').trim();` +
      `    let metadata;` +
      `    if(metadataRaw){ metadata=JSON.parse(metadataRaw); }` +
      `    const thinking={};` +
      `    const mode=(read('thinking_mode')?.value || '').trim();` +
      `    const effort=(read('thinking_effort')?.value || '').trim();` +
      `    const budget=(read('thinking_budget_tokens')?.value || '').trim();` +
      `    if(mode) thinking.mode=mode;` +
      `    if(effort) thinking.effort=effort;` +
      `    if(budget) thinking.budget_tokens=Number(budget);` +
      `    const model={` +
      `      id:(read('id')?.value || '').trim(),` +
      `      api_base_url:(read('api_base_url')?.value || '').trim(),` +
      `      api_key:(read('api_key')?.value || '').trim(),` +
      `      protocol:(read('protocol')?.value || '').trim(),` +
      `      model:(read('model')?.value || '').trim(),` +
      `    };` +
      `    if(providerTemplate){ model.provider_template=providerTemplate; }` +
      `    if(Object.keys(thinking).length){ model.thinking=thinking; }` +
      `    if(metadata !== undefined){ model.metadata=metadata; }` +
      `    return model;` +
      `  });` +
      `}` +
      `function applyProviderTemplate(index){` +
      `  const card=modelsFormGrid.querySelector('[data-model-card=\"'+index+'\"]');` +
      `  if(!card){ return; }` +
      `  const templateKey=(card.querySelector('[data-field=\"provider_template\"][data-index=\"'+index+'\"]')?.value || '').trim();` +
      `  const template=modelProviderTemplates[templateKey];` +
      `  if(!template){ return; }` +
      `  const protocol=card.querySelector('[data-field=\"protocol\"][data-index=\"'+index+'\"]');` +
      `  const apiBaseUrl=card.querySelector('[data-field=\"api_base_url\"][data-index=\"'+index+'\"]');` +
      `  const modelInput=card.querySelector('[data-field=\"model\"][data-index=\"'+index+'\"]');` +
      `  if(protocol){ protocol.value=template.protocol; }` +
      `  if(apiBaseUrl && !apiBaseUrl.value.trim()){ apiBaseUrl.value=template.api_base_url; } else if(apiBaseUrl){ apiBaseUrl.value=template.api_base_url; }` +
      `  if(modelInput){ modelInput.placeholder=template.default_model || modelInput.placeholder; if(!modelInput.value.trim() && template.default_model){ modelInput.value=template.default_model; } }` +
      `  const nextModels=extractModelsFromForm();` +
      `  if(nextModels[index]){ nextModels[index]={ ...nextModels[index], provider_template: templateKey }; }` +
      `  renderModelsForm(nextModels);` +
      `}` +
      `function renderTriggerRulesList(rules){` +
      `  const list=Array.isArray(rules) ? rules : [];` +
      `  if(!list.length){ triggerRulesList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No trigger rules yet</span></div>'; return; }` +
      `  triggerRulesList.innerHTML=list.map((rule,index)=>'<div class="list-item" data-trigger-rule=\"'+index+'\">' +` +
      `    '<div class="action-row"><strong>Rule #'+(index+1)+'</strong><button type="button" data-remove-trigger-rule=\"'+index+'\">删除</button></div>' +` +
      `    '<div class="list-item-grid">' +` +
      `      '<div><label>Name</label><input data-trigger-field=\"name\" data-index=\"'+index+'\" value=\"'+esc(rule.name || '')+'\"></div>' +` +
      `      '<div><label>Model</label><input data-trigger-field=\"model\" data-index=\"'+index+'\" list=\"triggerModelSuggestions'+index+'\" value=\"'+esc(rule.model || '')+'\">'+getModelIdSuggestionsMarkup('triggerModelSuggestions'+index)+'</div>' +` +
      `      '<div><label>Priority</label><input data-trigger-field=\"priority\" data-index=\"'+index+'\" value=\"'+esc(rule.priority ?? 10)+'\"></div>' +` +
      `      '<div><label><input type=\"checkbox\" data-trigger-field=\"enabled\" data-index=\"'+index+'\"'+(rule.enabled === false ? '' : ' checked')+'> Enabled</label></div>' +` +
      `      '<div style=\"grid-column:1/-1\"><label>Description</label><input data-trigger-field=\"description\" data-index=\"'+index+'\" value=\"'+esc(rule.description || '')+'\"></div>' +` +
      `    '</div>' +` +
      `    '<div class=\"action-row\" style=\"margin-top:.75rem\"><strong>Patterns</strong><button type=\"button\" data-add-trigger-pattern=\"'+index+'\">新增 Pattern</button></div>' +` +
      `    '<div class=\"list-editor\">'+(((rule.patterns || []).length ? rule.patterns : [{ type:'exact', keywords:[] }]).map((pattern,patternIndex)=>'<div class=\"list-item\" data-trigger-pattern=\"'+index+'-'+patternIndex+'\">' +` +
      `      '<div class=\"action-row\"><span class=\"muted\">Pattern #'+(patternIndex+1)+'</span><span class=\"pill\">'+esc(pattern.type || 'exact')+'</span><span class=\"muted\">'+esc(getTriggerPatternValidationHint(pattern).message)+'</span><button type=\"button\" data-remove-trigger-pattern=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\">删除</button></div>' +` +
      `      '<div class=\"list-item-grid\">' +` +
      `        '<div><label>Type</label><select data-trigger-pattern-field=\"type\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"><option value=\"exact\"'+(pattern.type !== 'regex' ? ' selected' : '')+'>exact</option><option value=\"regex\"'+(pattern.type === 'regex' ? ' selected' : '')+'>regex</option></select></div>' +` +
      `        '<div><label><input type=\"checkbox\" data-trigger-pattern-field=\"caseSensitive\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"'+(pattern.caseSensitive ? ' checked' : '')+'> Case sensitive</label></div>' +` +
      `        '<div style=\"grid-column:1/-1\"><div class=\"action-row\"><label>Keywords</label><button type=\"button\" data-add-trigger-keyword=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\"'+(pattern.type === 'regex' ? ' disabled' : '')+'>新增 Keyword</button></div><div class=\"list-editor\">'+((((pattern.keywords || []).length ? pattern.keywords : ['']).map((keyword,keywordIndex)=>'<div class=\"list-item\" data-trigger-keyword=\"'+index+'-'+patternIndex+'-'+keywordIndex+'\"><div class=\"action-row\"><span class=\"muted\">Keyword #'+(keywordIndex+1)+'</span><button type=\"button\" data-remove-trigger-keyword=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" data-keyword-index=\"'+keywordIndex+'\"'+(pattern.type === 'regex' ? ' disabled' : '')+'>删除</button></div><input data-trigger-pattern-field=\"keyword_item\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" data-keyword-index=\"'+keywordIndex+'\" value=\"'+esc(keyword || '')+'\" placeholder=\"keyword\"'+(pattern.type === 'regex' ? ' disabled' : '')+'></div>')).join(''))+'</div><div class=\"muted\">'+(pattern.type === 'regex' ? 'regex 模式下忽略 keywords' : 'exact 模式下按关键词列表匹配')+'</div></div>' +` +
      `        '<div style=\"grid-column:1/-1\"><label>Regex pattern</label><input data-trigger-pattern-field=\"pattern\" data-index=\"'+index+'\" data-pattern-index=\"'+patternIndex+'\" value=\"'+esc(pattern.pattern || '')+'\" placeholder=\"error|exception\"'+(pattern.type === 'regex' ? '' : ' disabled')+'><div class=\"muted\">'+(pattern.type === 'regex' ? 'regex 模式下使用正则表达式匹配' : 'exact 模式下忽略 regex pattern')+'</div></div>' +` +
      `      '</div>' +` +
      `    '</div>').join(''))+'</div>' +` +
      `  '</div>').join('');` +
      `}` +
      `function extractTriggerRulesFromForm(){` +
      `  return Array.from(triggerRulesList.querySelectorAll('[data-trigger-rule]')).map((card,index)=>{` +
      `    const read=(field)=>card.querySelector('[data-trigger-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
      `    const patterns=Array.from(card.querySelectorAll('[data-trigger-pattern]')).map((patternCard,patternIndex)=>{` +
      `      const patternRead=(field)=>patternCard.querySelector('[data-trigger-pattern-field=\"'+field+'\"][data-index=\"'+index+'\"][data-pattern-index=\"'+patternIndex+'\"]');` +
      `      const type=(patternRead('type')?.value || 'exact').trim();` +
      `      const pattern={ type, caseSensitive:Boolean(patternRead('caseSensitive')?.checked) };` +
      `      const keywords=Array.from(patternCard.querySelectorAll('[data-trigger-pattern-field=\"keyword_item\"][data-index=\"'+index+'\"][data-pattern-index=\"'+patternIndex+'\"]')).map((node)=>node.value.trim()).filter(Boolean);` +
      `      const regexPattern=(patternRead('pattern')?.value || '').trim();` +
      `      if(type === 'regex'){ if(regexPattern){ pattern.pattern=regexPattern; } } else if(keywords.length){ pattern.keywords=keywords; }` +
      `      return pattern;` +
      `    });` +
      `    const rule={ name:(read('name')?.value || '').trim(), model:(read('model')?.value || '').trim(), priority:Number(read('priority')?.value || 10), enabled:Boolean(read('enabled')?.checked), patterns };` +
      `    const description=(read('description')?.value || '').trim(); if(description){ rule.description=description; } return rule;` +
      `  });` +
      `}` +
      `function renderSmartCandidatesList(candidates){` +
      `  const list=Array.isArray(candidates) ? candidates : [];` +
      `  if(!list.length){ smartCandidatesList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No smart candidates yet</span></div>'; return; }` +
      `  smartCandidatesList.innerHTML=list.map((candidate,index)=>'<div class="list-item" data-smart-candidate=\"'+index+'\">' +` +
      `    '<div class="action-row"><strong>Candidate #'+(index+1)+'</strong><button type="button" data-remove-smart-candidate=\"'+index+'\">删除</button></div>' +` +
      `    '<div class="list-item-grid">' +` +
      `      '<div><label>Model</label><input data-smart-field=\"model\" data-index=\"'+index+'\" list=\"smartModelSuggestions'+index+'\" value=\"'+esc(candidate.model || '')+'\">'+getModelIdSuggestionsMarkup('smartModelSuggestions'+index)+'</div>' +` +
      `      '<div style=\"grid-column:1/-1\"><label>Description</label><input data-smart-field=\"description\" data-index=\"'+index+'\" value=\"'+esc(candidate.description || '')+'\"></div>' +` +
      `    '</div>' +` +
      `  '</div>').join('');` +
      `}` +
      `function extractSmartCandidatesFromForm(){` +
      `  return Array.from(smartCandidatesList.querySelectorAll('[data-smart-candidate]')).map((card,index)=>{` +
      `    const read=(field)=>card.querySelector('[data-smart-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
      `    return { model:(read('model')?.value || '').trim(), description:(read('description')?.value || '').trim() };` +
      `  });` +
      `}` +
      `function renderCascadeLevelsList(levels){` +
      `  const list=Array.isArray(levels) ? levels : [];` +
      `  if(!list.length){ governanceCascadeLevelsList.innerHTML='<div class="panel" style="margin-bottom:0"><span class="muted">No cascade levels yet</span></div>'; return; }` +
      `  governanceCascadeLevelsList.innerHTML=list.map((level,index)=>'<div class="list-item" data-cascade-level=\"'+index+'\">' +` +
      `    '<div class="action-row"><strong>Level #'+(index+1)+'</strong><button type="button" data-remove-cascade-level=\"'+index+'\">删除</button></div>' +` +
      `    '<div class="list-item-grid">' +` +
      `      '<div><label>From</label><input data-cascade-field=\"from\" data-index=\"'+index+'\" list=\"cascadeFromSuggestions'+index+'\" value=\"'+esc(level.from || '')+'\">'+getModelIdSuggestionsMarkup('cascadeFromSuggestions'+index)+'</div>' +` +
      `      '<div><label>To</label><input data-cascade-field=\"to\" data-index=\"'+index+'\" list=\"cascadeToSuggestions'+index+'\" value=\"'+esc(level.to || '')+'\">'+getModelIdSuggestionsMarkup('cascadeToSuggestions'+index)+'</div>' +` +
      `      '<div style=\"grid-column:1/-1\"><label>Reason</label><input data-cascade-field=\"reason\" data-index=\"'+index+'\" value=\"'+esc(level.reason || '')+'\"></div>' +` +
      `    '</div>' +` +
      `  '</div>').join('');` +
      `}` +
      `function extractCascadeLevelsFromForm(){` +
      `  return Array.from(governanceCascadeLevelsList.querySelectorAll('[data-cascade-level]')).map((card,index)=>{` +
      `    const read=(field)=>card.querySelector('[data-cascade-field=\"'+field+'\"][data-index=\"'+index+'\"]');` +
      `    const level={ from:(read('from')?.value || '').trim(), to:(read('to')?.value || '').trim() };` +
      `    const reason=(read('reason')?.value || '').trim(); if(reason){ level.reason=reason; } return level;` +
      `  });` +
      `}` +
      `function buildDraftPayloadFromForm(){` +
        `  const payload=JSON.parse(JSON.stringify(currentDraftConfig || {}));` +
        `  payload.Models=extractModelsFromForm();` +
        `  const routerDefault=(draftRouterDefault.value || '').trim();` +
        `  if(routerDefault){ payload.Router={ ...(payload.Router || {}), default: routerDefault }; }` +
        `  else if(payload.Router){ delete payload.Router.default; if(!Object.keys(payload.Router).length){ delete payload.Router; } }` +
      `  const triggerRules=extractTriggerRulesFromForm();` +
      `  if(triggerEnabled.checked || triggerIntentEnabled.checked || triggerIntentModel.value.trim() || triggerRules.length){ payload.TriggerRouter={ ...(payload.TriggerRouter || {}), enabled: triggerEnabled.checked, analysis_scope: triggerAnalysisScope.value || 'last_message', llm_intent_recognition: triggerIntentEnabled.checked, intent_model: triggerIntentModel.value.trim(), rules: triggerRules }; } else { delete payload.TriggerRouter; }` +
      `  const smartCandidates=extractSmartCandidatesFromForm();` +
      `  if(smartEnabled.checked || smartRouterModel.value.trim() || smartCandidates.length || smartCacheTtl.value.trim() || smartMaxTokens.value.trim()){ payload.SmartRouter={ ...(payload.SmartRouter || {}), enabled: smartEnabled.checked, router_model: smartRouterModel.value.trim(), fallback: smartFallback.value || 'default', candidates: smartCandidates, cache_ttl: smartCacheTtl.value.trim() ? Number(smartCacheTtl.value.trim()) : undefined, max_tokens: smartMaxTokens.value.trim() ? Number(smartMaxTokens.value.trim()) : undefined }; } else { delete payload.SmartRouter; }` +
      `  const cascadeLevels=extractCascadeLevelsFromForm();` +
      `  if(governanceEnabled.checked || governanceAlignmentEnabled.checked || governanceSummarizerModel.value.trim() || governanceSemanticEnabled.checked || governanceClassifierModel.value.trim() || governanceShadowEnabled.checked || governanceVerifierModel.value.trim() || cascadeLevels.length){ payload.Governance={ ...(payload.Governance || {}), enabled: governanceEnabled.checked, sticky:{ ...((payload.Governance && payload.Governance.sticky) || {}), enabled: Boolean(governanceEnabled.checked || governanceAlignmentEnabled.checked), alignment:{ ...(((payload.Governance && payload.Governance.sticky && payload.Governance.sticky.alignment) || {})), enabled: governanceAlignmentEnabled.checked, summarizer_model: governanceSummarizerModel.value.trim() } }, semantic:{ ...((payload.Governance && payload.Governance.semantic) || {}), enabled: governanceSemanticEnabled.checked, mode:'classifier', classifier_model: governanceClassifierModel.value.trim() }, shadow:{ ...((payload.Governance && payload.Governance.shadow) || {}), enabled: governanceShadowEnabled.checked, verifier_model: governanceVerifierModel.value.trim() }, cascade:{ ...((payload.Governance && payload.Governance.cascade) || {}), enabled: Boolean(cascadeLevels.length), levels: cascadeLevels } }; } else { delete payload.Governance; }` +
      `  return payload;` +
      `}` +
      `function renderConfigControlForms(config){` +
      `  const trigger=config?.TriggerRouter || {};` +
      `  triggerEnabled.checked=Boolean(trigger.enabled);` +
      `  triggerIntentEnabled.checked=Boolean(trigger.llm_intent_recognition);` +
      `  triggerAnalysisScope.value=trigger.analysis_scope || 'last_message';` +
      `  triggerIntentModel.value=trigger.intent_model || '';` +
      `  renderTriggerRulesList(trigger.rules || []);` +
      `  const smart=config?.SmartRouter || {};` +
      `  smartEnabled.checked=Boolean(smart.enabled);` +
      `  smartRouterModel.value=smart.router_model || '';` +
      `  smartFallback.value=smart.fallback || 'default';` +
      `  smartCacheTtl.value=smart.cache_ttl ?? '';` +
      `  smartMaxTokens.value=smart.max_tokens ?? '';` +
      `  renderSmartCandidatesList(smart.candidates || []);` +
      `  const governance=config?.Governance || {};` +
      `  governanceEnabled.checked=Boolean(governance.enabled);` +
      `  governanceAlignmentEnabled.checked=Boolean(governance.sticky?.alignment?.enabled);` +
      `  governanceSummarizerModel.value=governance.sticky?.alignment?.summarizer_model || '';` +
      `  governanceSemanticEnabled.checked=Boolean(governance.semantic?.enabled);` +
      `  governanceClassifierModel.value=governance.semantic?.classifier_model || '';` +
      `  governanceShadowEnabled.checked=Boolean(governance.shadow?.enabled);` +
      `  governanceVerifierModel.value=governance.shadow?.verifier_model || '';` +
      `  renderCascadeLevelsList(governance.cascade?.levels || []);` +
      `}` +
      `function syncDraftEditorFromForm(){` +
      `  try {` +
      `    const payload=buildDraftPayloadFromForm();` +
      `    currentDraftConfig=payload;` +
      `    configDraftEditor.value=JSON.stringify(payload,null,2);` +
      `    renderDraftSummary(payload);` +
      `    renderDraftValidation([]);` +
      `    draftPreviewStatus.textContent='已同步 Models 表单到 JSON 草稿';` +
      `  } catch (error) {` +
      `    draftPreviewStatus.textContent='同步失败：'+error.message;` +
      `  }` +
      `}` +
      `function applyReferenceSuggestion(path,modelId){` +
      `  if(!modelId){ return; }` +
      `  if(path==='Router.default'){ draftRouterDefault.value=modelId; syncDraftEditorFromForm(); draftPreviewStatus.textContent='已将建议模型应用到 Router.default'; return; }` +
      `  const payload=JSON.parse(JSON.stringify(currentDraftConfig || {}));` +
      `  const pathMatch=path.match(/^([^.\[]+)(?:\.(.+))?$/);` +
      `  if(!pathMatch){ draftPreviewStatus.textContent='暂不支持自动修复：'+path; return; }` +
      `  const tokens=path.replace(/\[(\d+)\]/g,'.$1').split('.');` +
      `  let cursor=payload;` +
      `  for(let i=0;i<tokens.length-1;i++){` +
      `    const token=tokens[i];` +
      `    const nextToken=tokens[i+1];` +
      `    if(cursor[token] === undefined){ cursor[token]=String(Number(nextToken))===nextToken ? [] : {}; }` +
      `    cursor=cursor[token];` +
      `  }` +
      `  cursor[tokens[tokens.length-1]]=modelId;` +
      `  currentDraftConfig=payload;` +
      `  if(payload.Router?.default){ draftRouterDefault.value=payload.Router.default; }` +
      `  renderConfigControlForms(payload);` +
      `  configDraftEditor.value=JSON.stringify(payload,null,2);` +
      `  renderDraftSummary(payload);` +
      `  renderDraftValidation([]);` +
      `  draftPreviewStatus.textContent='已将建议模型应用到 '+path+'，可重新预览验证';` +
      `}` +
      `function renderCompiledDiff(diff){` +
      `  const summary=diff?.summary || {};` +
      `  compiledDiffSummary.innerHTML=[` +
      "    ['Added providers', summary.addedProviders ?? 0]," +
      "    ['Removed providers', summary.removedProviders ?? 0]," +
      "    ['Changed providers', summary.changedProviders ?? 0]," +
      "    ['Added models', summary.addedModels ?? 0]," +
      "    ['Removed models', summary.removedModels ?? 0]," +
      "    ['Changed models', summary.changedModels ?? 0]" +
      `  ].map(([label,value])=>'<div class=\"diff-chip\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
      `  const rows=[` +
      `    ...((diff?.providerChanges || []).map(item=>({ scope:'provider', key:item.name, type:item.type, fields:item.fields || [], target:item.after || item.before || {} }))),` +
      `    ...((diff?.modelChanges || []).map(item=>({ scope:'model', key:item.modelId, type:item.type, fields:item.fields || [], target:item.after || item.before || {} }))),` +
      `  ];` +
      `  compiledDiffTableBody.innerHTML=rows.length ? rows.map(item=>'<tr>' +` +
      `    '<td>'+esc(item.scope)+'</td>' +` +
      `    '<td>'+esc(item.type)+'</td>' +` +
      `    '<td><code>'+esc(item.key)+'</code></td>' +` +
      `    '<td>'+esc(item.fields.join(', ') || '-')+'</td>' +` +
      `    '<td><code>'+esc(item.target.providerName || item.target.name || '-')+'</code><div class="muted">'+esc(item.target.modelName || (item.target.models || []).join(', ') || '-')}</div></td>' +` +
      `  '</tr>').join('') : '<tr><td colspan="5" class="muted">No compiled registry changes</td></tr>';` +
      `}` +
      `function renderReferenceImpact(impact){` +
      `  const summary=impact?.summary || {};` +
      `  referenceImpactSummary.innerHTML=[` +
      "    ['Total refs', summary.total ?? 0]," +
      "    ['modelId refs', summary.modelIdRefs ?? 0]," +
      "    ['Legacy refs', summary.legacyRefs ?? 0]," +
      "    ['Valid modelIds', summary.validModelIds ?? 0]," +
      "    ['Missing modelIds', summary.missingModelIds ?? 0]" +
      `  ].map(([label,value])=>'<div class=\"diff-chip\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
      `  const entries=impact?.entries || [];` +
      `  referenceImpactTableBody.innerHTML=entries.length ? entries.map(item=>'<tr>' +` +
      `    '<td><code>'+esc(item.path)+'</code></td>' +` +
      `    '<td><code>'+esc(item.value)+'</code></td>' +` +
      `    '<td>'+esc(item.referenceType)+'</td>' +` +
      `    '<td>'+esc(item.status)+'</td>' +` +
      `    '<td><code>'+esc(item.resolvedTarget?.providerName || '-')+'</code><div class="muted">'+esc(item.resolvedTarget?.modelName || '-')}</div></td>' +` +
      `    '<td>'+((item.suggestions || []).length ? item.suggestions.map(s=>'<div><code>'+esc(s.modelId)+'</code><div class="muted">'+esc(s.modelName || '-')+'</div><button type="button" data-apply-reference-path=\"'+esc(item.path)+'\" data-apply-reference-model=\"'+esc(s.modelId)+'\">应用建议</button></div>').join('') : '<span class="muted">-</span>')+'</td>' +` +
      `  '</tr>').join('') : '<tr><td colspan="6" class="muted">No model references found</td></tr>';` +
      `}` +
      `function renderCompiledModels(data){` +
      `  const providers=Array.isArray(data.providers) ? data.providers : [];` +
      `  const modelMapEntries=Object.entries(data.modelMap || {});` +
      `  knownModelIds=modelMapEntries.map(([modelId])=>modelId).sort();` +
      `  updateTopLevelModelSuggestionLists();` +
      `  compiledModelsStatus.textContent='已加载 '+providers.length+' 个 compiled provider / '+modelMapEntries.length+' 个 modelId 映射';` +
      `  compiledProvidersTableBody.innerHTML=providers.length ? providers.map(provider=>'<tr>' +` +
      `    '<td><code>'+esc(provider.name)+'</code><div class="muted">'+esc(provider.api_base_url || '-')+'</div></td>' +` +
      `    '<td>'+esc(provider.transformer?.use?.[0] || '-')+'</td>' +` +
      `    '<td>'+esc((provider.models || []).join(', ') || '-')+'</td>' +` +
      `    '<td>'+esc(JSON.stringify(provider.transformer || {}))+'</td>' +` +
      `    '<td>'+esc(provider.has_api_key ? 'configured' : 'missing')+'</td>' +` +
      `  '</tr>').join('') : '<tr><td colspan="5" class="muted">No compiled providers</td></tr>';` +
      `  compiledModelMapTableBody.innerHTML=modelMapEntries.length ? modelMapEntries.map(([modelId,item])=>'<tr>' +` +
      `    '<td><code>'+esc(modelId)+'</code></td>' +` +
      `    '<td><code>'+esc(item.providerName || '-')+'</code><div class="muted">'+esc(item.modelName || '-')+'</div></td>' +` +
      `    '<td>'+esc(item.protocol || '-')+'</td>' +` +
      `    '<td><code>'+esc(JSON.stringify(item.thinking || { mode: 'off' }))+'</code></td>' +` +
      `    '<td>'+esc(item.source || '-')+'</td>' +` +
      `  '</tr>').join('') : '<tr><td colspan="5" class="muted">No compiled model map</td></tr>';` +
      `  if(data.diff){ renderCompiledDiff(data.diff); }` +
      `  if(data.referenceImpact){ renderReferenceImpact(data.referenceImpact); }` +
      `  renderConfigControlForms(currentDraftConfig);` +
      `}` +
      `async function loadConfigDraft(){` +
      `  draftPreviewStatus.textContent='加载当前配置中...';` +
      `  const res=await fetch('/api/config');` +
      `  const data=await res.json();` +
      `  currentDraftConfig=data || {};` +
      `  renderModelsForm(currentDraftConfig.Models || []);` +
      `  renderConfigControlForms(currentDraftConfig);` +
      `  draftRouterDefault.value=currentDraftConfig.Router?.default || '';` +
      `  configDraftEditor.value=JSON.stringify(data,null,2);` +
      `  renderDraftSummary(currentDraftConfig);` +
      `  renderDraftValidation([]);` +
      `  draftPreviewStatus.textContent='已载入当前配置，可通过 Models 表单或 JSON 草稿编辑';` +
      `}` +
      `async function previewConfigDraft(){` +
      `  let payload;` +
      `  try {` +
      `    payload=buildDraftPayloadFromForm();` +
      `    configDraftEditor.value=JSON.stringify(payload,null,2);` +
      `  } catch (error) {` +
      `    renderDraftValidation(['JSON parse error: '+error.message]);` +
      `    draftPreviewStatus.textContent='草稿解析失败：'+error.message;` +
      `    return;` +
      `  }` +
      `  draftPreviewStatus.textContent='预览编译结果中...';` +
      `  const res=await fetch('/api/models/compiled/preview',{` +
      `    method:'POST',` +
      `    headers:{'Content-Type':'application/json'},` +
      `    body:JSON.stringify(payload)` +
      `  });` +
      `  const data=await res.json();` +
      `  if(!res.ok){` +
      `    draftPreviewStatus.textContent='预览失败：'+((data.errors || []).join('; ') || data.message || 'unknown error');` +
      `    renderDraftValidation(data.errors || [data.message || 'unknown error']);` +
      `    renderCompiledDiff();` +
      `    renderReferenceImpact(data.referenceImpact);` +
      `    return;` +
      `  }` +
      `  renderDraftValidation([]);` +
      `  renderCompiledModels(data);` +
      `  draftPreviewStatus.textContent='预览完成：已按草稿配置刷新 compiled models';` +
      `}` +
      `function addDraftModel(){` +
      `  const nextModels=extractModelsFromForm();` +
      `  nextModels.push({ protocol:'openai', thinking:{ mode:'auto' } });` +
      `  renderModelsForm(nextModels);` +
      `  syncDraftEditorFromForm();` +
      `}` +
      `function addTriggerRule(){ const next=extractTriggerRulesFromForm(); next.push({ name:'', enabled:true, priority:10, model:'', patterns:[{ type:'exact', keywords:[] }] }); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
      `function addTriggerPattern(ruleIndex){ const next=extractTriggerRulesFromForm(); if(!next[ruleIndex]){ return; } next[ruleIndex].patterns = Array.isArray(next[ruleIndex].patterns) ? next[ruleIndex].patterns : []; next[ruleIndex].patterns.push({ type:'exact', keywords:[] }); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
      `function addTriggerKeyword(ruleIndex,patternIndex){ const next=extractTriggerRulesFromForm(); if(!next[ruleIndex] || !next[ruleIndex].patterns || !next[ruleIndex].patterns[patternIndex]){ return; } const pattern=next[ruleIndex].patterns[patternIndex]; pattern.keywords=Array.isArray(pattern.keywords) ? pattern.keywords : []; pattern.keywords.push(''); renderTriggerRulesList(next); syncDraftEditorFromForm(); }` +
      `function addSmartCandidate(){ const next=extractSmartCandidatesFromForm(); next.push({ model:'', description:'' }); renderSmartCandidatesList(next); syncDraftEditorFromForm(); }` +
      `function addCascadeLevel(){ const next=extractCascadeLevelsFromForm(); next.push({ from:'', to:'' }); renderCascadeLevelsList(next); syncDraftEditorFromForm(); }` +
      `modelsFormGrid.addEventListener('input',()=>syncDraftEditorFromForm());` +
      `modelsFormGrid.addEventListener('change',()=>syncDraftEditorFromForm());` +
      `modelsFormGrid.addEventListener('click',(e)=>{ const applyBtn=e.target.closest('button[data-apply-template]'); if(applyBtn){ const applyIndex=Number(applyBtn.dataset.applyTemplate); applyProviderTemplate(applyIndex); syncDraftEditorFromForm(); return; } const btn=e.target.closest('button[data-remove-model]'); if(!btn){ return; } const removeIndex=Number(btn.dataset.removeModel); const nextModels=extractModelsFromForm().filter((_,index)=>index!==removeIndex); renderModelsForm(nextModels); syncDraftEditorFromForm(); });` +
      `triggerRulesList.addEventListener('input',()=>syncDraftEditorFromForm());` +
      `triggerRulesList.addEventListener('change',()=>syncDraftEditorFromForm());` +
      `triggerRulesList.addEventListener('click',(e)=>{ const addKeywordBtn=e.target.closest('button[data-add-trigger-keyword]'); if(addKeywordBtn){ addTriggerKeyword(Number(addKeywordBtn.dataset.addTriggerKeyword), Number(addKeywordBtn.dataset.patternIndex)); return; } const removeKeywordBtn=e.target.closest('button[data-remove-trigger-keyword]'); if(removeKeywordBtn){ const ruleIndex=Number(removeKeywordBtn.dataset.removeTriggerKeyword); const patternIndex=Number(removeKeywordBtn.dataset.patternIndex); const keywordIndex=Number(removeKeywordBtn.dataset.keywordIndex); const next=extractTriggerRulesFromForm(); if(next[ruleIndex] && next[ruleIndex].patterns && next[ruleIndex].patterns[patternIndex]){ const pattern=next[ruleIndex].patterns[patternIndex]; pattern.keywords=(pattern.keywords || []).filter((_,index)=>index!==keywordIndex); if(!pattern.keywords.length){ pattern.keywords=['']; } renderTriggerRulesList(next); syncDraftEditorFromForm(); } return; } const addBtn=e.target.closest('button[data-add-trigger-pattern]'); if(addBtn){ addTriggerPattern(Number(addBtn.dataset.addTriggerPattern)); return; } const removePatternBtn=e.target.closest('button[data-remove-trigger-pattern]'); if(removePatternBtn){ const ruleIndex=Number(removePatternBtn.dataset.removeTriggerPattern); const patternIndex=Number(removePatternBtn.dataset.patternIndex); const next=extractTriggerRulesFromForm(); if(next[ruleIndex]){ next[ruleIndex].patterns=(next[ruleIndex].patterns || []).filter((_,index)=>index!==patternIndex); if(!next[ruleIndex].patterns.length){ next[ruleIndex].patterns=[{ type:'exact', keywords:[] }]; } renderTriggerRulesList(next); syncDraftEditorFromForm(); } return; } const btn=e.target.closest('button[data-remove-trigger-rule]'); if(!btn){ return; } const next=extractTriggerRulesFromForm().filter((_,index)=>index!==Number(btn.dataset.removeTriggerRule)); renderTriggerRulesList(next); syncDraftEditorFromForm(); });` +
      `smartCandidatesList.addEventListener('input',()=>syncDraftEditorFromForm());` +
      `smartCandidatesList.addEventListener('change',()=>syncDraftEditorFromForm());` +
      `smartCandidatesList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-remove-smart-candidate]'); if(!btn){ return; } const next=extractSmartCandidatesFromForm().filter((_,index)=>index!==Number(btn.dataset.removeSmartCandidate)); renderSmartCandidatesList(next); syncDraftEditorFromForm(); });` +
      `governanceCascadeLevelsList.addEventListener('input',()=>syncDraftEditorFromForm());` +
      `governanceCascadeLevelsList.addEventListener('change',()=>syncDraftEditorFromForm());` +
      `governanceCascadeLevelsList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-remove-cascade-level]'); if(!btn){ return; } const next=extractCascadeLevelsFromForm().filter((_,index)=>index!==Number(btn.dataset.removeCascadeLevel)); renderCascadeLevelsList(next); syncDraftEditorFromForm(); });` +
      `referenceImpactTableBody.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-apply-reference-path]'); if(!btn){ return; } applyReferenceSuggestion(btn.dataset.applyReferencePath, btn.dataset.applyReferenceModel); });` +
      `draftValidationList.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-validation-path]'); if(!btn){ return; } jumpToValidationPath(btn.dataset.validationPath); });` +
      `draftRouterDefault.addEventListener('input',syncDraftEditorFromForm);` +
      `[triggerEnabled,triggerIntentEnabled,triggerAnalysisScope,triggerIntentModel,smartEnabled,smartRouterModel,smartFallback,smartCacheTtl,smartMaxTokens,governanceEnabled,governanceAlignmentEnabled,governanceSummarizerModel,governanceSemanticEnabled,governanceClassifierModel,governanceShadowEnabled,governanceVerifierModel].forEach(el=>{ el.addEventListener('input',syncDraftEditorFromForm); el.addEventListener('change',syncDraftEditorFromForm); });` +
      `function renderMetrics(metrics){` +
      `  metricsGrid.innerHTML=[` +
      "    ['Recent traces', metrics.totalTraces ?? 0]," +
      "    ['Sticky hit rate', pct(metrics.stickyHitRate)]," +
      "    ['Cascade rate', pct(metrics.cascadeTriggeredRate)]," +
      "    ['Shadow rate', pct(metrics.shadowCheckedRate)]," +
      "    ['Alignment rate', pct(metrics.alignmentUsedRate)]," +
      "    ['Avg latency', fmt(metrics.averageLatencyMs)+' ms']" +
      `  ].map(([label,value])=>'<div class=\"stat\"><span class=\"muted\">'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');` +
      `}` +
      `function applyDraftPreset(presetName){` +
      `  const preset=draftPresets[presetName];` +
      `  if(!preset){ return; }` +
      `  const overwriteMode=draftPresetMode.value === 'replace';` +
      `  if(overwriteMode){ renderModelsForm(currentDraftConfig.Models || []); renderTriggerRulesList([]); renderSmartCandidatesList([]); renderCascadeLevelsList([]); triggerEnabled.checked=false; triggerIntentEnabled.checked=false; triggerIntentModel.value=''; smartEnabled.checked=false; smartRouterModel.value=''; governanceEnabled.checked=false; governanceAlignmentEnabled.checked=false; governanceSummarizerModel.value=''; governanceSemanticEnabled.checked=false; governanceClassifierModel.value=''; governanceShadowEnabled.checked=false; governanceVerifierModel.value=''; }` +
      `  if(preset.routerDefault){ draftRouterDefault.value=resolvePresetModelId(preset.routerDefault); }` +
      `  if(preset.triggerEnabled !== undefined){ triggerEnabled.checked=Boolean(preset.triggerEnabled); }` +
      `  if(preset.triggerRules){ renderTriggerRulesList(preset.triggerRules.map(rule=>({ ...rule, model: resolvePresetModelId(rule.model) }))); }` +
      `  if(preset.smartEnabled !== undefined){ smartEnabled.checked=Boolean(preset.smartEnabled); }` +
      `  if(preset.smartCandidates){ renderSmartCandidatesList(preset.smartCandidates.map(item=>({ ...item, model: resolvePresetModelId(item.model) }))); }` +
      `  if(preset.governanceEnabled !== undefined){ governanceEnabled.checked=Boolean(preset.governanceEnabled); }` +
      `  if(preset.governanceAlignmentEnabled !== undefined){ governanceAlignmentEnabled.checked=Boolean(preset.governanceAlignmentEnabled); }` +
      `  if(preset.governanceSemanticEnabled !== undefined){ governanceSemanticEnabled.checked=Boolean(preset.governanceSemanticEnabled); }` +
      `  if(preset.governanceShadowEnabled !== undefined){ governanceShadowEnabled.checked=Boolean(preset.governanceShadowEnabled); }` +
      `  if(preset.governanceSummarizerModel !== undefined){ governanceSummarizerModel.value=resolvePresetModelId(preset.governanceSummarizerModel); }` +
      `  if(preset.governanceClassifierModel !== undefined){ governanceClassifierModel.value=resolvePresetModelId(preset.governanceClassifierModel); }` +
      `  if(preset.governanceVerifierModel !== undefined){ governanceVerifierModel.value=resolvePresetModelId(preset.governanceVerifierModel); }` +
      `  syncDraftEditorFromForm();` +
      `  draftPreviewStatus.textContent='已应用预设：'+presetName+'（'+(overwriteMode ? 'overwrite' : 'append / merge')+'）';` +
      `}` +
      `function renderRanking(target,entries,emptyLabel){` +
      `  if(!entries || !entries.length){ target.innerHTML='<li><span class="muted">'+esc(emptyLabel)+'</span><strong>0</strong></li>'; return; }` +
      `  target.innerHTML=entries.map(item=>'<li><span><code>'+esc(item.key)+'</code></span><strong>'+esc(item.count)+' · '+esc(pct(item.rate))+'</strong></li>').join('');` +
      `}` +
      `function renderAnomalies(anomalies){` +
      `  if(!anomalies || !anomalies.length){ anomalyList.innerHTML='<div class="alert info"><strong>No active alerts</strong><div class="muted">当前窗口未发现明显治理异常</div></div>'; return; }` +
      `  anomalyList.innerHTML=anomalies.map(item=>'<div class="alert '+esc(item.severity || 'info')+'"><strong>'+esc(item.type)+'</strong><div>'+esc(item.message)+'</div></div>').join('');` +
      `}` +
      `function renderBuckets(report){` +
      `  const buckets=report.buckets || [];` +
      `  const windowMs=Number(report.windowMs || 0);` +
      `  bucketHint.textContent=windowMs ? ('最近 '+Math.round(windowMs / 60000)+' 分钟，共 '+(report.bucketCount || buckets.length || 0)+' 桶') : '当前未启用时间窗';` +
      `  if(!buckets.length){ bucketGrid.innerHTML='<div class="stat"><span class="muted">No bucket data</span><strong>0</strong></div>'; return; }` +
      `  bucketGrid.innerHTML=buckets.map(bucket=>` +
      "    '<div class=\"stat\">'+"
      + "'<span class=\"muted\">'+esc(shortTime(bucket.bucketStart))+' - '+esc(shortTime(bucket.bucketEnd))+'</span>'+"
      + "'<strong>'+esc(bucket.metrics.totalTraces)+'</strong>'+"
      + "'<div class=\"muted\">sticky '+esc(pct(bucket.metrics.stickyHitRate))+' / cascade '+esc(pct(bucket.metrics.cascadeTriggeredRate))+'</div>'+"
      + "'</div>'"
      + `).join('');` +
      `}` +
      `function renderTrendTable(report){` +
      `  const buckets=report.buckets || [];` +
      `  if(!buckets.length){ trendTableBody.innerHTML='<tr><td colspan="6" class="muted">No trend data</td></tr>'; return; }` +
      `  trendTableBody.innerHTML=buckets.map(bucket=>'<tr>' +` +
      `    '<td>'+esc(shortTime(bucket.bucketStart))+' - '+esc(shortTime(bucket.bucketEnd))+'</td>' +` +
      `    '<td>'+esc(bucket.metrics.totalTraces)+'</td>' +` +
      `    '<td>'+esc(pct(bucket.metrics.stickyHitRate))+'</td>' +` +
      `    '<td>'+esc(pct(bucket.metrics.cascadeTriggeredRate))+'</td>' +` +
      `    '<td>'+esc(pct(bucket.metrics.shadowCheckedRate))+'</td>' +` +
      `    '<td>'+esc(pct(bucket.metrics.alignmentUsedRate))+'</td>' +` +
      `  '</tr>').join('');` +
      `}` +
      `function renderExportHistory(data){` +
      `  const exports=(data.exports || []);` +
      `  const schedules=(data.schedules || []);` +
      `  exportTableBody.innerHTML=exports.length ? exports.map(item=>'<tr><td><code>'+esc(item.id)+'</code></td><td>'+esc(item.kind)+'</td><td>'+esc(item.format)+'</td><td>'+esc(new Date(item.createdAt).toISOString())+'</td></tr>').join('') : '<tr><td colspan="4" class="muted">No exports yet</td></tr>';` +
      `  scheduleTableBody.innerHTML=schedules.length ? schedules.map(item=>'<tr><td><code>'+esc(item.id)+'</code></td><td>'+esc(item.intervalMs)+' ms</td><td>'+esc(item.format)+'</td><td>'+esc(item.lastRunAt ? new Date(item.lastRunAt).toISOString() : '-')}</td></tr>').join('') : '<tr><td colspan="4" class="muted">No schedules yet</td></tr>';` +
      `}` +
      `function renderArchives(data){` +
      `  const archives=(data.archives || []);` +
      `  archiveTableBody.innerHTML=archives.length ? archives.map(item=>'<tr><td><code>'+esc(item.file)+'</code></td><td>'+esc(item.startedAt ? new Date(item.startedAt).toISOString().slice(0,10) : '-')+' ~ '+esc(item.endedAt ? new Date(item.endedAt).toISOString().slice(0,10) : '-')+'</td><td>'+esc(item.traceCount)+'</td><td>'+esc(item.compressed ? 'yes' : 'no')+'</td></tr>').join('') : '<tr><td colspan="4" class="muted">No archives found</td></tr>';` +
      `}` +
      `async function loadCompiledModels(){` +
      `  compiledModelsStatus.textContent='加载 compiled models 中...';` +
      `  const res=await fetch('/api/models/compiled');` +
      `  const data=await res.json();` +
      `  renderCompiledModels(data);` +
      `  renderCompiledDiff();` +
      `  renderReferenceImpact();` +
      `}` +
      `async function loadTraces(){` +
      `  const requestId=document.getElementById('requestId').value.trim();` +
      `  const sessionKey=document.getElementById('sessionKey').value.trim();` +
      `  const routeReason=document.getElementById('routeReason').value.trim();` +
      `  const cascadeTriggered=document.getElementById('cascadeTriggered').value;` +
      `  const shadowChecked=document.getElementById('shadowChecked').value;` +
      `  const windowMs=document.getElementById('windowMs').value;` +
      `  const minSampleSize=document.getElementById('minSampleSize').value.trim();` +
      `  const cascadeWarnRate=document.getElementById('cascadeWarnRate').value.trim();` +
      `  const shadowWarnRate=document.getElementById('shadowWarnRate').value.trim();` +
      `  const latencyWarnMs=document.getElementById('latencyWarnMs').value.trim();` +
      `  const limit=document.getElementById('limit').value.trim();` +
      `  const params=new URLSearchParams();` +
      `  if(requestId) params.set('requestId',requestId);` +
      `  if(sessionKey) params.set('sessionKey',sessionKey);` +
      `  if(routeReason) params.set('routeReason',routeReason);` +
      `  if(cascadeTriggered) params.set('cascadeTriggered',cascadeTriggered);` +
      `  if(shadowChecked) params.set('shadowChecked',shadowChecked);` +
      `  if(windowMs) params.set('windowMs',windowMs);` +
      `  if(minSampleSize) params.set('minSampleSize',minSampleSize);` +
      `  if(cascadeWarnRate) params.set('cascadeWarnRate',cascadeWarnRate);` +
      `  if(shadowWarnRate) params.set('shadowWarnRate',shadowWarnRate);` +
      `  if(latencyWarnMs) params.set('latencyWarnMs',latencyWarnMs);` +
      `  params.set('bucketCount','6');` +
      `  if(limit) params.set('limit',limit);` +
      `  tbody.innerHTML='<tr><td colspan="6" class="muted">加载中...</td></tr>';` +
      `  const query=params.toString()?('?'+params.toString()):'';` +
      `  const [traceRes,metricsRes]=await Promise.all([` +
      `    fetch('/api/governance/traces'+query),` +
      `    fetch('/api/governance/metrics'+query)` +
      `  ]);` +
      `  const data=await traceRes.json();` +
      `  const metricsData=await metricsRes.json();` +
      `  renderMetrics(metricsData.metrics || {});` +
      `  renderBuckets(metricsData || {});` +
      `  renderAnomalies(metricsData.anomalies || []);` +
      `  renderRanking(routeRanking,metricsData.topRouteReasons || [],'No routes');` +
      `  renderRanking(modelRanking,metricsData.topFinalModels || [],'No models');` +
      `  renderRanking(intentRanking,metricsData.topSemanticIntents || [],'No intents');` +
      `  renderTrendTable(metricsData || {});` +
      `  const traces=data.traces || [];` +
      `  if(!traces.length){ tbody.innerHTML='<tr><td colspan="6" class="muted">暂无 trace</td></tr>'; return; }` +
      `  tbody.innerHTML=traces.map(t=>` +
      "    `<tr>`+" +
      "      `<td><code>${esc(t.requestId)}</code></td>`+" +
      "      `<td>${t.sessionKey ? `<span class=\"pill\">${esc(t.sessionKey)}</span>` : '<span class=\"muted\">-</span>'}</td>`+" +
      "      `<td><code>${esc(t.finalModel || '')}</code></td>`+" +
      "      `<td>${(t.routeReason || []).map(r=>`<span class=\"pill\">${esc(r)}</span>`).join(' ')}</td>`+" +
      "      `<td>${esc(t.latencyMs ?? '')}</td>`+" +
      "      `<td><button data-request=\"${esc(t.requestId)}\">View</button></td>`+" +
      "    `</tr>`" +
      `  ).join('');` +
      `}` +
      `async function loadDetail(requestId){` +
      `  const res=await fetch('/api/governance/traces/'+encodeURIComponent(requestId));` +
      `  const data=await res.json();` +
      `  detailHint.textContent='当前查看：'+requestId;` +
      `  detail.textContent=JSON.stringify(data,null,2);` +
      `}` +
      `async function loadExports(){` +
      `  const res=await fetch('/api/governance/metrics/exports');` +
      `  renderExportHistory(await res.json());` +
      `}` +
      `async function createSnapshot(){` +
      `  snapshotStatus.textContent='创建快照中...';` +
      `  const res=await fetch('/api/governance/metrics/snapshots',{` +
      `    method:'POST',` +
      `    headers:{'Content-Type':'application/json'},` +
      `    body:JSON.stringify({ format: document.getElementById('snapshotFormat').value, windowMs: Number(document.getElementById('windowMs').value || 0) || undefined })` +
      `  });` +
      `  const data=await res.json();` +
      `  snapshotStatus.textContent=res.ok ? ('已创建：'+data.export.id) : ('创建失败：'+(data.message || 'unknown error'));` +
      `  if(res.ok) await loadExports();` +
      `}` +
      `async function loadArchives(){` +
      `  archiveStatus.textContent='加载归档中...';` +
      `  const params=new URLSearchParams();` +
      `  const archiveDate=document.getElementById('archiveDate').value.trim();` +
      `  const archivePage=document.getElementById('archivePage').value.trim();` +
      `  const archivePageSize=document.getElementById('archivePageSize').value.trim();` +
      `  if(archiveDate) params.set('date',archiveDate);` +
      `  if(archivePage) params.set('page',archivePage);` +
      `  if(archivePageSize) params.set('pageSize',archivePageSize);` +
      `  const res=await fetch('/api/governance/archives'+(params.toString()?('?'+params.toString()):''));` +
      `  const data=await res.json();` +
      `  renderArchives(data);` +
      `  archiveStatus.textContent='归档加载完成';` +
      `}` +
      `async function saveThresholds(){` +
      `  const payload={` +
      `    min_sample_size:Number(document.getElementById('minSampleSize').value || 0),` +
      `    cascade_warn_rate:Number(document.getElementById('cascadeWarnRate').value || 0),` +
      `    shadow_warn_rate:Number(document.getElementById('shadowWarnRate').value || 0),` +
      `    latency_warn_ms:Number(document.getElementById('latencyWarnMs').value || 0)` +
      `  };` +
      `  saveThresholdsStatus.textContent='保存中...';` +
      `  const res=await fetch('/api/governance/observability/anomaly-thresholds',{` +
      `    method:'POST',` +
      `    headers:{'Content-Type':'application/json'},` +
      `    body:JSON.stringify(payload)` +
      `  });` +
      `  const data=await res.json();` +
      `  if(!res.ok){ saveThresholdsStatus.textContent='保存失败：'+(data.message || 'unknown error'); return; }` +
      `  saveThresholdsStatus.textContent='已保存到配置文件';` +
      `}` +
      `document.getElementById('refreshBtn').addEventListener('click',loadTraces);` +
      `document.getElementById('loadConfigDraftBtn').addEventListener('click',loadConfigDraft);` +
      `document.getElementById('addModelDraftBtn').addEventListener('click',addDraftModel);` +
      `document.getElementById('applyBalancedPresetBtn').addEventListener('click',()=>applyDraftPreset('balanced'));` +
      `document.getElementById('applyFastPresetBtn').addEventListener('click',()=>applyDraftPreset('fast'));` +
      `document.getElementById('applyGovernancePresetBtn').addEventListener('click',()=>applyDraftPreset('governance'));` +
      `document.getElementById('addTriggerRuleBtn').addEventListener('click',addTriggerRule);` +
      `document.getElementById('addSmartCandidateBtn').addEventListener('click',addSmartCandidate);` +
      `document.getElementById('addCascadeLevelBtn').addEventListener('click',addCascadeLevel);` +
      `document.getElementById('syncDraftJsonBtn').addEventListener('click',syncDraftEditorFromForm);` +
      `document.getElementById('previewConfigDraftBtn').addEventListener('click',previewConfigDraft);` +
      `draftPresetMode.addEventListener('change',renderDraftPresetModeHint);` +
      `document.getElementById('createSnapshotBtn').addEventListener('click',createSnapshot);` +
      `document.getElementById('loadArchivesBtn').addEventListener('click',loadArchives);` +
      `document.getElementById('saveThresholdsBtn').addEventListener('click',saveThresholds);` +
      `tbody.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-request]'); if(btn){ loadDetail(btn.dataset.request); } });` +
      `renderDraftPresetGuide();` +
      `renderDraftPresetModeHint();` +
      `loadConfigDraft();` +
      `loadCompiledModels();` +
      `loadExports();` +
      `loadArchives();` +
      `loadTraces();` +
      `</script>` +
      `</body></html>`
    );
  });

  return server;
};
