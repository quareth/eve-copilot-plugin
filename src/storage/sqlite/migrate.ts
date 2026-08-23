import type Database from 'better-sqlite3';
import type { Clock } from '../../application/ports/clock.js';
import { AppError } from '../../domain/errors.js';
import { DATABASE_SCHEMA_VERSION } from '../../domain/versions.js';
import { MIGRATIONS } from './migrations/index.js';

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly checksum: string;
  up(db: Database.Database): void;
}

interface MigrationRow {
  readonly id: number;
  readonly name: string;
  readonly checksum: string;
}

export function runMigrations(
  db: Database.Database,
  clock: Clock,
  migrations: readonly Migration[] = MIGRATIONS,
): number {
  validateMigrationDefinitions(migrations);
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        checksum    TEXT NOT NULL,
        applied_at  TEXT NOT NULL
      )
    `);
    const rows = db.prepare('SELECT id, name, checksum FROM schema_migrations ORDER BY id').all() as MigrationRow[];
    const applied = new Map(rows.map((row) => [row.id, row]));

    for (const migration of migrations) {
      const existing = applied.get(migration.id);
      if (existing !== undefined) {
        if (existing.name !== migration.name || existing.checksum !== migration.checksum) {
          throw new AppError({
            code: 'DATABASE_UNAVAILABLE',
            safeMessage: `Database migration ${String(migration.id)} does not match this application build.`,
          });
        }
        continue;
      }
      migration.up(db);
      db.prepare(`
        INSERT INTO schema_migrations (id, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(migration.id, migration.name, migration.checksum, clock.now().toISOString());
    }
    db.pragma(`user_version = ${String(DATABASE_SCHEMA_VERSION)}`);
    db.exec('COMMIT');
    return DATABASE_SCHEMA_VERSION;
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'The local database could not be migrated.',
      cause: error,
    });
  }
}

function validateMigrationDefinitions(migrations: readonly Migration[]): void {
  let previous = 0;
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.id) || migration.id <= previous) {
      throw new Error('Migration IDs must be positive and strictly increasing.');
    }
    if (names.has(migration.name)) throw new Error(`Duplicate migration name: ${migration.name}`);
    if (!/^[a-f0-9]{64}$/u.test(migration.checksum)) {
      throw new Error(`Invalid migration checksum: ${migration.name}`);
    }
    previous = migration.id;
    names.add(migration.name);
  }
}
