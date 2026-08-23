import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectDatabase } from '../../../src/storage/sqlite/integrity-check.js';
import { runMigrations, type Migration } from '../../../src/storage/sqlite/migrate.js';
import { foundationMigration } from '../../../src/storage/sqlite/migrations/0001_foundation.js';
import { MIGRATIONS } from '../../../src/storage/sqlite/migrations/index.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import { SqliteSystemStateRepository } from '../../../src/storage/sqlite/system-state-repository.js';
import { FixedClock } from '../../helpers/fakes.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-db-'));
  directories.push(directory);
  return join(directory, 'state.db');
}

describe('SQLite foundation', () => {
  it('opens a migrated WAL database with foreign keys', () => {
    const handle = openDatabase({ path: databasePath(), busyTimeoutMs: 5000, clock: new FixedClock() });
    expect(inspectDatabase(handle, true)).toEqual({
      quickCheck: 'ok',
      journalMode: 'wal',
      foreignKeys: true,
      schemaVersion: 5,
    });
    expect(handle.raw.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(5);
    handle.close();
    handle.close();
  });

  it('repeats migrations without changing history', () => {
    const handle = openDatabase({ path: databasePath(), busyTimeoutMs: 5000, clock: new FixedClock() });
    expect(runMigrations(handle.raw, new FixedClock())).toBe(5);
    expect(handle.raw.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(5);
    handle.close();
  });

  it('splits legacy mail action plans into least-privilege families', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, new FixedClock(), MIGRATIONS.slice(0, 4));
    db.prepare(`
      INSERT INTO characters (
        character_id, verified_name, status, credential_reference,
        authorization_generation, created_at, updated_at, last_verified_at
      ) VALUES (1, 'Migration Pilot', 'connected', 'migration-credential', 1, ?, ?, ?)
    `).run('2026-08-20T10:00:00.000Z', '2026-08-20T10:00:00.000Z', '2026-08-20T10:00:00.000Z');
    const insert = db.prepare(`
      INSERT INTO action_plans (
        plan_id, capability_id, operation_id, action_family, character_id,
        authorization_generation, arguments_json, argument_digest,
        confirmation_digest, summary_json, required_scopes_json,
        required_roles_json, state, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'mail_write', 1, 1, '{}', ?, ?, '{}', '[]', '[]',
        'planned', ?, ?, ?)
    `);
    const timestamp = '2026-08-20T10:00:00.000Z';
    insert.run('send-plan', 'esi.post_characters_character_id_mail',
      'PostCharactersCharacterIdMail', 'a'.repeat(64), 'b'.repeat(64), timestamp, timestamp, timestamp);
    insert.run('organize-plan', 'esi.put_characters_character_id_mail_mail_id',
      'PutCharactersCharacterIdMailMailId', 'c'.repeat(64), 'd'.repeat(64), timestamp, timestamp, timestamp);

    runMigrations(db, new FixedClock());

    expect(db.prepare('SELECT plan_id, action_family FROM action_plans ORDER BY plan_id').all()).toEqual([
      { plan_id: 'organize-plan', action_family: 'mail_organize' },
      { plan_id: 'send-plan', action_family: 'mail_send' },
    ]);
    db.close();
  });

  it('rejects migration checksum drift', () => {
    const path = databasePath();
    const handle = openDatabase({ path, busyTimeoutMs: 5000, clock: new FixedClock() });
    handle.raw.prepare("UPDATE schema_migrations SET checksum = 'bad' WHERE id = 1").run();
    handle.close();
    expect(() => openDatabase({ path, busyTimeoutMs: 5000, clock: new FixedClock() }))
      .toThrow(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }));
  });

  it('rolls back a failed migration completely', () => {
    const db = new Database(':memory:');
    const failing: Migration = {
      id: 2,
      name: 'failing',
      checksum: 'a'.repeat(64),
      up(database): void {
        database.exec('CREATE TABLE must_rollback (id INTEGER PRIMARY KEY)');
        throw new Error('injected failure');
      },
    };
    expect(() => runMigrations(db, new FixedClock(), [foundationMigration, failing]))
      .toThrow(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }));
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'must_rollback'").get()).toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get()).toBeUndefined();
    db.close();
  });

  it('validates and preserves system state', () => {
    const handle = openDatabase({ path: databasePath(), busyTimeoutMs: 5000, clock: new FixedClock() });
    const repository = new SqliteSystemStateRepository(handle);
    const first = repository.initializeInstallation({
      installationId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-08-20T10:00:00.000Z',
    });
    const second = repository.initializeInstallation({
      installationId: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-08-21T10:00:00.000Z',
    });
    expect(second).toEqual(first);
    repository.setLastCleanShutdown({ at: '2026-08-20T11:00:00.000Z', version: '0.1.0' });
    expect(repository.getLastCleanShutdown()).toEqual({
      at: '2026-08-20T11:00:00.000Z',
      version: '0.1.0',
    });
    handle.close();
  });

  it.skipIf(process.platform === 'win32')('rejects a symbolic-link database target', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-db-link-'));
    directories.push(directory);
    const target = join(directory, 'target.db');
    const link = join(directory, 'linked.db');
    writeFileSync(target, '', { mode: 0o600 });
    symlinkSync(target, link);
    expect(() => openDatabase({ path: link, busyTimeoutMs: 5000, clock: new FixedClock() }))
      .toThrow(expect.objectContaining({ code: 'DATABASE_UNAVAILABLE' }));
  });
});
