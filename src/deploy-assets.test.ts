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
    expect(releasingGuide).toContain('docs/release-notes-v1.8.0.md');
    expect(releasingGuide).toContain('v1.8.0 agent/tool');
  });

  it('keeps v1.8.0 agent/tool architecture release readiness documented', () => {
    const releaseNotes = readFileSync(join(process.cwd(), 'docs', 'release-notes-v1.8.0.md'), 'utf-8');

    expect(packageJson.files).toContain('docs/*.md');
    expect(releaseNotes).toContain('低侵入 agent/tool 增强与架构减压版');
    expect(releaseNotes).toContain('src/runtime/pipeline.ts');
    expect(releaseNotes).toContain('src/server/management-routes.ts');
    expect(releaseNotes).toContain('src/ui/workbench-fragments.ts');
    expect(releaseNotes).toContain('Tool capability guardrail');
    expect(releaseNotes).toContain('governanceTrace.spans');
    expect(releaseNotes).toContain('npm run release:verify');

    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
    expect(readme).toContain('## v1.8.0 发布定位');
    expect(readme).toContain('docs/release-notes-v1.8.0.md');
    expect(readme).toContain('runtime pipeline');
    expect(readme).toContain('trace spans');
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
