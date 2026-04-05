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
      `.alert-list{display:grid;gap:.75rem;margin-top:1rem}` +
      `.alert{border-radius:12px;padding:.85rem 1rem;border:1px solid}` +
      `.alert.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}` +
      `.alert.critical{background:#fef2f2;border-color:#fca5a5;color:#991b1b}` +
      `.alert.info{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}` +
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
      `<div class="muted" style="margin-top:.75rem">数据源：<code>/api/governance/traces</code>、<code>/api/governance/traces/:requestId</code>、<code>/api/governance/archives</code>、<code>/api/governance/metrics</code>、<code>/api/governance/metrics/export</code>、<code>/api/governance/metrics/exports</code></div>` +
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
      `<p>其他管理 API：</p>` +
      `<ul>` +
      `<li><code>GET /api/config</code> — 读取当前配置</li>` +
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
      `const metricsGrid=document.getElementById('metricsGrid');` +
      `const bucketGrid=document.getElementById('bucketGrid');` +
      `const bucketHint=document.getElementById('bucketHint');` +
      `const routeRanking=document.getElementById('routeRanking');` +
      `const modelRanking=document.getElementById('modelRanking');` +
      `const intentRanking=document.getElementById('intentRanking');` +
      `const anomalyList=document.getElementById('anomalyList');` +
      `const trendTableBody=document.querySelector('#trendTable tbody');` +
      `function esc(v){return String(v ?? '').replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));}` +
      `function pct(v){return (Number(v || 0) * 100).toFixed(1)+'%';}` +
      `function fmt(v){return Number(v || 0).toFixed(2);}` +
      `function shortTime(v){ const d=new Date(v); return d.toISOString().slice(11,16); }` +
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
      `document.getElementById('refreshBtn').addEventListener('click',loadTraces);` +
      `tbody.addEventListener('click',(e)=>{ const btn=e.target.closest('button[data-request]'); if(btn){ loadDetail(btn.dataset.request); } });` +
      `loadTraces();` +
      `</script>` +
      `</body></html>`
    );
  });

  return server;
};
