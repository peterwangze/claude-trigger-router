/**
 * Process Check Utilities
 *
 * 进程检查和管理工具
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PID_FILE } from "../constants";
import { logError } from "./log";

/**
 * 跨平台检查进程是否存在
 */
function isProcessAlive(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      // Windows: 使用 tasklist 查询 PID
      const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"], {
        encoding: "utf-8",
        timeout: 3000,
      });
      return result.stdout?.includes(`"${pid}"`) ?? false;
    } else {
      // Unix: 发送信号 0 检查进程是否存在
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * 跨平台终止进程
 */
export function killProcess(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/PID", String(pid)], { timeout: 5000 });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // 进程可能已经退出
    }
  }
}

/**
 * 检查服务是否正在运行
 */
export function isServiceRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    if (isNaN(pid) || pid <= 0) {
      cleanupPidFile();
      return false;
    }

    if (isProcessAlive(pid)) {
      return true;
    }

    // 进程不存在，清理 PID 文件
    cleanupPidFile();
    return false;
  } catch {
    return false;
  }
}

/**
 * 保存 PID
 */
export function savePid(pid: number): void {
  writeFileSync(PID_FILE, pid.toString(), "utf-8");
}

/**
 * 清理 PID 文件
 */
export function cleanupPidFile(): void {
  if (existsSync(PID_FILE)) {
    try {
      unlinkSync(PID_FILE);
    } catch (error) {
      logError("Failed to cleanup PID file:", error);
    }
  }
}
