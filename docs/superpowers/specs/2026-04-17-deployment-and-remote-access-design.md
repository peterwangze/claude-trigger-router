# 部署形态与远程接入设计

> **统一进展承接说明（2026-04-16）**
>
> 本文档承接 `docs/superpowers/plans/unified-progress-baseline.md` 中“部署形态与远程接入收敛”这一行的设计输入。
>
> 当前职责：承接本地 / server / cloud 部署、服务端 / 客户端职责、远程注册和集中式 Router 服务边界；统一进展入口只维护状态与闭环结论。

## 1. 背景

当前 Claude Trigger Router 的默认心智仍偏向本地单机场景：

- 用户在本地运行 `ctr server`
- 本地加载用户配置与模型映射
- 本地 CLI / Claude Code 指向本地服务

这条路径已足够支撑单用户和单终端使用，但当用户希望：

- 在服务器或云端部署统一服务
- 多端共用同一套模型路由服务
- 远程注册模型、查询状态、复用统一治理与观测能力

现有设计就会暴露边界：部署形态、服务职责和客户端入口还没有被正式收敛。

## 2. 设计定位

该事项当前不升级为新的独立总体系，而是作为以下主线的交叉收敛事项推进：

- 配置产品化最终收口
- 统一 Router 运行时收敛
- CLI / setup UX 重设计

原因：

- 远程接入本质上仍需要复用统一配置 schema、compiled model registry 和运行时 dispatch
- 服务端 / 客户端心智会直接影响 setup、doctor、CLI 帮助和 `/ui` 入口
- 如果脱离现有主线单独立项，容易把“部署方式”误做成另一套并行产品

## 3. 设计目标

### 3.1 核心目标

- 让 Router 支持本地、server、cloud 三类部署形态
- 把“一个服务多端使用”收敛为明确的服务端 / 客户端模型
- 支持远程注册模型或服务实例，避免多端重复部署
- 支持远程健康状态、compiled models、能力和治理状态查询
- 保持单机场景仍然是最低门槛路径

### 3.2 非目标

本轮不追求：

- 一开始就做复杂集群编排
- 在首轮引入完整多租户权限系统
- 脱离当前配置与运行时实现一套全新的控制面
- 先做重量级云控制台再回头补基础远程能力

## 4. 部署形态定义

### 4.1 local

- 服务与客户端运行在同一台机器
- 默认读取本地用户配置
- 适合个人开发、试用和单终端场景

### 4.2 server

- Router 作为常驻服务运行在局域网或自管服务器
- 多个客户端连接同一服务
- 由服务端统一承载 compiled models、governance trace 和配置加载

### 4.3 cloud

- Router 运行在云主机或托管环境
- 通过公开或受控网络向远端客户端提供服务
- 需要更明确的认证、安全与实例管理边界

## 5. 核心概念

### 5.1 Router Service

统一对外提供：

- `/v1/messages` 路由与代理能力
- 配置与 compiled models 查询能力
- governance / observability 查询能力
- 远程注册与状态管理能力

### 5.2 Client

负责：

- 连接指定 Router Service
- 注册模型或服务引用
- 查询健康状态与当前可用模型
- 在本地 CLI / setup / UI 中切换目标服务

### 5.3 Registration Target

远程注册首轮建议不要直接注册“单个 provider 密钥碎片”，而是明确区分：

- `model registration`：注册一个可被服务消费的模型定义
- `service registration`：注册一个可被上层聚合消费的远程 Router Service
- `node registration`：预留给更后续的多实例能力，不作为首轮主概念

首轮建议优先支持：

1. 模型注册
2. 远程服务引用

## 6. 服务端职责

服务端至少负责：

- 加载和保存统一配置
- 编译并提供 model registry / modelMap
- 承载 TriggerRouter、Governance、protocol dispatch 主链
- 提供 health / compiled models / capabilities / trace / alerts 查询
- 管理远程注册记录与当前服务状态

服务端暂不负责：

- 完整集群调度
- 复杂租户计费
- 多活一致性控制

## 7. 客户端职责

客户端至少负责：

- 配置要连接的目标 Router Service
- 发起模型注册或远程服务接入
- 查询服务 health、compiled models、capabilities、service status
- 在本地入口中区分“我是在管理本地服务”还是“我在连接远程服务”

客户端不应负责：

- 重新实现一套服务端编译与治理逻辑
- 在本地复制完整治理面板数据处理链路

## 8. 状态查询边界

首轮建议对外暴露的查询能力：

- `health`
- `service info`
- `compiled models`
- `capabilities`
- `governance metrics summary`
- `alerts / anomaly summary`
- `registration status`

这些查询要解决的不是“看起来功能很多”，而是让客户端明确知道：

- 当前连的是谁
- 当前服务是否可用
- 当前有哪些模型和能力
- 当前是否存在治理风险信号

## 9. 与现有 CLI / setup / doctor / server 的承接

### 9.1 `ctr setup`

- 需要新增“本地使用”与“连接远程服务”两条入口心智
- 当用户选择远程接入时，应优先配置目标服务地址，而不是本地 provider 细节

### 9.2 `ctr doctor`

- 需要区分诊断对象：本地配置、当前本地服务、远程服务连通性
- 不应把远程服务不可达与本地配置损坏混为一类

### 9.3 `ctr server`

- 需要明确支持 local/server/cloud 三类运行语义
- 后续可能需要更清晰的 mode 标识与服务元数据

### 9.4 `/ui`

- 使用者界面应能看见“当前在管理本地还是远程服务”
- 维护者界面应能查看服务状态、注册记录和观测摘要

## 10. 配置方向

建议在统一配置中显式区分：

```yaml
Runtime:
  mode: local | server | cloud
  remote_service:
    enabled: false
    base_url: "https://router.example.com"
    auth_token: "..."

Registration:
  enabled: false
  models: []
  upstream_services: []
```

说明：

- `Runtime.mode` 表达当前实例角色
- `remote_service` 表达客户端连接目标
- `Registration` 表达本地对外或对上注册的对象

## 11. 风险

| 风险 | 影响 | 缓解策略 |
|---|---|---|
| 本地与远程心智混淆 | 用户不知道当前在配置谁 | setup/UI 显式展示当前目标服务 |
| 认证与安全边界不足 | 云端暴露风险 | 首轮最少要求 token/密钥认证与显式开关 |
| 配置漂移 | 本地和远程状态不一致 | 统一 compiled models 与 service info 查询 |
| 多实例协调复杂 | 后续实现失控 | 首轮只定义 service 级边界，不先做复杂集群 |

## 12. 最小验收边界

首轮最小交付建议定义为：

### 服务端

- 可以在 local/server/cloud 三种模式中被声明
- 可以对外提供 health、compiled models、capabilities、governance summary
- 可以承接统一配置并对外暴露服务元信息

### 客户端

- 可以配置目标远程服务
- 可以查询服务状态
- 可以发起最小模型注册或远程服务接入
- 可以在 CLI / UI 中区分本地与远程路径

## 13. 推进建议

建议按以下顺序推进：

1. 先完成部署形态与角色命名收敛
2. 再定义 service info / registration / status 查询边界
3. 然后把 setup / UI 的入口心智切换到“本地 vs 远程”
4. 最后再进入更复杂的注册同步与多实例协调

## 14. 结论

部署形态与远程接入的核心，不是简单加一个“远程地址”配置，而是把 Router 从“单机工具”稳态推进到“可复用的统一路由服务”，同时保持单机路径仍然足够轻量。
