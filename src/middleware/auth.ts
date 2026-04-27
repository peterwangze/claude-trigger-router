/**
 * Auth Middleware
 *
 * 认证中间件
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { IAppConfig } from "../trigger/types";
import { authAuditStore, extractApiKeyFromHeaders, verifyApiKey } from "../auth/api-keys";

type AuthConfigInput = Partial<IAppConfig> | (() => Partial<IAppConfig> | Promise<Partial<IAppConfig>>);

/**
 * API Key 认证中间件
 */
export function apiKeyAuth(configInput: AuthConfigInput) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    Promise.resolve(typeof configInput === "function" ? configInput() : configInput)
      .then((config) => {
        const auditBase = {
          required: "client" as const,
          method: req.method,
          path: req.url,
          requestId: req.id,
        };

        // 如果没有配置 bootstrap key 或 managed key，跳过认证
        if (!config.APIKEY && !config.Auth?.managed_keys?.length) {
          authAuditStore.add({
            ...auditBase,
            outcome: "skipped",
            reason: "no_auth_config",
          });
          done();
          return;
        }

        const result = verifyApiKey(config, extractApiKeyFromHeaders(req.headers), "client");
        if (!result.ok) {
          const statusCode = result.reason === "insufficient_scope" ? 403 : 401;
          authAuditStore.add({
            ...auditBase,
            outcome: "denied",
            source: result.source,
            keyId: result.keyId,
            reason: result.reason,
            statusCode,
          });
          reply.code(statusCode).send({
            error: statusCode === 403 ? "Forbidden" : "Unauthorized",
            reason: result.reason,
          });
          done(new Error(statusCode === 403 ? "Forbidden" : "Unauthorized"));
          return;
        }

        authAuditStore.add({
          ...auditBase,
          outcome: "allowed",
          source: result.source,
          keyId: result.keyId,
          scopes: result.scopes,
          statusCode: 200,
        });
        done();
      })
      .catch((error) => {
        done(error instanceof Error ? error : new Error(String(error)));
      });
  };
}
