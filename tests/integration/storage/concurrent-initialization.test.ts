import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('concurrent database initialization', () => {
  it('allows two local MCP processes to share first-run initialization', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-concurrent-'));
    directories.push(directory);
    const path = join(directory, 'state.db');
    const fixture = fileURLToPath(new URL('../../fixtures/open-database-worker.ts', import.meta.url));

    await Promise.all([runWorker(fixture, path), runWorker(fixture, path)]);

    const db = new Database(path, { readonly: true });
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(5);
    expect(db.prepare("SELECT COUNT(*) FROM system_state WHERE key = 'installation'").pluck().get()).toBe(1);
    expect(db.pragma('quick_check', { simple: true })).toBe('ok');
    db.close();
  });
});

function runWorker(fixture: string, database: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fixture, database], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Worker exited with ${String(code)}: ${stderr}`));
    });
  });
}
