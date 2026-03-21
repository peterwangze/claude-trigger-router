#!/usr/bin/env node

/**
 * CLI Entry Point
 *
 * 命令行入口
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import open from "openurl";
import { existsSync } from "fs";
import { run } from "./index";
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON } from "./constants";

const args = process.argv.slice(2);
const command = args[0];

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
Claude Trigger Router - Intelligent trigger-based router for Claude Code

Usage: ctr <command> [options]

Commands:
  start       Start the router service in background
  stop        Stop the router service
  restart     Restart the router service
  code        Run Claude Code with the router
  ui          Open the web UI
  help        Show this help message

Options:
  --port, -p  Specify the port (default: 3456)

Examples:
  ctr start
  ctr code
  ctr ui

Configuration:
  Config file: ${CONFIG_FILE} or ${CONFIG_FILE_JSON}
  Config dir:  ${CONFIG_DIR}

For more information, visit: https://github.com/peterwangze/claude-trigger-router
`);
}

/**
 * 启动服务
 */
async function startService(port?: number) {
  console.log("🚀 Starting Claude Trigger Router...");

  try {
    await run({ port });
    console.log("✅ Service started successfully");
  } catch (error: any) {
    console.error("❌ Failed to start service:", error.message);
    process.exit(1);
  }
}

/**
 * 停止服务
 */
function stopService() {
  const pidFile = join(CONFIG_DIR, "claude-trigger-router.pid");

  if (!existsSync(pidFile)) {
    console.log("⚠️ No running service found");
    return;
  }

  try {
    const { readFileSync, unlinkSync } = require("fs");
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    unlinkSync(pidFile);
    console.log("✅ Service stopped");
  } catch (error: any) {
    console.error("❌ Failed to stop service:", error.message);
  }
}

/**
 * 运行 Claude Code
 */
function runClaudeCode() {
  const port = 3456;

  console.log("🚀 Starting Claude Code with Trigger Router...");

  // 设置环境变量
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;

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
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
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
  const port = 3456;
  const url = `http://127.0.0.1:${port}/ui`;

  console.log(`🌐 Opening UI at ${url}`);

  try {
    open(url);
  } catch (error: any) {
    console.log(`Please open ${url} in your browser`);
  }
}

/**
 * 主函数
 */
async function main() {
  switch (command) {
    case "start":
      const portIndex = args.indexOf("--port") !== -1 ? args.indexOf("--port") : args.indexOf("-p");
      const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : undefined;
      await startService(port);
      break;

    case "stop":
      stopService();
      break;

    case "restart":
      stopService();
      setTimeout(() => startService(), 1000);
      break;

    case "code":
      runClaudeCode();
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
