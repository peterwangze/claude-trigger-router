/**
 * Claude Trigger Router
 *
 * 智能触发路由器主入口
 */

import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { initConfig, initDir, readConfigFile } from "./utils";
import { createServer } from "./server";
import { router } from "./router";
import { apiKeyAuth } from "./middleware/auth";
import { authQuotaUsageStore, managedApiKeySummary } from "./auth/api-keys";
import { loadPersistedAuthQuotaUsage, savePersistedAuthQuotaUsage } from "./auth/quota-persistence";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { HOME_DIR } from "./constants";
import { configureLogging, log, logError, logWarn, logDebug } from "./utils/log";
import { sessionUsageCache } from "./router/cache";
import { SSEParserTransform } from "./utils/SSEParser.transform";
import { SSESerializerTransform } from "./utils/SSESerializer.transform";
import { rewriteStream } from "./utils/rewriteStream";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { triggerRouter as smartRouterRuntime } from "./trigger";
import { createStream } from 'rotating-file-stream';
import { appendTraceReason, applyResponseGovernance, contextAlignmentService, createGovernanceTrace, governStreamingResponse, sessionStateStore } from "./governance";
import { buildModelRegistry, getCompiledModelRef, resolveModelReference } from "./models/compile";
import { buildProviderDispatchRequest } from "./protocols";

const event = new EventEmitter();

function cloneRequestBody<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

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

function buildServerInitialConfig(config: any, registry: any, host: string, servicePort: number) {
  return {
    ...config,
    providers: registry.providers,
    HOST: host,
    PORT: servicePort,
    LOG_FILE: join(
      homedir(),
      ".claude-trigger-router",
      "claude-trigger-router.log"
    ),
  };
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
  authQuotaUsageStore.hydrate(config.Auth?.quota_usage);
  try {
    authQuotaUsageStore.hydrate(await loadPersistedAuthQuotaUsage());
  } catch (error) {
    logWarn(`[AuthQuota] Failed to load persisted quota usage: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 配置日志
  configureLogging(config);

  let HOST = config.HOST || "127.0.0.1";
  const managedKeySummary = managedApiKeySummary(config);
  const hasPublicAuth = Boolean(config.APIKEY || managedKeySummary.active > 0);

  if (config.HOST && !hasPublicAuth) {
    HOST = "127.0.0.1";
    logWarn("⚠️ API key or active managed key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = options.port ?? config.PORT ?? DEFAULT_CONFIG.PORT;

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

    return `ctr-${month}${day}${hour}${minute}${seconds}${index ? `_${index}` : ''}.log`;
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
  const registry = buildModelRegistry(config);
  const server = createServer({
    useJsonFile: false,
    initialConfig: buildServerInitialConfig(config, registry, HOST, servicePort),
    logger: loggerConfig,
  });

  const authMiddleware = apiKeyAuth(async () => {
    try {
      const currentConfig = await readConfigFile();
      return {
        ...config,
        APIKEY: currentConfig.APIKEY,
        Auth: currentConfig.Auth,
      };
    } catch (error) {
      logWarn(`[Auth] Failed to refresh auth config, using startup auth config: ${error instanceof Error ? error.message : String(error)}`);
      return config;
    }
  }, {
    persistQuotaUsage: async (usage) => {
      try {
        await savePersistedAuthQuotaUsage(usage);
      } catch (error) {
        logWarn(`[AuthQuota] Failed to persist quota usage: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });

  // 认证中间件
  server.addHook("preHandler", async (req: any, reply: any) => {
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      authMiddleware(req, reply, done);
    });
  });

  // 初始化 SmartRouter 统一路由引擎
  smartRouterRuntime.init(config);
  log(`[SmartRouter] Initialized, enabled: ${smartRouterRuntime.isEnabled()}`);

  // SmartRouter 统一路由中间件（在原有路由之前）
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/messages")) {
      if (req.body.metadata?.user_id) {
        const parts = req.body.metadata.user_id.split("_session_");
        if (parts.length > 1) {
          req.sessionId = parts[1];
        }
      }

      req.governanceTrace = createGovernanceTrace({
        requestId: req.id,
        sessionKey: req.sessionId,
        initialModel: req.body?.model,
      });
      appendTraceReason(req.governanceTrace, "request_received");

      const bypassSmartRouter = req.headers["x-ctr-smart-router"] === "1";
      const triggerResult = bypassSmartRouter
        ? { matched: false, confidence: 0, analysisTime: 0 }
        : await smartRouterRuntime.route(req);
      req.triggerResult = triggerResult;

      if (!bypassSmartRouter && triggerResult.matched && triggerResult.model) {
          const previousSessionState = req.sessionId ? sessionStateStore.get(req.sessionId) : undefined;
          const previousModel = previousSessionState?.lastSuccessfulModel;
          const alignmentConfig =
            smartRouterRuntime.getSmartRouterConfig()?.sticky?.alignment
            ?? config.Governance?.sticky?.alignment;

        if (
          smartRouterRuntime.getSmartRouterConfig()?.enabled &&
          alignmentConfig?.enabled &&
          previousModel &&
          previousModel !== triggerResult.model &&
          triggerResult.analyzedText
          ) {
            const resolvedAlignmentConfig = {
              ...alignmentConfig,
              summarizer_model: resolveModelReference(config, alignmentConfig.summarizer_model) ?? alignmentConfig.summarizer_model,
            };
            const summary = await contextAlignmentService.summarizeTransition(
              triggerResult.analyzedText,
              previousModel,
              triggerResult.model,
              resolvedAlignmentConfig,
              servicePort,
              undefined,
              config.APIKEY,
            config.API_TIMEOUT_MS
          );

          if (summary) {
            req.body.system = contextAlignmentService.injectAlignmentContext(
              req.body.system,
              summary,
              previousModel,
              triggerResult.model
            );
            req.governanceTrace.alignmentUsed = true;
            appendTraceReason(req.governanceTrace, 'context_alignment');
          }
        }

        req.body.model = triggerResult.model;
        req.governanceTrace.finalModel = triggerResult.model;

        log(
          `[SmartRouter] Selected "${triggerResult.rule?.name ?? triggerResult.routeSource ?? 'route'}" -> "${triggerResult.model}"`
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

      const compiledModel = getCompiledModelRef(config, req.body?.model);
      if (compiledModel?.interface && req.body?.messages) {
        const originalBody = cloneRequestBody(req.body);
        const upstream = buildProviderDispatchRequest({
          model: compiledModel.modelName,
          interface: compiledModel.interface,
          compatibilityProfile: compiledModel.compatibilityProfile,
          request: originalBody,
          capabilities: compiledModel.capabilities,
        });

        req.originalRequestBody = originalBody;
        req.messageIR = upstream.ir;
        req.upstreamRequestBody = upstream.body;
        req.upstreamInterface = compiledModel.interface;
        req.protocolDiagnostics = upstream.diagnostics;
        if (upstream.diagnostics.length) {
          logWarn(
            `[ProtocolDispatch] Model "${compiledModel.id}" reported capability diagnostics: ${upstream.diagnostics.join(', ')}`
          );
        }
        req.body = {
          ...upstream.body,
          model: req.body.model,
        };
      }
    }
  });

  // 错误处理
  server.addHook("onError", async (request: any, reply: any, error: any) => {
    event.emit("onError", request, reply, error);
  });

  // 响应处理
  server.addHook("onSend", (req: any, reply: any, payload: any, done: any) => {
    if (req.originalRequestBody) {
      req.body = req.originalRequestBody;
    }

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

          const agentStream = rewriteStream(eventStream, async (data: any, controller: any) => {
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
            }).pipeThrough(sseSerializer as any);

          return done(
            null,
            governStreamingResponse(agentStream, req, config, servicePort)
          );
        }

        return done(null, governStreamingResponse(payload, req, config, servicePort));
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
    }
    if (typeof payload === "object" && payload.error) {
      if (req.modelPoolSelection) {
        applyResponseGovernance({
          req,
          payload,
          config,
          servicePort,
        }).then((governedPayload) => {
          req.responseGovernanceApplied = true;
          if (governedPayload && typeof governedPayload === "object" && governedPayload.error) {
            return done(governedPayload.error, null);
          }
          if (req.sessionId && governedPayload?.usage) {
            sessionUsageCache.put(req.sessionId, governedPayload.usage);
          }
          return done(null, governedPayload);
        }).catch((error) => done(error, null));
        return;
      }
      return done(payload.error, null);
    }
    done(null, payload);
  });

  server.addHook("onSend", async (req: any, reply: any, payload: any) => {
    if (payload instanceof ReadableStream) {
      return payload;
    }

    if (!req.responseGovernanceApplied) {
      payload = await applyResponseGovernance({
        req,
        payload,
        config,
        servicePort,
      });
    }

    if (req.governanceTrace) {
      logDebug("[GovernanceTrace]", JSON.stringify(req.governanceTrace));
    }

    logDebug("onSend hook triggered");
    event.emit("onSend", req, reply, payload);
    return payload;
  });

  await server.start();
}

export { buildServerInitialConfig, run, initializeClaudeConfig };
