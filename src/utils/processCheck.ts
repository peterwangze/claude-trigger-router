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
  const info = readServiceInfo();
  if (!info || isNaN(info.pid) || info.pid <= 0) {
    cleanupPidFile();
    return false;
  }

  if (isProcessAlive(info.pid)) {
    return true;
  }

  // 进程不存在，清理 PID 文件
  cleanupPidFile();
  return false;
}

/**
 * PID 文件中的服务元数据
 */
export interface IServiceInfo {
  pid: number;
  port: number;
  startTime: string;
}

/**
 * 保存 PID 及服务元数据
 */
export function savePid(pid: number, port?: number): void {
  const info: IServiceInfo = {
    pid,
    port: port ?? 3456,
    startTime: new Date().toISOString(),
  };
  writeFileSync(PID_FILE, JSON.stringify(info, null, 2), "utf-8");
}

/**
 * 读取服务元数据，兼容旧版纯数字格式
 */
export function readServiceInfo(): IServiceInfo | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const content = readFileSync(PID_FILE, "utf-8").trim();
    // 兼容旧格式（纯数字 PID）
    if (/^\d+$/.test(content)) {
      return { pid: parseInt(content, 10), port: 3456, startTime: '' };
    }
    return JSON.parse(content) as IServiceInfo;
  } catch {
    return null;
  }
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
