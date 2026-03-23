/**
 * Server
 *
 * Fastify 服务器配置
 */

import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { log } from "./utils/log";

/**
 * 创建服务器
 */
export const createServer = (config: any): Server => {
  const server = new Server(config);

  // 读取配置 API
  server.app.get("/api/config", async (req: any, reply: any) => {
    return await readConfigFile();
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
    const newConfig = req.body;

    // 备份现有配置
    const backupPath = await backupConfigFile();
    if (backupPath) {
      log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
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

      spawn(process.execPath, [cliPath, "start", "--daemon"], {
        detached: true,
        stdio: "ignore",
      }).unref();

      // 等待新进程启动后再退出当前进程
      setTimeout(() => process.exit(0), 500);
    }, 500);
  });

  // Web UI 入口（功能尚未开放，返回占位页面）
  server.app.get("/ui", async (_: any, reply: any) => {
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claude Trigger Router</title></head>` +
      `<body style="font-family:sans-serif;padding:2rem">` +
      `<h2>Claude Trigger Router</h2>` +
      `<p>Web UI 功能尚在开发中，暂未开放。</p>` +
      `<p>你可以通过以下 API 端点管理服务：</p>` +
      `<ul>` +
      `<li><code>GET /api/config</code> — 读取当前配置</li>` +
      `<li><code>POST /api/config</code> — 保存配置</li>` +
      `<li><code>GET /api/transformers</code> — 查看已加载 transformer</li>` +
      `<li><code>POST /api/restart</code> — 重启服务</li>` +
      `</ul>` +
      `</body></html>`
    );
  });

  return server;
};
