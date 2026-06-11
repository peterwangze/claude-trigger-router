# Release notes v1.19.1

`v1.19.1` 定位为“配置向导与一键模型配置体验修复版”。这个 patch release 不改变路由协议、远程接入语义或治理运行时能力，重点把 `/ui` 默认入口从维护者视角的混合工作台，收敛成普通用户更容易完成的模型配置向导。

## 本次闭环

1. UI configuration wizard
   - `/ui` 第一屏改为“配置向导”，优先展示模型厂商、Model ID、API Key、上游模型和 API 地址。
   - 新增“一键模型配置”，可从常用厂商模板生成最小推荐配置。
   - 默认用户路径只落 `Models` 与 `Router.default`，高级路由、SmartRouter、治理和诊断收进高级区。

2. Provider templates
   - 内置 OpenRouter、DeepSeek、OpenAI-compatible、Anthropic 和 SiliconFlow 常用模板。
   - 厂商卡片会填入默认 endpoint、interface、模型名和模型建议，减少用户理解 `interface` 与厂商名的成本。
   - UI-only 的 `provider_template` 不写入最终配置，保持推荐字段仍是 `id/api/key/interface/model`。

3. Browser smoke stability
   - `test:ui:browser` 更新为检查“配置向导”和 quick config 控件。
   - Windows headless Edge relaunch 后会按临时 browser profile 清理真实进程，避免 smoke 在验证通过后卡住。
   - 桌面和移动视口继续检查无横向溢出。

## 发布边界

- 不改变模型编译、基础路由或 SmartRouter 的运行时选择语义。
- 不新增远程配置写回、节点/集群编排或托管控制面。
- 不移除维护者工作台；只是把治理、trace、pool health 和高级路由从默认用户路径后移。
- 后续发布与进展治理可持续化仍进入 v1.20.0 主线。

## 发布前验证

本版本发布前至少执行：

```bash
npm run test:ui
npm run test:ui:browser
npm run test:e2e:acceptance -- -t "release:stage creates a usable isolated wrapper that points to the staged HOME"
npm run build
npm run release:verify
```

其中 `release:verify` 仍是最终发布门禁。
