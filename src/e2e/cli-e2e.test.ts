import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
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

interface IFakeUpstreamRequest {
  url: string;
  body: any;
}

function extractOpenAiRequestText(body: any): string {
  if (!Array.isArray(body?.messages)) {
    return '';
  }

  return body.messages
    .flatMap((message: any) => {
      if (typeof message?.content === 'string') {
        return [message.content];
      }

      if (Array.isArray(message?.content)) {
        return message.content
          .map((item: any) => typeof item?.text === 'string' ? item.text : '')
          .filter(Boolean);
      }

      return [];
    })
    .join('\n');
}

async function startFakeOpenAiUpstream(): Promise<{
  port: number;
  requests: IFakeUpstreamRequest[];
  close: () => Promise<void>;
}> {
  const requests: IFakeUpstreamRequest[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    requests.push({
      url: req.url || '/',
      body,
    });

    const requestText = extractOpenAiRequestText(body);
    const content = requestText.includes('Select the most appropriate model')
      ? '{"model":"model__reasoner_model,deepseek-reasoner","confidence":0.91,"reasoning":"complex reasoning"}'
      : 'ok from fake upstream';

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'chatcmpl-fake',
      object: 'chat.completion',
      created: 0,
      model: body.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }));
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve upstream port'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    port,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function startFakeAnthropicUpstream(): Promise<{
  port: number;
  requests: IFakeUpstreamRequest[];
  close: () => Promise<void>;
}> {
  const requests: IFakeUpstreamRequest[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    requests.push({
      url: req.url || '/',
      body,
    });

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'msg_fake',
      type: 'message',
      role: 'assistant',
      model: body.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      content: [
        {
          type: 'text',
          text: 'ok from fake anthropic upstream',
        },
      ],
      usage: {
        input_tokens: 1,
        output_tokens: 1,
      },
    }));
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve anthropic upstream port'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    port,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function postAnthropicMessage(port: number, model: string, text: string): Promise<Response> {
  return postAnthropicPayload(port, {
    model,
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  });
}

async function postAnthropicMessageWithTools(port: number, model: string, text: string): Promise<Response> {
  return postAnthropicPayload(port, {
    model,
    max_tokens: 64,
    tools: [
      {
        name: 'search_docs',
        description: 'Search the docs',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  });
}

async function postAnthropicMessageWithOpenAiTools(port: number, model: string, text: string): Promise<Response> {
  return postAnthropicPayload(port, {
    model,
    max_tokens: 64,
    tools: [
      {
        type: 'function',
        function: {
          name: 'search_docs',
          description: 'Search the docs',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    ],
  });
}

async function postAnthropicPayload(port: number, payload: any): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      lastError = error;
      const isConnectionRefused =
        error?.cause?.code === 'ECONNREFUSED' ||
        error?.code === 'ECONNREFUSED' ||
        String(error?.message || '').includes('ECONNREFUSED');
      if (!isConnectionRefused || attempt === 24) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildMinimalModelsConfig(port: number, overrides: string[] = []): string {
  return [
    'HOST: "127.0.0.1"',
    `PORT: ${port}`,
    'LOG: false',
    'Models:',
    '  - id: default_model',
    '    api: "https://openrouter.ai/api/v1/chat/completions"',
    '    key: "sk-test"',
    '    interface: "openai"',
    '    model: "anthropic/claude-sonnet-4"',
    ...overrides,
    'Router:',
    '  default: "default_model"',
  ].join('\n');
}

function getSetupMutationWhitelist(): string[] {
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
  ];
}

async function readCurrentCtrConfigText(homeDir: string): Promise<string> {
  const candidates = [
    join(homeDir, '.claude-trigger-router', 'config.yaml'),
    join(homeDir, '.claude-trigger-router', 'config.yml'),
    join(homeDir, '.claude-trigger-router', 'config.json'),
  ];
  const existing = candidates.find((item) => existsSync(item));
  if (!existing) {
    throw new Error(`No ctr config file found under ${join(homeDir, '.claude-trigger-router')}`);
  }
  return readText(existing);
}

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

  it('invoking ctr without a command prints help and does not modify the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-no-command-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, [], env);
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('用法：ctr <命令> [选项]');
      expect(result.stdout).toContain('setup');
      expect(result.stderr).toBe('');

      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('help aliases exit cleanly without mutating the isolated HOME', async () => {
    const env = await createTestEnvironment('ctr-help-alias-e2e-');
    try {
      for (const arg of ['--help', '-h']) {
        const before = await snapshotTree(env.homeDir);
        const result = await runCtr(cliPath, [arg], env);
        const after = await snapshotTree(env.homeDir);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('用法：ctr <命令> [选项]');
        expect(result.stderr).toBe('');
        expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
      }
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

  it('init --force generates a minimal template that can start the local service immediately', async () => {
    const env = await createTestEnvironment('ctr-init-startable-e2e-');
    const port = await getFreePort();
    try {
      const initResult = await runCtr(cliPath, ['init', '--force'], env);
      expect(initResult.code).toBe(0);

      const configPath = join(env.homeDir, '.claude-trigger-router', 'config.yaml');
      const configText = (await readText(configPath)).replace('PORT: 5678', `PORT: ${port}`);
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', configText);

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
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('init without --force does not overwrite an existing config file', async () => {
    const env = await createTestEnvironment('ctr-init-existing-e2e-');
    const configPath = join(env.homeDir, '.claude-trigger-router', 'config.yaml');
    const originalConfig = buildMinimalModelsConfig(5678);
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', originalConfig);

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['init'], env);
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('配置文件已存在');
      expect(await readText(configPath)).toBe(originalConfig);
      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
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

  it('doctor can repair a minimal alias-based config and make the service startable without probing models', async () => {
    const env = await createTestEnvironment('ctr-doctor-fix-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'Models:',
          '  - api_base_url: "https://openrouter.ai/api/v1/chat/completions"',
          '    api_key: "sk-test"',
          '    protocol: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router: {}',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor'], env, {
        timeoutMs: 60000,
        input: 'n\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      const repairedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('已归一 Models[0].api');
      expect(result.stdout).toContain('已补全 Models[0].id');
      expect(result.stdout).toContain('已补全 Router.default');
      expect(result.stdout).toContain('模型兼容策略：anthropic_claude_sonnet_4 -> OpenAI-compatible / Anthropic dispatch');
      expect(result.stdout).toContain('兼容说明：目标接口属于 OpenAI-compatible 兼容族');
      expect(result.stdout).toContain('请求编译：Anthropic-style messages');
      expect(result.stdout).not.toContain('openai-compatible-anthropic-dispatch');
      expect(result.stdout).toContain('已跳过模型探测');
      expect(repairedConfig).toContain('id: anthropic_claude_sonnet_4');
      expect(repairedConfig).toContain(`PORT: ${port}`);

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.stdout).toContain('服务运行中');

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('doctor can probe configured models after explicit user consent', async () => {
    const env = await createTestEnvironment('ctr-doctor-probe-e2e-');
    const upstream = await startFakeOpenAiUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: sonnet',
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-test"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "sonnet"',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor', '--check-models'], env, {
        timeoutMs: 60000,
        input: 'y\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('模型探测成功：sonnet');
      expect(result.stdout).toContain('模型探测完成：成功 1，失败 0。');
      expect(upstream.requests.length).toBeGreaterThan(0);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('doctor can probe a local openai-compatible model when the config only provides a bare /v1 base url', async () => {
    const env = await createTestEnvironment('ctr-doctor-probe-bare-openai-endpoint-');
    const upstream = await startFakeOpenAiUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: local_model',
          `    api: "http://127.0.0.1:${upstream.port}/v1"`,
          '    key: "sk-local"',
          '    interface: "openai"',
          '    model: "gpt-4.1"',
          'Router:',
          '  default: "local_model"',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor', '--check-models'], env, {
        timeoutMs: 60000,
        input: 'y\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('模型探测成功：local_model');
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/chat/completions');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('doctor can probe a local anthropic-compatible model when the config only provides a bare base url', async () => {
    const env = await createTestEnvironment('ctr-doctor-probe-bare-anthropic-endpoint-');
    const upstream = await startFakeAnthropicUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: claude_local',
          `    api: "http://127.0.0.1:${upstream.port}"`,
          '    key: "sk-anthropic-local"',
          '    interface: "anthropic"',
          '    model: "claude-sonnet-4-5"',
          'Router:',
          '  default: "claude_local"',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor', '--check-models'], env, {
        timeoutMs: 60000,
        input: 'y\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('模型探测成功：claude_local');
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/messages');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('doctor reports probe failures with user-readable guidance instead of internal compatibility terms', async () => {
    const env = await createTestEnvironment('ctr-doctor-probe-failure-e2e-');
    const failingServer = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        error: {
          message: 'bad key',
        },
      }));
    });

    const port = await new Promise<number>((resolve, reject) => {
      failingServer.once('error', reject);
      failingServer.listen(0, '127.0.0.1', () => {
        const address = failingServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve failing upstream port'));
          return;
        }
        resolve(address.port);
      });
    });

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: sonnet',
          `    api: "http://127.0.0.1:${port}/v1/chat/completions"`,
          '    key: "sk-bad"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router:',
          '  default: "sonnet"',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor', '--check-models'], env, {
        timeoutMs: 60000,
        input: 'y\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('模型探测失败：sonnet -> 鉴权失败');
      expect(result.stdout).toContain('失败说明：上游接口拒绝了当前 API Key');
      expect(result.stdout).toContain('处理建议：请检查 API Key、账号订阅状态');
      expect(result.stdout).toContain('远端原始信息：401');
      expect(result.stdout).toContain('模型探测完成：成功 0，失败 1。');
      expect(result.stdout).not.toContain('auth_error');
      expect(result.stdout).not.toContain('openai-compatible-anthropic-dispatch');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await new Promise<void>((resolve, reject) => failingServer.close((error) => error ? reject(error) : resolve()));
      await removePath(env.rootDir);
    }
  }, 300000);

  it('doctor previews runtime compatibility fallbacks in user-readable terms before probing models', async () => {
    const env = await createTestEnvironment('ctr-doctor-compat-preview-e2e-');
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: true',
          'LOG_LEVEL: "debug"',
          'Models:',
          '  - id: limited_model',
          '    api: "https://example.com/v1/chat/completions"',
          '    key: "sk-test"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          '    metadata:',
          '      supports_reasoning: false',
          '      supports_tools: false',
          '      supports_images: false',
          'Router:',
          '  default: "limited_model"',
        ].join('\n')
      );

      const result = await runCtr(cliPath, ['doctor'], env, {
        timeoutMs: 60000,
        input: 'n\n',
        extraEnv: {
          CTR_DOCTOR_FORCE_SCRIPTED_INPUT: '1',
        },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('运行时兼容提示：thinking 已忽略');
      expect(result.stdout).toContain('运行时兼容提示：图片已降级为文本');
      expect(result.stdout).toContain('运行时兼容提示：工具调用已降级为文本');
      expect(result.stdout).toContain('运行时建议：如需保留工具调用，请启用 supports_tools');
      expect(result.stdout).not.toContain('tools_text_fallback');
      expect(result.stdout).not.toContain('images_text_fallback');
      expect(result.stdout).not.toContain('thinking_ignored');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

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
      expect(['服务已停止', '未发现运行中的服务'].some((item) => stopResult.stdout.includes(item))).toBe(true);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('status and stop fail safely when no service is running', async () => {
    const env = await createTestEnvironment('ctr-no-service-e2e-');
    try {
      const statusResult = await runCtr(cliPath, ['status'], env);
      const stopResult = await runCtr(cliPath, ['stop'], env);

      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务未运行');
      expect(stopResult.code).toBe(0);
      expect(stopResult.stdout).toContain('未发现运行中的服务');
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('start foreground returns a clear message when the router is already running on the same port', async () => {
    const env = await createTestEnvironment('ctr-start-foreground-duplicate-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));

      const daemonStart = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(daemonStart.code).toBe(0);

      const foregroundStart = await runCtr(cliPath, ['start', '--port', String(port)], env, {
        timeoutMs: 15000,
      });
      expect(foregroundStart.code).toBe(0);
      expect(foregroundStart.stdout).toContain(`Service is already running on port ${port}`);
      expect(foregroundStart.stdout).toContain("Use 'ctr status' to inspect it or 'ctr stop' before starting again.");
      expect(foregroundStart.stdout).not.toContain('Starting Claude Trigger Router (foreground)');

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('start foreground fails cleanly on invalid config without unexpected file writes', async () => {
    const env = await createTestEnvironment('ctr-start-invalid-e2e-');
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: false',
          'Models:',
          '  - id: invalid_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router: {}',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['start'], env, { timeoutMs: 30000 });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('Starting Claude Trigger Router (foreground)');
      expect(result.stderr).toContain('Configuration error');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude-trigger-router/logs',
      ]);
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('start rejects an invalid --port value before attempting startup', async () => {
    const env = await createTestEnvironment('ctr-invalid-port-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['start', '--port', 'abc'], env, { timeoutMs: 15000 });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('命令行端口参数 不是合法端口：abc');
      expect(result.stdout).not.toContain('Starting Claude Trigger Router');
      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('start --daemon fails cleanly when configuration is invalid instead of printing a false success message', async () => {
    const env = await createTestEnvironment('ctr-start-daemon-invalid-e2e-');
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          'PORT: 5678',
          'LOG: false',
          'Models:',
          '  - id: invalid_model',
          '    api: "https://openrouter.ai/api/v1/chat/completions"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          'Router: {}',
        ].join('\n')
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['start', '--daemon'], env, { timeoutMs: 20000 });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Service failed to start in background');
      expect(result.stderr).toContain("Run 'ctr start' (without --daemon) to inspect the startup error.");
      expect(result.stdout).not.toContain('Service started in background');
      expect(result.stdout).not.toContain('Service launched in background');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), [
        '.claude-trigger-router',
        '.claude-trigger-router/config.yaml',
        '.claude-trigger-router/logs',
      ]);
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('start --daemon does not start a duplicate service when one is already running', async () => {
    const env = await createTestEnvironment('ctr-start-duplicate-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));

      const firstStart = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, { timeoutMs: 20000 });
      expect(firstStart.code).toBe(0);

      const statusBefore = await runCtr(cliPath, ['status'], env);
      const secondStart = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, { timeoutMs: 15000 });
      const statusAfter = await runCtr(cliPath, ['status'], env);

      expect(secondStart.code).toBe(0);
      expect(secondStart.stdout).toContain('Service is already running in the background');
      expect(statusBefore.stdout).toContain('服务运行中');
      expect(statusAfter.stdout).toContain('服务运行中');
      expect(statusBefore.stdout).toContain(String(port));
      expect(statusAfter.stdout).toContain(String(port));

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('restart starts the service when none is running and restarts it cleanly when already running', async () => {
    const env = await createTestEnvironment('ctr-restart-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));

      const restartCold = await runCtr(cliPath, ['restart', '--daemon', '--port', String(port)], env, { timeoutMs: 20000 });
      expect(restartCold.code).toBe(0);
      expect(restartCold.stdout).toContain('未发现运行中的服务');

      const statusAfterCold = await runCtr(cliPath, ['status'], env);
      expect(statusAfterCold.code).toBe(0);
      expect(statusAfterCold.stdout).toContain('服务运行中');

      const pidBefore = statusAfterCold.stdout.match(/PID：(\d+)/)?.[1];
      const restartWarm = await runCtr(cliPath, ['restart', '--daemon', '--port', String(port)], env, { timeoutMs: 25000 });
      expect(restartWarm.code).toBe(0);
      expect(restartWarm.stdout).toContain('正在停止服务');

      const statusAfterWarm = await runCtr(cliPath, ['status'], env);
      const pidAfter = statusAfterWarm.stdout.match(/PID：(\d+)/)?.[1];
      expect(statusAfterWarm.code).toBe(0);
      expect(statusAfterWarm.stdout).toContain('服务运行中');
      expect(pidBefore).toBeTruthy();
      expect(pidAfter).toBeTruthy();
      expect(pidAfter).not.toBe(pidBefore);

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('SmartRouter rules route matched requests to the configured target model in packaged CLI mode', async () => {
    const env = await createTestEnvironment('ctr-trigger-router-e2e-');
    const port = await getFreePort();
    const upstream = await startFakeOpenAiUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          `  - id: default_model`,
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-default"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          `  - id: opus_model`,
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-opus"',
          '    interface: "openai"',
          '    model: "anthropic/claude-opus-4"',
          'Router:',
          '  default: "default_model"',
          'SmartRouter:',
          '  enabled: true',
          '  analysis_scope: "last_message"',
          '  rules:',
          '    - name: "architecture"',
          '      priority: 90',
          '      enabled: true',
          '      patterns:',
          '        - type: exact',
          '          keywords: ["架构设计"]',
          '      model: "opus_model"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const response = await postAnthropicMessage(port, 'default_model', '请给我一个架构设计方案');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests.at(-1)?.body?.model).toBe('anthropic/claude-opus-4');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('SmartRouter selects a candidate model for unmatched requests in packaged CLI mode', async () => {
    const env = await createTestEnvironment('ctr-smart-router-e2e-');
    const port = await getFreePort();
    const upstream = await startFakeOpenAiUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Models:',
          `  - id: default_model`,
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-default"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          `  - id: reasoner_model`,
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-reasoner"',
          '    interface: "openai"',
          '    model: "deepseek-reasoner"',
          '    thinking: "high"',
          'Router:',
          '  default: "default_model"',
          'SmartRouter:',
          '  enabled: true',
          '  analysis_scope: "last_message"',
          '  rules: []',
          '  router_model: "default_model"',
          '  candidates:',
          '    - model: "default_model"',
          '      description: "通用编程与日常调试"',
          '    - model: "reasoner_model"',
          '      description: "复杂推理与严谨分析"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const response = await postAnthropicMessage(port, 'default_model', '请帮我深入分析这个复杂推理问题');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThanOrEqual(2);
      expect(upstream.requests[0]?.body?.model).toBe('anthropic/claude-sonnet-4');
      expect(upstream.requests.at(-1)?.body?.model).toBe('deepseek-reasoner');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('unified Router config routes requests through the normalized runtime chain in packaged CLI mode', async () => {
    const env = await createTestEnvironment('ctr-unified-router-e2e-');
    const port = await getFreePort();
    const upstream = await startFakeOpenAiUpstream();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-trigger-router/config.yaml',
        [
          'HOST: "127.0.0.1"',
          `PORT: ${port}`,
          'LOG: false',
          'Providers:',
          '  - name: openrouter',
          `    api_base_url: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    api_key: "sk-provider"',
          '    models: ["anthropic/claude-sonnet-4", "anthropic/claude-opus-4"]',
          'Models:',
          '  - id: sonnet',
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-sonnet"',
          '    interface: "openai"',
          '    model: "anthropic/claude-sonnet-4"',
          '  - id: opus',
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-opus"',
          '    interface: "openai"',
          '    model: "anthropic/claude-opus-4"',
          'Router:',
          '  default: "sonnet"',
          '  routes:',
          '    - name: "architecture"',
          '      model: "opus"',
          '      description: "重构 系统 结构 模块 拆分 架构 设计"',
          '      priority: 90',
          '      match:',
          '        semantic: true',
          '        semantic_profile:',
          '          threshold: 0.2',
          '  decision:',
          '    smart_fallback: true',
          '    router_model: "sonnet"',
          '    candidates:',
          '      - model: "sonnet"',
          '        description: "通用编程与日常调试"',
          '      - model: "opus"',
          '        description: "架构与复杂评审"',
          '  defaults:',
          '    semantic:',
          '      enabled: true',
          '      threshold: 0.2',
          '    sticky:',
          '      enabled: true',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const response = await postAnthropicMessage(port, 'sonnet', '请帮我重构系统结构并拆分核心模块');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests.at(-1)?.body?.model).toBe('anthropic/claude-opus-4');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('generic openai-compatible models preserve tool names when Claude sends openai-style tool definitions', async () => {
    const env = await createTestEnvironment('ctr-compat-tools-e2e-');
    const upstream = await startFakeOpenAiUpstream();
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
          '  - id: gpt90',
          `    api: "http://127.0.0.1:${upstream.port}/v1/chat/completions"`,
          '    key: "sk-test"',
          '    interface: "openai"',
          '    model: "gpt-5.4"',
          'Router:',
          '  default: "gpt90"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const response = await postAnthropicMessageWithOpenAiTools(port, 'gpt90', '帮我查一下路由协议兼容性');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.body?.tools).toEqual([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({
            name: 'search_docs',
            description: 'Search the docs',
            parameters: expect.objectContaining({
              type: 'object',
            }),
          }),
        }),
      ]);

      const stopResult = await runCtr(cliPath, ['stop'], env);
      expect(stopResult.code).toBe(0);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
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

  it('code still fails safely when CTR_AUTO_START=1 but the router service is not running', async () => {
    const env = await createTestEnvironment('ctr-code-auto-start-e2e-');
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
      const result = await runCtr(cliPath, ['code'], env, {
        timeoutMs: 30000,
        extraEnv: {
          CTR_AUTO_START: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(`Checking if service is available on port ${port}`);
      expect(result.stdout).toContain(`Trigger Router service is not running on port ${port}`);
      expect(result.stdout).not.toContain('Starting Claude Code with Trigger Router');
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

  it('runtime requests normalize bare openai-compatible endpoints before dispatching upstream', async () => {
    const env = await createTestEnvironment('ctr-bare-openai-runtime-e2e-');
    const upstream = await startFakeOpenAiUpstream();
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
          '  - id: local_model',
          `    api: "http://127.0.0.1:${upstream.port}/v1"`,
          '    key: "sk-local"',
          '    interface: "openai"',
          '    model: "gpt-4.1"',
          'Router:',
          '  default: "local_model"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const response = await postAnthropicMessage(port, 'local_model', '请回复 bare endpoint runtime test');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/chat/completions');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('runtime requests normalize bare anthropic-compatible endpoints before dispatching upstream', async () => {
    const env = await createTestEnvironment('ctr-bare-anthropic-runtime-e2e-');
    const upstream = await startFakeAnthropicUpstream();
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
          '  - id: claude_local',
          `    api: "http://127.0.0.1:${upstream.port}"`,
          '    key: "sk-anthropic-local"',
          '    interface: "anthropic"',
          '    model: "claude-sonnet-4-5"',
          'Router:',
          '  default: "claude_local"',
        ].join('\n')
      );

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      await postAnthropicMessage(port, 'claude_local', '请回复 bare anthropic endpoint runtime test');
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/messages');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

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
      expect(marker).toContain('ANTHROPIC_AUTH_TOKEN=ctr-local-proxy');
      expect(marker).toContain('ANTHROPIC_API_KEY=');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('code fails clearly when Claude Code CLI is unavailable even if the router service is healthy', async () => {
    const env = await createTestEnvironment('ctr-code-missing-claude-e2e-');
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

      const fakeClaudePath = join(env.binDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
      if (process.platform === 'win32') {
        await writeFile(fakeClaudePath, '@echo off\r\nexit /b 1\r\n', 'utf-8');
      } else {
        await writeFile(fakeClaudePath, '#!/usr/bin/env sh\nexit 1\n', 'utf-8');
      }

      const result = await runCtr(cliPath, ['code'], env, {
        timeoutMs: 30000,
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(`Starting Claude Code with Trigger Router (port: ${port})`);
      expect(result.stdout).toContain('请先安装：npm install -g @anthropic-ai/claude-code');
      expect(result.stderr).toContain('未检测到 Claude Code CLI');
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
      expect(result.stdout).toContain('当前 UI 服务未就绪');
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

  it('restart without --daemon documents and uses the same background restart behavior', async () => {
    const env = await createTestEnvironment('ctr-restart-default-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));

      const restartCold = await runCtr(cliPath, ['restart', '--port', String(port)], env, { timeoutMs: 20000 });
      expect(restartCold.code).toBe(0);
      expect(restartCold.stdout).toContain('`ctr restart` 当前默认按后台模式重启服务');
      expect(restartCold.stdout).toContain('未发现运行中的服务');

      const statusAfterCold = await runCtr(cliPath, ['status'], env);
      expect(statusAfterCold.code).toBe(0);
      expect(statusAfterCold.stdout).toContain('服务运行中');
      expect(statusAfterCold.stdout).toContain(String(port));

      const stopResult = await runCtr(cliPath, ['stop'], env);
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
      expect(['服务已停止', '未发现运行中的服务'].some((item) => stopResult.stdout.includes(item))).toBe(true);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can create a fresh config on first use when no current or legacy config exists', async () => {
    const env = await createTestEnvironment('ctr-setup-first-use-e2e-');
    try {
      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '本地使用（推荐）',
          'sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-first-use',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readCurrentCtrConfigText(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('当前要本地使用、连接远程服务，还是部署为远程服务端？');
      expect(configText).toContain('id: sonnet');
      expect(configText).toContain('key: sk-first-use');
      expect(configText).toContain('default: sonnet');
      expect(result.stdout).toContain('你可以按需继续配置路由能力：');
      expect(result.stdout).toContain('SmartRouter');
      expect(result.stdout).toContain('config/trigger.advanced.yaml');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('setup can skip legacy migration and build a fresh config on first use', async () => {
    const env = await createTestEnvironment('ctr-setup-skip-legacy-e2e-');
    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "legacy-openai",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-legacy",
      "models": ["gpt-4.1"]
    }
  ],
  "Router": {
    "default": "legacy-openai,gpt-4.1"
  }
}`
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '2',
          '本地使用（推荐）',
          'sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-skip-legacy',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readCurrentCtrConfigText(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('跳过迁移，手动新建');
      expect(configText).toContain('key: sk-skip-legacy');
      expect(configText).toContain('default: sonnet');
      expect(configText).not.toContain('legacy-openai');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('setup falls back to fresh creation when legacy config exists but cannot be parsed', async () => {
    const env = await createTestEnvironment('ctr-setup-legacy-read-error-e2e-');
    try {
      await writeFileUnder(env.homeDir, '.claude-code-router/config.json', '{ invalid json');

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '本地使用（推荐）',
          'sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-read-error',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readCurrentCtrConfigText(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('旧 ccr 配置读取失败');
      expect(configText).toContain('key: sk-read-error');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const stopResult = await runCtr(cliPath, ['stop'], env);
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
  "LOG": false,
  "LOG_LEVEL": "debug",
  "HOST": "127.0.0.1",
  "PORT": ${port},
  "API_TIMEOUT_MS": "600000",
  "Providers": [
    {
      "name": "gpt90",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-migrated",
      "models": ["gpt-5.4"]
    },
    {
      "name": "qianfan_coding",
      "api_base_url": "https://example.com/qianfan/v1/chat/completions",
      "api_key": "sk-qianfan",
      "models": ["glm-5"]
    }
  ],
  "Router": {
    "default": "gpt90,gpt-5.4",
    "background": "gpt90,gpt-5.4",
    "think": "gpt90,gpt-5.4",
    "longContext": "qianfan_coding,glm-5",
    "longContextThreshold": 60000,
    "webSearch": "qianfan_coding,glm-5"
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
      expect(migratedConfig).toContain('id: qianfan_coding_glm_5');
      expect(migratedConfig).toContain('default: gpt90_gpt_5_4');
      expect(migratedConfig).toContain('background: gpt90_gpt_5_4');
      expect(migratedConfig).toContain('think: gpt90_gpt_5_4');
      expect(migratedConfig).toContain('longContext: qianfan_coding_glm_5');
      expect(migratedConfig).toContain('longContextThreshold: 60000');
      expect(migratedConfig).toContain('webSearch: qianfan_coding_glm_5');
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

  it('setup can complete missing api base url during claude-code-router migration and then start successfully', async () => {
    const env = await createTestEnvironment('ctr-setup-migrate-missing-api-e2e-');
    const port = await getFreePort();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "legacy_provider",
      "api_key": "sk-legacy-migrate",
      "models": ["gpt-4.1"]
    }
  ],
  "Router": {
    "default": "legacy_provider,gpt-4.1"
  }
}`
      );

      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '1',
          'https://example.com/openai/v1/chat/completions',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });

      const migratedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('检测到旧 claude-code-router 配置。是否迁移为当前推荐配置？');
      expect(migratedConfig).toContain('api: https://example.com/openai/v1/chat/completions');
      expect(migratedConfig).toContain('default: legacy_provider_gpt_4_1');

      const startResult = await runCtr(cliPath, ['start', '--daemon', '--port', String(port)], env, {
        timeoutMs: 20000,
      });
      expect(startResult.code).toBe(0);

      const statusResult = await runCtr(cliPath, ['status'], env);
      expect(statusResult.code).toBe(0);
      expect(statusResult.stdout).toContain('服务运行中');

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('setup migration normalizes bare legacy openai-compatible endpoints and the migrated runtime can use them directly', async () => {
    const env = await createTestEnvironment('ctr-setup-migrate-bare-openai-endpoint-');
    const upstream = await startFakeOpenAiUpstream();
    const port = await getFreePort();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "LOG": false,
  "HOST": "127.0.0.1",
  "PORT": ${port},
  "Providers": [
    {
      "name": "legacy_local",
      "api_base_url": "http://127.0.0.1:${upstream.port}/v1",
      "api_key": "sk-legacy-local",
      "models": ["gpt-4.1"]
    }
  ],
  "Router": {
    "default": "legacy_local,gpt-4.1"
  }
}`
      );

      const setupResult = await runCtr(cliPath, ['setup'], env, {
        input: '1\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });

      const migratedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      expect(setupResult.code).toBe(0);
      expect(migratedConfig).toContain(`api: http://127.0.0.1:${upstream.port}/v1/chat/completions`);
      expect(migratedConfig).toContain('default: legacy_local_gpt_4_1');

      const response = await postAnthropicMessage(port, 'legacy_local_gpt_4_1', '请验证迁移后的 bare endpoint runtime');
      expect(response.ok).toBe(true);
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/chat/completions');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup migration normalizes bare legacy anthropic endpoints and the migrated runtime can use them directly', async () => {
    const env = await createTestEnvironment('ctr-setup-migrate-bare-anthropic-endpoint-');
    const upstream = await startFakeAnthropicUpstream();
    const port = await getFreePort();

    try {
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "LOG": false,
  "HOST": "127.0.0.1",
  "PORT": ${port},
  "Providers": [
    {
      "name": "legacy_claude",
      "api_base_url": "http://127.0.0.1:${upstream.port}",
      "api_key": "sk-legacy-claude",
      "models": ["claude-sonnet-4-5"]
    }
  ],
  "Router": {
    "default": "legacy_claude,claude-sonnet-4-5"
  }
}`
      );

      const setupResult = await runCtr(cliPath, ['setup'], env, {
        input: '1\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });

      const migratedConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      expect(setupResult.code).toBe(0);
      expect(migratedConfig).toContain(`api: http://127.0.0.1:${upstream.port}/v1/messages`);
      expect(migratedConfig).toContain('interface: anthropic');
      expect(migratedConfig).toContain('default: legacy_claude_claude_sonnet_4_5');

      await postAnthropicMessage(port, 'legacy_claude_claude_sonnet_4_5', '请验证迁移后的 bare anthropic endpoint runtime');
      expect(upstream.requests.length).toBeGreaterThan(0);
      expect(upstream.requests[0]?.url).toBe('/v1/messages');
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await upstream.close();
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can overwrite a valid current config with a newly guided configuration', async () => {
    const env = await createTestEnvironment('ctr-setup-overwrite-valid-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '2',
          '本地使用（推荐）',
          'sonnet45',
          '使用常见接入模板',
          'anthropic',
          'anthropic',
          'https://api.anthropic.com/v1/messages',
          'sk-overwrite',
          'claude-sonnet-4-5',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readCurrentCtrConfigText(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('检查并调整当前配置');
      expect(configText).toContain('id: sonnet45');
      expect(configText).toContain('interface: anthropic');
      expect(configText).toContain('key: sk-overwrite');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('setup can abandon a valid current config, skip legacy migration, and rebuild fresh', async () => {
    const env = await createTestEnvironment('ctr-setup-fresh-skip-valid-e2e-');
    const port = await getFreePort();
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', buildMinimalModelsConfig(port));
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "legacy-openai",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-legacy",
      "models": ["gpt-4.1"]
    }
  ],
  "Router": {
    "default": "legacy-openai,gpt-4.1"
  }
}`
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: [
          '3',
          '2',
          '本地使用（推荐）',
          'fresh_sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-fresh-after-skip',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readCurrentCtrConfigText(env.homeDir);

      expect(result.code).toBe(0);
      expect(configText).toContain('id: fresh_sonnet');
      expect(configText).toContain('key: sk-fresh-after-skip');
      expect(configText).not.toContain('legacy-openai');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const stopResult = await runCtr(cliPath, ['stop'], env);
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

  it('setup can cancel invalid-config repair without mutating files', async () => {
    const env = await createTestEnvironment('ctr-setup-invalid-cancel-e2e-');
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
      const originalConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      const result = await runCtr(cliPath, ['setup'], env, {
        input: 'cancel\n',
        timeoutMs: 30000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('当前配置校验失败');
      expect(await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'))).toBe(originalConfig);
      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });

  it('setup can overwrite an invalid config by migrating legacy claude-code-router settings', async () => {
    const env = await createTestEnvironment('ctr-setup-invalid-overwrite-migrate-e2e-');
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
      await writeFileUnder(
        env.homeDir,
        '.claude-code-router/config.json',
        `{
  "Providers": [
    {
      "name": "gpt90",
      "api_base_url": "https://example.com/openai/v1/chat/completions",
      "api_key": "sk-invalid-migrate",
      "models": ["gpt-5.4"]
    }
  ],
  "Router": {
    "default": "gpt90,gpt-5.4"
  }
}`
      );

      const before = await snapshotTree(env.homeDir);
      const result = await runCtr(cliPath, ['setup'], env, {
        input: 'overwrite\n1\n',
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const configText = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));

      expect(result.code).toBe(0);
      expect(configText).toContain('id: gpt90_gpt_5_4');
      expect(configText).toContain('key: sk-invalid-migrate');
      assertOnlyExpectedPathsChanged(diffSnapshots(before, after), getSetupMutationWhitelist());

      const stopResult = await runCtr(cliPath, ['stop'], env);
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
          '本地使用（推荐）',
          'sonnet',
          '使用常见接入模板',
          'openrouter',
          'openrouter',
          'https://openrouter.ai/api/v1/chat/completions',
          'sk-fresh',
          'anthropic/claude-sonnet-4',
          '先不添加',
          '保持默认',
        ].join('\n'),
        timeoutMs: 180000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);
      const rebuiltConfig = await readCurrentCtrConfigText(env.homeDir);

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
      expect(['服务已停止', '未发现运行中的服务'].some((item) => stopResult.stdout.includes(item))).toBe(true);
    } finally {
      try {
        await runCtr(cliPath, ['stop'], env, { timeoutMs: 15000 });
      } catch {
        // Ignore cleanup stop failures.
      }
      await removePath(env.rootDir);
    }
  }, 300000);

  it('setup can cancel rebuild when the current config is unparseable without mutating files', async () => {
    const env = await createTestEnvironment('ctr-setup-parse-cancel-e2e-');
    try {
      await writeFileUnder(env.homeDir, '.claude-trigger-router/config.yaml', 'Models:\n\t- bad: yaml\n');

      const before = await snapshotTree(env.homeDir);
      const originalConfig = await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'));
      const result = await runCtr(cliPath, ['setup'], env, {
        input: 'cancel\n',
        timeoutMs: 30000,
        extraEnv: {
          CTR_SETUP_FORCE_SCRIPTED_INPUT: '1',
          CTR_SETUP_SKIP_ENTER_CODE: '1',
        },
      });
      const after = await snapshotTree(env.homeDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('当前配置无法解析');
      expect(await readText(join(env.homeDir, '.claude-trigger-router', 'config.yaml'))).toBe(originalConfig);
      expect(diffSnapshots(before, after)).toEqual({ added: [], removed: [], changed: [] });
    } finally {
      await removePath(env.rootDir);
    }
  });
});

