import type {
  ContinuationRepository,
  ContinuationState,
} from '../../application/ports/continuation-repository.js';
import type { JsonValue } from '../../domain/json.js';
import type { DatabaseHandle } from './database-handle.js';

interface ContinuationRow {
  readonly continuation_id: string;
  readonly capability_id: string;
  readonly arguments_json: string;
  readonly item_offset: number;
  readonly page_number: number;
  readonly character_id: number | null;
  readonly authorization_generation: number | null;
  readonly expires_at: string;
  readonly created_at: string;
}

export class SqliteContinuationRepository implements ContinuationRepository {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  find(continuationId: string): ContinuationState | null {
    const row = this.#database.raw.prepare(
      'SELECT * FROM continuation_state WHERE continuation_id = ?',
    ).get(continuationId) as ContinuationRow | undefined;
    return row === undefined ? null : mapRow(row);
  }

  put(state: ContinuationState): void {
    this.#database.raw.prepare(`
      INSERT INTO continuation_state (
        continuation_id, capability_id, arguments_json, item_offset,
        page_number, character_id, authorization_generation, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(continuation_id) DO NOTHING
    `).run(
      state.continuationId,
      state.capabilityId,
      JSON.stringify(state.arguments),
      state.itemOffset,
      state.pageNumber,
      state.characterId,
      state.authorizationGeneration,
      state.expiresAt,
      state.createdAt,
    );
  }

  remove(continuationId: string): boolean {
    return this.#database.raw.prepare(
      'DELETE FROM continuation_state WHERE continuation_id = ?',
    ).run(continuationId).changes > 0;
  }

  removeExpired(now: string): number {
    return this.#database.raw.prepare(
      'DELETE FROM continuation_state WHERE expires_at <= ?',
    ).run(now).changes;
  }

  invalidateCharacter(characterId: number): number {
    return this.#database.raw.prepare(
      'DELETE FROM continuation_state WHERE character_id = ?',
    ).run(characterId).changes;
  }
}

function mapRow(row: ContinuationRow): ContinuationState {
  const argumentsValue = JSON.parse(row.arguments_json) as unknown;
  if (!isJsonObject(argumentsValue)) throw new Error('Stored continuation arguments are invalid.');
  return Object.freeze({
    continuationId: row.continuation_id,
    capabilityId: row.capability_id,
    arguments: argumentsValue,
    itemOffset: row.item_offset,
    pageNumber: row.page_number,
    characterId: row.character_id,
    authorizationGeneration: row.authorization_generation,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  });
}

function isJsonObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
