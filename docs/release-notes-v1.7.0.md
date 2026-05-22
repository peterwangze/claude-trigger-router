# v1.7.0 Release Notes

`v1.7.0` 定位为“远程服务与模型池安全体验版”。这个版本承接已有 server deploy、managed key、quota、remote forward、registration model pool 和 pool health 基础，目标是让服务维护者能更安全地暴露服务，让远程使用者稳定接入，并让模型池调度更可解释。

## 本次发布主线

- 服务端部署默认安全策略：`ctr deploy init --target server` 生成 `Runtime.security`，明确公网监听必须鉴权、bootstrap key 仅限 admin、远程客户端使用 managed `client + read-only` key，并建议放在 HTTPS 反向代理或内网之后；`/api/service-info` 返回同一 policy 和 deployment checklist。
- 密钥轮换和托管维护：新增 `POST /api/auth/keys/:id/rotate`，admin 可生成替代 managed key、只返回一次新 secret，并立即吊销旧 key；README、`/ui` auth guide 与 server maintainer guide 已补定期轮换、交接和疑似泄漏处置路径。
- 模型池主动健康探测：新增 operator/admin 可触发的 `POST /api/models/pool-health/probe`，对 enabled endpoint 做轻量 `HEAD` 探测，把可达延迟或失败写入现有 cooldown / circuit breaker / latency health。
- 成本和速率元数据：`Registration.models[].metadata` 支持 `cost_per_1m_input_tokens`、`cost_per_1m_output_tokens`、`cost_currency`、`rate_limit_rpm`、`rate_limit_tpm`，并在 compiled model pool、`/api/models/pool-health` 与 `/ui` 中展示。
- 更丰富的模型池策略：`Registration.strategy` 支持 `priority`、`least-latency`、`round-robin`、`health-aware`、`cost-aware`，active endpoint 与 fallback candidate 使用同一排序口径。

## 发布边界

本版本聚焦自托管服务安全和模型池运营，不宣称完整 cloud/托管控制面、节点集群编排或 agent 平台化。以下事项进入后续版本，但不作为 `v1.7.0` 发布承诺：

- 服务发现、节点/集群编排和多节点自动注册。
- 更完整的外部报表、告警通道和可视化趋势系统。
- handoff summary、tool capability guardrail、输入/输出 guardrail 和 trace span 化。
- 完整托管平台的用户、组织、计费和审计控制面。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.7.0`
- `ctr version` 输出 `Version: 1.7.0`
- `v1.7.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.7.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
