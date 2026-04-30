/**
 * Router
 *
 * 路由逻辑，复用自 claude-code-router
 */

import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { IAppConfig } from '../trigger/types';
import { sessionUsageCache, Usage } from './cache';
import { log, logError } from '../utils/log';
import { getCompiledModelRef, resolveModelReference } from '../models/compile';
import type { ICompiledModelRef } from '../models/compile';
import { appendTraceReason } from '../governance';

const enc = get_encoding("cl100k_base");

/**
 * 计算 token 数量
 */
const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

/**
 * 获取使用的模型
 */
const getUseModel = async (
  req: any,
  tokenCount: number,
  config: IAppConfig,
  lastUsage?: Usage | undefined
) => {
  // 如果模型已经包含逗号（已经被触发路由设置），直接返回
  const explicitModel = resolveModelReference(config, req.body.model);
  if (explicitModel && explicitModel.includes(",")) {
    return explicitModel;
  }

  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
    log(
      "Using long context model due to token count:",
      tokenCount,
      "threshold:",
      longContextThreshold
    );
    return resolveModelReference(config, config.Router.longContext);
  }

  // 子代理模型标记
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CTR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CTR-SUBAGENT-MODEL>(.*?)<\/CTR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CTR-SUBAGENT-MODEL>${model[1]}</CTR-SUBAGENT-MODEL>`,
        ""
      );
      return resolveModelReference(config, model[1]);
    }
  }

  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    log("Using background model for ", req.body.model);
    return resolveModelReference(config, config.Router.background);
  }

  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    log("Using think model for ", req.body.thinking);
    return resolveModelReference(config, config.Router.think);
  }

  // web search
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return resolveModelReference(config, config.Router.webSearch);
  }

  return resolveModelReference(config, config.Router!.default);
};

const applyModelThinking = (req: any, config: IAppConfig, modelRef?: string): void => {
  const compiled = getCompiledModelRef(config, modelRef);
  const thinking = compiled?.thinking;

  if (!thinking) {
    return;
  }

  if (thinking.mode === 'off') {
    delete req.body.thinking;
    return;
  }

  if (thinking.mode === 'on') {
    req.body.thinking = {
      ...(typeof req.body.thinking === 'object' && req.body.thinking ? req.body.thinking : { type: 'enabled' }),
      type: 'enabled',
    };
  }

  if (thinking.mode === 'auto' && !req.body.thinking) {
    return;
  }

  if (!req.body.thinking) {
    req.body.thinking = { type: 'enabled' };
  }

  if (thinking.effort) {
    req.body.thinking.effort = thinking.effort;
  }

  if (thinking.budget_tokens) {
    req.body.thinking.budget_tokens = thinking.budget_tokens;
  }
};

const readPositiveInteger = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
};

const getRequestedOutputTokens = (body: any): number => {
  return readPositiveInteger(body?.max_tokens)
    ?? readPositiveInteger(body?.max_completion_tokens)
    ?? 0;
};

const getThinkingBudgetTokens = (body: any): number => {
  return readPositiveInteger(body?.thinking?.budget_tokens) ?? 0;
};

const getEffectiveThinkingBudgetTokens = (
  compiled: ICompiledModelRef | undefined,
  body: any
): number => {
  const modelThinking = compiled?.thinking;
  if (modelThinking?.mode === 'off') {
    return 0;
  }

  return readPositiveInteger(modelThinking?.budget_tokens)
    ?? getThinkingBudgetTokens(body);
};

function evaluateContextFit(compiled: ICompiledModelRef | undefined, req: any, tokenCount: number) {
  const safeInputTokens = compiled?.capabilities?.safeInputTokens;
  const contextWindowTokens = compiled?.capabilities?.contextWindowTokens;
  const outputTokens = getRequestedOutputTokens(req.body);
  const thinkingTokens = getEffectiveThinkingBudgetTokens(compiled, req.body);
  const estimatedTotalTokens = tokenCount + outputTokens + thinkingTokens;

  if (safeInputTokens && tokenCount > safeInputTokens) {
    return {
      fits: false,
      code: 'safe_input_exceeded',
      inputTokens: tokenCount,
      estimatedTotalTokens,
      limit: safeInputTokens,
    };
  }

  if (contextWindowTokens && estimatedTotalTokens > contextWindowTokens) {
    return {
      fits: false,
      code: 'context_window_exceeded',
      inputTokens: tokenCount,
      estimatedTotalTokens,
      limit: contextWindowTokens,
    };
  }

  return {
    fits: true,
    inputTokens: tokenCount,
    estimatedTotalTokens,
  };
}

function applyContextWindowGuard(
  req: any,
  config: IAppConfig,
  selectedModel: string | undefined,
  tokenCount: number
): string | undefined {
  if (!selectedModel) {
    return selectedModel;
  }

  const selectedCompiled = getCompiledModelRef(config, selectedModel);
  const selectedFit = evaluateContextFit(selectedCompiled, req, tokenCount);
  if (selectedFit.fits) {
    return selectedModel;
  }

  const longContextModel = config.Router.longContext
    ? resolveModelReference(config, config.Router.longContext)
    : undefined;
  if (longContextModel && longContextModel !== selectedModel) {
    const longContextCompiled = getCompiledModelRef(config, longContextModel);
    const longContextFit = evaluateContextFit(longContextCompiled, req, tokenCount);
    if (longContextFit.fits) {
      log(
        "Using long context model due to selected model context capacity:",
        selectedModel,
        "->",
        longContextModel,
        "input tokens:",
        selectedFit.inputTokens,
        "estimated total tokens:",
        selectedFit.estimatedTotalTokens,
        "limit:",
        selectedFit.limit
      );
      if (req.governanceTrace) {
        appendTraceReason(
          req.governanceTrace,
          `context_window_fallback:${selectedCompiled?.id ?? selectedModel}->${longContextCompiled?.id ?? longContextModel}`
        );
      }
      return longContextModel;
    }
  }

  req.contextWindowExceeded = {
    code: selectedFit.code,
    model: selectedCompiled?.id ?? selectedModel,
    inputTokens: selectedFit.inputTokens,
    estimatedTotalTokens: selectedFit.estimatedTotalTokens,
    limit: selectedFit.limit,
    longContextModel: config.Router.longContext,
  };
  if (req.governanceTrace) {
    appendTraceReason(req.governanceTrace, `context_window_exceeded:${selectedCompiled?.id ?? selectedModel}`);
  }
  return selectedModel;
}

/**
 * 路由中间件
 */
export const router = async (req: any, _res: any, context: any) => {
  const { config, event } = context;

  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
    }
  }

  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;

  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;

    // 自定义路由器（触发路由已命中时跳过，避免覆盖更高优先级的选择）
    if (config.CUSTOM_ROUTER_PATH && !req.body.model.includes(",")) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount;
        model = await customRouter(req, config, {
          event
        });
      } catch (e: any) {
        logError("failed to load custom router", e.message);
      }
    }

    // 如果没有通过触发路由或自定义路由设置模型，使用原有逻辑
    if (!model && !req.body.model.includes(",")) {
      model = await getUseModel(req, tokenCount, config, lastMessageUsage);
    }

    // 如果触发路由已命中（模型含逗号），保留其选择
    req.body.model = applyContextWindowGuard(req, config, model ?? req.body.model, tokenCount);
    applyModelThinking(req, config, req.body.model);
    const compiledModel = getCompiledModelRef(config, req.body.model);
    if (compiledModel?.source === 'registration' && compiledModel.modelPool) {
      req.modelPoolSelection = compiledModel.modelPool;
      if (req.governanceTrace) {
        req.governanceTrace.finalModel = req.body.model;
        appendTraceReason(
          req.governanceTrace,
          `model_pool:${compiledModel.modelPool.modelId}:${compiledModel.modelPool.endpointId}`
        );
      }
    }
    req.tokenCount = tokenCount;
  } catch (error: any) {
    logError("Error in router middleware:", error.message);
    req.body.model = config.Router!.default;
  }

  return;
};
