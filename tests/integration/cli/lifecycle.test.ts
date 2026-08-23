import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe.skipIf(process.platform === 'win32')('serve lifecycle process behavior', () => {
  it.each([1, 2])('shuts down cleanly and idempotently after %i termination signal(s)', async (signals) => {
    const dataDir = await createTemporaryDirectory();
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      'src/cli/main.ts',
      'serve',
      '--data-dir',
      dataDir,
      '--log-level',
      'info',
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    const started = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timed out.'));
      }, 5_000);
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        if (stderr.includes('server_started')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await started;
    for (let index = 0; index < signals; index += 1) child.kill('SIGTERM');
    const outcome = await waitForExit(child);

    expect(outcome).toEqual({ code: 0, signal: null });
    expect(stdout).toBe('');
    expect(stderr).toContain('shutdown_started');
    expect(stderr).toContain('shutdown_completed');
    expect(stderr.match(/shutdown_completed/gu)).toHaveLength(1);

    const database = new Database(join(dataDir, 'eve-copilot.db'), { readonly: true });
    try {
      const row = database.prepare(`
        SELECT value_json FROM system_state WHERE key = 'last_clean_shutdown'
      `).get() as { readonly value_json: string } | undefined;
      expect(row).toBeDefined();
      expect(JSON.parse(row?.value_json ?? '{}')).toMatchObject({ version: '0.1.5' });
    } finally {
      database.close();
    }
  }, 10_000);
});

describe('CLI failure exit codes', () => {
  it('uses exit code 2 for invalid configuration', async () => {
    const result = await runChild(['invalid-command']);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Configuration error:');
  });

  it('uses exit code 3 for a database startup failure', async () => {
    const root = await createTemporaryDirectory();
    const filePath = join(root, 'invalid.db');
    await writeFile(filePath, 'not a sqlite database', 'utf8');
    const result = await runChild([
      'doctor',
      '--data-dir',
      root,
      '--database',
      filePath,
    ]);
    expect(result.code).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('The local database could not be opened.');
    expect(result.stderr).not.toContain(filePath);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'eve-copilot-lifecycle-'));
  temporaryDirectories.push(path);
  return path;
}

async function runChild(args: readonly string[]): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/main.ts', ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const { code } = await waitForExit(child);
  return { code, stdout, stderr };
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Child process did not exit within the deadline.'));
    }, 5_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}
