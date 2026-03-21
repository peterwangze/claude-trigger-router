/**
 * Auth Middleware
 *
 * 认证中间件
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { IAppConfig } from "../trigger/types";

/**
 * API Key 认证中间件
 */
export function apiKeyAuth(config: IAppConfig) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    // 如果没有配置 APIKEY，跳过认证
    if (!config.APIKEY) {
      done();
      return;
    }

    // 从请求头获取 API Key
    const authHeader = req.headers.authorization;
    const xApiKey = req.headers["x-api-key"];

    let providedKey: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7);
    } else if (xApiKey) {
      providedKey = xApiKey as string;
    }

    if (!providedKey || providedKey !== config.APIKEY) {
      reply.code(401).send({ error: "Unauthorized" });
      done(new Error("Unauthorized"));
      return;
    }

    done();
  };
}
