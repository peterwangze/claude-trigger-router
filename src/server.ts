/**
 * Server
 *
 * Fastify 服务器配置
 */

import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile, normalizeAndValidateConfig } from "./utils";
import { log } from "./utils/log";
import { SERVICE_NAME } from "./service-health";
import { governanceTraceStore } from "./governance";

/**
 * 创建服务器
 */
export const createServer = (config: any): Server => {
  const server = new Server(config);

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
      `.row{display:flex;gap:1rem;flex-wrap:wrap;align-items:center}` +
      `input,button{font:inherit;padding:.55rem .75rem;border-radius:8px;border:1px solid #d1d5db}` +
      `button{background:#111827;color:#fff;border-color:#111827;cursor:pointer}` +
      `table{width:100%;border-collapse:collapse;margin-top:1rem}` +
      `th,td{text-align:left;padding:.65rem .5rem;border-bottom:1px solid #e5e7eb;vertical-align:top}` +
      `code,pre{font-family:ui-monospace,SFMono-Regular,monospace}` +
      `pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:1rem;border-radius:12px;overflow:auto}` +
      `.pill{display:inline-block;padding:.2rem .5rem;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:.8rem}` +
      `</style></head>` +
      `<body>` +
      `<h2>Claude Trigger Router</h2>` +
      `<p class="muted">简易 Governance Trace 调试页。可查看最近治理链路、按 requestId / sessionKey 过滤，并查看单条 trace 详情。</p>` +
      `<div class="panel">` +
      `<div class="row">` +
      `<input id="requestId" placeholder="requestId">` +
      `<input id="sessionKey" placeholder="sessionKey">` +
      `<input id="limit" placeholder="limit" value="20">` +
      `<button id="refreshBtn">刷新</button>` +
      `</div>` +
      `<div class="muted" style="margin-top:.75rem">数据源：<code>/api/governance/traces</code> 与 <code>/api/governance/traces/:requestId</code></div>` +
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
      `</ul>` +
      `</div>` +
      `<script>` +
      `const tbody=document.querySelector('#traceTable tbody');` +
      `const detail=document.getElementById('traceDetail');` +
      `const detailHint=document.getElementById('detailHint');` +
      `function esc(v){return String(v ?? '').replace(/[&<>"]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));}` +
      `async function loadTraces(){` +
      `  const requestId=document.getElementById('requestId').value.trim();` +
      `  const sessionKey=document.getElementById('sessionKey').value.trim();` +
      `  const limit=document.getElementById('limit').value.trim();` +
      `  const params=new URLSearchParams();` +
      `  if(requestId) params.set('requestId',requestId);` +
      `  if(sessionKey) params.set('sessionKey',sessionKey);` +
      `  if(limit) params.set('limit',limit);` +
      `  tbody.innerHTML='<tr><td colspan="6" class="muted">加载中...</td></tr>';` +
      `  const res=await fetch('/api/governance/traces'+(params.toString()?('?'+params.toString()):''));` +
      `  const data=await res.json();` +
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
