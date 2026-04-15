# TriggerRouter / SmartRouter 对外心智收编实施计划

## 1. 计划定位

本计划对应统一进展基线中的：

- 主线 C2：将用户侧 `TriggerRouter` / `SmartRouter` 分立心智正式收编为统一 Router 主入口

它不负责重新设计运行时链路，也不重复统一 Router 设计文档中的总体目标；本计划只负责把“用户侧仍看到 TriggerRouter / SmartRouter 两套主概念”的问题拆成可执行路径。

## 2. 当前问题

虽然运行时已经逐步进入统一 Router 收敛阶段，但当前用户入口仍存在明显分裂：

1. README 主要按 `TriggerRouter` / `SmartRouter` 分节说明功能
2. `setup` 完成后的下一步指引仍显式提示 `TriggerRouter` / `SmartRouter`
3. 示例配置仍主要以分立模块表达能力
4. 用户容易理解成：
   - TriggerRouter 是一套系统
   - SmartRouter 是另一套系统
   - Governance 又是第三套系统

这会直接削弱统一 Router 主线的最终目标：

- 用户只理解一套 Router 决策心智
- 内部模块名保留历史实现价值，但不再主导对外产品表达

## 3. 最终目标

完成后，对外用户侧应形成统一表达：

- 用户先理解 `Router`
- `Router` 有显式规则、语义辅助、智能兜底、默认治理
- `TriggerRouter` / `SmartRouter` 不再作为 README / setup / 示例配置中的第一层主入口概念

允许保留：

- 内部模块名、代码目录名
- 兼容读取旧配置
- 文档中在“兼容说明”或“历史映射”段落提到旧名

不允许继续保留：

- 用户首页或快速开始仍把 TriggerRouter / SmartRouter 当成主要产品入口
- setup 结束页继续把它们作为默认下一步主叙事
- 示例配置只提供分立表达，而没有统一 Router 主表达

## 4. 范围边界

### 本计划要做

1. README 的对外产品叙事收编
2. setup 完成页 / 下一步提示收编
3. example config 主表达收编
4. `/ui` 文案和配置工作台主表达收编
5. 兼容期映射说明

### 本计划暂不做

1. 运行时 selector 顺序重排
2. compatibility profile 的进一步 provider-specific 细化
3. doctor 的更深层 provider 调试能力
4. 统一 Router 完整 schema 默认落盘切换

这些内容属于统一 Router 运行时主线或配置产品化主线，不在本计划第一阶段内完成。

## 5. 实施阶段

### 阶段 C2-1：统一对外叙事入口

目标：

- README 不再把 `TriggerRouter` / `SmartRouter` 当成第一层产品分类
- 先讲统一 Router，再讲显式规则与智能兜底是 Router 的两种能力

涉及：

- `README.md`

完成标准：

- 快速开始和主要功能说明以 `Router` 为主语
- `TriggerRouter` / `SmartRouter` 最多作为兼容术语或实现映射出现

### 阶段 C2-2：setup 完成页与 CLI 帮助收编

目标：

- setup 成功后的输出不再默认引导用户继续理解两套系统
- CLI 帮助与下一步提示统一收口到 Router 心智

涉及：

- `src/setup/index.ts`
- `src/cli.ts`
- `src/setup/index.test.ts`
- `src/cli-run.test.ts`

完成标准：

- setup 完成提示改为“继续完善 Router”
- 不再把 `TriggerRouter` / `SmartRouter` 当成主线下一步入口

### 阶段 C2-3：示例配置主表达收编

目标：

- 提供统一 Router 主表达的 example config
- 旧分立模块表达只保留兼容说明或高级示例位置

涉及：

- `config/trigger.example.yaml`
- `config/trigger.advanced.yaml`
- `src/e2e/cli-e2e.test.ts`
- `src/setup/templates.test.ts`

完成标准：

- 最小示例优先体现统一 Router 心智
- 高级示例中如保留旧模块表达，必须明确其兼容角色

### 阶段 C2-4：`/ui` 工作台主表达收编

目标：

- `/ui` 的配置/编译/预览文案不再把 Trigger/Smart/Governance 当成三套并列产品
- 用户看到的是一套 Router 决策工作台

涉及：

- `src/server.ts`
- `src/server.test.ts`

完成标准：

- UI 主入口术语统一为 Router
- 旧术语只保留在兼容说明、字段来源说明或折叠层

## 6. 验收标准

本主线完成时，必须同时满足：

1. README 首屏与快速开始已经统一 Router 叙事
2. setup 完成页已经统一 Router 叙事
3. example config 已以统一 Router 为主表达
4. `/ui` 主文案已统一 Router 叙事
5. 兼容期内旧配置仍可运行
6. 相关 CLI / setup / example / UI 测试已更新并通过

## 7. 当前状态（2026-04-15）

当前已完成：

- 在统一进展基线中单独列出该主线
- 明确该主线此前属于“被统一 Router 大主线掩盖的未启动路径”
- 正式创建独立实施计划，作为后续代码与文档调整的执行依据

当前未完成：

- 尚未开始 README / setup / example / `/ui` 的统一 Router 文案与结构调整
- 尚未建立这一主线的专门回归测试组

## 8. 推荐的第一批执行顺序

建议后续按下面顺序落地，而不是同时散改：

1. 先改 README 和 setup 完成页
2. 再改 example config
3. 再改 `/ui`
4. 最后做统一回归和基线状态更新

这样可以先把用户最容易接触到的入口统一，再逐步把高级工作台跟上。
