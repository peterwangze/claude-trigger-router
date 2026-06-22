import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = process.cwd();
const tmpRoot = join(tmpdir(), `ctr-ui-browser-smoke-${Date.now()}`);
const homeDir = join(tmpRoot, 'home');
const userDataDir = join(tmpRoot, 'browser-profile');
const configDir = join(homeDir, '.claude-trigger-router');
const HARD_TIMEOUT_MS = Number(process.env.CTR_BROWSER_SMOKE_TIMEOUT_MS ?? 60000);
const CDP_COMMAND_TIMEOUT_MS = Number(process.env.CTR_BROWSER_SMOKE_CDP_TIMEOUT_MS ?? 5000);

let ctrProcess;
let browserProcess;
let cdp;
let upstreamServer;
const ctrLogs = [];
const browserLogs = [];
const hardTimeout = setTimeout(() => {
  console.error(`UI browser smoke timed out after ${HARD_TIMEOUT_MS}ms`);
  printProcessTail('CTR', ctrLogs);
  printProcessTail('browser', browserLogs);
  Promise.allSettled([
    terminateProcess(browserProcess),
    terminateBrowserProfileProcesses(userDataDir),
    terminateProcess(ctrProcess),
    closeServer(upstreamServer),
    removeWithRetry(tmpRoot),
  ]).finally(() => process.exit(1));
}, HARD_TIMEOUT_MS);

try {
  await mkdir(tmpRoot, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(userDataDir, { recursive: true });

  const port = await getFreePort();
  const cdpPort = await getFreePort();
  const appUrl = `http://127.0.0.1:${port}/ui`;
  console.log(`UI browser smoke using app port ${port} and CDP port ${cdpPort}`);
  const upstream = await startFakeUpstream();
  upstreamServer = upstream.server;

  await writeFile(join(configDir, 'config.yaml'), [
    'HOST: 127.0.0.1',
    `PORT: ${port}`,
    'Models:',
    '  - id: sonnet',
    `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
    '    key: "sk-browser-smoke"',
    '    interface: "openai"',
    '    model: "browser-smoke-model"',
    'Router:',
    '  default: "sonnet"',
    '',
  ].join('\n'));

  ctrProcess = spawn(process.execPath, [join(repoRoot, 'dist', 'cli.js'), 'start', '--port', String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      CTR_CONFIG_DIR: configDir,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  captureProcessLogs(ctrProcess, ctrLogs);

  await waitForHttp(`http://127.0.0.1:${port}/health`);
  console.log('CTR service is ready');

  const browserPath = resolveBrowserExecutable();
  console.log(`Launching browser: ${browserPath}`);
  browserProcess = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    appUrl,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  captureProcessLogs(browserProcess, browserLogs);

  const target = await waitForCdpTarget(cdpPort, appUrl);
  cdp = await connectCdp(target.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: appUrl });
  await waitForWorkbenchReady(cdp);

  const desktopResult = await evaluate(cdp, smokeExpression());
  assertSmokeResult('desktop', desktopResult);
  console.log('Desktop UI browser smoke passed');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  const mobileResult = await evaluate(cdp, smokeExpression());
  assertSmokeResult('mobile', mobileResult);
  console.log('Mobile UI browser smoke passed');

  await cdp.close();
  console.log(`UI browser smoke passed at ${appUrl}`);
} finally {
  clearTimeout(hardTimeout);
  await terminateProcess(browserProcess);
  await terminateBrowserProfileProcesses(userDataDir);
  await cdp?.close?.();
  await terminateProcess(ctrProcess);
  await closeServer(upstreamServer);
  await removeWithRetry(tmpRoot);
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.CTR_BROWSER_SMOKE_EXECUTABLE,
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : undefined,
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : undefined,
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : undefined,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined,
    process.platform === 'darwin' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : undefined,
    process.platform !== 'win32' ? '/usr/bin/google-chrome' : undefined,
    process.platform !== 'win32' ? '/usr/bin/chromium-browser' : undefined,
    process.platform !== 'win32' ? '/usr/bin/chromium' : undefined,
    process.platform !== 'win32' ? '/usr/bin/microsoft-edge' : undefined,
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome/Edge executable found. Set CTR_BROWSER_SMOKE_EXECUTABLE to run UI browser smoke.');
  }
  return found;
}

function smokeExpression() {
  return `(() => {
    const beforeOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const deepseekTemplate = document.querySelector('#providerTemplateCards [data-provider-template="deepseek"]');
    deepseekTemplate?.click();
    const maintainerButton = document.querySelector('#maintainerRoleCard button[data-surface-jump="maintainer"]');
    maintainerButton?.click();
    const maintainerSurface = document.querySelector('#maintainerSurface');
    const maintainerTab = document.querySelector('#maintainerSurfaceTab');
    const afterOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    return {
      title: document.querySelector('h1')?.textContent || '',
      href: location.href,
      bodyText: document.body?.innerText?.slice(0, 240) || '',
      roleEntry: Boolean(document.querySelector('#localUserRoleCard') && document.querySelector('#remoteClientRoleCard') && document.querySelector('#maintainerRoleCard') && document.querySelector('#routingDesignerRoleCard')),
      quickConfig: Boolean(document.querySelector('#quickProviderTemplate') && document.querySelector('#applyQuickConfigBtn') && document.querySelector('#providerTemplateCards [data-provider-template="openrouter"]')),
      currentConfigPanel: Boolean(document.querySelector('#currentConfigOverview') && document.querySelector('#currentConfigSnapshot') && document.querySelector('#routePathDiagram')),
      pendingRouteText: document.querySelector('#routePathDiagram')?.textContent || '',
      designPanel: Boolean(document.querySelector('#uiDesignAssistantPanel')),
      decisionRail: Boolean(document.querySelector('#maintainerDecisionRail .decision-signal')),
      traceEvidence: Boolean(document.querySelector('#traceEvidenceDetail')),
      maintainerVisible: Boolean(maintainerSurface && !maintainerSurface.hidden && maintainerTab?.classList.contains('active')),
      noHorizontalOverflow: beforeOverflow && afterOverflow,
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      widest: Array.from(document.body.querySelectorAll('*'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || '',
            className: typeof element.className === 'string' ? element.className : '',
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            text: (element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
          };
        })
        .filter((item) => item.width > window.innerWidth || item.scrollWidth > window.innerWidth)
        .sort((a, b) => Math.max(b.width, b.scrollWidth) - Math.max(a.width, a.scrollWidth))
        .slice(0, 5)
    };
  })()`;
}

function assertSmokeResult(label, result) {
  const failures = [];
  if (!result.title.includes('本地状态')) failures.push('missing local status title');
  if (!result.roleEntry) failures.push('missing role entry cards');
  if (!result.quickConfig) failures.push('missing quick config controls');
  if (!result.currentConfigPanel) failures.push('missing current config / route path panel');
  if (!result.pendingRouteText.includes('deepseek-v4-flash')) failures.push('provider template click did not refresh pending route path');
  if (!result.designPanel) failures.push('missing UI design assistant panel');
  if (!result.decisionRail) failures.push('missing maintainer decision rail');
  if (!result.traceEvidence) failures.push('missing trace evidence detail anchor');
  if (!result.maintainerVisible) failures.push('maintainer role card did not switch surface');
  if (!result.noHorizontalOverflow) failures.push(`horizontal overflow (${result.scrollWidth} > ${result.width})`);

  if (failures.length) {
    throw new Error(`UI browser smoke failed on ${label}: ${failures.join('; ')}; url=${result.href || '-'}; body=${JSON.stringify(result.bodyText || '')}; widest=${JSON.stringify(result.widest || [])}`);
  }
}

async function getFreePort() {
  const server = createNetServer();
  try {
    return await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve free port'));
          return;
        }
        resolve(address.port);
      });
    });
  } finally {
    await closeServer(server);
  }
}

async function startFakeUpstream() {
  const server = createHttpServer((request, response) => {
    if (request.url?.startsWith('/v1/chat/completions')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: 'browser-smoke',
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve fake upstream port'));
        return;
      }
      resolve(address.port);
    });
  });
  return { server, port };
}

async function closeServer(server) {
  if (!server?.listening) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => server.close(() => resolve())),
    delay(2000),
  ]);
  server.closeAllConnections?.();
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  const detachChild = () => {
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.stdin?.destroy();
    child.unref?.();
  };

  if (process.platform === 'win32') {
    await runTaskkill(child.pid);
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(1000)]);
    }
    detachChild();
    await delay(500);
    return;
  }

  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, delay(2000)]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(2000)]);
  }
  detachChild();
}

async function terminateBrowserProfileProcesses(profileDir) {
  if (process.platform !== 'win32') {
    return;
  }
  const script = [
    '$profile = $env:CTR_BROWSER_PROFILE_DIR;',
    'Get-CimInstance Win32_Process |',
    '  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) -and $_.Name -match "^(msedge|chrome|chromium)\\.exe$" } |',
    '  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join(' ');
  await runProcessWithTimeout('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    CTR_BROWSER_PROFILE_DIR: profileDir,
  });
}

async function runTaskkill(pid) {
  await runProcessWithTimeout('taskkill', ['/PID', String(pid), '/T', '/F']);
}

async function runProcessWithTimeout(command, args, extraEnv = {}, timeoutMs = 5000) {
  let killer;
  let timeout;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      killer?.unref?.();
      resolve();
    };
    killer = spawn(command, args, { env: { ...process.env, ...extraEnv }, stdio: 'ignore' });
    timeout = setTimeout(() => {
      killer?.kill();
      finish();
    }, 5000);
    killer.once('exit', finish);
    killer.once('error', finish);
  });
}

async function removeWithRetry(path) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  console.warn(`UI browser smoke cleanup skipped for ${path}: ${message}`);
}

async function waitForHttp(url, attempts = 60) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

async function waitForCdpTarget(port, expectedUrl, attempts = 60) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl && target.url === expectedUrl)
        ?? targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for browser CDP target');
}

async function connectCdp(url) {
  const ws = new WebSocket(url);
  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), CDP_COMMAND_TIMEOUT_MS, 'Timed out opening browser CDP websocket');

  let id = 0;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });
  ws.addEventListener('close', () => {
    for (const { reject } of pending.values()) {
      reject(new Error('Browser CDP websocket closed'));
    }
    pending.clear();
  });

  return {
    send(method, params = {}) {
      id += 1;
      const requestId = id;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`Browser CDP command timed out: ${method}`));
        }, CDP_COMMAND_TIMEOUT_MS);
        pending.set(requestId, {
          resolve(value) {
            clearTimeout(timeout);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timeout);
            reject(error);
          },
        });
        ws.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

async function waitForWorkbenchReady(cdp) {
  let lastSnapshot;
  for (let index = 0; index < 60; index += 1) {
    const result = await evaluate(cdp, `({
      readyState: document.readyState,
      href: location.href,
      hasRoleEntry: Boolean(document.querySelector('#localUserRoleCard')),
      title: document.querySelector('h1')?.textContent || '',
      bodyText: document.body?.innerText?.slice(0, 160) || ''
    })`);
    lastSnapshot = result;
    if (result.readyState === 'complete' && result.hasRoleEntry) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for browser workbench page: ${JSON.stringify(lastSnapshot)}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result.value;
}

function captureProcessLogs(child, lines) {
  const capture = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) {
        lines.push(line);
      }
    }
    if (lines.length > 40) {
      lines.splice(0, lines.length - 40);
    }
  };

  child?.stdout?.on('data', capture);
  child?.stderr?.on('data', capture);
}

function printProcessTail(label, lines) {
  if (!lines.length) {
    console.error(`${label} output tail: <empty>`);
    return;
  }
  console.error(`${label} output tail:`);
  for (const line of lines.slice(-20)) {
    console.error(`  ${line}`);
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}
