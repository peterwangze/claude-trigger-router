import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  assertOnlyExpectedPathsChanged,
  createFakeClaude,
  createTestEnvironment,
  diffSnapshots,
  expectNoTerminalCorruption,
  installPackedCli,
  packCli,
  readText,
  removePath,
  runCommandInShell,
  runCtr,
  runCtrThroughUserShell,
  snapshotTree,
  writeFileUnder,
  type ITestEnvironment,
} from './harness';

const repoRoot = process.cwd();

let sharedEnv: ITestEnvironment;
let cliPath: string;
let tarballPath: string;
let prefixDir: string;

function getAcceptanceMutationWhitelist(): string[] {
  return [
    '.claude-trigger-router',
    '.claude-trigger-router/config.yaml',
    '.claude-trigger-router/config.backup.*',
    '.claude-trigger-router/logs',
    '.claude-trigger-router/logs/ctr-*',
    '.claude-trigger-router/claude-trigger-router.pid',
    '.claude-code-router',
    '.claude-code-router/config.json',
    '.claude.json',
    'claude-invoked.txt',
  ];
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  try {
    return await new Promise<number>((resolve, reject) => {
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
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
}

async function fetchTextWithRetry(url: string, attempts = 20): Promise<{ status: number; text: string; contentType: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.status === 200) {
        return {
          status: response.status,
          text,
          contentType: response.headers.get('content-type') ?? '',
        };
      }
      lastError = new Error(`Unexpected status ${response.status} from ${url}: ${text.slice(0, 120)}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

describe('isolated packaged CLI acceptance', () => {
  beforeAll(async () => {
    sharedEnv = await createTestEnvironment('ctr-packaged-acceptance-');
    prefixDir = join(sharedEnv.rootDir, 'prefix');
    tarballPath = await packCli(repoRoot);
    cliPath = await installPackedCli(repoRoot, prefixDir, tarballPath);
  }, 300000);

  afterAll(async () => {
    await removePath(sharedEnv.rootDir);
    await removePath(tarballPath);
  });

  it('setup reuse -> status -> code works through the packaged user shell wrapper without terminal corruption or auto-enter side effects', async () => {
    const env = await createTestEnvironment('ctr-acceptance-setup-shell-');
    const markerPath = join(env.homeDir, 'claude-invoked.txt');
    const port = await getFreePort();

    try {
      await createFakeClaude(env.binDir, markerPath);
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          `  - id: shell_acceptance_model_${port}`,
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-shell-acceptance"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          '    thinking: true',
          'Router:',
          `  default: "shell_acceptance_model_${port}"`,
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const setupResult = await runCtrThroughUserShell(cliPath, ['setup'], env, {
        input: '直接使用当前配置（推荐）\n',
        timeoutMs: 240000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
        },
      });
      const afterSetup = await snapshotTree(env.homeDir);
      const configText = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));

      expect(setupResult.code).toBe(0);
      expectNoTerminalCorruption(`${setupResult.stdout}\n${setupResult.stderr}`);
      expect(setupResult.stdout).toContain('为避免 setup 结束后接管当前终端，请手动运行：ctr code');
      expect(setupResult.stdout).not.toContain('请输入选项编号。');
      expect(setupResult.stdout).toContain('检测到当前 claude-trigger-router 配置已可用。');
      expect(configText).toContain(`PORT: ${port}`);
      expect(configText).toContain(`id: shell_acceptance_model_${port}`);
      expect(configText).toContain('thinking: true');
      expect(existsSync(markerPath)).toBe(false);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, afterSetup), getAcceptanceMutationWhitelist());

      const statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      expect(statusResult.code).toBe(0);
      expectNoTerminalCorruption(`${statusResult.stdout}\n${statusResult.stderr}`);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const codeResult = await runCtrThroughUserShell(cliPath, ['code'], env, {
        timeoutMs: 30000,
      });
      expect(codeResult.code).toBe(0);
      expectNoTerminalCorruption(`${codeResult.stdout}\n${codeResult.stderr}`);
      expect(codeResult.stdout).toContain(`Checking if service is available on port ${port}`);
      expect(codeResult.stdout).toContain(`Starting Claude Code with Trigger Router (port: ${port})`);
      expect(existsSync(markerPath)).toBe(true);

      const markerText = await readText(markerPath);
      expect(markerText).toContain('invoked');
      expect(markerText).toContain(`ANTHROPIC_BASE_URL=http://127.0.0.1:${port}`);
      expect(markerText).toContain('ANTHROPIC_API_KEY=ctr-local-proxy');

      const afterCode = await snapshotTree(env.homeDir);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, afterCode), getAcceptanceMutationWhitelist());

      const stopResult = await runCtrThroughUserShell(cliPath, ['stop'], env, {
        timeoutMs: 30000,
      });
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

  it('fresh setup can start a usable service and ctr code works in a brand-new packaged user environment', async () => {
    const env = await createTestEnvironment('ctr-acceptance-fresh-shell-');
    const markerPath = join(env.homeDir, 'claude-invoked.txt');

    try {
      await createFakeClaude(env.binDir, markerPath);

      const before = await snapshotTree(env.homeDir);
      const setupResult = await runCtrThroughUserShell(cliPath, ['setup'], env, {
        input: [
          '本地使用（推荐）',
          'sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-fresh-acceptance',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 240000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
        },
      });
      const afterSetup = await snapshotTree(env.homeDir);

      expect(setupResult.code).toBe(0);
      expectNoTerminalCorruption(`${setupResult.stdout}\n${setupResult.stderr}`);
      expect(setupResult.stdout).toContain('当前要本地使用，还是连接远程服务？');
      expect(setupResult.stdout).toContain('我们先创建一份最小可用配置。');
      expect(setupResult.stdout).toContain('为避免 setup 结束后接管当前终端，请手动运行：ctr code');
      const configPathCandidates = [
        join(env.homeDir, '.claude-trigger-router', 'config.yaml'),
        join(env.homeDir, '.claude-trigger-router', 'config.yml'),
        join(env.homeDir, '.claude-trigger-router', 'config.json'),
      ];
      const configPath = configPathCandidates.find((item) => existsSync(item));
      expect(configPath).toBeTruthy();
      const configText = await readText(configPath!);
      expect(configText).toContain('id: sonnet');
      expect(configText).toContain('default: sonnet');
      expect(existsSync(markerPath)).toBe(false);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, afterSetup), getAcceptanceMutationWhitelist());

      const statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');

      const codeResult = await runCtrThroughUserShell(cliPath, ['code'], env, {
        timeoutMs: 30000,
      });
      expect(codeResult.code).toBe(0);
      expectNoTerminalCorruption(`${codeResult.stdout}\n${codeResult.stderr}`);
      expect(codeResult.stdout).toContain('Starting Claude Code with Trigger Router');
      expect(existsSync(markerPath)).toBe(true);

      const markerText = await readText(markerPath);
      expect(markerText).toContain('invoked');
      expect(markerText).toContain('ANTHROPIC_API_KEY=ctr-local-proxy');

      const afterCode = await snapshotTree(env.homeDir);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, afterCode), getAcceptanceMutationWhitelist());
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can abandon current config and still migrate claude-code-router config through the packaged user shell wrapper', async () => {
    const env = await createTestEnvironment('ctr-acceptance-migrate-shell-');
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
          '  - id: current_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-current"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "current_model"',
        ].join('\n')
      );
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "legacy_provider",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-legacy-migrate",
      "models": ["gpt-4.1"]
    }
  ],
  "Router": {
    "default": "legacy_provider,gpt-4.1"
  }
}`
      );

      const before = await snapshotTree(env.homeDir);
      const setupResult = await runCtrThroughUserShell(cliPath, ['setup'], env, {
        input: [
          '放弃当前配置，重新开始',
          '迁移旧配置（推荐）',
        ].join('\n'),
        timeoutMs: 240000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const migratedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));

      expect(setupResult.code).toBe(0);
      expectNoTerminalCorruption(`${setupResult.stdout}\n${setupResult.stderr}`);
      expect(setupResult.stdout).toContain('检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？');
      expect(setupResult.stdout).toContain('迁移后的默认模型：legacy_provider_gpt_4_1');
      expect(migratedConfig).toContain('id: legacy_provider_gpt_4_1');
      expect(migratedConfig).toContain('key: sk-legacy-migrate');
      expect(migratedConfig).toContain('default: legacy_provider_gpt_4_1');
      expect(migratedConfig).toContain(`PORT: ${port}`);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getAcceptanceMutationWhitelist());

      const statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const stopResult = await runCtrThroughUserShell(cliPath, ['stop'], env, {
        timeoutMs: 30000,
      });
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

  it('start --daemon -> status -> stop works through the packaged user shell wrapper on an isolated port', async () => {
    const env = await createTestEnvironment('ctr-acceptance-daemon-shell-');
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
          '  - id: daemon_acceptance_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-daemon-acceptance"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "daemon_acceptance_model"',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const startResult = await runCtrThroughUserShell(cliPath, ['start', '--daemon'], env, {
        timeoutMs: 30000,
      });
      expect(startResult.code).toBe(0);
      expectNoTerminalCorruption(`${startResult.stdout}\n${startResult.stderr}`);
      expect(
        ['Service started in background', 'Service launched in background'].some((item) => startResult.stdout.includes(item))
      ).toBe(true);

      let statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      if (!statusResult.stdout.includes('服务运行中')) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
          timeoutMs: 30000,
        });
      }

      expect(statusResult.code).toBe(0);
      expectNoTerminalCorruption(`${statusResult.stdout}\n${statusResult.stderr}`);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const afterStart = await snapshotTree(env.homeDir);
      assertOnlyExpectedPathsChanged(diffSnapshots(before, afterStart), getAcceptanceMutationWhitelist());

      const stopResult = await runCtrThroughUserShell(cliPath, ['stop'], env, {
        timeoutMs: 30000,
      });
      expect(stopResult.code).toBe(0);
      expectNoTerminalCorruption(`${stopResult.stdout}\n${stopResult.stderr}`);
      expect(stopResult.stdout).toContain('服务已停止');

      const finalStatus = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      expect(finalStatus.code).toBe(0);
      expect(finalStatus.stdout).toContain('服务未运行');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('status reports non-self occupied port safely through the packaged user shell wrapper without mutating config', async () => {
    const env = await createTestEnvironment('ctr-acceptance-occupied-shell-');
    const server = createServer((_, res) => {
      res.statusCode = 200;
      res.end('not ctr');
    });

    try {
      const port = await new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Failed to resolve occupied port'));
            return;
          }
          resolve(address.port);
        });
      });

      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          '  - id: occupied_acceptance_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-occupied-acceptance"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "occupied_acceptance_model"',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      const after = await snapshotTree(env.homeDir);

      expect(statusResult.code).toBe(0);
      expectNoTerminalCorruption(`${statusResult.stdout}\n${statusResult.stderr}`);
      expect(statusResult.stdout).toContain(`端口 ${port} 已被其他服务占用`);
      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await removePath(env.rootDir);
    }
  }, 300000);

  it('status cleans up a stale pid file safely through the packaged user shell wrapper', async () => {
    const env = await createTestEnvironment('ctr-acceptance-stale-pid-shell-');
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
          '  - id: stale_pid_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-stale-pid"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "stale_pid_model"',
        ].join('\n')
      );
      const pidFilePath = join(env.homeDir, '.claude-trigger-router', 'claude-trigger-router.pid');
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/claude-trigger-router.pid',
        JSON.stringify({
          pid: 999999,
          port,
          startTime: '2026-04-13T00:00:00.000Z',
        }, null, 2)
      );

      const before = await snapshotTree(env.homeDir);
      const statusResult = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      const after = await snapshotTree(env.homeDir);

      expect(statusResult.code).toBe(0);
      expectNoTerminalCorruption(`${statusResult.stdout}\n${statusResult.stderr}`);
      expect(statusResult.stdout).toContain('服务未运行');
      expect(existsSync(pidFilePath)).toBe(false);

      const diff = diffSnapshots(before, after);
      expect(diff.added).toEqual([]);
      expect(diff.changed).toEqual([]);
      expect(diff.removed).toEqual(['.claude-trigger-router/claude-trigger-router.pid']);
    } finally {
      await removePath(env.rootDir);
    }
  }, 300000);

  it('restart --daemon keeps the service available through the packaged user shell wrapper', async () => {
    const env = await createTestEnvironment('ctr-acceptance-restart-shell-');
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
          '  - id: restart_acceptance_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    key: "sk-restart-acceptance"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "restart_acceptance_model"',
        ].join('\n')
      );

      const startResult = await runCtrThroughUserShell(cliPath, ['start', '--daemon'], env, {
        timeoutMs: 30000,
      });
      expect(startResult.code).toBe(0);

      const preRestartStatus = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      expect(preRestartStatus.stdout).toContain('服务运行中');
      const pidBefore = preRestartStatus.stdout.match(/PID：(\d+)/)?.[1];
      expect(pidBefore).toBeTruthy();

      const restartResult = await runCtrThroughUserShell(cliPath, ['restart', '--daemon'], env, {
        timeoutMs: 30000,
      });
      expect(restartResult.code).toBe(0);
      expectNoTerminalCorruption(`${restartResult.stdout}\n${restartResult.stderr}`);
      expect(restartResult.stdout).toContain('正在停止服务');

      let postRestartStatus = await runCtrThroughUserShell(cliPath, ['status'], env, {
        timeoutMs: 30000,
      });
      if (!postRestartStatus.stdout.includes('服务运行中')) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        postRestartStatus = await runCtrThroughUserShell(cliPath, ['status'], env, {
          timeoutMs: 30000,
        });
      }

      expect(postRestartStatus.code).toBe(0);
      expect(postRestartStatus.stdout).toContain('服务运行中');
      expect(postRestartStatus.stdout).toContain(String(port));
      const pidAfter = postRestartStatus.stdout.match(/PID：(\d+)/)?.[1];
      expect(pidAfter).toBeTruthy();
      expect(pidAfter).not.toBe(pidBefore);

      const stopResult = await runCtrThroughUserShell(cliPath, ['stop'], env, {
        timeoutMs: 30000,
      });
      expect(stopResult.code).toBe(0);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('release:stage creates a usable isolated wrapper that points to the staged HOME', async () => {
    const env = await createTestEnvironment('ctr-acceptance-release-stage-');
    const port = await getFreePort();
    const stageDir = join(repoRoot, '.release-stage');
    const releaseHomeDir = join(repoRoot, '.release-home');
    const wrapperPath = process.platform === 'win32'
      ? join(stageDir, 'ctr-release-home.cmd')
      : join(stageDir, 'ctr-release-home.sh');
    const toWrapperCommand = (...args: string[]) => {
      if (process.platform === 'win32') {
        const escapedPath = wrapperPath.replace(/'/g, "''");
        const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(' ');
        return escapedArgs.length > 0
          ? `& '${escapedPath}' ${escapedArgs}`
          : `& '${escapedPath}'`;
      }

      const escapedPath = wrapperPath.replace(/'/g, "'\\''");
      const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
      return escapedArgs.length > 0
        ? `'${escapedPath}' ${escapedArgs}`
        : `'${escapedPath}'`;
    };

    try {
      const stageResult = await runCommandInShell(`npm run release:stage -- -Port ${port}`, env, {
        cwd: repoRoot,
        timeoutMs: 600000,
      });
      expect(stageResult.code).toBe(0);
      expectNoTerminalCorruption(`${stageResult.stdout}\n${stageResult.stderr}`);
      expect(stageResult.stdout).toContain('Staged package is ready for manual verification.');

      expect(existsSync(wrapperPath)).toBe(true);
      expect(existsSync(join(releaseHomeDir, '.claude-trigger-router', 'config.yaml'))).toBe(true);
      expect(existsSync(join(releaseHomeDir, '.claude-code-router', 'config.json'))).toBe(true);

      const helpResult = await runCommandInShell(toWrapperCommand('--help'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
      });
      expect(helpResult.code).toBe(0);
      expectNoTerminalCorruption(`${helpResult.stdout}\n${helpResult.stderr}`);
      expect(helpResult.stdout).toContain('用法：ctr <命令> [选项]');
      expect(helpResult.stdout).toContain('setup');

      const versionResult = await runCommandInShell(toWrapperCommand('version'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
      });
      expect(versionResult.code).toBe(0);
      expectNoTerminalCorruption(`${versionResult.stdout}\n${versionResult.stderr}`);
      expect(versionResult.stdout).toContain('Package: @peterwangze/claude-trigger-router');
      expect(versionResult.stdout).toContain('Version: 1.1.1');

      const upgradeResult = await runCommandInShell(toWrapperCommand('upgrade'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
      });
      expect(upgradeResult.code).toBe(0);
      expectNoTerminalCorruption(`${upgradeResult.stdout}\n${upgradeResult.stderr}`);
      expect(upgradeResult.stdout).toContain('升级到最新版本：');
      expect(upgradeResult.stdout).toContain('npm install -g @peterwangze/claude-trigger-router@latest');

      const uiResult = await runCommandInShell(toWrapperCommand('ui'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
        extraEnv: {
          CTR_UI_SKIP_OPEN: '1',
        },
      });
      expect(uiResult.code).toBe(0);
      expectNoTerminalCorruption(`${uiResult.stdout}\n${uiResult.stderr}`);
      expect(uiResult.stdout).toContain(`Opening UI at http://127.0.0.1:${port}/ui`);
      expect(uiResult.stdout).toContain('Browser launch skipped by CTR_UI_SKIP_OPEN=1');

      const setupResult = await runCommandInShell(toWrapperCommand('setup'), env, {
        cwd: repoRoot,
        timeoutMs: 240000,
        input: '1\n',
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
        },
      });
      expect(setupResult.code).toBe(0);
      expectNoTerminalCorruption(`${setupResult.stdout}\n${setupResult.stderr}`);
      expect(setupResult.stdout).toContain('检测到当前 claude-trigger-router 配置已可用。');
      expect(setupResult.stdout).toContain('为避免 setup 结束后接管当前终端，请手动运行：ctr code');

      const statusResult = await runCommandInShell(toWrapperCommand('status'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
      });
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');
      expect(statusResult.stdout).toContain(String(port));

      const uiPage = await fetchTextWithRetry(`http://127.0.0.1:${port}/ui`);
      expect(uiPage.contentType).toContain('text/html');
      expect(uiPage.text).toContain('配置与状态工作台');
      expect(uiPage.text).toContain('维护者工作台');
      expect(uiPage.text).toContain('/api/governance/health');
      expect(uiPage.text).toContain('id="healthSummary"');
      expect(uiPage.text).toContain('data-health-action');
      expect(uiPage.text).toContain('applyHealthAction');

      const healthResponse = await fetchTextWithRetry(`http://127.0.0.1:${port}/api/governance/health`);
      expect(healthResponse.contentType).toContain('application/json');
      const healthPayload = JSON.parse(healthResponse.text);
      expect(healthPayload.health.status).toBe('idle');
      expect(Array.isArray(healthPayload.health.actions)).toBe(true);
      expect(Array.isArray(healthPayload.anomalies)).toBe(true);

      const stopResult = await runCommandInShell(toWrapperCommand('stop'), env, {
        cwd: repoRoot,
        timeoutMs: 120000,
      });
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('服务已停止');

      const wrapperContent = await readText(wrapperPath);
      expect(wrapperContent).toContain('.release-home');
    } finally {
      try {
        if (existsSync(wrapperPath)) {
          await runCommandInShell(toWrapperCommand('stop'), env, {
            cwd: repoRoot,
            timeoutMs: 30000,
          });
        }
      } catch {
        // Ignore cleanup stop failures.
      }
      await runCommandInShell('npm run release:clean', env, {
        cwd: repoRoot,
        timeoutMs: 300000,
      });
      await removePath(env.rootDir);
    }
  }, 600000);
});
