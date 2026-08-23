import type Database from 'better-sqlite3';
import type {
  EsiCacheEntry,
  EsiCacheRepository,
} from '../../application/ports/esi-cache-repository.js';
import type { EsiOperationId } from '../../domain/esi.js';
import type { DatabaseHandle } from './database-handle.js';

interface CacheRow {
  readonly cache_key: string;
  readonly operation_id: EsiOperationId;
  readonly compatibility_date: string;
  readonly character_id: number | null;
  readonly authorization_generation: number | null;
  readonly request_variant_hash: Uint8Array;
  readonly response_status: number;
  readonly etag: string | null;
  readonly last_modified: string | null;
  readonly fresh_until: string;
  readonly stale_until: string | null;
  readonly validated_payload_json: string;
  readonly byte_size: number;
  readonly accessed_at: string;
  readonly created_at: string;
}

export class SqliteEsiCacheRepository implements EsiCacheRepository {
  readonly #db: Database.Database;

  constructor(database: DatabaseHandle) {
    this.#db = database.raw;
  }

  find(cacheKey: string, accessedAt: string): EsiCacheEntry | null {
    const row = this.#db.prepare(
      'SELECT * FROM esi_cache_entries WHERE cache_key = ?',
    ).get(cacheKey) as CacheRow | undefined;
    if (row === undefined) return null;
    this.#db.prepare(
      'UPDATE esi_cache_entries SET accessed_at = ? WHERE cache_key = ?',
    ).run(accessedAt, cacheKey);
    return this.#map({ ...row, accessed_at: accessedAt });
  }

  put(entry: EsiCacheEntry): void {
    this.#db.prepare(`
      INSERT INTO esi_cache_entries (
        cache_key, operation_id, compatibility_date, character_id,
        authorization_generation, request_variant_hash, response_status, etag,
        last_modified, fresh_until, stale_until, validated_payload_json,
        byte_size, accessed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        response_status = excluded.response_status,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        fresh_until = excluded.fresh_until,
        stale_until = excluded.stale_until,
        validated_payload_json = excluded.validated_payload_json,
        byte_size = excluded.byte_size,
        accessed_at = excluded.accessed_at,
        created_at = excluded.created_at
    `).run(
      entry.cacheKey, entry.operationId, entry.compatibilityDate, entry.characterId,
      entry.authorizationGeneration, Buffer.from(entry.requestVariantHash), entry.responseStatus,
      entry.etag, entry.lastModified, entry.freshUntil, entry.staleUntil,
      entry.validatedPayloadJson, entry.byteSize, entry.accessedAt, entry.createdAt,
    );
  }

  remove(cacheKey: string): boolean {
    return this.#db.prepare('DELETE FROM esi_cache_entries WHERE cache_key = ?').run(cacheKey).changes > 0;
  }

  invalidateCharacter(characterId: number): number {
    return this.#db.prepare('DELETE FROM esi_cache_entries WHERE character_id = ?').run(characterId).changes;
  }

  pruneTo(maximumBytes: number): number {
    let removed = 0;
    while (this.totalBytes() > maximumBytes) {
      const result = this.#db.prepare(`
        DELETE FROM esi_cache_entries WHERE cache_key = (
          SELECT cache_key FROM esi_cache_entries ORDER BY accessed_at, cache_key LIMIT 1
        )
      `).run();
      if (result.changes === 0) break;
      removed += result.changes;
    }
    return removed;
  }

  totalBytes(): number {
    return this.#db.prepare(
      'SELECT COALESCE(SUM(byte_size), 0) FROM esi_cache_entries',
    ).pluck().get() as number;
  }

  #map(row: CacheRow): EsiCacheEntry {
    return Object.freeze({
      cacheKey: row.cache_key,
      operationId: row.operation_id,
      compatibilityDate: row.compatibility_date,
      characterId: row.character_id,
      authorizationGeneration: row.authorization_generation,
      requestVariantHash: Uint8Array.from(row.request_variant_hash),
      responseStatus: row.response_status,
      etag: row.etag,
      lastModified: row.last_modified,
      freshUntil: row.fresh_until,
      staleUntil: row.stale_until,
      validatedPayloadJson: row.validated_payload_json,
      byteSize: row.byte_size,
      accessedAt: row.accessed_at,
      createdAt: row.created_at,
    });
  }
}
