import type Database from 'better-sqlite3';
import type { CharacterRepository } from '../../application/ports/character-repository.js';
import type { ConnectedCharacter, VerifiedCharacterInput } from '../../domain/character.js';
import { assertCharacterId, normalizeScopes } from '../../domain/character.js';
import { AppError } from '../../domain/errors.js';
import type { DatabaseHandle } from './database-handle.js';

interface CharacterRow {
  readonly character_id: number;
  readonly verified_name: string;
  readonly status: ConnectedCharacter['status'];
  readonly credential_reference: string;
  readonly authorization_generation: number;
  readonly selected: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_verified_at: string;
}

export class SqliteCharacterRepository implements CharacterRepository {
  readonly #db: Database.Database;

  constructor(database: DatabaseHandle) {
    this.#db = database.raw;
  }

  list(): readonly ConnectedCharacter[] {
    const rows = this.#db.prepare(`
      SELECT c.*, CASE WHEN s.character_id IS NULL THEN 0 ELSE 1 END AS selected
      FROM characters c
      LEFT JOIN character_selection s ON s.character_id = c.character_id
      ORDER BY lower(c.verified_name), c.character_id
    `).all() as CharacterRow[];
    return rows.map((row) => this.#map(row));
  }

  find(characterId: number): ConnectedCharacter | null {
    assertCharacterId(characterId);
    const row = this.#db.prepare(`
      SELECT c.*, CASE WHEN s.character_id IS NULL THEN 0 ELSE 1 END AS selected
      FROM characters c
      LEFT JOIN character_selection s ON s.character_id = c.character_id
      WHERE c.character_id = ?
    `).get(characterId) as CharacterRow | undefined;
    return row === undefined ? null : this.#map(row);
  }

  selected(): ConnectedCharacter | null {
    const row = this.#db.prepare(`
      SELECT c.*, 1 AS selected
      FROM character_selection s
      JOIN characters c ON c.character_id = s.character_id
      WHERE s.singleton = 1
    `).get() as CharacterRow | undefined;
    return row === undefined ? null : this.#map(row);
  }

  connect(input: VerifiedCharacterInput): ConnectedCharacter {
    this.#validateInput(input);
    const scopes = normalizeScopes(input.grantedScopes);
    return this.#transaction(() => {
      if (this.#findRaw(input.characterId) !== undefined) {
        throw new AppError({
          code: 'AMBIGUOUS_INPUT',
          safeMessage: 'This character is already connected. Reauthorize it instead.',
          details: { character_id: input.characterId, next_step: 'Call reauthorize_character.' },
        });
      }
      this.#db.prepare(`
        INSERT INTO characters (
          character_id, verified_name, status, credential_reference,
          authorization_generation, created_at, updated_at, last_verified_at
        ) VALUES (?, ?, 'connected', ?, 1, ?, ?, ?)
      `).run(
        input.characterId,
        input.verifiedName,
        input.credentialReference,
        input.verifiedAt,
        input.verifiedAt,
        input.verifiedAt,
      );
      this.#writeScopes(input.characterId, scopes, input.verifiedAt);
      const hasSelection = this.#db.prepare(
        'SELECT 1 FROM character_selection WHERE singleton = 1',
      ).get() !== undefined;
      if (!hasSelection) {
        this.#db.prepare(`
          INSERT INTO character_selection (singleton, character_id, selected_at)
          VALUES (1, ?, ?)
        `).run(input.characterId, input.verifiedAt);
      }
      return this.#required(input.characterId);
    });
  }

  replaceGrant(input: VerifiedCharacterInput): {
    readonly character: ConnectedCharacter;
    readonly previousCredentialReference: string;
  } {
    this.#validateInput(input);
    const scopes = normalizeScopes(input.grantedScopes);
    return this.#transaction(() => {
      const previous = this.#findRaw(input.characterId);
      if (previous === undefined) {
        throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
      }
      this.#db.prepare(`
        UPDATE characters
        SET verified_name = ?, status = 'connected', credential_reference = ?,
            authorization_generation = authorization_generation + 1,
            updated_at = ?, last_verified_at = ?
        WHERE character_id = ?
      `).run(
        input.verifiedName,
        input.credentialReference,
        input.verifiedAt,
        input.verifiedAt,
        input.characterId,
      );
      this.#db.prepare('DELETE FROM character_scopes WHERE character_id = ?').run(input.characterId);
      this.#writeScopes(input.characterId, scopes, input.verifiedAt);
      this.#db.prepare('DELETE FROM esi_cache_entries WHERE character_id = ?').run(input.characterId);
      this.#db.prepare('DELETE FROM continuation_state WHERE character_id = ?').run(input.characterId);
      return {
        character: this.#required(input.characterId),
        previousCredentialReference: previous.credential_reference,
      };
    });
  }

  recordRefresh(input: {
    readonly characterId: number;
    readonly verifiedName: string;
    readonly grantedScopes: readonly string[];
    readonly verifiedAt: string;
  }): ConnectedCharacter {
    assertCharacterId(input.characterId);
    if (input.verifiedName.trim().length === 0 || input.verifiedName.length > 256) {
      throw new TypeError('Verified character name is invalid.');
    }
    const scopes = normalizeScopes(input.grantedScopes);
    return this.#transaction(() => {
      const current = this.#findRaw(input.characterId);
      if (current === undefined) {
        throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
      }
      if (current.status === 'removal_pending') {
        throw new AppError({
          code: 'CREDENTIAL_REMOVAL_PENDING',
          safeMessage: 'The character is being disconnected.',
          details: { character_id: input.characterId },
        });
      }
      this.#db.prepare(`
        UPDATE characters
        SET verified_name = ?, status = 'connected', updated_at = ?, last_verified_at = ?
        WHERE character_id = ?
      `).run(input.verifiedName, input.verifiedAt, input.verifiedAt, input.characterId);
      this.#db.prepare('DELETE FROM character_scopes WHERE character_id = ?').run(input.characterId);
      this.#writeScopes(input.characterId, scopes, input.verifiedAt);
      return this.#required(input.characterId);
    });
  }

  select(characterId: number, selectedAt: string): ConnectedCharacter {
    assertCharacterId(characterId);
    return this.#transaction(() => {
      const character = this.#findRaw(characterId);
      if (character === undefined) {
        throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
      }
      if (character.status === 'reauthorization_required') {
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'The character must be reauthorized before selection.',
          details: { character_id: characterId, next_step: 'Call reauthorize_character.' },
        });
      }
      if (character.status !== 'connected') {
        throw new AppError({
          code: 'CREDENTIAL_REMOVAL_PENDING',
          safeMessage: 'The character is being disconnected and cannot be selected.',
          details: { character_id: characterId },
        });
      }
      this.#db.prepare(`
        INSERT INTO character_selection (singleton, character_id, selected_at)
        VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET
          character_id = excluded.character_id,
          selected_at = excluded.selected_at
      `).run(characterId, selectedAt);
      return this.#required(characterId);
    });
  }

  markReauthorizationRequired(characterId: number, updatedAt: string): ConnectedCharacter {
    assertCharacterId(characterId);
    const result = this.#db.prepare(`
      UPDATE characters
      SET status = 'reauthorization_required', updated_at = ?
      WHERE character_id = ? AND status <> 'removal_pending'
    `).run(updatedAt, characterId);
    if (result.changes === 0) return this.#required(characterId);
    return this.#required(characterId);
  }

  beginRemoval(characterId: number, updatedAt: string): {
    readonly character: ConnectedCharacter;
    readonly selectionCleared: boolean;
  } {
    assertCharacterId(characterId);
    return this.#transaction(() => {
      if (this.#findRaw(characterId) === undefined) {
        throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
      }
      const selectionResult = this.#db.prepare(
        'DELETE FROM character_selection WHERE character_id = ?',
      ).run(characterId);
      this.#db.prepare(`
        UPDATE characters
        SET status = 'removal_pending', authorization_generation = authorization_generation + 1,
            updated_at = ?
        WHERE character_id = ?
      `).run(updatedAt, characterId);
      this.#db.prepare('DELETE FROM esi_cache_entries WHERE character_id = ?').run(characterId);
      this.#db.prepare('DELETE FROM continuation_state WHERE character_id = ?').run(characterId);
      return {
        character: this.#required(characterId),
        selectionCleared: selectionResult.changes > 0,
      };
    });
  }

  completeRemoval(characterId: number): boolean {
    assertCharacterId(characterId);
    const result = this.#db.prepare(`
      DELETE FROM characters WHERE character_id = ? AND status = 'removal_pending'
    `).run(characterId);
    return result.changes > 0;
  }

  #required(characterId: number): ConnectedCharacter {
    const result = this.find(characterId);
    if (result === null) {
      throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
    }
    return result;
  }

  #findRaw(characterId: number): CharacterRow | undefined {
    return this.#db.prepare(`
      SELECT c.*, CASE WHEN s.character_id IS NULL THEN 0 ELSE 1 END AS selected
      FROM characters c
      LEFT JOIN character_selection s ON s.character_id = c.character_id
      WHERE c.character_id = ?
    `).get(characterId) as CharacterRow | undefined;
  }

  #map(row: CharacterRow): ConnectedCharacter {
    const scopes = this.#db.prepare(`
      SELECT scope FROM character_scopes WHERE character_id = ? ORDER BY scope
    `).pluck().all(row.character_id) as string[];
    return Object.freeze({
      characterId: row.character_id,
      verifiedName: row.verified_name,
      status: row.status,
      credentialReference: row.credential_reference,
      authorizationGeneration: row.authorization_generation,
      grantedScopes: Object.freeze(scopes),
      selected: row.selected === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastVerifiedAt: row.last_verified_at,
    });
  }

  #writeScopes(characterId: number, scopes: readonly string[], grantedAt: string): void {
    const statement = this.#db.prepare(`
      INSERT INTO character_scopes (character_id, scope, granted_at) VALUES (?, ?, ?)
    `);
    for (const scope of scopes) statement.run(characterId, scope, grantedAt);
  }

  #validateInput(input: VerifiedCharacterInput): void {
    assertCharacterId(input.characterId);
    if (input.verifiedName.trim().length === 0 || input.verifiedName.length > 256) {
      throw new TypeError('Verified character name is invalid.');
    }
    if (input.credentialReference.length === 0 || input.credentialReference.length > 128) {
      throw new TypeError('Credential reference is invalid.');
    }
  }

  #transaction<T>(operation: () => T): T {
    return this.#db.transaction(operation).immediate();
  }
}
