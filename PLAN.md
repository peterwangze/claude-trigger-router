# [已归档] Claude Trigger Router 实施计划

> **⚠️ 归档说明（2026-03-24）**
>
> 本文档是项目初期的历史设计草案，其中大量任务在代码库中已经完成实现，但文档本身未同步更新，勾选状态不能反映当前实际进度。
>
> **请以以下资源作为当前项目权威文档：**
> - **README.md** — 功能说明、配置参考、使用指南
> - **src/** — 实际实现代码
> - **docs/project-review-2026-03-24.md** — 最新状态检视报告
>
> 本文件保留仅供了解项目早期设计思路。

## 项目概述

**目标**: 在 claude-code-router 基础上实现智能触发路由系统，通过分析输入内容自动将请求分发到最适合处理该任务的模型。

**核心价值**:
- 智能识别任务类型（图片生成、架构设计、代码编写等）
- 基于关键词/正则表达式的灵活触发规则
- 可配置优先级和分析范围
- 可选 LLM 增强的意图识别

## 技术栈

- **Runtime**: Node.js + TypeScript
- **Server**: Fastify
- **配置格式**: YAML/JSON
- **协议兼容**: OpenAI Compatible API

## 架构设计

```
Request Flow:
┌──────────────────────────────────────────────────────────────┐
│ Client Request                                                │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Auth Middleware (复用)                                        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Trigger Analyzer [NEW]                                       │
│ ├─ Pattern Matcher (精确匹配 + 正则表达式)                    │
│ ├─ Intent Detector (可选 LLM 意图识别)                       │
│ └─ Context Analyzer (分析范围配置)                           │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Model Selector [NEW]                                         │
│ └─ 按优先级排序 → 匹配规则 → 选择模型                        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Original Router Logic (复用 + 适配)                          │
│ ├─ Token Count → Long Context                                │
│ ├─ Background Model                                          │
│ ├─ Think Model                                               │
│ └─ Web Search Model                                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Transformer Service (复用)                                   │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Target LLM Provider                                          │
└──────────────────────────────────────────────────────────────┘
```

## 实施步骤

### Phase 1: 项目初始化与基础结构

**Step 1.1: 创建项目结构**
- 初始化 npm 项目
- 配置 TypeScript
- 创建基础目录结构
- 复制并适配 claude-code-router 的核心文件

**Step 1.2: 定义类型系统**
- 创建 `src/trigger/types.ts` 定义核心接口
- 定义触发规则接口 (ITriggerRule)
- 定义分析结果接口 (IAnalysisResult)
- 定义配置接口 (ITriggerConfig)

### Phase 2: 触发分析器实现

**Step 2.1: 实现模式匹配器**
- 创建 `src/trigger/matcher.ts`
- 实现精确匹配逻辑
- 实现正则表达式匹配逻辑
- 支持大小写敏感/不敏感配置

**Step 2.2: 实现上下文分析器**
- 创建 `src/trigger/analyzer.ts`
- 实现"最后一条消息"分析模式
- 实现"完整对话历史"分析模式
- 提取用户消息内容

**Step 2.3: 实现意图识别器（可选）**
- 创建 `src/trigger/intent.ts`
- 实现 LLM 辅助意图识别
- 支持配置意图识别模型
- 缓存意图识别结果

### Phase 3: 模型选择器实现

**Step 3.1: 实现规则引擎**
- 创建 `src/trigger/selector.ts`
- 实现规则优先级排序
- 实现规则匹配逻辑
- 实现模型选择逻辑

**Step 3.2: 集成原有路由逻辑**
- 复用 `src/utils/router.ts` 的核心逻辑
- 实现触发路由与原有路由的优先级协调
- 保持向后兼容性

### Phase 4: 配置系统实现

**Step 4.1: YAML 配置加载**
- 创建 `src/utils/config.ts`
- 支持 YAML 和 JSON 配置格式
- 实现配置验证
- 实现配置热重载

**Step 4.2: 创建配置示例**
- 创建 `config/trigger.example.yaml`
- 文档化所有配置选项
- 提供常见场景示例

### Phase 5: 集成与测试

**Step 5.1: 中间件集成**
- 在 `src/index.ts` 中集成触发分析中间件
- 确保执行顺序正确

**Step 5.2: 单元测试**
- 测试模式匹配器
- 测试意图识别
- 测试模型选择

**Step 5.3: 集成测试**
- 端到端测试完整请求流程
- 测试各种触发场景

### Phase 6: 文档与发布

**Step 6.1: 编写文档**
- README.md（中英文）
- 配置文档
- API 文档

**Step 6.2: 发布准备**
- package.json 完善
- 构建脚本
- npm 发布

## 详细任务清单

### Phase 1: 项目初始化

#### Task 1.1: 创建项目基础结构
- [ ] 初始化 npm 项目 (`npm init`)
- [ ] 配置 TypeScript (`tsconfig.json`)
- [ ] 安装依赖包
  - fastify
  - yaml (解析 YAML 配置)
  - @fastify/static
  - tiktoken
  - 其他依赖
- [ ] 创建目录结构
  ```
  src/
  ├── trigger/
  ├── router/
  ├── agents/
  ├── middleware/
  └── utils/
  ```

#### Task 1.2: 定义类型系统
- [ ] 创建 `src/trigger/types.ts`
- [ ] 定义 `ITriggerPattern` 接口
  ```typescript
  interface ITriggerPattern {
    type: 'exact' | 'regex';
    keywords?: string[];      // for exact type
    pattern?: string;         // for regex type
    caseSensitive?: boolean;  // default false
  }
  ```
- [ ] 定义 `ITriggerRule` 接口
  ```typescript
  interface ITriggerRule {
    name: string;
    priority: number;
    enabled: boolean;
    patterns: ITriggerPattern[];
    model: string;  // "provider,model_name"
    description?: string;
  }
  ```
- [ ] 定义 `ITriggerConfig` 接口
  ```typescript
  interface ITriggerConfig {
    enabled: boolean;
    analysis_scope: 'last_message' | 'full_conversation';
    llm_intent_recognition: boolean;
    intent_model?: string;
    rules: ITriggerRule[];
  }
  ```
- [ ] 定义 `IAnalysisResult` 接口
  ```typescript
  interface IAnalysisResult {
    matched: boolean;
    rule?: ITriggerRule;
    model?: string;
    confidence: number;
    analysisTime: number;
  }
  ```

### Phase 2: 触发分析器

#### Task 2.1: 实现模式匹配器
- [ ] 创建 `src/trigger/matcher.ts`
- [ ] 实现 `PatternMatcher` 类
  - `matchExact(text: string, keywords: string[], caseSensitive: boolean): boolean`
  - `matchRegex(text: string, pattern: string): boolean`
  - `match(text: string, pattern: ITriggerPattern): boolean`
- [ ] 添加单元测试

#### Task 2.2: 实现上下文分析器
- [ ] 创建 `src/trigger/analyzer.ts`
- [ ] 实现 `ContextAnalyzer` 类
  - `extractLastUserMessage(messages: MessageParam[]): string`
  - `extractAllUserMessages(messages: MessageParam[]): string[]`
  - `analyze(req: any, config: ITriggerConfig): string`
- [ ] 添加单元测试

#### Task 2.3: 实现意图识别器
- [ ] 创建 `src/trigger/intent.ts`
- [ ] 实现 `IntentDetector` 类
  - `detectIntent(text: string, config: ITriggerConfig): Promise<string>`
  - 使用配置的 LLM 进行意图识别
  - 实现 prompt 模板
- [ ] 添加缓存机制
- [ ] 添加单元测试

### Phase 3: 模型选择器

#### Task 3.1: 实现规则引擎
- [ ] 创建 `src/trigger/selector.ts`
- [ ] 实现 `ModelSelector` 类
  - `sortRulesByPriority(rules: ITriggerRule[]): ITriggerRule[]`
  - `matchRule(text: string, rules: ITriggerRule[]): ITriggerRule | null`
  - `selectModel(req: any, config: ITriggerConfig): IAnalysisResult`
- [ ] 添加单元测试

#### Task 3.2: 集成原有路由
- [ ] 复制 `src/utils/router.ts` 到 `src/router/index.ts`
- [ ] 创建 `src/router/rules.ts` 封装原有规则
- [ ] 实现 `CompositeRouter` 类整合触发路由和原有路由
- [ ] 添加单元测试

### Phase 4: 配置系统

#### Task 4.1: 配置加载器
- [ ] 创建 `src/utils/config.ts`
- [ ] 实现 YAML 配置解析
- [ ] 实现配置验证 (JSON Schema)
- [ ] 实现默认值合并
- [ ] 实现配置热重载（可选）

#### Task 4.2: 配置示例文件
- [ ] 创建 `config/trigger.example.yaml`
- [ ] 添加详细注释
- [ ] 提供多种场景示例

### Phase 5: 集成测试

#### Task 5.1: 中间件集成
- [ ] 修改 `src/index.ts`
- [ ] 添加触发分析中间件
- [ ] 确保执行顺序：Auth → Trigger → Router

#### Task 5.2: 端到端测试
- [ ] 创建测试脚本
- [ ] 测试场景：
  - 精确关键词匹配
  - 正则表达式匹配
  - 优先级排序
  - 多规则匹配
  - 原有路由兼容性

### Phase 6: 文档与发布

#### Task 6.1: 文档编写
- [ ] README.md（中文）
- [ ] README_en.md（英文）
- [ ] 配置文档
- [ ] 使用示例

#### Task 6.2: 发布准备
- [ ] 完善 package.json
- [ ] 构建脚本
- [ ] CLI 命令支持

## 依赖列表

```json
{
  "dependencies": {
    "fastify": "^5.4.0",
    "@fastify/static": "^8.2.0",
    "yaml": "^2.3.0",
    "tiktoken": "^1.0.21",
    "json5": "^2.2.3",
    "lru-cache": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "@types/node": "^24.0.15",
    "esbuild": "^0.25.1",
    "vitest": "^1.0.0"
  }
}
```

## 风险与缓解措施

| 风险 | 缓解措施 |
|------|----------|
| 正则表达式性能问题 | 添加超时限制，缓存编译后的正则 |
| LLM 意图识别延迟 | 默认关闭，缓存结果，异步处理 |
| 配置复杂度 | 提供良好文档和示例，UI 配置工具（未来） |
| 向后兼容性 | 保持原有配置格式，触发配置作为扩展 |

## 里程碑

1. **M1 - 基础框架** (Phase 1 完成): 项目结构就绪，类型定义完成
2. **M2 - 核心功能** (Phase 2-3 完成): 触发分析器和模型选择器可用
3. **M3 - 可用版本** (Phase 4-5 完成): 配置系统完整，测试通过
4. **M4 - 发布就绪** (Phase 6 完成): 文档齐全，可发布使用

## 验收标准

- [ ] 支持精确匹配和正则表达式两种模式
- [ ] 支持配置分析范围
- [ ] 支持优先级配置
- [ ] 支持可选的 LLM 意图识别
- [ ] 完整的单元测试覆盖
- [ ] 端到端测试通过
- [ ] 文档完整
