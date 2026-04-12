import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import packageJson from '../../package.json';
import {
  assertOnlyExpectedPathsChanged,
  createFakeClaude,
  createTestEnvironment,
  diffSnapshots,
  installPackedCli,
  packCli,
  readText,
  removePath,
  runCtr,
  snapshotTree,
  writeFileUnder,
  type ITestEnvironment,
} from './harness';

const repoRoot = process.cwd();

let sharedEnv: ITestEnvironment;
let cliPath: string;
let tarballPath: string;
let prefixDir: string;

async function canBindPort(port: number): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve free port'));
          return;
        }
        resolve(address.port);
      });
    });
    return port;
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

describe('packaged CLI E2E', () => {
  beforeAll(async () => {
    sharedEnv = await createTestEnvironment('ctr-packaged-e2e-');
    prefixDir = join(sharedEnv.rootDir, 'prefix');
    tarballPath = await packCli(repoRoot);
    cliPath = await installPackedCli(repoRoot, prefixDir, tarballPath);
  }, 300000);

  afterAll(async () => {
    await removePath(sharedEnv.rootDir);
    await removePath(tarballPath);
  });

  it('help exits cleanly and does not modify the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-help-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['help'], env);
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('setup');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('status');
      expect(result.stderr).toBe('');

      const diff = diffSnapshots(before, after);
      expect(diff).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('init --force writes only the expected config file under the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-init-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['init', '--force'], env);
      const after = await snapshotTree(env.homeDir);
      const configPath = join(env.homeDir, '.claude-trigger-router', 'config.yaml');

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/配置文件已(创建|覆盖)/);
      expect(existsSync(configPath)).toBe(true);

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
      ]);
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('version exits cleanly and does not modify the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-version-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['version'], env, {
        timeoutMs: 30000,
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Package: @peterwangze/claude-trigger-router');
      expect(result.stdout).toContain(`Version: ${packageJson.version}`);
      expect(result.stdout).toContain('Latest:');

      const diff = diffSnapshots(before, after);
      expect(diff).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('upgrade prints guidance and does not modify the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-upgrade-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['upgrade'], env);
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('npm install -g @peterwangze/claude-trigger-router@latest');
      expect(result.stdout).toContain('请在当前 ctr 进程外执行升级命令');
      expect(result.stdout).toContain('NPM: https://www.npmjs.com/package/@peterwangze/claude-trigger-router');
      expect(result.stderr).toBe('');

      const diff = diffSnapshots(before, after);
      expect(diff).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('unknown command exits with error without mutating the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-unknown-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['no-such-command'], env);
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('Unknown command: no-such-command');
      expect(result.stdout).toContain('用法：ctr <命令> [选项]');
      expect(result.stderr).toBe('');

      const diff = diffSnapshots(before, after);
      expect(diff).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('start/status/stop work on a clean alternate port using an isolated config', async () => {
    const env = await createTestEnvironment('ctr-service-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: service_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-service"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "service_model"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('code fails cleanly when the router service is not running and only creates Claude compatibility config', async () => {
    const env = await createTestEnvironment('ctr-code-nosvc-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: offline_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-offline"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "offline_model"',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['code'], env, { timeoutMs: 30000 });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(`Checking if service is available on port ${port}`);
      expect(result.stdout).toContain(`Trigger Router service is not running on port ${port}`);
      expect(result.stdout).toContain('Start service first:  ctr start --daemon');
      expect(result.stderr).toBe('');

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude.json',
      ]);
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('code reuses the running service and invokes Claude with the routed base URL', async () => {
    const env = await createTestEnvironment('ctr-code-service-e2e-');
    const port = await getFreePort();
    const markerPath = join(env.homeDir, 'fake-claude.marker');

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: service_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-service"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "service_model"',
        ].join('\n')
      );
      await createFakeClaude(env.binDir, markerPath);

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const result = await runCtr(cliPath, ['code'], env, { timeoutMs: 30000 });
      const marker = await readText(markerPath);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`Checking if service is available on port ${port}`);
      expect(result.stdout).toContain(`Starting Claude Code with Trigger Router (port: ${port})`);
      expect(marker).toContain('invoked');
      expect(marker).toContain(`ANTHROPIC_BASE_URL=http://127.0.0.1:${port}`);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('ui prints the management URL without mutating config when browser launch is skipped', async () => {
    const env = await createTestEnvironment('ctr-ui-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: ui_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-ui"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "ui_model"',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['ui'], env, {
        extraEnv: {
          CTR_UI_SKIP_OPEN: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`Opening UI at http://127.0.0.1:${port}/ui`);
      expect(result.stdout).toContain('Browser launch skipped by CTR_UI_SKIP_OPEN=1');
      expect(result.stderr).toBe('');

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
      ]);
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('setup can reuse a valid current config without unexpected file writes', async () => {
    const env = await createTestEnvironment('ctr-setup-reuse-e2e-');
    const configPath = join(env.homeDir, '.claude-trigger-router', 'config.yaml');
    const port = await getFreePort();

    try {
      if (!(await canBindPort(port))) {
        console.warn(`Skipping packaged setup reuse E2E because port ${port} is already occupied in this environment.`);
        return;
      }

      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: reusable_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-existing"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "reusable_model"',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: '1\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('检测到当前 claude-trigger-router 配置已可用。');
      expect(result.stdout).toContain('直接使用当前配置（推荐）');

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude-trigger-router/config.backup.*',
        '.claude-trigger-router/logs',
        '.claude-trigger-router/claude-trigger-router.pid',
        '.claude.json',
      ]);
      expect(await readText(configPath)).toContain(`PORT: ${port}`);

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can abandon current config and migrate legacy claude-code-router config into the new template', async () => {
    const env = await createTestEnvironment('ctr-setup-migrate-e2e-');
    const port = await getFreePort();

    try {
      if (!(await canBindPort(port))) {
        console.warn(`Skipping packaged setup migration E2E because port ${port} is already occupied in this environment.`);
        return;
      }

      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: existing_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-existing"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "existing_model"',
        ].join('\n')
      );
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "gpt90",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-migrated",
      "models": ["gpt-5.4"]
    }
  ],
  "Router": {
    "default": "gpt90,gpt-5.4"
  }
}`
      );

      const result = await runCtr(cliPath, ['setup'], env, {
        input: '3\n1\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });

      const migratedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      const legacyConfig = await readText(join(env.homeDir, '.claude-code-router', 'config.json'));

      if (result.code !== 0) {
        console.error('setup migrate stdout:\n' + result.stdout);
        console.error('setup migrate stderr:\n' + result.stderr);
        console.error('retained debug root: ' + env.rootDir);
      }

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？');
      expect(result.stdout).toContain('迁移旧配置（推荐）');
      expect(result.stdout).toContain('迁移后的默认模型：gpt90_gpt_5_4');
      expect(migratedConfig).toContain('id: gpt90_gpt_5_4');
      expect(migratedConfig).toContain('default: gpt90_gpt_5_4');
      expect(migratedConfig).toContain(`PORT: ${port}`);
      expect(legacyConfig).toContain('"default": "gpt90,gpt-5.4"');

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      if (!process.env.CTR_KEEP_E2E_FAILURES) {
        await removePath(env.rootDir);
      }
    }
  }, 300000);

  it('setup can repair an invalid current config without touching unexpected files', async () => {
    const env = await createTestEnvironment('ctr-setup-repair-e2e-');
    const port = await getFreePort();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: broken_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router: {}',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: 'repair\nanthropic/claude-sonnet-4\nsk-repaired\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const repairedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('当前配置校验失败');
      expect(repairedConfig).toContain('default: broken_model');
      expect(repairedConfig).toContain('key: sk-repaired');
      expect(repairedConfig).toContain(`PORT: ${port}`);

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude-trigger-router/config.backup.*',
        '.claude-trigger-router/logs',
        '.claude-trigger-router/logs/ctr-*',
        '.claude-trigger-router/claude-trigger-router.pid',
        '.claude.json',
      ]);

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can rebuild from an unparseable current config into a fresh minimal template', async () => {
    const env = await createTestEnvironment('ctr-setup-rebuild-e2e-');

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        'Models:\n\t- bad: yaml\n'
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          'rebuild',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-fresh',
          'anthropic/claude-sonnet-4',
          'sonnet',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const rebuiltConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('当前配置无法解析');
      expect(rebuiltConfig).toContain('id: sonnet');
      expect(rebuiltConfig).toContain('key: sk-fresh');
      expect(rebuiltConfig).toContain('default: sonnet');

      const diff = diffSnapshots(before, after);
      assertOnlyExpectedPathsChanged(diff, [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude-trigger-router/config.backup.*',
        '.claude-trigger-router/logs',
        '.claude-trigger-router/logs/ctr-*',
        '.claude-trigger-router/claude-trigger-router.pid',
        '.claude.json',
      ]);

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);
});
