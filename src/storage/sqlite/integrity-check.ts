import type { DatabaseHandle } from './database-handle.js';

export interface DatabaseInspection {
  readonly quickCheck: 'ok' | 'failed';
  readonly journalMode: string;
  readonly foreignKeys: boolean;
  readonly schemaVersion: number;
}

export function inspectDatabase(database: DatabaseHandle, full = false): DatabaseInspection {
  const quick = full
    ? database.raw.pragma('quick_check', { simple: true })
    : database.raw.prepare('SELECT 1').pluck().get();
  return {
    quickCheck: quick === 'ok' || quick === 1 ? 'ok' : 'failed',
    journalMode: String(database.raw.pragma('journal_mode', { simple: true })).toLowerCase(),
    foreignKeys: database.raw.pragma('foreign_keys', { simple: true }) === 1,
    schemaVersion: Number(database.raw.pragma('user_version', { simple: true })),
  };
}
