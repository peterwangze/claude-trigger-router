/**
 * Process Check Utilities
 *
 * 进程检查和管理工具
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { PID_FILE } from "../constants";

/**
 * 检查服务是否正在运行
 */
export function isServiceRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    // 检查进程是否存在
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      // 进程不存在，清理 PID 文件
      cleanupPidFile();
      return false;
    }
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
      console.error("Failed to cleanup PID file:", error);
    }
  }
}
