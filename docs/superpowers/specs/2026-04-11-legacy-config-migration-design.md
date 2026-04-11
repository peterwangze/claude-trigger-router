# Claude Code Router Legacy 配置迁移设计

## 1. 背景与问题

当前 `claude-trigger-router` 的 setup 流程虽然已经存在 legacy migration 分支，但对真实 `claude-code-router` 配置的支持并不完整。现状中的主要问题不是“没有迁移入口”，而是迁移逻辑和测试样本没有基于真实 legacy 配置进行约束，导致功能表面存在、真实场景却无法闭环。

本次确认到的真实 legacy 配置来源为：

- `C:\Users\peter\.claude-code-router\config.json`

该配置与当前迁移逻辑主要覆盖的旧输入存在明显差异：

- 使用 `config.json`，而非仅 `config.yaml`
- 主要字段为 `Providers` / `Router`，而非仅旧式 `providers` / `default`
- 含有多 provider、多 model、多路由槽位
- 含有 `transformer`、`headers`、`StatusLine` 等附加 legacy 字段
- 真实文件存在宽松 JSON 特征（如尾随逗号），不能假设标准 `JSON.parse` 一定可直接消费

这意味着当前问题的根因不是 setup 没有“迁移”按钮，而是：

1. legacy 输入识别覆盖不完整
2. 迁移器仍然偏向旧的最小样例，而不是用户真实配置
3. 测试没有使用真实 legacy 配置形态作为主样例，导致需求被反复忽略

---

## 2. 设计目标

### 2.1 核心目标

- setup 必须识别真实 `claude-code-router` legacy 配置，尤其是 `.claude-code-router/config.json`
- 迁移结果必须输出为当前 `claude-trigger-router` 支持的“新 module id 配置内容”，而不是保留 legacy 外壳
- 迁移应尽量完整保留 legacy 配置语义，尤其是多 provider、多 model、默认路由等主链路语义
- 无法映射到当前配置结构的字段必须显式提示并跳过，不能静默丢失
- 必须引入真实 legacy 配置样本驱动的测试看护，防止同类遗漏再次发生

### 2.2 非目标

本次设计不追求：

- 完整兼容 legacy 中所有扩展字段的运行时语义
- 为了迁移而扩展当前正式配置 schema 去承载所有历史字段
- 在 setup 本轮中重新设计全部高级路由/治理能力
- 保留 legacy 原始配置格式作为输出结果

---

## 3. 产品与迁移原则

### 3.1 输出形态原则

迁移的目标不是“把老配置抄过来”，而是“把老配置的内容翻译成当前新配置”。

换句话说：

- 输入是 legacy 配置
- 输出是当前支持的 `Models[] + Router` 配置内容
- 配置引用方式必须转成当前统一的 module id 形态

因此，本设计明确要求：

- 不保留 legacy 的 `Providers/default` 作为最终落盘主形态
- 不保留 `provider,model` 这种旧路由引用作为最终默认行为
- 所有可迁移的路由引用都必须转换为新的 module id

### 3.2 尽量完整迁移原则

“尽量完整”不是指保留 legacy 外壳，而是尽量保留语义：

- legacy provider 要尽量映射成新的可用模型条目
- legacy model 列表要尽量全部迁入
- `Router.default` 要迁成新的默认 module id
- 如果当前系统已有对应承载点，则尽量迁移 `background`、`think`、`longContext` 这类路由槽位
- 如果当前系统没有正式承载点，则必须在迁移结果中记录为 skipped，并在 setup 中提示用户

### 3.3 显式跳过原则

以下字段若无法被当前 schema 正确表达，必须显式标记为 skipped：

- `transformer`
- `headers`
- `StatusLine`
- 任何当前 schema 无稳定承载点的 legacy 路由扩展字段
- 任何未被当前迁移器正式消费的 legacy 顶层字段

禁止出现“成功迁移”但 silently 丢字段的行为。

对于真实 `claude-code-router` config.json，至少要覆盖这类顶层字段的处理策略：

- `LOG`
- `LOG_LEVEL`
- `CLAUDE_PATH`
- `HOST`
- `PORT`
- `APIKEY`
- `API_TIMEOUT_MS`
- `PROXY_URL`
- `transformers`
- `CUSTOM_ROUTER_PATH`

本次设计的默认规则是：

- 如果字段已在当前正式配置 schema 中有明确承载点，则按正式配置语义迁移
- 如果字段没有正式承载点，或本轮不属于 setup 主链路语义，则统一进入 `skippedFields`
- `skippedFields` 的范围必须覆盖“已知 legacy 附加字段”和“未知顶层字段”，不能只靠人工白名单维持

---

## 4. 顶层方案

推荐采用统一迁移入口、两层内部结构：

1. legacy 输入识别与归一化
2. 归一化语义对象生成新 module id 配置草稿

这样做的原因是：

- 既能兼容 `.ccr/config.yaml` / `.claude-code-router/config.yaml` 的旧输入
- 也能兼容真实 `.claude-code-router/config.json` 输入
- 避免把迁移逻辑拆成多条平行分支，导致后续维护继续分叉

### 4.1 输入识别层

`readLegacyConfig()` 需要覆盖以下候选路径：

- `.ccr/config.yaml`
- `.claude-code-router/config.yaml`
- `.claude-code-router/config.json`

这里的目标不只是“发现 legacy 文件”，而是为后续迁移提供真实、可消费的配置对象。

对于 `.json` 输入，设计必须明确支持宽松 JSON 特征的读取策略。至少要覆盖真实样本中的尾随逗号，否则 setup 会在“识别到文件”后直接掉进 parse error，迁移链路并未真正闭环。

可接受的实现方向只有两类：

- 使用支持宽松 JSON/JSON5 的解析方式
- 在明确、可测试的前提下对 legacy json 做最小规范化后再解析

无论采用哪种实现，测试都必须基于真实样本证明：`.claude-code-router/config.json` 可被成功读取并进入迁移分支，而不是停在 read error。

此外，候选文件优先级也需要被测试锁定：

- 当 yaml 缺失、json 存在时，必须识别 json
- 当 yaml 与 json 同时存在时，必须有明确优先级，并形成测试看护
- 当 json 存在但解析失败时，必须给出明确错误结果，而不是静默回退到 fresh path

### 4.2 语义归一化层

迁移器应先将 legacy 输入统一归一化为内部语义对象，至少包含：

- legacy providers 列表
- 每个 provider 下的模型列表
- legacy 默认路由引用
- legacy 扩展路由槽位（如 `background` / `think` / `longContext`）
- 可映射元信息
- skipped 字段列表

归一化层要同时兼容两类输入：

- 旧小写形态：`providers` / `default`
- 真实大写形态：`Providers` / `Router`

### 4.3 新配置生成层

归一化后统一生成当前 `ISetupConfigDraft`：

- `Models[]` 作为主要配置承载点
- `Router.default` 引用新的 module id
- 如当前 schema 已支持更多路由槽位，则同步写入对应字段
- 不能表达的字段进入迁移结果的 `skippedFields`

---

## 5. 关键设计细节

## 5.1 module id 生成

迁移后的模型必须生成稳定、可预测的 module id，以便：

- setup 测试能直接断言
- 用户多次迁移同一 legacy 配置时结果稳定
- legacy 路由引用能稳定映射到新 id

推荐规则延续当前 setup 的归一化风格：

- 基于 `providerName + upstreamModel` 生成 id
- `providerName` 与 `upstreamModel` 都执行相同的归一化规则
- 统一小写
- 非字母数字字符归一为下划线
- 去除首尾多余下划线

例如：

- `qianfan_coding + glm-5` -> `qianfan_coding_glm_5`
- `qianfan_coding + kimi-k2.5` -> `qianfan_coding_kimi_k2_5`
- `gpt90 + gpt-5.4` -> `gpt90_gpt_5_4`

为避免 legacy 路由映射不稳定，冲突处理规则也必须写死：

- 路由引用匹配时，优先按 legacy 原始 `(provider, model)` 精确匹配，而不是按归一化后的字符串反推
- module id 生成后若出现冲突，使用稳定后缀去重，推荐按出现顺序追加 `_2`、`_3` 等后缀
- 冲突去重逻辑必须是确定性的，同一输入多次迁移得到完全相同的 module id 集合
- 测试必须覆盖至少一个命名冲突样例，证明默认路由最终仍能映射到正确 module id

这样可以保证：module id 可以稳定断言，legacy 路由也不会因为归一化碰撞而指向错误模型。

如果实现上需要保留一份 `(provider, model) -> moduleId` 映射表，应将其视为迁移内部的正式中间产物，而不是临时字符串查找逻辑。

## 5.2 legacy 路由映射

对于类似下列 legacy 引用：

- `Router.default = "gpt90,gpt-5.4"`

迁移器必须：

1. 解析出 `provider,model`
2. 在归一化后的模型集合中找到对应条目
3. 将其转换为新的 module id
4. 写入当前 `Router.default`

如果 legacy 路由引用找不到匹配模型，不应静默跳过，而应：

- 将相关项标记为缺失或 skipped
- 让 setup 在必要时进入补全流程

## 5.3 真实附加字段处理

对已确认的真实 legacy 配置字段，处理策略如下：

- `transformer`
  - 默认视为当前 schema 无正式承载点
  - 标记到 `skippedFields`
- `headers`
  - 若当前 schema 无对应字段，标记到 `skippedFields`
- `StatusLine`
  - 不进入当前主迁移配置，标记到 `skippedFields`
- `Router.background / think / longContext`
  - 若当前正式 schema 有对应承载点，则迁移
  - 若没有，则显式标记 skipped，不 silently 丢弃

---

## 6. 对 setup 流程的影响

### 6.1 `readLegacyConfig()`

职责扩大为“真实 legacy 配置检测器”，不再只是 yaml-only fallback。

验收要求：

- 当 `.claude-code-router/config.json` 存在时，setup 必须能探测到 legacy 配置
- 探测结果必须被后续迁移分支正确使用

### 6.2 `migrateLegacyConfig()`

职责从“旧小样例转换器”提升为“统一 legacy 归一化迁移器”。

验收要求：

- 同时支持旧小写 legacy 结构与真实大写 config.json 结构
- 输出仍然是当前 `ISetupConfigDraft`
- 返回 `skippedFields` / `missingFields`，覆盖真实场景

### 6.3 `runSetupCli()` / `runSetupFlow()`

主流程原则上不需要重排，但要保证：

- 选择 legacy migration 后，优先走迁移草稿输出，而不是退回 fresh provider preset 流程
- 如果迁移结果已经完整，则直接持久化并进入 service-ready 阶段
- 如果迁移结果不完整，则只补必要缺口，而不是强迫用户重新从零配置
- setup 信息输出要明确本次迁移保留了什么、跳过了什么

这里需要补一个可执行约束：当前 setup 主流程不能只消费 `draft` 与 `missingFields`，还必须消费并展示 `skippedFields`。否则实现者很容易只改迁移器，最终 CLI 仍然对用户表现为“迁移成功”，但用户根本不知道哪些字段没有迁入。

推荐展示要求：

- 迁移前或迁移后输出一段简要摘要：识别到的 provider 数、模型数、默认路由
- 若 `skippedFields` 非空，必须输出“以下字段未迁移”的信息摘要
- 若 skipped 项属于高级能力或当前 schema 无承载点，应提示用户后续需要手工处理，而不是假装已经完成
- 相关 setup 测试必须断言这段提示确实被输出

这部分是“避免 silently 丢字段”的 CLI 闭环抓手，不是可选增强。

---

## 7. 测试设计

本次改动必须严格采用“真实样本先红后绿”的测试策略。

### 7.1 `src/setup/index.test.ts`

新增测试目标：

- 能探测 `.claude-code-router/config.json`
- 当 yaml 不存在但 json 存在时，优先识别真实 legacy config.json
- 当 yaml 与 json 同时存在时，优先级行为明确且有测试看护
- 当 json 存在但解析失败时，返回明确的 read/parse error 结果，而不是静默回退 fresh path

这组测试锁定“发现真实 legacy 输入”的能力。

### 7.1.1 宽松 JSON 读入测试

必须新增真实样本级别的读取测试，证明带尾随逗号的 `.claude-code-router/config.json` 可以被成功读入。

如果实现选择 JSON5 或最小规范化策略，对应测试也必须直接锁定该能力，而不是只用严格 JSON 假样本通过测试。

### 7.2 `src/setup/migrate.test.ts`

新增真实样本驱动测试，样本结构需贴近用户机器上的实际 config.json，但要脱敏。

至少断言：

- 多 provider 被全部纳入归一化迁移
- 每个 provider 下的模型能生成稳定 module id
- `Router.default` 被正确改写为 module id
- `transformer`、`headers`、`StatusLine` 被纳入 `skippedFields` 或等价迁移报告
- 若 `background/think/longContext` 当前无承载点，则也被显式记录

这组测试是本次需求的核心看护，不允许再用“最小 legacy 样例”替代真实配置形态。

### 7.3 `src/setup/setup.test.ts`

新增端到端测试目标：

- 检测到真实 `.claude-code-router/config.json`
- 用户选择 `迁移旧配置`
- setup 直接写出新的 module id 配置
- 默认路由指向新的 module id
- 无法迁移字段进入提示/报告，而不是强制退回 fresh init

这组测试锁定用户真正关心的行为：setup 不再忽略 legacy migration 需求。

---

## 8. 验收标准

本设计完成后，必须满足以下标准：

1. setup 能识别 `.claude-code-router/config.json`
2. 真实 legacy 配置可被迁移成当前支持的新 module id 配置内容
3. 多 provider / 多 model / 默认路由语义可以保留
4. setup 不会在 legacy migration 场景下错误退回 fresh provider preset 流程
5. 无法迁移字段会被显式提示并记录
6. 新增测试对真实 config.json 形态形成长期看护

---

## 9. 风险与边界

### 9.1 风险

- 当前 schema 未必有足够字段承载 legacy 的全部扩展语义
- 真实 legacy 配置中可能存在更多未被当前样本覆盖的字段变体
- module id 生成若不稳定，可能导致默认路由映射不可靠

### 9.2 边界处理

本次设计采取以下边界策略：

- 主链路优先：先保证 `Models[] + Router.default` 正确迁移
- 扩展路由槽位次优先：有承载点就迁，没有就显式 skipped
- 扩展元字段保守处理：不强行为迁移而污染当前 schema
- 测试以真实样本为主样例，后续若发现更多 legacy 变体，再补充归一化样例

---

## 10. 实施要求

- 先写基于真实 config.json 形态的 failing tests，再改实现
- 不允许直接在旧迁移逻辑上堆分支而不抽出归一化层
- 不允许仅修“读到 json 文件”而不修“迁移结果转成 module id 配置”
- 不允许 silently 丢弃无法迁移字段
- 改动完成后，至少运行 setup 相关测试组验证主链路

这次需求的完成标准不是“setup 支持了一个新路径”，而是“真实 legacy 配置能稳定迁成当前配置内容，并且被测试永久看住”。
