import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('deployment assets', () => {
  it('ships server deployment templates through the config package payload', () => {
    expect(packageJson.files).toContain('config');
    expect(packageJson.files).toContain('docs/*.md');

    const compose = readFileSync(join(process.cwd(), 'config', 'deploy', 'docker-compose.server.yaml'), 'utf-8');
    expect(compose).toContain('claude-trigger-router');
    expect(compose).toContain('ctr deploy init --target server');
    expect(compose).toContain('ctr start --port 5678');
    expect(compose).toContain('http://127.0.0.1:5678/health');

    const systemd = readFileSync(join(process.cwd(), 'config', 'deploy', 'systemd', 'claude-trigger-router.service'), 'utf-8');
    expect(systemd).toContain('Description=Claude Trigger Router');
    expect(systemd).toContain('ctr deploy init --target server');
    expect(systemd).toContain('ExecStart=/usr/bin/env ctr start --port 5678');
    expect(systemd).toContain('ReadWritePaths=/var/lib/claude-trigger-router');

    const readme = readFileSync(join(process.cwd(), 'config', 'deploy', 'README.md'), 'utf-8');
    expect(readme).toContain('managed `client + read-only` keys');
    expect(readme).toContain('HTTPS reverse proxy');

    const maintainerGuide = readFileSync(join(process.cwd(), 'docs', 'server-maintainer-guide.md'), 'utf-8');
    expect(maintainerGuide).toContain('ctr deploy init --target server');
    expect(maintainerGuide).toContain('ANTHROPIC_BASE_URL=http://<server-host>:<port>');

    const remoteClientGuide = readFileSync(join(process.cwd(), 'docs', 'remote-client-guide.md'), 'utf-8');
    expect(remoteClientGuide).toContain('client + read-only');
    expect(remoteClientGuide).toContain('Runtime:');

    const roleGuide = readFileSync(join(process.cwd(), 'docs', 'configuration-roles.md'), 'utf-8');
    expect(roleGuide).toContain('本地使用者');
    expect(roleGuide).toContain('服务维护者');
    expect(roleGuide).toContain('远程服务使用者');

    const configurationGuide = readFileSync(join(process.cwd(), 'docs', 'configuration-guide.md'), 'utf-8');
    expect(configurationGuide).toContain('配置指南');
    expect(configurationGuide).toContain('ctr doctor --route-preview --route-text');
    expect(configurationGuide).toContain('显式 `provider,model` 上游引用会直接使用');

    const smartRouterTemplate = readFileSync(join(process.cwd(), 'config', 'trigger.smart-router.yaml'), 'utf-8');
    expect(smartRouterTemplate).toContain('SmartRouter:');
    expect(smartRouterTemplate).toContain('coding');
    expect(smartRouterTemplate).toContain('review');
    expect(smartRouterTemplate).toContain('architecture');
    expect(smartRouterTemplate).toContain('long_context');
    expect(smartRouterTemplate).toContain('fast_reply');

    const migrationGuide = readFileSync(join(process.cwd(), 'docs', 'models-migration-guide.md'), 'utf-8');
    expect(migrationGuide).toContain('Models');

    const releasingGuide = readFileSync(join(process.cwd(), 'docs', 'releasing.md'), 'utf-8');
    expect(releasingGuide).toContain('Release');
    expect(releasingGuide).toContain('docs/release-notes-v1.12.0.md');
    expect(releasingGuide).toContain('v1.12.0');
    expect(releasingGuide).toContain('流式传输韧性');
  });

  it('keeps v1.12.0 stream resilience release readiness documented', () => {
    const releaseNotes = readFileSync(join(process.cwd(), 'docs', 'release-notes-v1.12.0.md'), 'utf-8');

    expect(packageJson.files).toContain('docs/*.md');
    expect(releaseNotes).toContain('流式传输韧性与远程中转稳定性修复版');
    expect(releaseNotes).toContain('v1.11.0');
    expect(releaseNotes).toContain('The socket connection was closed unexpectedly');
    expect(releaseNotes).toContain('upstream_stream_error');
    expect(releaseNotes).toContain('客户端断开');
    expect(releaseNotes).toContain('TextDecoder');
    expect(releaseNotes).toContain('npm run release:verify');

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
    expect(readme).toContain('## v1.12.0 发布定位');
    expect(readme).toContain('docs/release-notes-v1.12.0.md');
    expect(readme).toContain('流式传输韧性');
    expect(readme).toContain('SSE error event');
    expect(readme).toContain('ctr doctor --route-preview --route-text');
    expect(readme).toContain('基础路由的实际判断顺序');
  });

  it('keeps README new-user quick start before release positioning', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
    const quickStartIndex = readme.indexOf('## 5 分钟跑起来');
    const releaseIndex = readme.indexOf('## v1.12.0 发布定位');
    const docsIndex = readme.indexOf('## 文档入口');

    expect(quickStartIndex).toBeGreaterThan(0);
    expect(releaseIndex).toBeGreaterThan(quickStartIndex);
    expect(docsIndex).toBeGreaterThan(quickStartIndex);
    expect(readme.slice(quickStartIndex, docsIndex)).toContain('ctr setup');
    expect(readme.slice(quickStartIndex, docsIndex)).toContain('ctr status');
    expect(readme.slice(quickStartIndex, docsIndex)).toContain('ctr doctor');
    expect(readme.slice(quickStartIndex, docsIndex)).toContain('ctr code');
    expect(readme.slice(quickStartIndex, docsIndex)).toContain('ctr ui');
  });

  it('keeps README as a concise user entry instead of a full manual', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
    const lines = readme.trim().split(/\r?\n/);

    expect(lines.length).toBeLessThan(260);
    expect(readme).toContain('## 你会得到什么');
    expect(readme).toContain('## 常用命令');
    expect(readme).toContain('## 文档入口');
    expect(readme).toContain('docs/configuration-guide.md');
    expect(readme).toContain('docs/server-maintainer-guide.md');
    expect(readme).not.toContain('## 基础路由五个槽位');
    expect(readme).not.toContain('## capability hint');
  });

  it('keeps remote Claude Code auth guidance on ANTHROPIC_AUTH_TOKEN', () => {
    const remoteClientGuide = readFileSync(join(process.cwd(), 'docs', 'remote-client-guide.md'), 'utf-8');
    const roleGuide = readFileSync(join(process.cwd(), 'docs', 'configuration-roles.md'), 'utf-8');
    const configurationGuide = readFileSync(join(process.cwd(), 'docs', 'configuration-guide.md'), 'utf-8');
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');

    for (const doc of [remoteClientGuide, roleGuide, configurationGuide, readme]) {
      expect(doc).toContain('ANTHROPIC_AUTH_TOKEN');
    }
    expect(remoteClientGuide).toContain('Authorization: Bearer <token>');
    expect(remoteClientGuide).toContain('x-api-key: <token>');
    expect(remoteClientGuide).toContain('clears `ANTHROPIC_API_KEY`');
    expect(roleGuide).not.toContain('ANTHROPIC_API_KEY');
    expect(configurationGuide).not.toContain('ANTHROPIC_API_KEY');
  });

  it('documents protected UI admin access without URL secrets', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
    const maintainerGuide = readFileSync(join(process.cwd(), 'docs', 'server-maintainer-guide.md'), 'utf-8');
    const configurationGuide = readFileSync(join(process.cwd(), 'docs', 'configuration-guide.md'), 'utf-8');

    for (const doc of [readme, maintainerGuide, configurationGuide]) {
      expect(doc).toContain('/ui');
      expect(doc).toContain('Authorization');
      expect(doc).toContain('admin key');
    }
    expect(readme).toContain('不要把 admin key 放进 URL');
    expect(configurationGuide).toContain('不要把 admin key 放进 URL');
    expect(maintainerGuide).toContain('Do not put an admin key in the URL');
    expect(maintainerGuide).toContain('curl -H "Authorization: Bearer $CTR_ADMIN_KEY"');
  });

  it('keeps release-stage server profile output out of the returned profile object', () => {
    const releaseScript = readFileSync(join(process.cwd(), 'scripts', 'release-package.ps1'), 'utf-8');
    expect(releaseScript).toContain('& $serverWrapperCmd deploy init --target server --force | Out-Host');
    expect(releaseScript).toContain('& $serverWrapperSh deploy init --target server --force | Out-Host');
    expect(releaseScript).toContain('Server profile HOME: $($releaseServerProfile.Home)');
  });

  it('allows a published package version when the current commit has the matching release tag', () => {
    const releaseCheckWorkflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'release-check.yml'), 'utf-8');
    const releasingGuide = readFileSync(join(process.cwd(), 'docs', 'releasing.md'), 'utf-8');

    expect(releaseCheckWorkflow).toContain('MATCHING_RELEASE_TAG');
    expect(releaseCheckWorkflow).toContain('refs/tags/v${CURRENT_VERSION}');
    expect(releaseCheckWorkflow).toContain('TAG_COMMIT="$(git rev-list -n 1 "v${CURRENT_VERSION}")"');
    expect(releaseCheckWorkflow).toContain('this commit is tagged v${CURRENT_VERSION}');
    expect(releasingGuide).toContain('master` push 和 `vX.Y.Z` tag push 几乎同时发生');
  });
});
