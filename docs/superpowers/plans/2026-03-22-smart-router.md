# SmartRouter 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有路由链中插入 SmartRouter 层，支持通过 LLM 从配置的候选模型列表中自动选择最优模型，提升路由准确率。

**Architecture:** SmartRouter 作为关键词匹配之后、LLM 意图识别之前的第三路由层。收到请求后，用配置的 `router_model` 调用一次 LLM，传入候选模型列表及各自的能力描述，LLM 返回 JSON 选择结果，结果经 LRU 缓存，命中时直接返回。若 LLM 调用失败或返回无法识别的模型，按 `fallback` 策略回退（`default` = 继续后续路由链，`skip` = 跳过 SmartRouter）。

**Tech Stack:** TypeScript, vitest, lru-cache（已有依赖），Anthropic messages API（通过 localhost 自回调）

---

## Chunk 1: 类型定义 + 常量

### Task 1: 新增 SmartRouter 类型定义

**Files:**
- Modify: `src/trigger/types.ts`

- [ ] **Step 1: 在 `src/trigger/types.ts` 末尾追加类型定义**

在 `IRouterConfig` 接口后追加：

```typescript
/**
 * SmartRouter 候选模型
 */
export interface ISmartRouterCandidate {
  /** 模型标识，格式：provider_name,model_name */
  model: string;

  /** 模型能力描述，用于告知 router_model 该模型擅长什么 */
  description: string;
}

/**
 * SmartRouter 配置
 */
export interface ISmartRouterConfig {
  /** 是否启用 SmartRouter，默认 false */
  enabled: boolean;

  /** 用于选择模型的路由 LLM，格式：provider_name,model_name */
  router_model: string;

  /** 候选模型列表（至少 2 个） */
  candidates: ISmartRouterCandidate[];

  /** 缓存 TTL（毫秒），默认 600000（10 分钟） */
  cache_ttl?: number;

  /** router_model 最大 token 数，默认 256 */
  max_tokens?: number;

  /**
   * SmartRouter 无结果时的回退策略
   * - "default"：继续执行后续路由链（默认）
   * - "skip"：跳过 SmartRouter，直接走后续路由链
   */
  fallback?: 'default' | 'skip';
}
```

在 `IAppConfig` 接口中添加可选字段（在 `TriggerRouter?` 字段后）：

```typescript
  /** 智能路由配置 */
  SmartRouter?: ISmartRouterConfig;
```

- [ ] **Step 2: 确认类型文件编译无误**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx tsc --noEmit
```

Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/trigger/types.ts
git commit -m "feat(types): 新增 SmartRouter 类型定义 ISmartRouterConfig, ISmartRouterCandidate"
```

---

### Task 2: 新增 SmartRouter 默认配置常量

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: 在 `src/constants.ts` 中新增默认配置**

在 `DEFAULT_TRIGGER_CONFIG` 后追加：

```typescript
/**
 * 默认 SmartRouter 配置
 * 注意：enabled 默认为 false，须在 config.yaml 中显式开启
 */
export const DEFAULT_SMART_ROUTER_CONFIG = {
  enabled: false,
  router_model: '',
  candidates: [] as Array<{ model: string; description: string }>,
  cache_ttl: 600000,
  max_tokens: 256,
  fallback: 'default' as const,
};
```

此常量在 `src/utils/config.ts` 的 `initConfig()` 中用于合并默认值（Task 7 中完成接线）。

- [ ] **Step 2: 确认编译无误**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/constants.ts
git commit -m "feat(constants): 新增 DEFAULT_SMART_ROUTER_CONFIG 默认配置"
```

---

## Chunk 2: SmartRouter 核心实现 + 测试

### Task 3: 实现 SmartRouterSelector 类

**Files:**
- Create: `src/trigger/smart-router.ts`

SmartRouter 的核心逻辑：
1. 构建 prompt（列出编号候选模型 + 各自描述）
2. 调用 `router_model` LLM（自回调 localhost）
3. 解析 JSON 响应 `{model, confidence, reasoning}`
4. 验证返回的模型在候选列表中
5. LRU 缓存（按 text hash 为 key）

- [ ] **Step 1: 先写测试文件（TDD）**

创建 `src/trigger/smart-router.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartRouterSelector } from './smart-router';
import { ISmartRouterConfig } from './types';

describe('SmartRouterSelector', () => {
  let selector: SmartRouterSelector;

  const baseConfig: ISmartRouterConfig = {
    enabled: true,
    router_model: 'test,model',
    candidates: [
      { model: 'provider,model-a', description: '擅长代码任务' },
      { model: 'provider,model-b', description: '擅长创意写作' },
    ],
    cache_ttl: 60000,
    max_tokens: 256,
    fallback: 'default',
  };

  beforeEach(() => {
    selector = new SmartRouterSelector();
    selector.clearCache();
  });

  // ============ 禁用/无效配置 ============

  it('should return null when config is disabled', async () => {
    const config = { ...baseConfig, enabled: false };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  it('should return null when candidates list is empty', async () => {
    const config = { ...baseConfig, candidates: [] };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  it('should return null when candidates list has only 1 item', async () => {
    const config = { ...baseConfig, candidates: [{ model: 'a,b', description: 'x' }] };
    const result = await selector.selectModel('hello', config);
    expect(result).toBeNull();
  });

  // ============ LLM 调用成功 ============

  it('should return selected model on valid LLM response', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              model: 'provider,model-a',
              confidence: 0.9,
              reasoning: 'Code task detected',
            }),
          },
        ],
      }),
    });

    const result = await selector.selectModel('写一段代码', baseConfig, 3456, mockFetch as any);
    expect(result).not.toBeNull();
    expect(result!.model).toBe('provider,model-a');
    expect(result!.confidence).toBe(0.9);
  });

  it('should return null when LLM returns unknown model', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              model: 'unknown,model-x',
              confidence: 0.9,
              reasoning: 'Unknown',
            }),
          },
        ],
      }),
    });

    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  // ============ 错误处理 ============

  it('should return null on fetch error', async () => {
    const mockFetch = async () => { throw new Error('Network error'); };
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  it('should return null on non-OK response', async () => {
    const mockFetch = async () => ({ ok: false, status: 500 });
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  it('should return null when response has no valid JSON', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ content: [{ text: 'no json here' }] }),
    });
    const result = await selector.selectModel('hello', baseConfig, 3456, mockFetch as any);
    expect(result).toBeNull();
  });

  // ============ 缓存 ============

  it('should cache result and return cached value on second call', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                model: 'provider,model-a',
                confidence: 0.85,
                reasoning: 'test',
              }),
            },
          ],
        }),
      };
    };

    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);
    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);

    expect(callCount).toBe(1); // 第二次命中缓存，无需再次调用 LLM
  });

  it('should not use cache for different text', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                model: 'provider,model-a',
                confidence: 0.85,
                reasoning: 'test',
              }),
            },
          ],
        }),
      };
    };

    await selector.selectModel('写代码', baseConfig, 3456, mockFetch as any);
    await selector.selectModel('写文章', baseConfig, 3456, mockFetch as any);

    expect(callCount).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试，确认全部失败（预期）**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run src/trigger/smart-router.test.ts 2>&1 | head -30
```

Expected: 编译错误或测试失败（SmartRouterSelector 未实现）

- [ ] **Step 3: 创建 `src/trigger/smart-router.ts` 实现**

```typescript
/**
 * SmartRouter Selector
 *
 * 智能路由选择器，使用 LLM 从候选模型列表中选择最优模型
 */

import { LRUCache } from 'lru-cache';
import { ISmartRouterConfig } from './types';
import { logError, logWarn } from '../utils/log';

/**
 * SmartRouter 选择结果
 */
export interface ISmartRouterResult {
  /** 选中的模型，格式：provider_name,model_name */
  model: string;

  /** 置信度 0-1 */
  confidence: number;

  /** LLM 的选择理由 */
  reasoning?: string;
}

/**
 * SmartRouter Prompt 模板
 */
const SMART_ROUTER_PROMPT = `You are a model routing assistant. Your job is to select the most appropriate AI model from the given candidates to handle the user's request.

User request:
"""
{request}
"""

Available models:
{candidates}

Select the most appropriate model and respond in the following JSON format ONLY:
{
  "model": "<exact model identifier from the list>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

Important:
- The "model" field MUST be one of the exact identifiers listed above
- Respond ONLY with the JSON, no additional text`;

/**
 * 智能路由选择器类
 */
export class SmartRouterSelector {
  private cache: LRUCache<string, ISmartRouterResult>;

  constructor() {
    this.cache = new LRUCache<string, ISmartRouterResult>({
      max: 500,
      ttl: 600000, // 默认 10 分钟，初始化时可被 config.cache_ttl 覆盖
    });
  }

  /**
   * 生成缓存 key（基于请求文本 + router_model + 候选模型列表）
   * 注意：包含 router_model 以防止切换路由模型后命中旧缓存
   */
  private generateCacheKey(text: string, routerModel: string, candidates: ISmartRouterConfig['candidates']): string {
    const content = `${text}:${routerModel}:${candidates.map(c => c.model).join(',')}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * 构建候选模型列表字符串
   */
  private buildCandidatesList(candidates: ISmartRouterConfig['candidates']): string {
    return candidates
      .map((c, i) => `${i + 1}. ${c.model} - ${c.description}`)
      .join('\n');
  }

  /**
   * 构建完整 prompt
   */
  private buildPrompt(text: string, candidates: ISmartRouterConfig['candidates']): string {
    return SMART_ROUTER_PROMPT
      .replace('{request}', text)
      .replace('{candidates}', this.buildCandidatesList(candidates));
  }

  /**
   * 使用 LLM 选择最优模型
   *
   * @param text 请求文本
   * @param config SmartRouter 配置
   * @param port 本地服务端口（默认 3456）
   * @param fetchFn 可注入的 fetch 函数（用于测试）
   * @returns 选择结果，失败时返回 null
   */
  async selectModel(
    text: string,
    config: ISmartRouterConfig,
    port: number = 3456,
    fetchFn?: typeof fetch
  ): Promise<ISmartRouterResult | null> {
    // 未启用或候选不足
    if (!config.enabled) {
      return null;
    }

    if (!config.candidates || config.candidates.length < 2) {
      return null;
    }

    // 检查缓存
    const cacheKey = this.generateCacheKey(text, config.router_model, config.candidates);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const fetchImpl = fetchFn || fetch;
      const prompt = this.buildPrompt(text, config.candidates);

      const response = await fetchImpl(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.router_model,
          max_tokens: config.max_tokens ?? 256,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        logError('[SmartRouter] LLM request failed:', (response as any).status);
        return null;
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || '';

      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logWarn('[SmartRouter] No JSON found in LLM response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as ISmartRouterResult;

      // 验证返回的模型在候选列表中
      const validModels = config.candidates.map(c => c.model);
      if (!validModels.includes(parsed.model)) {
        logWarn(`[SmartRouter] LLM returned unknown model: "${parsed.model}"`);
        return null;
      }

      // 缓存结果（使用配置的 TTL 进行按条目覆盖）
      this.cache.set(cacheKey, parsed, { ttl: config.cache_ttl ?? 600000 });

      return parsed;
    } catch (error) {
      logError('[SmartRouter] Error selecting model:', error);
      return null;
    }
  }

  /**
   * 清除缓存（用于测试）
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 导出单例实例
export const smartRouterSelector = new SmartRouterSelector();
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run src/trigger/smart-router.test.ts
```

Expected: 所有测试通过（10 个测试）

- [ ] **Step 5: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/trigger/smart-router.ts src/trigger/smart-router.test.ts
git commit -m "feat(smart-router): 实现 SmartRouterSelector，支持 LLM 选择最优模型"
```

---

## Chunk 3: 集成到路由链

### Task 4: 在 ModelSelector 中插入 SmartRouter 层

**Files:**
- Modify: `src/trigger/selector.ts`

SmartRouter 在路由链中的位置：关键词匹配（第1步）之后，LLM 意图识别（第2步）之前。

`selectModel()` 需要接收 `smartRouterConfig` 参数（可选）。

- [ ] **Step 1: 修改 `selector.ts`，添加 SmartRouter 集成**

在文件顶部 import 区域添加（同时更新现有的 log import，增加 `log`）：

```typescript
import { smartRouterSelector } from './smart-router';
import { ISmartRouterConfig } from './types';
```

将现有的：

```typescript
import { logError } from '../utils/log';
```

改为：

```typescript
import { log, logError } from '../utils/log';
```

修改 `selectModel` 方法签名，添加可选参数：

```typescript
async selectModel(
  req: IRequestContext,
  config: ITriggerConfig,
  port: number = 3456,
  smartRouterConfig?: ISmartRouterConfig
): Promise<IAnalysisResult>
```

在第一步（关键词匹配）和第二步（LLM 意图识别）之间插入 SmartRouter 逻辑：

```typescript
// 第二步：SmartRouter 智能模型选择
if (smartRouterConfig?.enabled && smartRouterConfig.candidates?.length >= 2) {
  try {
    const smartResult = await smartRouterSelector.selectModel(text, smartRouterConfig, port);
    if (smartResult) {
      log(`[SmartRouter] Selected model "${smartResult.model}" (confidence: ${smartResult.confidence})`);
      return {
        matched: true,
        model: smartResult.model,
        confidence: smartResult.confidence,
        analysisTime: Date.now() - startTime,
        analyzedText: text,
      };
    }
  } catch (error) {
    logError('[ModelSelector] SmartRouter error:', error);
  }
}
```

原第二步（LLM 意图识别）改为第三步，保持不变。

> **关于 `fallback` 字段：** 当前版本中 `fallback: 'default'` 和 `fallback: 'skip'` 的行为相同——SmartRouter 返回 null 时都继续执行后续路由链（LLM 意图识别 → 默认路由）。`fallback` 字段保留用于未来扩展（如 `'skip'` 未来可实现"直接跳到 Router.default"的语义）。现阶段无需在 selector.ts 中添加条件分支。

- [ ] **Step 2: 运行全量测试，确认无回归**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run
```

Expected: 所有已有测试仍然通过（包括 selector.test.ts）

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/trigger/selector.ts
git commit -m "feat(selector): 在路由链中集成 SmartRouter，位于关键词匹配之后"
```

---

### Task 5: 更新 TriggerRouter，传递 SmartRouter 配置

**Files:**
- Modify: `src/trigger/index.ts`

`TriggerRouter` 需要持有 `ISmartRouterConfig` 并在调用 `selectModel` 时传入。

- [ ] **Step 1: 修改 `src/trigger/index.ts`**

在 import 中添加 `ISmartRouterConfig`：

```typescript
import { ITriggerConfig, IAnalysisResult, IAppConfig, IRequestContext, ISmartRouterConfig } from './types';
```

在 `TriggerRouter` 类中添加 `smartRouterConfig` 字段：

```typescript
private smartRouterConfig: ISmartRouterConfig | undefined = undefined;
```

在 `init()` 方法中保存 SmartRouter 配置：

```typescript
init(appConfig: IAppConfig): void {
  this.config = appConfig.TriggerRouter || this.getDefaultConfig();
  this.port = appConfig.PORT || 3456;
  this.smartRouterConfig = appConfig.SmartRouter;
}
```

在 `route()` 方法中，将 `modelSelector.selectModel` 调用改为传入 SmartRouter 配置：

```typescript
return modelSelector.selectModel(req, this.config, this.port, this.smartRouterConfig);
```

注意：`routeSync()` 不涉及 SmartRouter（同步方法只做关键词匹配），无需修改。

更新 `createMiddleware()` 中的日志，增加 SmartRouter 命中标识。

将以下原有代码（`src/trigger/index.ts` 第 152-156 行）：

```typescript
          log(
            `[TriggerRouter] Matched rule "${result.rule?.name}" -> model "${result.model}" ` +
            `(confidence: ${result.confidence}, time: ${result.analysisTime}ms)`
          );
```

替换为：

```typescript
          log(
            `[TriggerRouter] ${result.rule ? `Matched rule "${result.rule.name}"` : 'SmartRouter selected'} -> model "${result.model}" ` +
            `(confidence: ${result.confidence}, time: ${result.analysisTime}ms)`
          );
```

- [ ] **Step 2: 运行全量测试**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run
```

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/trigger/index.ts
git commit -m "feat(trigger-router): 将 SmartRouter 配置传递给 ModelSelector"
```

---

### Task 6: 更新 trigger/index.ts 的 barrel exports

**Files:**
- Modify: `src/trigger/index.ts`

> **注意：Task 6 必须在 Task 5 commit 完成后才能开始（两者修改同一文件，顺序执行）。**

- [ ] **Step 1: 确保 smart-router 模块被导出**

在 `src/trigger/index.ts` 顶部 export 区域添加：

```typescript
export * from './smart-router';
```

- [ ] **Step 2: 确认编译**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/trigger/index.ts
git commit -m "feat(trigger): 导出 SmartRouter 模块"
```

---

## Chunk 4: 配置验证 + 示例 + 文档

### Task 7: 在 config.ts 中添加 SmartRouter 配置验证

**Files:**
- Modify: `src/utils/config.ts`

- [ ] **Step 1: 导入 `DEFAULT_SMART_ROUTER_CONFIG` 并接线到 `initConfig()` 的 deepMerge**

在 `src/utils/config.ts` 顶部 import 中添加：

```typescript
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_JSON, DEFAULT_CONFIG, DEFAULT_TRIGGER_CONFIG, DEFAULT_SMART_ROUTER_CONFIG } from '../constants';
```

在 `initConfig()` 函数的 `deepMerge` 调用中，添加 `SmartRouter` 默认值（在 `TriggerRouter: DEFAULT_TRIGGER_CONFIG` 后）：

```typescript
  const mergedConfig = deepMerge(
    {
      ...DEFAULT_CONFIG,
      Router: {
        default: '',
      },
      Providers: [],
      TriggerRouter: DEFAULT_TRIGGER_CONFIG,
      SmartRouter: DEFAULT_SMART_ROUTER_CONFIG,
    },
    config
  );
```

- [ ] **Step 2: 在 `validateConfig()` 函数中添加 SmartRouter 验证**

在现有 `TriggerRouter` 验证块之后，添加：

```typescript
  // 验证 SmartRouter 配置
  if (config.SmartRouter?.enabled) {
    if (!config.SmartRouter.router_model) {
      errors.push('SmartRouter.router_model is required when SmartRouter is enabled');
    }
    if (!config.SmartRouter.candidates || config.SmartRouter.candidates.length < 2) {
      errors.push('SmartRouter.candidates must have at least 2 entries when SmartRouter is enabled');
    } else {
      config.SmartRouter.candidates.forEach((candidate, index) => {
        if (!candidate.model) {
          errors.push(`SmartRouter.candidates[${index}].model is required`);
        }
        if (!candidate.description) {
          errors.push(`SmartRouter.candidates[${index}].description is required`);
        }
      });
    }
  }
```

- [ ] **Step 3: 运行全量测试**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run
```

Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add src/utils/config.ts
git commit -m "feat(config): 接线 DEFAULT_SMART_ROUTER_CONFIG 并添加 SmartRouter 配置验证"
```

---

### Task 8: 更新示例配置文件

**Files:**
- Modify: `config/trigger.example.yaml`

- [ ] **Step 1: 在 `TriggerRouter` 配置后追加 SmartRouter 示例**

在文件末尾的 `simple_task` 规则之后添加：

```yaml

# 智能路由配置（SmartRouter）
# 当关键词/正则规则均未命中时，由 router_model 从候选列表中智能选择最优模型
SmartRouter:
  # 是否启用智能路由，默认 false
  enabled: false

  # 用于做路由决策的 LLM（轻量快速模型即可）
  router_model: "deepseek,deepseek-chat"

  # 候选模型列表（至少 2 个，需配合 Providers 中的模型）
  candidates:
    - model: "deepseek,deepseek-chat"
      description: "通用编程、代码生成、调试、日常问答任务"

    - model: "deepseek,deepseek-reasoner"
      description: "数学推理、逻辑推理、复杂分析、科学问题"

    - model: "openrouter,anthropic/claude-opus-4"
      description: "系统架构设计、技术文档撰写、长篇创意写作"

    - model: "openrouter,anthropic/claude-sonnet-4"
      description: "代码审查、技术讨论、多轮对话、长上下文任务"

  # 结果缓存时间（毫秒），相同请求在缓存期内直接返回
  cache_ttl: 600000

  # router_model 响应最大 token 数
  max_tokens: 256

  # SmartRouter 无法选择时的回退策略
  # "default"：继续后续路由链（推荐）
  # "skip"：跳过，等同于 SmartRouter 未启用
  fallback: "default"
```

- [ ] **Step 2: 验证 YAML 格式**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('config/trigger.example.yaml', 'utf-8')); console.log('YAML valid')"
```

Expected: `YAML valid`

- [ ] **Step 3: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add config/trigger.example.yaml
git commit -m "docs(config): 在示例配置中添加 SmartRouter 配置示例"
```

---

### Task 9: 更新 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在路由优先级表中插入 SmartRouter 行**

找到 `README.md` 中 `## 🔄 路由优先级` 部分的完整表格，将其替换为（优先级 2 为新增行，原 2-8 依次变为 3-9）：

```markdown
| 优先级 | 条件 | 使用模型 | 配置项 |
|--------|------|----------|--------|
| 1 | 触发规则关键词/正则匹配成功 | 规则指定模型 | `TriggerRouter.rules[].model` |
| 2 | SmartRouter 启用且 LLM 返回有效选择 | SmartRouter 选中模型 | `SmartRouter.candidates[].model` |
| 3 | Token 数超过阈值 | 长上下文模型 | `Router.longContext` |
| 4 | System 提示含 `<CTR-SUBAGENT-MODEL>` 标签 | 子代理指定模型 | 动态注入 |
| 5 | 请求模型为 `claude-3-5-haiku-*` | 后台任务模型 | `Router.background` |
| 6 | 请求含 `thinking` 参数 | 深度思考模型 | `Router.think` |
| 7 | 工具列表含 `web_search` 类型工具 | 网络搜索模型 | `Router.webSearch` |
| 8 | 配置了自定义路由器路径 | 自定义路由器决定 | `CUSTOM_ROUTER_PATH` |
| 9 | 以上均不满足 | 默认模型 | `Router.default` |
```

同时将表格下方的注释更新（将"优先级 1"改为一致描述）：

```markdown
> **注意**：触发路由（优先级 1-2）在所有原有路由逻辑之前执行。一旦匹配成功，后续路由逻辑均跳过。
```

- [ ] **Step 2: 在配置参数参考部分新增 SmartRouter 章节**

在 `### TriggerRouter 配置项` 之后，新增：

```markdown
### SmartRouter 智能路由配置

SmartRouter 是关键词/正则匹配之后的第二道路由层。当规则匹配未命中时，由 `router_model` 分析请求并从 `candidates` 列表中选择最优模型。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | false | 是否启用 SmartRouter |
| `router_model` | string | - | **必填**（启用时）。用于路由决策的 LLM，格式 `"provider,model"` |
| `candidates` | array | [] | **必填**（启用时）。候选模型列表，至少 2 个 |
| `cache_ttl` | number | 600000 | 结果缓存时间（毫秒） |
| `max_tokens` | number | 256 | router_model 响应最大 token 数 |
| `fallback` | string | "default" | 无结果时回退策略：`default`（继续路由链）或 `skip` |

**候选模型配置：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型标识，格式 `"provider,model"` |
| `description` | string | 模型能力描述（供 router_model 参考） |

**示例：**

```yaml
SmartRouter:
  enabled: true
  router_model: "deepseek,deepseek-chat"
  candidates:
    - model: "deepseek,deepseek-chat"
      description: "通用编程、代码生成、调试"
    - model: "deepseek,deepseek-reasoner"
      description: "数学推理、逻辑推理、复杂分析"
    - model: "openrouter,anthropic/claude-opus-4"
      description: "架构设计、长篇文档撰写"
  cache_ttl: 600000
  fallback: "default"
```
```

- [ ] **Step 3: 更新 README 架构图和工作原理描述**

在 `## 🏗️ 工作原理` 部分的 ASCII 图中，找到以下两行（关键词匹配示例行，位于箭头图的末尾两个 `├─` 之间）：

```
    ├─ 关键词匹配 "生成图片" ──→ Provider A (支持图片的模型)
    ├─ 关键词匹配 "架构设计" ──→ Provider B (能力强的大模型)
    ├─ Token 数 > 60000     ──→ Provider C (长上下文模型)
```

将其替换为（在关键词匹配行之后、Token 行之前插入 SmartRouter 行）：

```
    ├─ 关键词匹配 "生成图片" ──→ Provider A (支持图片的模型)
    ├─ 关键词匹配 "架构设计" ──→ Provider B (能力强的大模型)
    ├─ SmartRouter (LLM 智能选择) ──→ 候选模型列表中最优模型
    ├─ Token 数 > 60000     ──→ Provider C (长上下文模型)
```

- [ ] **Step 4: Commit**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git add README.md
git commit -m "docs(readme): 添加 SmartRouter 配置说明和路由优先级更新"
```

---

### Task 10: 全量测试 + 构建验证

- [ ] **Step 1: 运行全量测试**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npx vitest run
```

Expected: 所有测试通过（包含新增的 smart-router.test.ts）

- [ ] **Step 2: 构建验证**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
npm run build
```

Expected: 无错误，`dist/` 目录包含编译产物

- [ ] **Step 3: 最终 Commit（如有遗漏）**

```bash
cd D:/AI/agent/claude/coding/claude_trigger_router
git status
# 确认无未提交的修改
```

---

## 完成标准

- [ ] `npx vitest run` 全部通过（新增 smart-router 测试 + 无回归）
- [ ] `npm run build` 无编译错误
- [ ] `config/trigger.example.yaml` 包含 SmartRouter 示例并可通过 YAML 解析
- [ ] `README.md` 路由优先级表已更新，SmartRouter 文档完整
- [ ] 所有修改均有对应 git commit
