import type Database from 'better-sqlite3';
import type {
  AuthorizationSessionRepository,
  CreateAuthorizationSessionInput,
} from '../../application/ports/authorization-session-repository.js';
import type { AuthorizationSession, AuthorizationSessionState } from '../../domain/authorization.js';
import type { DatabaseHandle } from './database-handle.js';

interface SessionRow {
  readonly session_id: string;
  readonly state_hash: Uint8Array;
  readonly verifier_reference: string;
  readonly reauthorize_character_id: number | null;
  readonly redirect_uri: string;
  readonly requested_scopes_json: string;
  readonly status: AuthorizationSessionState;
  readonly created_at: string;
  readonly expires_at: string;
  readonly consumed_at: string | null;
  readonly terminal_at: string | null;
  readonly connected_character_id: number | null;
  readonly failure_code: string | null;
}

export class SqliteAuthorizationSessionRepository implements AuthorizationSessionRepository {
  readonly #db: Database.Database;

  constructor(database: DatabaseHandle) {
    this.#db = database.raw;
  }

  create(input: CreateAuthorizationSessionInput): AuthorizationSession {
    this.#db.prepare(`
      INSERT INTO authorization_sessions (
        session_id, state_hash, verifier_reference, reauthorize_character_id,
        redirect_uri, requested_scopes_json, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'authorization_required', ?, ?)
    `).run(
      input.sessionId,
      Buffer.from(input.stateHash),
      input.verifierReference,
      input.reauthorizeCharacterId,
      input.redirectUri,
      JSON.stringify(input.requestedScopes),
      input.createdAt,
      input.expiresAt,
    );
    return this.#required(input.sessionId);
  }

  findById(sessionId: string): AuthorizationSession | null {
    const row = this.#db.prepare(
      'SELECT * FROM authorization_sessions WHERE session_id = ?',
    ).get(sessionId) as SessionRow | undefined;
    return row === undefined ? null : this.#map(row);
  }

  consumeByStateHash(stateHash: Uint8Array, consumedAt: string): AuthorizationSession | null {
    return this.#db.transaction(() => {
      const row = this.#db.prepare(`
        SELECT * FROM authorization_sessions
        WHERE state_hash = ? AND status = 'authorization_required' AND expires_at > ?
      `).get(Buffer.from(stateHash), consumedAt) as SessionRow | undefined;
      if (row === undefined) return null;
      const result = this.#db.prepare(`
        UPDATE authorization_sessions
        SET status = 'pending', consumed_at = ?
        WHERE session_id = ? AND status = 'authorization_required'
      `).run(consumedAt, row.session_id);
      return result.changes === 1 ? this.#required(row.session_id) : null;
    }).immediate();
  }

  setTerminal(input: {
    readonly sessionId: string;
    readonly from: 'authorization_required' | 'pending';
    readonly status: Exclude<AuthorizationSessionState, 'authorization_required' | 'pending'>;
    readonly terminalAt: string;
    readonly connectedCharacterId?: number;
    readonly failureCode?: string;
  }): AuthorizationSession | null {
    const result = this.#db.prepare(`
      UPDATE authorization_sessions
      SET status = ?, terminal_at = ?, connected_character_id = ?, failure_code = ?
      WHERE session_id = ? AND status = ?
    `).run(
      input.status,
      input.terminalAt,
      input.connectedCharacterId ?? null,
      input.failureCode ?? null,
      input.sessionId,
      input.from,
    );
    return result.changes === 1 ? this.#required(input.sessionId) : null;
  }

  cancel(sessionId: string, cancelledAt: string): AuthorizationSession | null {
    return this.#db.transaction(() => {
      const current = this.findById(sessionId);
      if (current === null) return null;
      if (current.status === 'cancelled' || current.status === 'connected'
        || current.status === 'failed' || current.status === 'expired'
        || current.status === 'pending') return current;
      this.#db.prepare(`
        UPDATE authorization_sessions
        SET status = 'cancelled', terminal_at = ?
        WHERE session_id = ? AND status = 'authorization_required'
      `).run(cancelledAt, sessionId);
      return this.#required(sessionId);
    }).immediate();
  }

  expire(now: string): readonly AuthorizationSession[] {
    return this.#db.transaction(() => {
      const rows = this.#db.prepare(`
        SELECT * FROM authorization_sessions
        WHERE status IN ('authorization_required', 'pending') AND expires_at <= ?
        ORDER BY created_at, session_id
      `).all(now) as SessionRow[];
      this.#db.prepare(`
        UPDATE authorization_sessions
        SET status = 'expired', terminal_at = ?
        WHERE status IN ('authorization_required', 'pending') AND expires_at <= ?
      `).run(now, now);
      return rows.map((row) => this.#required(row.session_id));
    }).immediate();
  }

  removeTerminalBefore(before: string): number {
    return this.#db.prepare(`
      DELETE FROM authorization_sessions
      WHERE terminal_at IS NOT NULL AND terminal_at < ?
    `).run(before).changes;
  }

  countActive(now: string): number {
    return this.#db.prepare(`
      SELECT COUNT(*) FROM authorization_sessions
      WHERE status IN ('authorization_required', 'pending') AND expires_at > ?
    `).pluck().get(now) as number;
  }

  #required(sessionId: string): AuthorizationSession {
    const session = this.findById(sessionId);
    if (session === null) throw new Error('Authorization session disappeared during transaction.');
    return session;
  }

  #map(row: SessionRow): AuthorizationSession {
    const scopes: unknown = JSON.parse(row.requested_scopes_json);
    if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) {
      throw new Error('Stored authorization scopes are invalid.');
    }
    return Object.freeze({
      sessionId: row.session_id,
      stateHash: Uint8Array.from(row.state_hash),
      verifierReference: row.verifier_reference,
      reauthorizeCharacterId: row.reauthorize_character_id,
      redirectUri: row.redirect_uri,
      requestedScopes: Object.freeze(scopes),
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      terminalAt: row.terminal_at,
      connectedCharacterId: row.connected_character_id,
      failureCode: row.failure_code,
    });
  }
}
