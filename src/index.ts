/**
 * Claude Trigger Router
 *
 * 智能触发路由器主入口
 */

import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir } from "./utils";
import { createServer } from "./server";
import { router } from "./router";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE, HOME_DIR } from "./constants";
import { configureLogging, log, logError, logWarn, logDebug } from "./utils/log";
import { sessionUsageCache } from "./router/cache";
import { SSEParserTransform } from "./utils/SSEParser.transform";
import { SSESerializerTransform } from "./utils/SSESerializer.transform";
import { rewriteStream } from "./utils/rewriteStream";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { triggerRouter } from "./trigger";
import { createStream } from 'rotating-file-stream';

const event = new EventEmitter();

/**
 * 初始化 Claude 配置
 */
async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    // 自动创建 ~/.claude.json，标记 onboarding 已完成，避免 Claude Code 重复走引导流程
    // 仅在文件不存在时创建，不会覆盖用户已有的配置
    log(`Creating ${configPath} for Claude Code compatibility (onboarding bypass)`);
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

/**
 * 运行服务
 */
async function run(options: RunOptions = {}) {
  // 检查服务是否已在运行
  if (isServiceRunning()) {
    log("✅ Service is already running in the background.");
    return;
  }

  await initDir();

  const config = await initConfig();

  // 配置日志
  configureLogging(config);

  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    logWarn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = options.port ?? config.PORT ?? 3456;

  // 保存 PID 及元数据（端口、启动时间），供 ctr status 等命令使用
  savePid(process.pid, port);

  // 处理退出信号
  process.on("SIGINT", () => {
    log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });

  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;

  // 将实际运行端口写回 config，确保所有内部模块（TriggerRouter、ImageAgent 等）
  // 自回调时使用同一端口，避免 --port 覆盖与配置文件 PORT 不一致导致的问题
  config.PORT = servicePort;

  // 配置日志器
  const pad = (num: number) => (num > 9 ? "" : "0") + num;
  const generator = (time: Date | number, index: number | undefined) => {
    if (!time) {
      time = new Date();
    }
    const date = new Date(time);
    const month = date.getFullYear() + "" + pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `./logs/ctr-${month}${day}${hour}${minute}${seconds}${index ? `_${index}` : ''}.log`;
  };

  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createStream(generator, {
            path: HOME_DIR,
            maxFiles: 3,
            interval: "1d",
            compress: 'gzip'
          }),
        }
      : false;

  // 创建服务器
  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      providers: config.Providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-trigger-router",
        "claude-trigger-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // 认证中间件
  server.addHook("preHandler", async (req: any, reply: any) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      apiKeyAuth(config)(req, reply, done);
    });
  });

  // 初始化触发路由器
  triggerRouter.init(config);
  log(`[TriggerRouter] Initialized, enabled: ${triggerRouter.isEnabled()}`);

  // 触发路由中间件（在原有路由之前）
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/messages")) {
      // 执行触发路由
      const triggerResult = await triggerRouter.route(req);

      if (triggerResult.matched && triggerResult.model) {
        req.body.model = triggerResult.model;
        req.triggerResult = triggerResult;

        log(
          `[TriggerRouter] Matched rule "${triggerResult.rule?.name}" -> "${triggerResult.model}"`
        );
      }

      // Agent 处理
      const useAgents: string[] = [];

      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          useAgents.push(agent.name);
          agent.reqHandler(req, config);

          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = [];
            }
            req.body.tools.unshift(
              ...Array.from(agent.tools.values()).map((item) => ({
                name: item.name,
                description: item.description,
                input_schema: item.input_schema,
              }))
            );
          }
        }
      }

      if (useAgents.length) {
        req.agents = useAgents;
      }

      // 执行原有路由
      await router(req, reply, {
        config,
        event,
      });
    }
  });

  // 错误处理
  server.addHook("onError", async (request: any, reply: any, error: any) => {
    event.emit("onError", request, reply, error);
  });

  // 响应处理
  server.addHook("onSend", (req: any, reply: any, payload: any, done: any) => {
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const sseParser = new SSEParserTransform();
          const eventStream = payload.pipeThrough(sseParser as any);
          let currentAgent: IAgent | undefined;
          let currentToolIndex = -1;
          let currentToolName = "";
          let currentToolArgs = "";
          let currentToolId = "";
          const toolMessages: any[] = [];
          const assistantMessages: any[] = [];

          const sseSerializer = new SSESerializerTransform();

          return done(
            null,
            rewriteStream(eventStream, async (data: any, controller: any) => {
              try {
                // 工具调用开始
                if (
                  data.event === "content_block_start" &&
                  data?.data?.content_block?.name
                ) {
                  const agent = req.agents.find((name: string) =>
                    agentsManager
                      .getAgent(name)
                      ?.tools.get(data.data.content_block.name)
                  );
                  if (agent) {
                    currentAgent = agentsManager.getAgent(agent);
                    currentToolIndex = data.data.index;
                    currentToolName = data.data.content_block.name;
                    currentToolId = data.data.content_block.id;
                    return undefined;
                  }
                }

                // 收集工具参数
                if (
                  currentToolIndex > -1 &&
                  data.data.index === currentToolIndex &&
                  data.data?.delta?.type === "input_json_delta"
                ) {
                  currentToolArgs += data.data?.delta?.partial_json;
                  return undefined;
                }

                // 工具调用完成
                if (
                  currentToolIndex > -1 &&
                  data.data.index === currentToolIndex &&
                  data.data.type === "content_block_stop"
                ) {
                  try {
                    const args = JSON5.parse(currentToolArgs);
                    assistantMessages.push({
                      type: "tool_use",
                      id: currentToolId,
                      name: currentToolName,
                      input: args,
                    });
                    const toolResult = await currentAgent?.tools
                      .get(currentToolName)
                      ?.handler(args, {
                        req,
                        config,
                      });
                    logDebug("Tool result:", toolResult);
                    toolMessages.push({
                      tool_use_id: currentToolId,
                      type: "tool_result",
                      content: toolResult,
                    });
                    currentAgent = undefined;
                    currentToolIndex = -1;
                    currentToolName = "";
                    currentToolArgs = "";
                    currentToolId = "";
                  } catch (e) {
                    logError("Tool execution error:", e);
                  }
                  return undefined;
                }

                if (data.event === "message_delta" && toolMessages.length) {
                  req.body.messages.push({
                    role: "assistant",
                    content: assistantMessages,
                  });
                  req.body.messages.push({
                    role: "user",
                    content: toolMessages,
                  });
                  const response = await fetch(
                    `http://127.0.0.1:${servicePort}/v1/messages`,
                    {
                      method: "POST",
                      headers: {
                        "x-api-key": config.APIKEY || "",
                        "content-type": "application/json",
                      },
                      body: JSON.stringify(req.body),
                    }
                  );
                  if (!response.ok) {
                    return undefined;
                  }
                  const innerSseParser = new SSEParserTransform();
                  const stream = response.body!.pipeThrough(innerSseParser as any);
                  const reader = stream.getReader();
                  while (true) {
                    try {
                      const { value, done } = await reader.read();
                      if (done) {
                        break;
                      }
                      if (
                        ["message_start", "message_stop"].includes(value.event)
                      ) {
                        continue;
                      }

                      if (!controller.desiredSize) {
                        logWarn("Stream backpressure detected");
                        break;
                      }

                      controller.enqueue(value);
                    } catch (readError: any) {
                      if (
                        readError.name === "AbortError" ||
                        readError.code === "ERR_STREAM_PREMATURE_CLOSE"
                      ) {
                        log(
                          "Stream reading aborted due to client disconnect"
                        );
                        abortController.abort();
                        break;
                      }
                      throw readError;
                    }
                  }
                  return undefined;
                }
                return data;
              } catch (error: any) {
                logError(
                  "Unexpected error in stream processing:",
                  error
                );

                if (error.code === "ERR_STREAM_PREMATURE_CLOSE") {
                  log("Stream prematurely closed, aborting operations");
                  abortController.abort();
                  return undefined;
                }

                throw error;
              }
            }).pipeThrough(sseSerializer as any)
          );
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith("event: message_delta")) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, message.usage);
              } catch {}
            }
          } catch (readError: any) {
            if (
              readError.name === "AbortError" ||
              readError.code === "ERR_STREAM_PREMATURE_CLOSE"
            ) {
              log("Background read stream closed prematurely");
            } else {
              logError("Error in background stream reading:", readError);
            }
          } finally {
            reader.releaseLock();
          }
        };
        read(clonedStream);
        return done(null, originalStream);
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
    }
    if (typeof payload === "object" && payload.error) {
      return done(payload.error, null);
    }
    done(null, payload);
  });

  server.addHook("onSend", async (req: any, reply: any, payload: any) => {
    logDebug("onSend hook triggered");
    event.emit("onSend", req, reply, payload);
    return payload;
  });

  server.start();
}

export { run, initializeClaudeConfig };
