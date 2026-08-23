import type { ActionAuditRepository } from '../../application/ports/action-audit-repository.js';
import type { ActionAuditEvent } from '../../domain/action-plan.js';
import type { DatabaseHandle } from './database-handle.js';

export class SqliteActionAuditRepository implements ActionAuditRepository {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  append(event: ActionAuditEvent): void {
    this.#database.raw.prepare(`
      INSERT INTO action_audit_events (
        event_id, plan_id, capability_id, operation_id, character_id,
        authorization_generation, state, target_digest, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.planId,
      event.capabilityId,
      event.operationId,
      event.characterId,
      event.authorizationGeneration,
      event.state,
      event.targetDigest,
      event.errorCode,
      event.createdAt,
    );
  }

  prune(before: string, maximumCount: number): number {
    const old = this.#database.raw.prepare(
      'DELETE FROM action_audit_events WHERE created_at < ?',
    ).run(before).changes;
    const excess = this.#database.raw.prepare(`
      DELETE FROM action_audit_events
      WHERE event_id IN (
        SELECT event_id FROM action_audit_events
        ORDER BY created_at DESC, event_id DESC LIMIT -1 OFFSET ?
      )
    `).run(maximumCount).changes;
    return old + excess;
  }
}
