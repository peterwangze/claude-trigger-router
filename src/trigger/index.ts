/**
 * SmartRouter runtime module
 *
 * 触发路由模块入口
 */

export * from './types';
export * from './matcher';
export * from './analyzer';
export * from './intent';
export * from './selector';
export * from './smart-router';

import { ITriggerConfig, IAnalysisResult, IAppConfig, IRequestContext, ISmartRouterConfig } from './types';
import { appendTraceReason } from '../governance/trace';
import { modelSelector } from './selector';
import { contextAnalyzer } from './analyzer';
import { log, logError } from '../utils/log';
import { DEFAULT_CONFIG } from '../constants';
import { IGovernanceConfig } from '../governance/types';
import { deriveRuntimeSmartRouterConfig } from '../utils/config';

/**
 * SmartRouter 运行时引擎。
 *
 * TriggerRouter 类名保留为兼容导出；运行时 contract 已以 SmartRouter 为统一入口。
 */
export class TriggerRouter {
  private config: ITriggerConfig | null = null;
  private appConfig: IAppConfig | null = null;
  private port: number = DEFAULT_CONFIG.PORT;
  private smartRouterConfig: ISmartRouterConfig | undefined = undefined;
  private governanceConfig: IGovernanceConfig | undefined = undefined;
  private apiKey?: string;
  private apiTimeoutMs?: number;

  /**
   * 初始化 SmartRouter 运行时
   *
   * @param appConfig 应用配置
   */
  init(appConfig: IAppConfig): void {
    this.appConfig = appConfig;
    this.config = appConfig.TriggerRouter || this.getDefaultConfig();
    this.port = appConfig.PORT || DEFAULT_CONFIG.PORT;
    this.smartRouterConfig = deriveRuntimeSmartRouterConfig(appConfig, appConfig);
    this.governanceConfig = appConfig.Governance;
    this.apiKey = appConfig.APIKEY;
    this.apiTimeoutMs = appConfig.API_TIMEOUT_MS;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): ITriggerConfig {
    return {
      enabled: false,
      analysis_scope: 'last_message',
      llm_intent_recognition: false,
      rules: [],
    };
  }

  /**
   * 检查 SmartRouter 运行时是否启用
   */
  isEnabled(): boolean {
    return Boolean(this.smartRouterConfig?.enabled);
  }

  /**
   * 获取当前配置
   */
  getConfig(): ITriggerConfig | null {
    return this.config;
  }

  getSmartRouterConfig(): ISmartRouterConfig | undefined {
    return this.smartRouterConfig;
  }

  /**
   * 执行 SmartRouter 统一路由
   * 分析请求并返回匹配的模型
   *
   * @param req 请求对象
   * @returns 分析结果
   */
  async route(req: IRequestContext): Promise<IAnalysisResult> {
    if (!this.config || !this.isEnabled()) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: 0,
      };
    }

    // 跳过工具调用循环中的请求，避免无意义的触发分析
    const messages = req.body?.messages;
    if (messages && contextAnalyzer.hasToolResults(messages)) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: 0,
      };
    }

    const result = await modelSelector.selectModel(
      {
        ...req,
        appConfig: this.appConfig ?? undefined,
      } as IRequestContext,
      this.config,
      this.port,
      this.smartRouterConfig,
      this.governanceConfig,
      this.apiKey,
      this.apiTimeoutMs
    );

    if (req.governanceTrace) {
      if (result.routeSource === 'smart_rule' && result.rule?.name) {
        appendTraceReason(req.governanceTrace, `smart_rule:${result.rule.name}`);
      } else if (result.routeSource === 'semantic_match' && result.rule?.name) {
        appendTraceReason(req.governanceTrace, `semantic_match:${result.rule.name}`);
      } else if (result.routeSource === 'sticky_correction') {
        req.governanceTrace.stickyHit = true;
        appendTraceReason(req.governanceTrace, 'sticky_correction');
      } else if (result.routeSource === 'smart_router') {
        appendTraceReason(req.governanceTrace, 'smart_router');
      } else {
        appendTraceReason(req.governanceTrace, 'smart_router:no_match');
      }
    }

    return result;
  }

  /**
   * 同步版本的 SmartRouter 统一路由
   *
   * @param req 请求对象
   * @returns 分析结果
   */
  routeSync(req: IRequestContext): IAnalysisResult {
    if (!this.config || !this.isEnabled()) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: 0,
      };
    }

    // 跳过工具调用循环中的请求
    const messages = req.body?.messages;
    if (messages && contextAnalyzer.hasToolResults(messages)) {
      return {
        matched: false,
        confidence: 0,
        analysisTime: 0,
      };
    }

    return modelSelector.selectModelSync({
      ...req,
      appConfig: this.appConfig ?? undefined,
    } as IRequestContext, this.config, this.smartRouterConfig);
  }

  /**
   * 创建 Fastify 中间件
   * 用于在请求处理前执行 SmartRouter 统一路由
   *
   * @param appConfig 应用配置
   * @returns Fastify 中间件函数
   */
  createMiddleware(appConfig: IAppConfig) {
    this.init(appConfig);

    return async (req: any, reply: any) => {
      if (!this.isEnabled()) {
        return;
      }

      // 只处理 /v1/messages 请求
      if (!req.url.startsWith('/v1/messages')) {
        return;
      }

      const startTime = Date.now();

      try {
        const result = await this.route(req);

        if (result.matched && result.model) {
          // 设置选中的模型
          req.body.model = result.model;

          // 记录触发结果到请求上下文
          req.triggerResult = result;

          log(
            `[SmartRouter] ${
              result.routeSource === 'sticky_correction'
                ? 'Sticky correction selected'
                : result.routeSource === 'semantic_match'
                  ? `Semantic match "${result.rule?.name}"`
                  : result.routeSource === 'smart_router'
                    ? 'Smart fallback selected'
                    : result.rule
                        ? `Matched rule "${result.rule.name}"`
                        : 'Unified router selected'
            } -> model "${result.model}" ` +
            `(confidence: ${result.confidence}, time: ${result.analysisTime}ms)`
          );
        }
      } catch (error) {
        logError('[SmartRouter] Error in routing:', error);
      }
    };
  }
}

// 导出单例实例
export const triggerRouter = new TriggerRouter();
