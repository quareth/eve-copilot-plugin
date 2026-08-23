import type Database from 'better-sqlite3';
import type {
  CredentialCleanupEntry,
  CredentialCleanupRepository,
} from '../../application/ports/credential-cleanup-repository.js';
import type { SecretKind } from '../../application/ports/credential-store.js';
import type { DatabaseHandle } from './database-handle.js';

interface CleanupRow {
  readonly credential_reference: string;
  readonly secret_kind: SecretKind;
  readonly created_at: string;
  readonly attempts: number;
}

export class SqliteCredentialCleanupRepository implements CredentialCleanupRepository {
  readonly #db: Database.Database;
  constructor(database: DatabaseHandle) { this.#db = database.raw; }

  enqueue(reference: string, kind: SecretKind, createdAt: string): void {
    this.#db.prepare(`
      INSERT INTO credential_cleanup (
        credential_reference, secret_kind, created_at, attempts
      ) VALUES (?, ?, ?, 0)
      ON CONFLICT(credential_reference) DO NOTHING
    `).run(reference, kind, createdAt);
  }

  list(limit: number): readonly CredentialCleanupEntry[] {
    const rows = this.#db.prepare(`
      SELECT credential_reference, secret_kind, created_at, attempts
      FROM credential_cleanup ORDER BY created_at, credential_reference LIMIT ?
    `).all(limit) as CleanupRow[];
    return rows.map((row) => Object.freeze({
      reference: row.credential_reference,
      kind: row.secret_kind,
      createdAt: row.created_at,
      attempts: row.attempts,
    }));
  }

  markAttempt(reference: string, attemptedAt: string): void {
    this.#db.prepare(`
      UPDATE credential_cleanup
      SET attempts = attempts + 1, last_attempt_at = ?
      WHERE credential_reference = ?
    `).run(attemptedAt, reference);
  }

  remove(reference: string): boolean {
    return this.#db.prepare(
      'DELETE FROM credential_cleanup WHERE credential_reference = ?',
    ).run(reference).changes > 0;
  }
}
