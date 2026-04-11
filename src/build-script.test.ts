import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import packageJson from '../package.json';

describe('build script', () => {
  it('builds an executable CLI bundle with a single shebang header', () => {
    const result = spawnSync(process.execPath, ['scripts/build.js'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);

    const lines = readFileSync('dist/cli.js', 'utf-8').split(/\r?\n/).slice(0, 3);
    expect(lines[0]).toBe('#!/usr/bin/env node');
    expect(lines[1]).not.toBe('#!/usr/bin/env node');

    const helpResult = spawnSync(process.execPath, ['dist/cli.js', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    expect(helpResult.status).toBe(0);
    expect(helpResult.stdout).toContain('Claude Trigger Router - 智能触发路由器');
    expect(helpResult.stdout).toContain('用法：ctr <命令> [选项]');
    expect(helpResult.stdout).toContain('version     查看当前安装版本与包信息');
    expect(helpResult.stdout).toContain('upgrade     查看升级到最新 npm 版本的指引');

    const versionResult = spawnSync(process.execPath, ['dist/cli.js', 'version'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    expect(versionResult.status).toBe(0);
    expect(versionResult.stdout).toContain('@peterwangze/claude-trigger-router');
    expect(versionResult.stdout).toContain(packageJson.version);
    expect(versionResult.stdout).toContain('Latest:');
  });
});
