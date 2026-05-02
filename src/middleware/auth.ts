/**
 * Auth Middleware
 *
 * 认证中间件
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { IAppConfig, IAuthConfig, TManagedApiKeyScope } from "../trigger/types";
import { authAuditStore, authQuotaUsageStore, extractApiKeyFromHeaders, verifyApiKey } from "../auth/api-keys";

type AuthConfigInput = Partial<IAppConfig> | (() => Partial<IAppConfig> | Promise<Partial<IAppConfig>>);
type AuthMiddlewareOptions = {
  persistQuotaUsage?: (usage: NonNullable<IAuthConfig['quota_usage']>) => void | Promise<void>;
};

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
    '/api/models/pool-health',
    '/api/transformers',
    '/api/governance/health',
    '/api/governance/metrics',
    '/api/governance/metrics/export',
    '/api/governance/metrics/exports',
  ]);
  const modelCallPaths = new Set([
    '/v1/messages',
    '/v1/chat/completions',
  ]);
  const operatorWritePaths = new Set([
    '/api/restart',
    '/api/governance/metrics/snapshots',
    '/api/governance/metrics/schedules',
    '/api/governance/observability/anomaly-thresholds',
  ]);

  if (method === 'GET' && (
    readOnlyPaths.has(path) ||
    path === '/api/governance/traces' ||
    path.startsWith('/api/governance/traces/') ||
    path === '/api/governance/archives' ||
    path.startsWith('/api/governance/archives/')
  )) {
    return 'read-only';
  }

  if (modelCallPaths.has(path)) {
    return 'client';
  }

  if (method === 'POST' && (
    operatorWritePaths.has(path) ||
    (path.startsWith('/api/governance/archives/') && path.endsWith('/delete'))
  )) {
    return 'operator';
  }

  return path.startsWith('/api/') || path === '/ui' ? 'admin' : 'client';
}

function isQuotaMeteredRequest(req: FastifyRequest): boolean {
  const method = String(req.method ?? '').toUpperCase();
  const path = String(req.url ?? '').split('?')[0];
  return method === 'POST' && (
    path === '/v1/messages' ||
    path === '/v1/chat/completions'
  );
}

/**
 * API Key 认证中间件
 */
export function apiKeyAuth(configInput: AuthConfigInput, options: AuthMiddlewareOptions = {}) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    Promise.resolve(typeof configInput === "function" ? configInput() : configInput)
      .then(async (config) => {
        authQuotaUsageStore.hydrate(config.Auth?.quota_usage);
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

        const quotaResult = isQuotaMeteredRequest(req)
          ? authQuotaUsageStore.consume(
            result.keyId,
            result.quota,
            estimateRequestTokens((req as any).body)
          )
          : { ok: true as const };
        if (!quotaResult.ok) {
          const retryAfterSeconds = quotaResult.usage.windowResetAt
            ? Math.max(0, Math.ceil((Date.parse(quotaResult.usage.windowResetAt) - Date.now()) / 1000))
            : undefined;
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
          if (retryAfterSeconds !== undefined) {
            reply.header("Retry-After", String(retryAfterSeconds));
          }
          reply.code(429).send({
            error: "Too Many Requests",
            reason: quotaResult.reason,
            quota: quotaResult.usage,
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
        if (quotaResult.usage && options.persistQuotaUsage) {
          Promise.resolve()
            .then(() => options.persistQuotaUsage?.(authQuotaUsageStore.exportForConfig()))
            .catch(() => undefined);
        }
        done();
      })
      .catch((error) => {
        done(error instanceof Error ? error : new Error(String(error)));
      });
  };
}
