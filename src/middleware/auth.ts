/**
 * Auth Middleware
 *
 * 认证中间件
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { IAppConfig, TManagedApiKeyScope } from "../trigger/types";
import { authAuditStore, authQuotaUsageStore, extractApiKeyFromHeaders, verifyApiKey } from "../auth/api-keys";

type AuthConfigInput = Partial<IAppConfig> | (() => Partial<IAppConfig> | Promise<Partial<IAppConfig>>);

function estimateRequestTokens(body: unknown): number {
  if (body === undefined || body === null) {
    return 0;
  }
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Math.ceil(text.length / 4);
}

function authRequirementForRequest(req: FastifyRequest): TManagedApiKeyScope {
  const method = String(req.method ?? '').toUpperCase();
  const path = String(req.url ?? '').split('?')[0];
  const readOnlyPaths = new Set([
    '/api/health',
    '/api/service-info',
    '/api/remote-status',
    '/api/registration',
    '/api/models/compiled',
  ]);

  return method === 'GET' && readOnlyPaths.has(path) ? 'read-only' : 'client';
}

/**
 * API Key 认证中间件
 */
export function apiKeyAuth(configInput: AuthConfigInput) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    Promise.resolve(typeof configInput === "function" ? configInput() : configInput)
      .then((config) => {
        const required = authRequirementForRequest(req);
        const auditBase = {
          required,
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

        const result = verifyApiKey(config, extractApiKeyFromHeaders(req.headers), required);
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

        const quotaResult = authQuotaUsageStore.consume(
          result.keyId,
          result.quota,
          estimateRequestTokens((req as any).body)
        );
        if (!quotaResult.ok) {
          authAuditStore.add({
            ...auditBase,
            outcome: "denied",
            source: result.source,
            keyId: result.keyId,
            scopes: result.scopes,
            reason: quotaResult.reason,
            statusCode: 429,
            quota: quotaResult.usage,
          });
          reply.code(429).send({
            error: "Too Many Requests",
            reason: quotaResult.reason,
          });
          done(new Error("Too Many Requests"));
          return;
        }

        authAuditStore.add({
          ...auditBase,
          outcome: "allowed",
          source: result.source,
          keyId: result.keyId,
          scopes: result.scopes,
          statusCode: 200,
          quota: quotaResult.usage,
        });
        done();
      })
      .catch((error) => {
        done(error instanceof Error ? error : new Error(String(error)));
      });
  };
}
