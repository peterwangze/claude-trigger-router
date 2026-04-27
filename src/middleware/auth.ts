/**
 * Auth Middleware
 *
 * 认证中间件
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { IAppConfig } from "../trigger/types";
import { extractApiKeyFromHeaders, verifyApiKey } from "../auth/api-keys";

/**
 * API Key 认证中间件
 */
export function apiKeyAuth(config: IAppConfig) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    // 如果没有配置 bootstrap key 或 managed key，跳过认证
    if (!config.APIKEY && !config.Auth?.managed_keys?.length) {
      done();
      return;
    }

    const result = verifyApiKey(config, extractApiKeyFromHeaders(req.headers), "client");
    if (!result.ok) {
      const statusCode = result.reason === "insufficient_scope" ? 403 : 401;
      reply.code(statusCode).send({
        error: statusCode === 403 ? "Forbidden" : "Unauthorized",
        reason: result.reason,
      });
      done(new Error(statusCode === 403 ? "Forbidden" : "Unauthorized"));
      return;
    }

    done();
  };
}
