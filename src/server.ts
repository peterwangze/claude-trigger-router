/**
 * Server
 *
 * Fastify 服务器配置
 */

import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
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

  // 静态文件服务
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // 重定向 /ui 到 /ui/
  server.app.get("/ui", async (_: any, reply: any) => {
    return reply.redirect("/ui/");
  });

  return server;
};
