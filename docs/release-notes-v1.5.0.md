# v1.5.0 Release Notes

`v1.5.0` 定位为“入口基础功能稳定与易用性巩固版”。这个版本不继续扩展 benchmark、服务化或模型池策略，而是先把新用户和日常用户每天会碰到的入口主路径做稳。

## 本次发布主线

- 入口门禁稳定化：新增 `npm run test:e2e:cli:entry` 作为较短 packaged CLI smoke，覆盖 init、doctor、start/status/stop、setup fresh、setup remote client、setup server deployment、code 和 ui。
- packaged E2E 可诊断性：E2E harness 在单命令 timeout 时会清理子进程树，并输出 cwd、stdout、stderr 摘要，避免发布前只看到超时和残留进程。
- 配置保存安全线：setup、doctor、UI save 和 server save 继续复用 validation issue contract；配置写入前必须先备份，备份失败不继续写入。
- 远程/服务端 setup 角色路径：packaged E2E 覆盖 remote client setup 保存 `Runtime.remote_service` 且不进入 provider/model 填写；server deployment setup 生成 `Runtime.mode: server` / bootstrap `APIKEY` 且不自动启动服务。
- UI 基础交互看护：新增 `npm run test:ui` 与 jsdom DOM smoke，覆盖 `/ui` 载入当前配置、compiled models 预览、保存失败 validation issue 展示和 Health action trace 过滤。
- UI 首轮工程化拆分：`workbench-document.ts` 承接 HTML 文档骨架和内联脚本抽取，UI smoke 增加脚本语法检查，防止字符串拼接错误绕过 HTML 字符串断言。

## 发布边界

本版本聚焦入口稳定，不把 CTR 宣称为完整 benchmark 运营平台、完整 server/cloud 托管平台或 agent 平台。以下事项进入后续版本，但不作为 `v1.5.0` 发布承诺：

- benchmark 历史看板和人工校准 UI 表单。
- `ctr eval` 与真实 trace 的长期收益运营闭环。
- 服务端默认安全运营、密钥轮换手册、主动 pool health、成本/速率元数据和更多调度策略。
- 更深入的 UI CSS/JS/渲染片段拆分、真实浏览器截图和键鼠流程 smoke。

对用户的建议口径是：`v1.5.0` 适合把 CTR 作为日常 Claude Code 路由代理入口使用；遇到问题时优先依赖 `ctr doctor`、`ctr status`、`ctr ui` 和发布前 packaged smoke 所覆盖的主路径。

## 发布前必跑

```bash
npm run release:verify
npm run release:stage
```

正式发布前确认：

- `package.json` 与 `package-lock.json` 版本均为 `1.5.0`
- `ctr version` 输出 `Version: 1.5.0`
- `v1.5.0` tag 与包版本一致
- npm registry 中不存在 `@peterwangze/claude-trigger-router@1.5.0`
- npm trusted publisher 指向 `peterwangze/claude-trigger-router` 的 `publish.yml`
- GitHub publish workflow 使用 Node 24 / npm 11.5.1+
