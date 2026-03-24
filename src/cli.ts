#!/usr/bin/env node

/**
 * CLI Entry Point
 *
 * 命令行入口
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import open from "openurl";
import { existsSync, readFileSync, copyFileSync, mkdirSync } from "fs";
import { run, initializeClaudeConfig } from "./index";
import { isServiceRunning, killProcess, readServiceInfo } from "./utils/processCheck";
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, CONFIG_FILE_YML, DEFAULT_CONFIG } from "./constants";

const args = process.argv.slice(2);
const command = args[0];

/**
 * 从命令行参数或配置文件中获取端口号
 */
function getPort(): number {
  // 优先使用命令行参数
  const portIndex = args.indexOf("--port") !== -1 ? args.indexOf("--port") : args.indexOf("-p");
  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10);
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
  return args.includes("--daemon") || args.includes("-d");
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
Claude Trigger Router - 智能触发路由器

用法：ctr <命令> [选项]

命令：
  init        初始化配置文件（从示例模板复制）
  start       启动路由服务（默认前台运行）
  stop        停止后台服务
  restart     重启后台服务
  status      查看服务运行状态（PID、端口、启动时间）
  code        通过路由器运行 Claude Code（需先启动服务）
  ui          打开管理 API 说明页（Web UI 开发中）
  help        显示此帮助信息

选项：
  --port, -p    指定监听端口（默认：3456）
  --daemon, -d  以后台方式运行（配合 start/restart 使用）
  --force       强制覆盖已有配置（配合 init 使用）

使用示例：
  ctr init                 # 初始化配置文件
  ctr start                # 前台启动（推荐首次使用，便于查看日志）
  ctr start --daemon       # 后台启动
  ctr status               # 查看服务状态
  ctr code                 # 启动 Claude Code（需先运行 ctr start）
  ctr stop                 # 停止后台服务
  ctr restart --daemon     # 重启后台服务

配置文件：
  ${CONFIG_FILE}
  ${CONFIG_FILE_JSON}

配置目录：${CONFIG_DIR}

更多信息：https://github.com/peterwangze/claude-trigger-router
`);
}

/**
 * 初始化配置文件
 */
function initConfig() {
  const force = args.includes("--force");

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

  // 查找示例配置文件
  const examplePaths = [
    join(__dirname, "..", "config", "trigger.example.yaml"),
    join(dirname(process.argv[1]), "..", "config", "trigger.example.yaml"),
  ];

  const exampleFile = examplePaths.find((p) => existsSync(p));

  if (!exampleFile) {
    console.error("❌ 找不到示例配置文件。");
    console.log(`   请手动创建 ${CONFIG_FILE}`);
    console.log("   参考文档：https://github.com/peterwangze/claude-trigger-router#configuration");
    process.exit(1);
  }

  try {
    copyFileSync(exampleFile, CONFIG_FILE);
    const action = force ? "已覆盖" : "已创建";
    console.log(`✅ 配置文件${action}：${CONFIG_FILE}`);
    console.log("");
    console.log("下一步：");
    console.log("  1. 编辑配置文件，填入你的 API 密钥");
    console.log("  2. 在 'Providers' 下配置你的模型提供商");
    console.log("  3. 将 'Router.default' 设置为你的默认模型");
    console.log("  4. 在 'TriggerRouter.rules' 下自定义触发规则");
    console.log(`  5. 运行：ctr start`);
  } catch (error: any) {
    console.error("❌ 创建配置文件失败:", error.message);
    process.exit(1);
  }
}

/**
 * 以前台方式启动服务
 */
async function startForeground(port?: number) {
  console.log("🚀 Starting Claude Trigger Router (foreground)...");
  console.log("   Press Ctrl+C to stop");

  try {
    await run({ port });
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
function startDaemon(port?: number) {
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

  // 等待服务启动（最多 5 秒）
  const targetPort = port ?? getPort();
  let waited = 0;
  const interval = setInterval(() => {
    waited += 500;
    if (isServiceRunning()) {
      clearInterval(interval);
      console.log(`✅ Service started in background (port: ${targetPort})`);
      console.log(`   Run 'ctr stop' to stop it.`);
    } else if (waited >= 5000) {
      clearInterval(interval);
      console.log(`✅ Service launched in background (port: ${targetPort})`);
      console.log(`   If it fails to start, run 'ctr start' (without --daemon) to see errors.`);
    }
  }, 500);
}

/**
 * 显示服务状态
 */
function showStatus() {
  const info = readServiceInfo();
  if (!info || !isServiceRunning()) {
    console.log("⏹  服务未运行");
    return;
  }
  const startTime = info.startTime ? new Date(info.startTime).toLocaleString() : "未知";
  console.log("✅ 服务运行中");
  console.log(`   PID：${info.pid}`);
  console.log(`   端口：${info.port}`);
  console.log(`   启动时间：${startTime}`);
  console.log(`   接入地址：http://127.0.0.1:${info.port}`);
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
function restartService() {
  stopService();
  setTimeout(() => startDaemon(getPort()), 1500);
}

/**
 * 检查服务是否在监听
 * 通过发送 HTTP 请求到 /api/config 端点来判断
 */
async function waitForService(port: number, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok || res.status < 500) return true;
    } catch {
      // 服务尚未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/**
 * 运行 Claude Code
 */
async function runClaudeCode() {
  const port = getPort();

  // 确保 ~/.claude.json 存在（跳过 Claude Code 首次引导流程）
  // 仅在此处执行，避免在 ctr start 时产生不必要的全局副作用
  await initializeClaudeConfig();

  // 检查服务是否在运行
  const running = isServiceRunning();

  if (!running) {
    // 尝试 HTTP 连通性检查（兼容非 PID 方式启动的服务）
    console.log(`🔍 Checking if service is available on port ${port}...`);
    const reachable = await waitForService(port, 2000);

    if (!reachable) {
      console.log(`⚠️  Trigger Router service is not running on port ${port}.`);
      console.log("");
      console.log("Options:");
      console.log("  1. Start service first:  ctr start --daemon");
      console.log("  2. Or start interactively in another terminal:  ctr start");
      console.log("");
      const proceed = process.env.CTR_AUTO_START === "1";
      if (!proceed) {
        process.exit(1);
      }
    }
  }

  console.log(`🚀 Starting Claude Code with Trigger Router (port: ${port})...`);

  // 启动 Claude Code（Windows 上 npm 全局命令为 .cmd shim，需要 shell: true）
  const isWindows = process.platform === "win32";
  const claude = spawn("claude", [], {
    stdio: "inherit",
    shell: isWindows,
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    },
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
function openUI() {
  const port = getPort();
  const url = `http://127.0.0.1:${port}/ui`;

  console.log(`🌐 Opening UI at ${url}`);

  try {
    open(url);
  } catch (error: any) {
    console.log(`   Please open ${url} in your browser`);
  }
}

/**
 * 主函数
 */
async function main() {
  switch (command) {
    case "init":
      initConfig();
      break;

    case "start":
      if (isDaemonMode()) {
        startDaemon(getPort());
      } else {
        await startForeground(getPort());
      }
      break;

    case "stop":
      stopService();
      break;

    case "status":
      showStatus();
      break;

    case "restart":
      restartService();
      break;

    case "code":
      await runClaudeCode();
      break;

    case "ui":
      openUI();
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

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
