import { chmod, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { spawn } from 'child_process';

export interface ICommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ITestEnvironment {
  rootDir: string;
  homeDir: string;
  workDir: string;
  binDir: string;
}

export interface IFileSnapshotEntry {
  type: 'file' | 'dir';
  size: number;
}

export type TFileSnapshot = Record<string, IFileSnapshotEntry>;

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
    shell?: boolean;
  }
): Promise<ICommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`));
    }, options.timeoutMs ?? 60000);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });

    if (options.input) {
      const lines = options.input.split(/\n/);
      let index = 0;
      const pump = () => {
        if (index >= lines.length) {
          child.stdin.end();
          return;
        }

        const chunk = index === lines.length - 1 ? lines[index] : `${lines[index]}\n`;
        index += 1;
        child.stdin.write(chunk, () => {
          setTimeout(pump, 50);
        });
      };
      setTimeout(pump, 50);
    } else {
      child.stdin.end();
    }
  });
}

function buildIsolatedCommandEnv(env: ITestEnvironment, extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: env.homeDir,
    USERPROFILE: env.homeDir,
    PATH: `${env.binDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    ...extraEnv,
  };
}

export async function createTestEnvironment(prefix = 'ctr-e2e-'): Promise<ITestEnvironment> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const homeDir = join(rootDir, 'home');
  const workDir = join(rootDir, 'workspace');
  const binDir = join(rootDir, 'bin');

  await mkdir(homeDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  return { rootDir, homeDir, workDir, binDir };
}

export async function createFakeClaude(binDir: string, markerPath: string): Promise<void> {
  const commandPath = join(binDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
  if (process.platform === 'win32') {
    await writeFile(
      commandPath,
      `@echo off\r\n> "${markerPath}" echo invoked\r\n>> "${markerPath}" echo ANTHROPIC_BASE_URL=%ANTHROPIC_BASE_URL%\r\nexit /b 0\r\n`,
      'utf-8'
    );
  } else {
    await writeFile(
      commandPath,
      `#!/usr/bin/env sh\nprintf 'invoked\nANTHROPIC_BASE_URL=%s\n' "$ANTHROPIC_BASE_URL" > "${markerPath}"\nexit 0\n`,
      'utf-8'
    );
    await chmod(commandPath, 0o755);
  }
}

export async function packCli(repoRoot: string): Promise<string> {
  const buildResult = await runCommand('npm', ['run', 'build'], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    timeoutMs: 180000,
  });
  if (buildResult.code !== 0) {
    throw new Error(`npm run build failed:\n${buildResult.stderr || buildResult.stdout}`);
  }

  const result = await runCommand('npm', ['pack', '--silent'], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    timeoutMs: 120000,
  });
  if (result.code !== 0) {
    throw new Error(`npm pack failed:\n${result.stderr || result.stdout}`);
  }
  const filename = result.stdout.trim().split(/\r?\n/).pop();
  if (!filename) {
    throw new Error('npm pack did not return a tarball filename');
  }
  return join(repoRoot, filename);
}

export async function installPackedCli(repoRoot: string, prefixDir: string, tarballPath: string): Promise<string> {
  const result = await runCommand('npm', ['install', '-g', tarballPath, '--prefix', prefixDir], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    timeoutMs: 180000,
  });
  if (result.code !== 0) {
    throw new Error(`npm install -g failed:\n${result.stderr || result.stdout}`);
  }
  const cliPath = process.platform === 'win32'
    ? join(prefixDir, 'ctr.cmd')
    : join(prefixDir, 'bin', 'ctr');
  if (!existsSync(cliPath)) {
    throw new Error(`Installed CLI not found at ${cliPath}`);
  }
  return cliPath;
}

export async function runCtr(
  cliPath: string,
  args: string[],
  env: ITestEnvironment,
  options: {
    input?: string;
    timeoutMs?: number;
    extraEnv?: NodeJS.ProcessEnv;
    cwd?: string;
  } = {}
): Promise<ICommandResult> {
  const commandEnv = buildIsolatedCommandEnv(env, options.extraEnv);

  if (process.platform === 'win32') {
    return runCommand(cliPath, args, {
      cwd: options.cwd ?? env.workDir,
      env: commandEnv,
      input: options.input,
      timeoutMs: options.timeoutMs,
      shell: true,
    });
  }

  return runCommand(cliPath, args, {
    cwd: options.cwd ?? env.workDir,
    env: commandEnv,
    input: options.input,
    timeoutMs: options.timeoutMs,
  });
}

export async function runCtrThroughUserShell(
  cliPath: string,
  args: string[],
  env: ITestEnvironment,
  options: {
    input?: string;
    timeoutMs?: number;
    extraEnv?: NodeJS.ProcessEnv;
    cwd?: string;
  } = {}
): Promise<ICommandResult> {
  const commandEnv = buildIsolatedCommandEnv(env, options.extraEnv);

  if (process.platform === 'win32') {
    const escapedCliPath = cliPath.replace(/'/g, "''");
    const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(' ');
    const command = escapedArgs.length > 0
      ? `& '${escapedCliPath}' ${escapedArgs}`
      : `& '${escapedCliPath}'`;

    return runCommand('pwsh', ['-NoProfile', '-Command', command], {
      cwd: options.cwd ?? env.workDir,
      env: commandEnv,
      input: options.input,
      timeoutMs: options.timeoutMs,
    });
  }

  const quotedCliPath = cliPath.replace(/'/g, "'\\''");
  const quotedArgs = args.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
  const command = quotedArgs.length > 0
    ? `'${quotedCliPath}' ${quotedArgs}`
    : `'${quotedCliPath}'`;

  return runCommand('sh', ['-lc', command], {
    cwd: options.cwd ?? env.workDir,
    env: commandEnv,
    input: options.input,
    timeoutMs: options.timeoutMs,
  });
}

export async function runCommandInShell(
  command: string,
  env: ITestEnvironment,
  options: {
    timeoutMs?: number;
    extraEnv?: NodeJS.ProcessEnv;
    cwd?: string;
    input?: string;
  } = {}
): Promise<ICommandResult> {
  const commandEnv = buildIsolatedCommandEnv(env, options.extraEnv);

  if (process.platform === 'win32') {
    return runCommand('pwsh', ['-NoProfile', '-Command', command], {
      cwd: options.cwd ?? env.workDir,
      env: commandEnv,
      input: options.input,
      timeoutMs: options.timeoutMs,
    });
  }

  return runCommand('sh', ['-lc', command], {
    cwd: options.cwd ?? env.workDir,
    env: commandEnv,
    input: options.input,
    timeoutMs: options.timeoutMs,
  });
}

export async function snapshotTree(rootDir: string): Promise<TFileSnapshot> {
  const snapshot: TFileSnapshot = {};

  async function walk(currentDir: string) {
    if (!existsSync(currentDir)) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = relative(rootDir, fullPath).replace(/\\/g, '/');
      const entryStat = await stat(fullPath);
      snapshot[relPath] = {
        type: entry.isDirectory() ? 'dir' : 'file',
        size: entryStat.size,
      };
      if (entry.isDirectory()) {
        await walk(fullPath);
      }
    }
  }

  await walk(rootDir);
  return snapshot;
}

export function diffSnapshots(before: TFileSnapshot, after: TFileSnapshot) {
  const added = Object.keys(after).filter((key) => !(key in before)).sort();
  const removed = Object.keys(before).filter((key) => !(key in after)).sort();
  const changed = Object.keys(after)
    .filter((key) => key in before)
    .filter((key) => before[key].type !== after[key].type || before[key].size !== after[key].size)
    .sort();

  return { added, removed, changed };
}

export function assertOnlyExpectedPathsChanged(
  diff: { added: string[]; removed: string[]; changed: string[] },
  allowedPaths: string[]
): void {
  const isAllowed = (item: string) =>
    allowedPaths.some((allowedPath) =>
      allowedPath.endsWith('*')
        ? item.startsWith(allowedPath.slice(0, -1))
        : item === allowedPath
    );
  const unexpected = [...diff.added, ...diff.removed, ...diff.changed].filter((item) => !isAllowed(item));
  if (unexpected.length) {
    throw new Error(`Unexpected file mutations detected: ${unexpected.join(', ')}`);
  }
}

export function expectNoTerminalCorruption(output: string): void {
  const unexpectedControlChars = [...output]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && char !== '\n' && char !== '\r' && char !== '\t') || code === 127;
    })
    .map((char) => JSON.stringify(char));

  if (unexpectedControlChars.length > 0) {
    throw new Error(`Unexpected terminal control characters detected: ${unexpectedControlChars.join(', ')}`);
  }

  if (output.includes('\u001b') || output.includes('\u0000') || output.includes('�')) {
    throw new Error('Unexpected terminal corruption markers detected in command output');
  }
}

export async function writeFileUnder(rootDir: string, relativePath: string, content: string): Promise<string> {
  const target = join(rootDir, relativePath);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, content, 'utf-8');
  return target;
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export async function removePath(targetPath: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if ((error?.code === 'EBUSY' || error?.code === 'ENOTEMPTY') && attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw error;
    }
  }
}
