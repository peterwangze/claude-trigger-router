import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('deployment assets', () => {
  it('ships server deployment templates through the config package payload', () => {
    expect(packageJson.files).toContain('config');
    expect(packageJson.files).toContain('docs/server-maintainer-guide.md');
    expect(packageJson.files).toContain('docs/remote-client-guide.md');

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
  });

  it('keeps release-stage server profile output out of the returned profile object', () => {
    const releaseScript = readFileSync(join(process.cwd(), 'scripts', 'release-package.ps1'), 'utf-8');
    expect(releaseScript).toContain('& $serverWrapperCmd deploy init --target server --force | Out-Host');
    expect(releaseScript).toContain('& $serverWrapperSh deploy init --target server --force | Out-Host');
    expect(releaseScript).toContain('Server profile HOME: $($releaseServerProfile.Home)');
  });
});
