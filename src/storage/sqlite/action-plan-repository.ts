import type { ActionPlanRepository } from '../../application/ports/action-plan-repository.js';
import type { ActionPlan, ActionPlanState } from '../../domain/action-plan.js';
import type { EsiActionFamily } from '../../domain/esi-operation.js';
import type { JsonValue } from '../../domain/json.js';
import type { DatabaseHandle } from './database-handle.js';

interface ActionPlanRow {
  readonly plan_id: string;
  readonly capability_id: string;
  readonly operation_id: string;
  readonly action_family: EsiActionFamily;
  readonly character_id: number;
  readonly authorization_generation: number;
  readonly arguments_json: string;
  readonly argument_digest: string;
  readonly confirmation_digest: string;
  readonly summary_json: string;
  readonly required_scopes_json: string;
  readonly required_roles_json: string;
  readonly state: ActionPlanState;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteActionPlanRepository implements ActionPlanRepository {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  create(plan: ActionPlan): void {
    this.#database.raw.prepare(`
      INSERT INTO action_plans (
        plan_id, capability_id, operation_id, action_family, character_id,
        authorization_generation, arguments_json, argument_digest,
        confirmation_digest, summary_json, required_scopes_json,
        required_roles_json, state, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan.planId,
      plan.capabilityId,
      plan.operationId,
      plan.actionFamily,
      plan.characterId,
      plan.authorizationGeneration,
      JSON.stringify(plan.arguments),
      plan.argumentDigest,
      plan.confirmationDigest,
      JSON.stringify(plan.summary),
      JSON.stringify(plan.requiredScopes),
      JSON.stringify(plan.requiredRoles),
      plan.state,
      plan.expiresAt,
      plan.createdAt,
      plan.updatedAt,
    );
  }

  find(planId: string): ActionPlan | null {
    const row = this.#database.raw.prepare(
      'SELECT * FROM action_plans WHERE plan_id = ?',
    ).get(planId) as ActionPlanRow | undefined;
    return row === undefined ? null : mapRow(row);
  }

  beginExecution(planId: string, now: string): ActionPlan | null {
    const changed = this.#database.raw.prepare(`
      UPDATE action_plans
      SET state = 'executing', updated_at = ?
      WHERE plan_id = ? AND state = 'planned' AND expires_at > ?
    `).run(now, planId, now).changes;
    return changed === 0 ? null : this.find(planId);
  }

  finish(
    planId: string,
    state: Extract<ActionPlanState, 'succeeded' | 'failed' | 'uncertain'>,
    now: string,
  ): boolean {
    return this.#database.raw.prepare(`
      UPDATE action_plans SET state = ?, updated_at = ?
      WHERE plan_id = ? AND state = 'executing'
    `).run(state, now, planId).changes > 0;
  }

  expire(now: string): number {
    return this.#database.raw.prepare(`
      UPDATE action_plans SET state = 'expired', updated_at = ?
      WHERE state = 'planned' AND expires_at <= ?
    `).run(now, now).changes;
  }

  prune(before: string, maximumCount: number): number {
    const old = this.#database.raw.prepare(`
      DELETE FROM action_plans
      WHERE state IN ('succeeded', 'failed', 'uncertain', 'expired') AND updated_at < ?
    `).run(before).changes;
    const excess = this.#database.raw.prepare(`
      DELETE FROM action_plans
      WHERE plan_id IN (
        SELECT plan_id FROM action_plans
        WHERE state IN ('succeeded', 'failed', 'uncertain', 'expired')
        ORDER BY updated_at DESC, plan_id DESC LIMIT -1 OFFSET ?
      )
    `).run(maximumCount).changes;
    return old + excess;
  }

  counts(): Readonly<Record<ActionPlanState, number>> {
    const counts: Record<ActionPlanState, number> = {
      planned: 0,
      executing: 0,
      succeeded: 0,
      failed: 0,
      uncertain: 0,
      expired: 0,
    };
    const rows = this.#database.raw.prepare(
      'SELECT state, COUNT(*) AS count FROM action_plans GROUP BY state',
    ).all() as Array<{ readonly state: ActionPlanState; readonly count: number }>;
    for (const row of rows) counts[row.state] = row.count;
    return Object.freeze(counts);
  }

  invalidateCharacter(characterId: number): number {
    return this.#database.raw.prepare(
      'DELETE FROM action_plans WHERE character_id = ?',
    ).run(characterId).changes;
  }
}

function mapRow(row: ActionPlanRow): ActionPlan {
  return Object.freeze({
    planId: row.plan_id,
    capabilityId: row.capability_id,
    operationId: row.operation_id,
    actionFamily: row.action_family,
    characterId: row.character_id,
    authorizationGeneration: row.authorization_generation,
    arguments: jsonObject(row.arguments_json),
    argumentDigest: row.argument_digest,
    confirmationDigest: row.confirmation_digest,
    summary: jsonObject(row.summary_json),
    requiredScopes: stringArray(row.required_scopes_json),
    requiredRoles: stringArray(row.required_roles_json),
    state: row.state,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function jsonObject(text: string): Readonly<Record<string, JsonValue>> {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored action plan JSON object is invalid.');
  }
  return value as Readonly<Record<string, JsonValue>>;
}

function stringArray(text: string): readonly string[] {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Stored action plan string array is invalid.');
  }
  return Object.freeze(value as string[]);
}
