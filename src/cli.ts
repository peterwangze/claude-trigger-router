/**
 * CLI Entry Point
 *
 * 命令行入口
 */

import { spawn, spawnSync } from "child_process";
import { randomBytes } from "crypto";
import { join } from "path";
import open from "openurl";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { run, initializeClaudeConfig } from "./index";
import { isServiceRunning, killProcess, readServiceInfo } from "./utils/processCheck";
import { BENCHMARK_HISTORY_FILE, CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, CONFIG_FILE_YML, DEFAULT_CONFIG } from "./constants";
import { SERVICE_INFO_PATH, SERVICE_NAME, isTcpPortOccupied, waitForService } from "./service-health";
import { runSetupCli } from "./setup";
import { buildServerDeploymentConfig, buildUsableMinimalTemplateConfig } from "./setup/templates";
import { runDoctorCli } from "./doctor";
import { managedApiKeySummary } from "./auth/api-keys";
import { normalizeAndValidateConfig } from "./utils/config";
import {
  buildOfflineTaskManifest,
  appendBenchmarkHistory,
  formatBenchmarkHistorySummary,
  formatOfflineTaskEvaluationReport,
  formatOfflineTaskManifest,
  parseOfflineEvaluationInputs,
  readBenchmarkHistory,
  runOfflineTaskBenchmark,
  runOfflineTaskEvaluation,
  runOfflineTaskJudge,
  summarizeBenchmarkHistory,
  type IOfflineEvaluationInput,
  type IOfflineTaskEvaluationReport,
} from "./governance/task-evaluation";

const PACKAGE_JSON_PATH = join(__dirname, "..", "package.json");
const PACKAGE_PAGE_URL = "https://www.npmjs.com/package/@peterwangze/claude-trigger-router";
const PACKAGE_REGISTRY_LATEST_URL = "https://registry.npmjs.org/@peterwangze%2Fclaude-trigger-router/latest";
const PACKAGE_REGISTRY_URL = "https://registry.npmjs.org/";

function getPackageInfo(): { name: string; version: string } {
  const content = readFileSync(PACKAGE_JSON_PATH, "utf-8");
  const pkg = JSON.parse(content) as { name?: string; version?: string };

  return {
    name: pkg.name ?? "@peterwangze/claude-trigger-router",
    version: pkg.version ?? "unknown",
  };
}

function getArgs(): string[] {
  return process.argv.slice(2);
}

function getCommand(): string | undefined {
  return getArgs()[0];
}

function hasArg(flag: string, shortFlag?: string): boolean {
  const args = getArgs();
  return args.includes(flag) || (shortFlag ? args.includes(shortFlag) : false);
}

function getArgValue(flag: string, shortFlag?: string): string | undefined {
  const args = getArgs();
  const index = args.indexOf(flag) !== -1 ? args.indexOf(flag) : shortFlag ? args.indexOf(shortFlag) : -1;
  const value = index !== -1 ? args[index + 1] : undefined;
  return value && !value.startsWith("-") ? value : undefined;
}

function getOptionalArgValue(flag: string, label: string): string | undefined {
  if (!hasArg(flag)) {
    return undefined;
  }

  const value = getArgValue(flag);
  if (!value) {
    throw new Error(`${label} 需要提供值：${flag} <value>`);
  }

  return value;
}

function parsePortValue(portValue: string, sourceLabel: string): number {
  const trimmed = portValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${sourceLabel} 不是合法端口：${portValue}`);
  }

  const port = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${sourceLabel} 超出合法范围（1-65535）：${portValue}`);
  }

  return port;
}

/**
 * 从命令行参数或配置文件中获取端口号
 */
function getPort(): number {
  // 优先使用命令行参数
  const portValue = getArgValue("--port", "-p");
  if (portValue) {
    return parsePortValue(portValue, "命令行端口参数");
  }

  // 尝试从配置文件读取（顺序：config.yaml → config.yml → config.json）
  try {
    const yaml = require("js-yaml");
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const config = yaml.load(content) as any;
      if (config?.PORT) return config.PORT;
    } else if (existsSync(CONFIG_FILE_YML)) {
      const content = readFileSync(CONFIG_FILE_YML, "utf-8");
      const config = yaml.load(content) as any;
      if (config?.PORT) return config.PORT;
    } else if (existsSync(CONFIG_FILE_JSON)) {
      const content = readFileSync(CONFIG_FILE_JSON, "utf-8");
      const config = JSON.parse(content);
      if (config?.PORT) return config.PORT;
    }
  } catch {
    // 配置读取失败，使用默认值
  }

  return DEFAULT_CONFIG.PORT;
}

/**
 * 检查命令行参数中是否包含 daemon 标志
 */
function isDaemonMode(): boolean {
  return hasArg("--daemon", "-d");
}

/**
 * 打印帮助信息
 */
export function printHelp() {
  console.log(`
Claude Trigger Router - 智能触发路由器

用法：ctr <命令> [选项]

命令：
  setup       检测并复用已有配置，必要时迁移旧配置或新建最小配置
  doctor      诊断并修复当前配置，按需探测模型可用性
  eval        离线评测固定任务集输出（--input / --tasks / --run / --judge-model）
  init        初始化最小配置模板
  deploy      生成部署入口配置（当前支持 deploy init --target server）
  start       启动路由服务（默认前台运行）
  stop        停止后台服务
  restart     重启后台服务
  status      查看服务运行状态（PID、端口、启动时间）
  version     查看当前安装版本与包信息
  upgrade     查看升级到最新 npm 版本的指引
  code        通过路由器运行 Claude Code（需先启动服务）
  ui          打开本地管理页（配置预览与调试）
  help        显示此帮助信息

选项：
  --port, -p    指定监听端口（默认：5678）
  --daemon, -d  以后台方式运行（配合 start/restart 使用）
  --force       强制覆盖已有配置（配合 init/deploy init 使用）

使用示例：
  ctr setup                # 复用当前配置 / 迁移旧配置 / 新建最小配置
  ctr doctor               # 诊断配置 / 修复格式问题 / 按需探测模型可用性
  ctr eval --tasks         # 查看固定评测任务、prompt 和 rubric
  ctr eval --input results.json  # 用固定任务集 rubric 评测多模型输出结果
  ctr eval --run --models "sonnet;haiku"  # 自动调用 CTR /v1/messages 后评测
  ctr eval --run --models "sonnet;haiku" --judge-model sonnet  # 自动追加 LLM 裁判分
  ctr eval --history       # 查看已保存 benchmark 历史趋势
  ctr init                 # 初始化最小配置模板
  ctr deploy init --target server  # 生成安全默认的 server 部署配置
  ctr version              # 查看当前安装版本
  ctr upgrade              # 查看升级到最新版本的命令
  ctr start                # 前台启动（推荐首次使用，便于查看日志）
  ctr start --daemon       # 后台启动
  ctr status               # 查看服务状态
  ctr code                 # 启动 Claude Code（需先运行 ctr start）
  ctr ui                   # 打开本地管理页（可选）
  ctr stop                 # 停止后台服务
  ctr restart --daemon     # 重启后台服务

配置文件：
  ${CONFIG_FILE}
  ${CONFIG_FILE_JSON}

配置目录：${CONFIG_DIR}

补充说明：
  ctr restart 当前默认按后台模式重启；可写 ctr restart 或 ctr restart --daemon

更多信息：https://github.com/peterwangze/claude-trigger-router
`);
}

function readConfigForCliStatus(): any {
  const yaml = require("js-yaml");
  for (const configFile of [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON]) {
    if (!existsSync(configFile)) {
      continue;
    }
    const content = readFileSync(configFile, "utf-8");
    return configFile.endsWith(".json") ? JSON.parse(content) : yaml.load(content);
  }
  return {};
}

function getLocalClaudeProxyToken(config: any): string {
  const bootstrapKey = typeof config?.APIKEY === "string" ? config.APIKEY.trim() : "";
  return bootstrapKey || "ctr-local-proxy";
}

async function fetchLiveServiceInfo(port: number, apiKey?: string): Promise<any | null> {
  try {
    const headers = apiKey?.trim()
      ? { Authorization: `Bearer ${apiKey.trim()}` }
      : undefined;
    const response = await fetch(`http://127.0.0.1:${port}${SERVICE_INFO_PATH}`, {
      headers,
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || (payload as any).service !== SERVICE_NAME) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function printRuntimeStatus(config: any, port: number, liveInfo?: any | null) {
  const normalized = normalizeAndValidateConfig(config ?? {}).config;
  const runtimeMode = liveInfo?.runtimeMode ?? normalized.Runtime?.mode ?? "local";
  const serviceRole = liveInfo?.serviceRole ?? (runtimeMode === "local" ? "local_agent" : "router_service");
  const listener = liveInfo?.listener && typeof liveInfo.listener === "object" ? liveInfo.listener : null;
  const host = String(listener?.host ?? normalized.HOST ?? DEFAULT_CONFIG.HOST ?? "127.0.0.1").trim() || "127.0.0.1";
  const publicHost = typeof listener?.public === "boolean"
    ? listener.public
    : ["0.0.0.0", "::", "[::]"].includes(host);
  const listenerPort = Number(listener?.port ?? port) || port;
  const managedKeys = managedApiKeySummary(normalized);
  const liveAuth = liveInfo?.auth && typeof liveInfo.auth === "object" ? liveInfo.auth : null;
  const hasBootstrapAuth = Boolean(liveAuth?.bootstrapConfigured ?? normalized.APIKEY);
  const managedActive = Number(liveAuth?.managedKeys?.active ?? managedKeys.active) || 0;
  const authRequired = Boolean(liveAuth?.required ?? (hasBootstrapAuth || managedKeys.total > 0));
  const listenerUrl = String(listener?.advertisedUrl ?? (publicHost ? `http://<server-host>:${listenerPort}` : `http://${host}:${listenerPort}`));
  const remoteService = normalized.Runtime?.remote_service;
  const clientConnection = liveInfo?.clientConnection && typeof liveInfo.clientConnection === "object"
    ? liveInfo.clientConnection
    : null;

  console.log(`   模式：${runtimeMode}（${serviceRole}）`);
  console.log(`   监听：${host}:${listenerPort}${publicHost ? "（对外监听）" : "（本机监听）"}`);
  console.log(`   鉴权：${authRequired ? "enabled" : "disabled"}（bootstrap=${hasBootstrapAuth}, managed_active=${managedActive}）`);

  if (runtimeMode !== "local") {
    console.log(`   远程客户端接入：ANTHROPIC_BASE_URL=${clientConnection?.baseUrl || listenerUrl}`);
    console.log("   推荐客户端 key：managed client + read-only；不要把 admin/bootstrap key 发给远程使用者。");
    console.log(`   维护入口：http://127.0.0.1:${listenerPort}/ui（需要 admin key）`);
    return;
  }

  if (clientConnection?.role === "remote_client" || remoteService?.enabled) {
    const baseUrl = String(clientConnection?.baseUrl || remoteService?.base_url || "").trim().replace(/\/+$/, "") || "<missing>";
    console.log(`   远程服务：${baseUrl}`);
    console.log("   推荐远程 token：managed client + read-only，用于 ready/status 探测和模型调用。");
    return;
  }

  console.log(`   本地接入：${clientConnection?.baseUrl || `http://127.0.0.1:${listenerPort}`}`);
}

function readOfflineEvaluationInputs(inputPath: string): IOfflineEvaluationInput[] {
  const payload = JSON.parse(readFileSync(inputPath, "utf-8"));
  return parseOfflineEvaluationInputs(payload);
}

function parsePositiveIntegerArg(flag: string, shortFlag: string | undefined, fallback: number, label: string): number {
  const value = getArgValue(flag, shortFlag);
  if (!value) {
    return fallback;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} 必须是正整数：${value}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} 必须是正整数：${value}`);
  }
  return parsed;
}

function parseEvalModelsArg(): string[] {
  const modelsValue = getArgValue("--models") || getArgValue("--model");
  return (modelsValue ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBenchmarkHistoryFile(): string {
  return getArgValue("--history-file") || BENCHMARK_HISTORY_FILE;
}

function saveBenchmarkHistoryIfRequested(report: IOfflineTaskEvaluationReport, source: "input" | "run" | "judge"): string | undefined {
  if (!hasArg("--save-history")) {
    return undefined;
  }

  const historyFile = getBenchmarkHistoryFile();
  const entry = appendBenchmarkHistory(report, {
    historyFile,
    source,
    label: getArgValue("--history-label"),
  });
  return `${historyFile}#${entry.id}`;
}

async function runOfflineEvaluationCli() {
  if (hasArg("--history")) {
    const historyFile = getBenchmarkHistoryFile();
    const summary = summarizeBenchmarkHistory(readBenchmarkHistory(historyFile));
    if (hasArg("--json")) {
      console.log(JSON.stringify({ historyFile, summary }, null, 2));
      return;
    }
    console.log(formatBenchmarkHistorySummary(summary));
    console.log(`History file: ${historyFile}`);
    return;
  }

  if (hasArg("--tasks")) {
    if (hasArg("--json")) {
      console.log(JSON.stringify(buildOfflineTaskManifest(), null, 2));
      return;
    }
    console.log(formatOfflineTaskManifest());
    return;
  }

  if (hasArg("--run")) {
    const models = parseEvalModelsArg();
    if (!models.length) {
      console.log('请提供自动评测模型：ctr eval --run --models "sonnet;haiku"');
      console.log("提示：模型名中可以包含逗号，因此多个模型用分号 ; 分隔。");
      process.exit(1);
    }

    try {
      const config = readConfigForCliStatus();
      const baseUrl = getArgValue("--base-url") || `http://127.0.0.1:${getPort()}`;
      const apiKey = getArgValue("--api-key") || getLocalClaudeProxyToken(config);
      const judgeModel = getOptionalArgValue("--judge-model", "judge-model");
      const result = await runOfflineTaskBenchmark({
        models,
        baseUrl,
        apiKey,
        timeoutMs: parsePositiveIntegerArg("--timeout-ms", undefined, 30000, "timeout-ms"),
        concurrency: parsePositiveIntegerArg("--concurrency", undefined, 2, "concurrency"),
        maxTokens: parsePositiveIntegerArg("--max-tokens", undefined, 768, "max-tokens"),
        judgeModel,
        judgeMaxTokens: parsePositiveIntegerArg("--judge-max-tokens", undefined, 256, "judge-max-tokens"),
      });
      const saved = saveBenchmarkHistoryIfRequested(result.report, "run");
      if (hasArg("--json")) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(formatOfflineTaskEvaluationReport(result.report));
      if (saved) {
        console.log(`Benchmark history saved: ${saved}`);
      }
      return;
    } catch (error: any) {
      console.error(`❌ 自动评测失败：${error.message}`);
      console.error('   示例：ctr eval --run --models "sonnet;haiku" --base-url http://127.0.0.1:5678');
      process.exit(1);
    }
  }

  const inputPath = getArgValue("--input", "-i");
  if (!inputPath) {
    console.log("请提供评测输入文件：ctr eval --input results.json");
    console.log("可先运行：ctr eval --tasks 查看固定任务、prompt 和 rubric");
    console.log("输入格式：[{ \"taskId\": \"coding_fix\", \"model\": \"provider,model\", \"output\": \"...\", \"latencyMs\": 1200 }]");
    process.exit(1);
  }

  try {
    const inputs = readOfflineEvaluationInputs(inputPath);
    const judgeModel = getOptionalArgValue("--judge-model", "judge-model");
    if (judgeModel) {
      const config = readConfigForCliStatus();
      const result = await runOfflineTaskJudge({
        inputs,
        judgeModel,
        baseUrl: getArgValue("--base-url") || `http://127.0.0.1:${getPort()}`,
        apiKey: getArgValue("--api-key") || getLocalClaudeProxyToken(config),
        timeoutMs: parsePositiveIntegerArg("--timeout-ms", undefined, 30000, "timeout-ms"),
        concurrency: parsePositiveIntegerArg("--concurrency", undefined, 2, "concurrency"),
        maxTokens: parsePositiveIntegerArg("--judge-max-tokens", undefined, 256, "judge-max-tokens"),
      });
      const saved = saveBenchmarkHistoryIfRequested(result.report, "judge");
      if (hasArg("--json")) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(formatOfflineTaskEvaluationReport(result.report));
      if (saved) {
        console.log(`Benchmark history saved: ${saved}`);
      }
      return;
    }

    const report = runOfflineTaskEvaluation(inputs);
    const saved = saveBenchmarkHistoryIfRequested(report, "input");
    if (hasArg("--json")) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(formatOfflineTaskEvaluationReport(report));
    if (saved) {
      console.log(`Benchmark history saved: ${saved}`);
    }
  } catch (error: any) {
    console.error(`❌ 离线评测失败：${error.message}`);
    console.error("   请检查输入格式：ctr eval --input results.json");
    process.exit(1);
  }
}

function getLatestPackageVersionViaNpm(packageName: string, timeoutMs = 5000): string | null {
  try {
    const result = spawnSync("npm", ["view", packageName, "version", "--registry", PACKAGE_REGISTRY_URL], {
      encoding: "utf-8",
      timeout: timeoutMs,
      shell: process.platform === "win32",
    });

    if (result.status !== 0) {
      return null;
    }

    const value = result.stdout?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

async function getLatestPackageVersion(packageName: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const response = await fetch(PACKAGE_REGISTRY_LATEST_URL, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { version?: unknown };
    if (typeof payload.version === "string") {
      return payload.version;
    }
  } catch {
    // Fall through to npm CLI lookup.
  }

  return getLatestPackageVersionViaNpm(packageName);
}

function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map((part) => Number.parseInt(part, 10));
  const latestParts = latest.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(currentParts.length, latestParts.length);

  for (let index = 0; index < length; index += 1) {
    const currentValue = Number.isFinite(currentParts[index]) ? currentParts[index] : 0;
    const latestValue = Number.isFinite(latestParts[index]) ? latestParts[index] : 0;

    if (latestValue > currentValue) {
      return true;
    }

    if (latestValue < currentValue) {
      return false;
    }
  }

  return false;
}

async function printVersion() {
  const pkg = getPackageInfo();
  const latestVersion = await getLatestPackageVersion(pkg.name);

  console.log(`Package: ${pkg.name}`);
  console.log(`Version: ${pkg.version}`);
  console.log(`Latest: ${latestVersion ?? "unavailable"}`);
  if (latestVersion && isNewerVersion(pkg.version, latestVersion)) {
    console.log(`Upgrade: npm install -g ${pkg.name}@latest`);
  }
  console.log(`NPM: ${PACKAGE_PAGE_URL}`);
}

function printUpgradeGuidance() {
  const pkg = getPackageInfo();

  console.log(`当前安装版本：${pkg.version}`);
  console.log(`包名：${pkg.name}`);
  console.log("升级到最新版本：");
  console.log(`  npm install -g ${pkg.name}@latest`);
  console.log("请在当前 ctr 进程外执行升级命令，避免自升级时占用当前文件。");
  console.log("如果你最初是通过 GitHub 源安装，请继续使用原安装来源，当前命令不会自动切换来源。");
  console.log("全局安装在某些环境下可能需要管理员/root 权限。");
  console.log(`NPM: ${PACKAGE_PAGE_URL}`);
}

function printRestartGuidanceHint() {
  console.log("说明：`ctr restart` 当前默认按后台模式重启服务，`--daemon` 只是显式写法。");
}

function isClaudeCommandAvailable(timeoutMs = 3000): boolean {
  try {
    const result = spawnSync("claude", ["--version"], {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: "ignore",
      shell: process.platform === "win32",
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

function createBootstrapApiKey(): string {
  return `ctr_bootstrap_${randomBytes(24).toString("hex")}`;
}

/**
 * 初始化配置文件
 */
function initConfig() {
  const force = hasArg("--force");

  const existingConfig = [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON].find(existsSync);
  if (existingConfig && !force) {
    console.log(`⚠️  配置文件已存在：${existingConfig}`);
    console.log("    如需覆盖，请使用 --force 参数。");
    return;
  }

  // 确保配置目录存在
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  try {
    const yaml = require("js-yaml");
    const templateConfig = buildUsableMinimalTemplateConfig();
    const content = yaml.dump(templateConfig, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    writeFileSync(CONFIG_FILE, content, "utf-8");
    const action = force ? "已覆盖" : "已创建";
    console.log(`✅ 配置文件${action}：${CONFIG_FILE}`);
    console.log("");
    console.log("下一步：");
    console.log("  1. 编辑配置文件，填入你的 API 密钥");
    console.log("  2. 在 'Models' 下补全你的模型接入信息");
    console.log("  3. 将 'Router.default' 设置为默认模型 ID");
    console.log("  4. 如需高级路由，再继续配置规则或智能路由");
    console.log(`  5. 运行：ctr start`);
  } catch (error: any) {
    console.error("❌ 创建配置文件失败:", error.message);
    process.exit(1);
  }
}

function printDeployHelp() {
  console.log("用法：ctr deploy init --target server [--force]");
  console.log("");
  console.log("当前支持：");
  console.log("  server  生成带 HOST/APIKEY/Runtime.mode/Models/Router 的自托管服务端配置");
  console.log("");
  console.log("下一步：");
  console.log("  1. 编辑 Models[].key 和 Models[].model");
  console.log("  2. 运行 ctr doctor 检查配置和鉴权状态");
  console.log("  3. 运行 ctr start --daemon 启动服务");
}

function initDeployConfig() {
  const action = getArgs()[1];
  const target = getArgValue("--target") ?? "server";
  const force = hasArg("--force");

  if (action !== "init") {
    printDeployHelp();
    return;
  }

  if (target !== "server") {
    console.error(`❌ 当前不支持的部署目标：${target}`);
    printDeployHelp();
    process.exit(1);
  }

  const existingConfig = [CONFIG_FILE, CONFIG_FILE_YML, CONFIG_FILE_JSON].find(existsSync);
  if (existingConfig && !force) {
    console.log(`⚠️  配置文件已存在：${existingConfig}`);
    console.log("    如需覆盖部署模板，请使用 --force 参数。");
    return;
  }

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  try {
    const yaml = require("js-yaml");
    const templateConfig = buildServerDeploymentConfig({
      apiKey: createBootstrapApiKey(),
    });
    const content = yaml.dump(templateConfig, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    writeFileSync(CONFIG_FILE, content, "utf-8");
    const actionLabel = force ? "已覆盖" : "已创建";
    console.log(`✅ Server 部署配置${actionLabel}：${CONFIG_FILE}`);
    console.log("");
    console.log("已生成 bootstrap admin APIKEY；请只用于维护者管理，不要发给远程客户端。");
    console.log("");
    console.log("下一步：");
    console.log("  1. 编辑 Models[].key 和 Models[].model，填入服务端要代理的上游模型");
    console.log("  2. 运行：ctr doctor");
    console.log("  3. 运行：ctr start --daemon");
    console.log("  4. 用 admin key 调用 POST /api/auth/keys 生成 client + read-only 远程客户端 key");
  } catch (error: any) {
    console.error("❌ 创建部署配置失败:", error.message);
    process.exit(1);
  }
}

/**
 * 以前台方式启动服务
 */
async function startForeground(port?: number) {
  const targetPort = port ?? getPort();
  const healthy = await waitForService(targetPort, 500);
  const occupied = await isTcpPortOccupied(targetPort, 500);
  if (healthy && occupied && isServiceRunning()) {
    console.log(`✅ Service is already running on port ${targetPort}.`);
    console.log("   Use 'ctr status' to inspect it or 'ctr stop' before starting again.");
    return;
  }
  if (!healthy && occupied && !isServiceRunning()) {
    console.error(`❌ Port ${targetPort} is already occupied by another service.`);
    process.exit(1);
  }

  console.log("🚀 Starting Claude Trigger Router (foreground)...");
  console.log("   Press Ctrl+C to stop");

  try {
    await run({ port: targetPort });
  } catch (error: any) {
    if (error.message?.includes("Invalid configuration")) {
      console.error("\n❌ Configuration error. Run 'ctr init' to create a config file.");
    } else {
      console.error("❌ Failed to start service:", error.message);
    }
    process.exit(1);
  }
}

/**
 * 以后台（daemon）方式启动服务
 */
async function startDaemon(port?: number) {
  const targetPort = port ?? getPort();
  const healthy = await waitForService(targetPort, 500);
  const occupied = await isTcpPortOccupied(targetPort, 500);
  if (!healthy && occupied && !isServiceRunning()) {
    console.log(`❌ Port ${targetPort} is already occupied by another service.`);
    return;
  }

  if (isServiceRunning()) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  const nodeExec = process.execPath;
  const scriptPath = process.argv[1];

  // 构造不含 --daemon 的参数
  const childArgs = [scriptPath, "start"];
  if (port) {
    childArgs.push("--port", String(port));
  }

  const child = spawn(nodeExec, childArgs, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, CTR_DAEMON: "1" },
  });

  child.unref();

  const startConfirmed = await new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + 5000;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    child.once("error", reject);
    child.once("exit", () => finish(false));

    const poll = () => {
      if (settled) {
        return;
      }
      if (isServiceRunning()) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(false);
        return;
      }
      setTimeout(poll, 250);
    };

    poll();
  });

  if (!startConfirmed) {
    console.error(`❌ Service failed to start in background (port: ${targetPort}).`);
    console.error("   Run 'ctr start' (without --daemon) to inspect the startup error.");
    process.exit(1);
  }

  console.log(`✅ Service started in background (port: ${targetPort})`);
  console.log(`   Run 'ctr stop' to stop it.`);
}

/**
 * 显示服务状态
 */
async function showStatus() {
  const config = readConfigForCliStatus();
  const configuredPort = getPort();
  const healthOptions = config?.APIKEY ? { apiKey: config.APIKEY } : {};
  const info = readServiceInfo();
  if (!info || !isServiceRunning()) {
    const targetPort = configuredPort;
    const healthy = await waitForService(targetPort, 500, healthOptions);
    const occupied = await isTcpPortOccupied(targetPort, 500);
    if (healthy) {
      const liveInfo = await fetchLiveServiceInfo(targetPort, config?.APIKEY);
      console.log("✅ 服务运行中");
      console.log(`   端口：${targetPort}`);
      console.log(`   接入地址：http://127.0.0.1:${targetPort}`);
      printRuntimeStatus(config, targetPort, liveInfo);
      return;
    }
    if (!healthy && occupied) {
      console.log(`⚠️  端口 ${targetPort} 已被其他服务占用，当前不是 claude-trigger-router。`);
      return;
    }
    console.log("⏹  服务未运行");
    printRuntimeStatus(config, targetPort);
    return;
  }
  const startTime = info.startTime ? new Date(info.startTime).toLocaleString() : "未知";
  console.log("✅ 服务运行中");
  console.log(`   PID：${info.pid}`);
  console.log(`   端口：${info.port}`);
  console.log(`   启动时间：${startTime}`);
  console.log(`   接入地址：http://127.0.0.1:${info.port}`);
  const liveInfo = await fetchLiveServiceInfo(info.port, config?.APIKEY);
  printRuntimeStatus(config, info.port, liveInfo);
}

/**
 * 停止服务
 */
function stopService() {
  const info = readServiceInfo();
  if (!info || !isServiceRunning()) {
    console.log("⚠️  未发现运行中的服务。");
    return;
  }

  try {
    console.log(`🛑 正在停止服务（PID: ${info.pid}，端口: ${info.port}）...`);
    killProcess(info.pid);
    console.log("✅ 服务已停止。");
  } catch (error: any) {
    console.error("❌ 停止服务失败:", error.message);
  }
}

/**
 * 重启服务（daemon 模式）
 */
async function restartService() {
  stopService();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await startDaemon(getPort());
}

/**
 * 运行 Claude Code
 */
export async function runClaudeCode() {
  const port = getPort();
  const config = readConfigForCliStatus();
  const proxyToken = getLocalClaudeProxyToken(config);

  // 确保 ~/.claude.json 存在（跳过 Claude Code 首次引导流程）
  // 仅在此处执行，避免在 ctr start 时产生不必要的全局副作用
  await initializeClaudeConfig();

  // 先看本地元数据，再用健康检查确认当前端口上确实是本服务
  const running = isServiceRunning();
  console.log(`🔍 Checking if service is available on port ${port}...`);
  const reachable = await waitForService(port, 2000, { apiKey: proxyToken });

  if (!reachable) {
    console.log(`⚠️  Trigger Router service is not running on port ${port}.`);
    console.log("");
    console.log("Options:");
    console.log("  1. Start service first:  ctr start --daemon");
    console.log("  2. Or start interactively in another terminal:  ctr start");
    console.log("");
    process.exit(1);
  }

  console.log(`🚀 Starting Claude Code with Trigger Router (port: ${port})...`);
  if (!isClaudeCommandAvailable()) {
    console.error("❌ 未检测到 Claude Code CLI。");
    console.log("   请先安装：npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }

  // 启动 Claude Code（Windows 上 npm 全局命令为 .cmd shim，需要 shell: true）
  const isWindows = process.platform === "win32";
  const claudeEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_AUTH_TOKEN: proxyToken,
  };
  delete claudeEnv.ANTHROPIC_API_KEY;

  const claude = spawn("claude", [], {
    stdio: "inherit",
    shell: isWindows,
    env: claudeEnv,
  });

  claude.on("error", (error) => {
    console.error("❌ 启动 Claude Code 失败:", error.message);
    console.log("   请确认 Claude Code 已全局安装：npm install -g @anthropic-ai/claude-code");
    if (isWindows) {
      console.log("   Windows 用户请确认在 PowerShell 或 CMD 中运行，而非 Git Bash");
    }
  });

  claude.on("exit", (code) => {
    process.exit(code || 0);
  });
}

/**
 * 打开 Web UI
 */
async function openUI() {
  const port = getPort();
  const url = `http://127.0.0.1:${port}/ui`;
  const healthy = await waitForService(port, 800);

  console.log(`🌐 Opening UI at ${url}`);
  if (!healthy) {
    console.log("⚠️  当前 UI 服务未就绪；如果页面无法打开，请先运行 ctr start 或 ctr start --daemon。");
  }

  if (process.env.CTR_UI_SKIP_OPEN === "1") {
    console.log("   Browser launch skipped by CTR_UI_SKIP_OPEN=1");
    return;
  }

  try {
    open(url);
  } catch (error: any) {
    console.log(`   Please open ${url} in your browser`);
  }
}

/**
 * 主函数
 */
export async function main() {
  const command = getCommand();

  switch (command) {
    case "setup":
      await runSetupCli();
      break;

    case "doctor":
      await runDoctorCli();
      break;

    case "eval":
      await runOfflineEvaluationCli();
      break;

    case "init":
      initConfig();
      break;

    case "deploy":
      initDeployConfig();
      break;

    case "start":
      if (isDaemonMode()) {
        await startDaemon(getPort());
      } else {
        await startForeground(getPort());
      }
      break;

    case "stop":
      stopService();
      break;

    case "status":
      await showStatus();
      break;

    case "version":
      await printVersion();
      break;

    case "upgrade":
      printUpgradeGuidance();
      break;

    case "restart":
      printRestartGuidanceHint();
      await restartService();
      break;

    case "code":
      await runClaudeCode();
      break;

    case "ui":
      await openUI();
      break;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      if (command) {
        console.log(`Unknown command: ${command}`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

if (process.env.CTR_SKIP_MAIN !== "1") {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
