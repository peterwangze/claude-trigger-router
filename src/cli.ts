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
import { run } from "./index";
import { isServiceRunning, killProcess } from "./utils/processCheck";
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, DEFAULT_CONFIG } from "./constants";

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

  // 尝试从配置文件读取
  try {
    if (existsSync(CONFIG_FILE)) {
      const yaml = require("js-yaml");
      const content = readFileSync(CONFIG_FILE, "utf-8");
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
Claude Trigger Router - Intelligent trigger-based router for Claude Code

Usage: ctr <command> [options]

Commands:
  init        Initialize the configuration file
  start       Start the router service (foreground by default)
  stop        Stop the router service (daemon mode)
  restart     Restart the router service (daemon mode)
  code        Run Claude Code with the router
  ui          Open the web UI
  help        Show this help message

Options:
  --port, -p    Specify the port (default: 3456)
  --daemon, -d  Run the service in background (used with start/restart)

Examples:
  ctr init              # Initialize config file
  ctr start             # Start in foreground (for debugging)
  ctr start --daemon    # Start in background
  ctr code              # Run Claude Code (auto-starts service if needed)
  ctr stop              # Stop background service
  ctr ui                # Open the web UI

Configuration:
  Config file: ${CONFIG_FILE} or ${CONFIG_FILE_JSON}
  Config dir:  ${CONFIG_DIR}

For more information, visit: https://github.com/peterwangze/claude-trigger-router
`);
}

/**
 * 初始化配置文件
 */
function initConfig() {
  if (existsSync(CONFIG_FILE)) {
    console.log(`⚠️  Config file already exists: ${CONFIG_FILE}`);
    console.log("    Use --force to overwrite.");
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
    console.error("❌ Could not find example config file.");
    console.log(`   Please create ${CONFIG_FILE} manually.`);
    console.log("   Reference: https://github.com/peterwangze/claude-trigger-router#configuration");
    process.exit(1);
  }

  try {
    copyFileSync(exampleFile, CONFIG_FILE);
    console.log(`✅ Config file created: ${CONFIG_FILE}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Edit the config file and fill in your API keys");
    console.log("  2. Configure your model providers under 'Providers'");
    console.log("  3. Set 'Router.default' to your default model");
    console.log("  4. Customize trigger rules under 'TriggerRouter.rules'");
    console.log(`  5. Run: ctr start --daemon`);
  } catch (error: any) {
    console.error("❌ Failed to create config file:", error.message);
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
 * 停止服务
 */
function stopService() {
  if (!isServiceRunning()) {
    console.log("⚠️  No running service found.");
    return;
  }

  try {
    const pid = parseInt(readFileSync(require("path").join(CONFIG_DIR, "claude-trigger-router.pid"), "utf-8").trim(), 10);
    killProcess(pid);
    console.log("✅ Service stopped.");
  } catch (error: any) {
    console.error("❌ Failed to stop service:", error.message);
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

  // 启动 Claude Code
  const claude = spawn("claude", [], {
    stdio: "inherit",
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    },
  });

  claude.on("error", (error) => {
    console.error("❌ Failed to start Claude Code:", error.message);
    console.log(
      "   Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
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
