/**
 * Trigger Router Module
 *
 * 触发路由模块入口
 */

export * from './types';
export * from './matcher';
export * from './analyzer';
export * from './intent';
export * from './selector';

import { ITriggerConfig, IAnalysisResult, IAppConfig } from './types';
import { modelSelector } from './selector';
import { contextAnalyzer } from './analyzer';

/**
 * 触发路由器类
 * 封装完整的触发路由逻辑
 */
export class TriggerRouter {
  private config: ITriggerConfig | null = null;
  private port: number = 3456;

  /**
   * 初始化触发路由器
   *
   * @param appConfig 应用配置
   */
  init(appConfig: IAppConfig): void {
    this.config = appConfig.TriggerRouter || this.getDefaultConfig();
    this.port = appConfig.PORT || 3456;
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
   * 检查触发路由是否启用
   */
  isEnabled(): boolean {
    return this.config?.enabled ?? false;
  }

  /**
   * 获取当前配置
   */
  getConfig(): ITriggerConfig | null {
    return this.config;
  }

  /**
   * 执行触发路由
   * 分析请求并返回匹配的模型
   *
   * @param req 请求对象
   * @returns 分析结果
   */
  async route(req: any): Promise<IAnalysisResult> {
    if (!this.config || !this.config.enabled) {
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

    return modelSelector.selectModel(req, this.config, this.port);
  }

  /**
   * 同步版本的触发路由
   * 仅使用关键词匹配
   *
   * @param req 请求对象
   * @returns 分析结果
   */
  routeSync(req: any): IAnalysisResult {
    if (!this.config || !this.config.enabled) {
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

    return modelSelector.selectModelSync(req, this.config);
  }

  /**
   * 创建 Fastify 中间件
   * 用于在请求处理前执行触发路由
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

          console.log(
            `[TriggerRouter] Matched rule "${result.rule?.name}" -> model "${result.model}" ` +
            `(confidence: ${result.confidence}, time: ${result.analysisTime}ms)`
          );
        }
      } catch (error) {
        console.error('[TriggerRouter] Error in trigger routing:', error);
      }
    };
  }
}

// 导出单例实例
export const triggerRouter = new TriggerRouter();
