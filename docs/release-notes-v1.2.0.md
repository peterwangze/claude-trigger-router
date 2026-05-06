# v1.2.0 Release Notes

`v1.2.0` 定位为“智能路由评测与治理增强版”。这个版本把多模型组合从“能配置、能路由”推进到“能用固定任务复现、能按维度解释质量差异、能在治理面看到收益和风险证据”。

## 本次发布主线

- `ctr eval --tasks`：导出固定任务、prompt、期望输出、rubric、质量维度和 result template，方便维护者建立稳定的多模型 A/B 输入。
- `ctr eval --input results.json`：对已有多模型输出做 deterministic rubric 评分，输出 pass rate、quality、speed、latency、best run、维度均分和失败 findings。
- `ctr eval --run --models "sonnet;haiku"`：通过 CTR `/v1/messages` 自动执行固定任务集，支持 `--base-url`、`--api-key`、`--timeout-ms`、`--concurrency`、`--max-tokens` 和 JSON 输出。
- `ctr eval --run --models "sonnet;haiku" --judge-model sonnet`：自动执行后继续调用一个 LLM 裁判模型，回填 `judgeScore`、`judgeFindings` 和 `calibrationNotes`；`ctr eval --input results.json --judge-model sonnet` 也可对已有结果补裁判分。
- 严格质量维度评分：固定任务与自定义任务都可以用 `qualityDimensions` 解释语义覆盖、完整性、交付格式、安全卫生等差异；任一必需维度低于阈值会让该结果失败。
- 人工/裁判校准入口：`ctr eval` 输入可以附带 `humanScore`、`judgeScore`、`calibrationNotes` 和 `judgeFindings`，也可以用 `--judge-model` 自动生成裁判分；报告会输出 calibration summary 和高分歧样本，裁判失败会以 `judge_error` 进入 findings 但不会误计入 calibration score。
- 治理收益观测增强：routing outcome、task comparison、quality evidence、context window guard、switch/alignment/cascade 等指标可通过 metrics、health、CSV 和 UI 进入维护者调优路径。
- UI benchmark summary：维护者工作台会把 task comparison、quality evidence 和 `ctr eval --run` 下一步动作合并成 benchmark 摘要。
- 发布链路继续使用 `release:verify` / `release:stage` / GitHub trusted publishing，并要求 tag 与 `package.json.version` 一致。

## 发布边界

本版本不把 CTR 宣称为完整云端平台或完整自动裁判系统。`--judge-model` 已提供可重复的裁判执行入口，但它仍应和人工复核一起作为校准信号使用。以下能力已经进入实施计划，但不作为 `v1.2.0` 的发布承诺：

- 人工校准 UI 表单
- 更完整的 benchmark 历史看板
- 公网 server/cloud 一键部署默认推荐
- 托管场景密钥轮换操作手册
- 服务发现、节点/集群编排
- 模型池主动健康探测、成本/速率元数据和更多调度策略

对用户的建议口径是：`v1.2.0` 已经适合用来验证多模型组合是否带来质量/速度收益；如果要把服务暴露给多人或公网，应继续按 README 的安全边界使用 managed key、quota、audit 和 HTTPS/内网保护，不要把 cloud/server 形态理解为已经具备完整托管控制面。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.2.0`
- `ctr version` 输出 `Version: 1.2.0`
- `v1.2.0` tag 与包版本一致
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
