import type Database from 'better-sqlite3';
import type {
  CoordinationLease,
  CoordinationLeaseRepository,
} from '../../application/ports/coordination-lease-repository.js';
import type { DatabaseHandle } from './database-handle.js';

interface LeaseRow {
  readonly lease_key: string;
  readonly owner_id: string;
  readonly acquired_at: string;
  readonly expires_at: string;
  readonly attempt: number;
}

export class SqliteCoordinationLeaseRepository implements CoordinationLeaseRepository {
  readonly #db: Database.Database;
  constructor(database: DatabaseHandle) { this.#db = database.raw; }

  acquire(key: string, ownerId: string, now: string, expiresAt: string): CoordinationLease | null {
    assertValue(key, 256);
    assertValue(ownerId, 128);
    return this.#db.transaction(() => {
      const existing = this.#db.prepare(
        'SELECT * FROM coordination_leases WHERE lease_key = ?',
      ).get(key) as LeaseRow | undefined;
      if (existing !== undefined && existing.expires_at > now && existing.owner_id !== ownerId) return null;
      const attempt = (existing?.attempt ?? 0) + 1;
      this.#db.prepare(`
        INSERT INTO coordination_leases (lease_key, owner_id, acquired_at, expires_at, attempt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(lease_key) DO UPDATE SET
          owner_id = excluded.owner_id,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at,
          attempt = excluded.attempt
      `).run(key, ownerId, now, expiresAt, attempt);
      return Object.freeze({ key, ownerId, acquiredAt: now, expiresAt, attempt });
    }).immediate();
  }

  renew(key: string, ownerId: string, expiresAt: string): boolean {
    return this.#db.prepare(`
      UPDATE coordination_leases SET expires_at = ? WHERE lease_key = ? AND owner_id = ?
    `).run(expiresAt, key, ownerId).changes === 1;
  }

  release(key: string, ownerId: string): boolean {
    return this.#db.prepare(
      'DELETE FROM coordination_leases WHERE lease_key = ? AND owner_id = ?',
    ).run(key, ownerId).changes === 1;
  }

  removeExpired(now: string): number {
    return this.#db.prepare('DELETE FROM coordination_leases WHERE expires_at <= ?').run(now).changes;
  }
}

function assertValue(value: string, maximum: number): void {
  if (value.length === 0 || value.length > maximum) throw new TypeError('Coordination lease value is invalid.');
}
