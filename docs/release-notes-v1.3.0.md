# v1.3.0 Release Notes

`v1.3.0` 定位为“基础路由常用体验版”。这个版本把 CTR 的最高频用户路径从“已经能配置多模型”推进到“新用户能配置、能诊断、能在 UI 看懂、也有 packaged smoke 防回退”。

## 本次发布主线

- 基础路由五槽位说明：README 围绕 `Router.default`、`Router.think`、`Router.longContext`、`Router.background`、`Router.webSearch` 补齐触发条件、推荐模型类型和常见误区。
- 可复制基础路由模板：新增 `config/trigger.routing.yaml`，用于快速建立 default / thinking / long context / background / web search 的分流配置。
- `ctr doctor` 路由槽位体检：检查默认模型是否存在、各槽位是否能解析到 `Models[].id`、thinking 能力是否匹配，以及上下文窗口元数据是否缺失。
- `/ui` 使用者工作台路由解释：展示当前五槽位引用、上游 provider/model、能力提示和潜在 warning，帮助用户确认当前配置是否按预期生效。
- Context window guide：在 `/ui` 中展示 default 与 longContext 容量、最大上下文候选、缺失元数据计数，并支持把推荐模型设为 `Router.longContext`。
- packaged basic routing smoke：打包后 acceptance 覆盖 fresh setup、`ctr status`、`ctr code` 环境、五槽位解析，以及真实 `/v1/messages` 请求触发 longContext fallback。

## 发布边界

本版本不把 CTR 宣称为完整 SmartRouter 产品化版本，也不承诺完整云端托管平台。以下事项已经进入后续计划，但不作为 `v1.3.0` 的发布承诺：

- SmartRouter 规则模板、候选模型配置向导、路由决策解释和慢路由/错路由调优建议。
- benchmark 历史看板和人工校准 UI 表单。
- 公网 server/cloud 一键部署默认推荐、托管级密钥轮换手册和集群编排。
- 模型池主动健康探测、成本/速率元数据和更多调度策略。

对用户的建议口径是：`v1.3.0` 已经适合把本地 Claude Code 的基础分流路径作为日常主路径使用；如果要启用 SmartRouter 候选模型或远程服务端，应继续按照 README 的边界说明使用，并等待后续版本把模板、解释和运维入口进一步收口。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.3.0`
- `ctr version` 输出 `Version: 1.3.0`
- `v1.3.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.3.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
