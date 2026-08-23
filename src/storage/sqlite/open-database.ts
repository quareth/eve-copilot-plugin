import Database from 'better-sqlite3';
import { existsSync, lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Clock } from '../../application/ports/clock.js';
import { AppError } from '../../domain/errors.js';
import { ensurePrivateDirectory, restrictPrivateFile } from '../file-permissions.js';
import { SqliteDatabaseHandle, type DatabaseHandle } from './database-handle.js';
import { runMigrations } from './migrate.js';

export function openDatabase(input: {
  readonly path: string;
  readonly busyTimeoutMs: number;
  readonly clock: Clock;
}): DatabaseHandle {
  ensurePrivateDirectory(dirname(input.path));
  const databaseExisted = existsSync(input.path);
  let db: Database.Database | undefined;
  try {
    if (databaseExisted && lstatSync(input.path).isSymbolicLink()) {
      throw new AppError({
        code: 'DATABASE_UNAVAILABLE',
        safeMessage: 'The configured database file cannot be a symbolic link.',
      });
    }
    db = new Database(input.path, { timeout: input.busyTimeoutMs });
    if (!databaseExisted) restrictPrivateFile(input.path);
    db.pragma(`busy_timeout = ${String(input.busyTimeoutMs)}`);
    retryWhileBusy(() => db?.pragma('journal_mode = WAL'), input.busyTimeoutMs);
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    if (foreignKeys !== 1) throw new Error('SQLite foreign-key enforcement is unavailable.');
    runMigrations(db, input.clock);
    return new SqliteDatabaseHandle(db, input.path);
  } catch (error) {
    if (db?.open === true) db.close();
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'The local database could not be opened.',
      cause: error,
    });
  }
}

function retryWhileBusy<T>(operation: () => T, timeoutMs: number): T {
  const deadline = Date.now() + timeoutMs;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      return operation();
    } catch (error) {
      const code = (error as { readonly code?: unknown }).code;
      if ((code !== 'SQLITE_BUSY' && code !== 'SQLITE_LOCKED') || Date.now() >= deadline) throw error;
      Atomics.wait(sleeper, 0, 0, Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }
}
