# 配置产品化第二阶段实施计划

> 目标：在现有 `Models` 抽象、`ctr setup` 和 `/ui` 草稿工作台基础上，继续收敛模型配置心智，推动“少参数配置模型 + 路由统一协议转换”落地。

## 1. 背景

当前项目已经完成配置产品化第一阶段的关键能力：

- 引入 `Models` 抽象，弱化旧 `Providers` 直配心智
- `ctr setup` 默认生成 `Models` 配置
- `/ui` 已支持 models 草稿编辑、编译预览、引用分析、修复建议、preset、dry-run
- 路由、trigger、governance 已能通过 `Models[].id` 引用目标模型

但当前模型配置仍然暴露了一部分 provider 协议细节：

- 用户仍需理解 `protocol=openai|anthropic`
- 部分服务商虽兼容 OpenAI/Anthropic，但在配置上仍容易让用户误解为“必须单独适配”
- 不同入口对“接口类型”“思考类型”“模型消息格式能力”的表达尚未完全收敛

因此，第二阶段的重点不再是“继续做更多编辑 UI”，而是进一步简化心智模型。

## 2. 第二阶段目标

目标是验证并逐步落地以下配置收敛方向：

1. 单个模型是否可用 4 个核心参数描述：
   - `api`
   - `key`
   - `接口类型`
   - `思考类型（可选）`
2. 由路由层统一做消息格式转换，而不是让配置入口暴露 OpenAI / Anthropic 消息差异
3. setup、配置文件、`/ui` 和编译器共享同一份模型 schema
4. 保持向后兼容，不破坏现有 `Models` 与旧 `Providers` 配置

## 3. 设计原则

### 3.1 先兼容，再收敛

第二阶段必须建立在现有 `Models` 之上演进，避免直接推翻第一阶段。

### 3.2 统一入口，不统一上游能力

我们要统一的是“用户如何配置”，不是强行假设所有上游能力完全一致。

### 3.3 编译期显式，运行期稳定

用户输入的简化配置应在编译期被展开成内部能力描述，运行期路由只消费统一结果。

### 3.4 能力缺失要可解释

如果某个接口类型不支持某种消息块、thinking 配置或工具能力，系统必须能给出明确提示，而不是静默失败。

## 4. 范围

### 本阶段要做

- 定义统一的“模型入口 schema”
- 定义 `接口类型` 与内部协议能力映射
- 定义 `思考类型` 的统一抽象与能力降级规则
- 设计统一消息中间表示（message IR）
- 设计 `message IR -> OpenAI/Anthropic` 的转换边界
- 评估 setup、`/ui`、配置文件如何共享这套 schema

### 本阶段暂不做

- 不一次性移除旧 `Providers`
- 不强制把所有历史 `Models` 字段砍掉
- 不在本阶段引入完整多协议插件系统
- 不先做过度抽象的 provider marketplace

## 5. 推荐分块

## Chunk A：统一模型入口 schema

目标：

- 从当前 `Models` 结构中抽取“用户最少必须关心的字段”
- 定义兼容层，支持旧字段继续工作

建议输出：

- 新的模型入口草案字段
- 旧 `Models` -> 新入口 schema 的兼容映射
- 新入口 schema -> 内部编译结果的转换规则

验收标准：

- 能明确区分“用户输入字段”和“内部编译字段”
- README、setup、`/ui` 可共享同一套字段说明

## Chunk B：接口类型与协议能力映射

目标：

- 把 `openai`、`anthropic` 从“用户必须理解的 transformer/protocol 细节”收敛为更清晰的“接口类型”

至少梳理：

- OpenAI 官方与 OpenAI-compatible 服务
- Anthropic 官方与 Anthropic-compatible 服务
- 某些通过 OpenAI 兼容层提供 Claude / DeepSeek / 第三方模型的服务

验收标准：

- 用户能知道“接口类型”描述的是请求/响应协议，而不是厂商品牌
- 兼容服务商不会被误建模成新的核心协议

## Chunk C：思考类型统一抽象

目标：

- 把现有 `thinking.mode / effort / budget_tokens` 收敛为面向用户更稳定的表达

建议方向：

- 保留内部细粒度结构
- 对外暴露更少的思考档位或模式
- 对不支持思考参数的接口类型自动忽略或给出提示

验收标准：

- setup 与 `/ui` 都能清楚表达“可选思考类型”
- 不支持的模型不会因为配置了思考类型而直接变成不可用

## Chunk D：统一消息中间表示与转换层

目标：

- 在路由完成选模后，统一走内部 message IR
- 再由目标协议转换器映射到 OpenAI / Anthropic 请求格式

验收标准：

- 路由层不再直接拼接各家协议消息格式
- 新服务商只要声明兼容哪种接口类型，就能复用现有转换器

## Chunk E：入口对齐与迁移策略

目标：

- setup、配置文件、`/ui`、编译器、校验器使用相同 schema
- 明确迁移和降级路径

验收标准：

- 一个模型入口在三条路径上表达一致
- 校验错误能够定位到统一字段名

## 6. 里程碑

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| P2-M1 | 第二阶段问题定义与术语收敛 | done |
| P2-M2 | 统一模型入口 schema 设计完成 | in_progress |
| P2-M3 | 接口类型 / thinking 抽象设计完成 | in_progress |
| P2-M4 | message IR 与协议转换设计完成 | in_progress |
| P2-M5 | setup / `/ui` / config 迁移方案完成 | pending |
| P2-M6 | 第一轮实现与回归测试完成 | pending |

## 7. 风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 过度抽象导致现有配置难以理解 | 文档与实现复杂化 | 保留兼容层，先做增量 schema |
| 把厂商能力差异错误归因为协议差异 | 用户配置误判 | 明确“接口类型”只表达协议兼容性 |
| 思考类型抽象过粗 | 无法覆盖不同模型能力 | 对外收敛，对内保留细粒度 |
| 消息 IR 设计过早过重 | 实现复杂度上升 | 先覆盖当前主路径的消息块类型 |

## 8. 建议推进顺序

1. 先出第二阶段设计文档
2. 再收敛统一 schema 与接口类型术语
3. 然后做 message IR 和协议转换层
4. 最后接 setup 和 `/ui`

## 9. 本文与现有文档关系

- 衔接 `docs/superpowers/plans/2026-04-06-router-progress-calibration.md`
- 作为“配置产品化”主线的第二阶段计划
- 详细设计见：`docs/superpowers/specs/2026-04-06-unified-model-config-design.md`

## 10. 2026-04-06 阶段推进记录

已完成的第二阶段子阶段：

### 阶段 2A：统一模型入口字段别名

- `Models` 已支持 `api` / `key` / `interface`
- 旧字段 `api_base_url` / `api_key` / `protocol` 仍兼容
- setup、配置保存和 `/ui` 草稿入口已开始切换到新命名

### 阶段 2B：thinking 公共抽象首轮落地

- `thinking` 已支持字符串档位：`off / auto / on / low / medium / high`
- 内部仍统一归一化为结构化 thinking 配置
- 配置写回优先输出更简洁的 thinking 字符串
- setup / `/ui` 已开始使用面向用户的 thinking 档位表达

### 阶段 2C：message IR 与协议适配边界首轮落地

- 已新增 `src/protocols/message-ir.ts`
- 已新增 `src/protocols/anthropic.ts` 和 `src/protocols/openai.ts`
- SmartRouter、Context Alignment、Semantic Router、Shadow Supervisor、Image Agent 的内部自调用请求已开始通过 message IR 组装
- 当前仍属于“内部治理与辅助链路先接入”，主请求链路与完整上游协议转换尚未完全切换

### 阶段 2D：主请求链路接入 message IR 与协议分发

- `/v1/messages` 主请求在选模后会先归一化为 `message IR`
- 已新增统一协议分发入口 `src/protocols/index.ts`
- 主请求会基于目标模型 `interface` 显式转换为 OpenAI / Anthropic 上游请求体
- 运行时仍保留原始 Anthropic 风格请求体，供 response governance、agent tool 回放和递归自调用继续复用
- 当前主路径已覆盖文本、图片、tool call、tool result 与 thinking 的统一转换
- 复杂块类型（如音频、结构化输出专用字段）仍待后续阶段继续扩展

### 阶段 2E：编译期 capability 描述首轮落地

- `buildModelRegistry` 现已为每个 `modelId` 生成 `capabilities`
- 当前 capability 首轮覆盖：`thinking.supported`、`tools`、`images`、`systemMessageStyle`
- `Models[].metadata` 已可声明 `supports_reasoning / supports_tools / supports_images`
- 主请求协议分发会读取 compiled capabilities，对不支持 reasoning 的模型自动忽略 thinking，并记录 capability diagnostics
- `/api/models/compiled` 与 `/api/models/compiled/preview` 现可直接查看每个 modelId 的 capability 描述
- 当前仍属于“能力描述先显式化”的阶段，tools/images 的更强运行时降级与用户提示仍待后续补齐

### 阶段 2F：capability 运行时降级首轮落地

- 协议分发现会对 `supports_tools=false` 的模型移除 `tools` / `tool_choice`
- tool call / tool result 会自动降级为普通文本上下文，而不是继续按工具协议透传
- 协议分发现会对 `supports_images=false` 的模型把图片块降级为说明性文本
- 保留 capability diagnostics，便于日志与后续 `/ui` 可视化继续接入
- README 与 `docs/models-migration-guide.md` 已同步补充 capability hint 与降级行为说明

### 阶段 2G：capability warning 可视化首轮落地

- `/api/models/compiled` 与 `/api/models/compiled/preview` 现会返回 `capabilityWarnings`
- warning 当前覆盖：`thinking_ignored`、`tools_text_fallback`、`images_text_fallback`
- `/ui` Draft Config Preview 已新增 `Capability Warnings` 面板
- warning 支持从面板直接跳转到对应配置路径，便于在草稿表单中修正
- 当前 warning 仍属于编译/预览期提示，尚未接入统一的配置校验 warnings 通道

### 阶段 2H：统一配置 warning 通道首轮落地

- `normalizeAndValidateConfig(...)` 现已返回 `warnings`
- warning 与 capability warning 已开始共享同一套来源，减少重复规则分叉
- `ctr setup` 在复用现有配置或保存新配置时，现会主动输出这些非致命 warning
- `/api/models/compiled`、`/api/models/compiled/preview`、`POST /api/config` 现也会返回 `warnings`
- 当前 warning 已进入配置与 setup 主通道，但 repair / save UI 仍未完全按 severity 分层展示

### 阶段 2I：repair/save UI warning 分层首轮落地

- `/ui` Draft Config Preview 的 `Validation Summary` 现已同时显示 errors 和 warnings
- 当前 UI 会按 `repair first` / `review before save` 区分修复优先级
- `/ui` 现已支持直接保存当前草稿配置，并在保存后继续展示 warning
- warning 不再只停留在 preview API 或 setup CLI，而是进入日常可视化编辑主路径
- 当前 remaining gap 主要是 warning 尚未与自动 repair 建议进一步联动

### 阶段 2J：capability 显式表单控件首轮落地

- `/ui` Models 表单现已新增 `Vendor hint`、`Reasoning support`、`Tool support`、`Image support`
- capability 常见编辑路径已从原先的纯 `metadata` JSON 输入，收敛为显式字段
- `Metadata (advanced JSON)` 仍保留，作为高级扩展入口
- 用户现在可以直接在表单中配置 capability hint，再配合 warning 面板查看效果
- 当前 remaining gap 主要是 setup CLI 仍未提供对这些 capability 字段的专门问答路径

### 阶段 2K：warning 快捷修正首轮落地

- `/ui` Capability Warnings 面板现已支持首轮快捷修正动作
- `thinking_ignored` 可直接一键移除当前模型的 `thinking`
- `tools_text_fallback / images_text_fallback` 可直接恢复默认 capability，而不是手动改 metadata
- warning 已开始从“只读提示”演进到“可操作修正入口”
- 当前 remaining gap 主要是 setup CLI 仍未提供 capability 字段的专门问答路径

### 阶段 2L：setup CLI capability 引导首轮落地

- `ctr setup` 现已支持在 fresh init 阶段直接填写 capability hint
- 当前向导已覆盖 `Vendor hint / Reasoning support / Tool support / Image support`
- invalid config repair 流程现也会把 capability warning 一并纳入 repair 字段映射
- capability 常见配置已不再只依赖 `/ui` 表单或 warning 回看
- 当前 remaining gap 主要是 setup CLI 仍未对多模型 capability 分别提供更细粒度引导
