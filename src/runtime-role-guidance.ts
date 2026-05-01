export const LOCAL_USER_ROLE_GUIDE =
  '本地使用者：先跑通 Models + Router.default，再用 ctr start / ctr status / ctr code 进入 Claude Code。';

export const SERVER_MAINTAINER_ROLE_GUIDE =
  '服务维护者：用 ctr deploy init --target server 生成 server 配置，保留 bootstrap/admin key 管理服务，并给远程使用者发放 managed client + read-only key。';

export const REMOTE_CLIENT_ROLE_GUIDE =
  '远程使用者：拿到服务地址和 managed client + read-only key；Runtime.remote_service 负责 ready/status 检查，并让本地 ctr 代理把模型请求转发到远程服务。';

export function runtimeRoleGuideSummary(): string[] {
  return [
    LOCAL_USER_ROLE_GUIDE,
    SERVER_MAINTAINER_ROLE_GUIDE,
    REMOTE_CLIENT_ROLE_GUIDE,
  ];
}
