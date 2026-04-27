import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('deployment assets', () => {
  it('ships server deployment templates through the config package payload', () => {
    expect(packageJson.files).toContain('config');

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
  });
});
