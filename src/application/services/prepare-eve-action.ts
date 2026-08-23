import type { PrepareEveActionInput, PreparedActionData } from '../dto/actions.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { RequestContext, UseCase } from './use-case.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';
import {
  assertActionScopes,
  assertActionTargetAccess,
  actionServiceContext,
  bindActionCharacter,
  primaryCapability,
  type ActionServiceContext,
  type ActionServiceDependencies,
} from './action-support.js';
import type { ActionAuditEvent, ActionPlan } from '../../domain/action-plan.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { EsiActionFamily, EsiOperationFact } from '../../domain/esi-operation.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import { assertJsonCompatible, type JsonValue } from '../../domain/json.js';
import type { ResultEnvelope } from '../../domain/result.js';

const PLAN_TTL_MS = 5 * 60 * 1_000;

export class PrepareEveAction implements UseCase<PrepareEveActionInput, ResultEnvelope<PreparedActionData>> {
  readonly #action: ActionServiceContext;

  constructor(input: ActionServiceDependencies | ActionServiceContext) {
    this.#action = actionServiceContext(input);
  }

  async execute(
    input: PrepareEveActionInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<PreparedActionData>> {
    throwIfAborted(context.signal);
    const operation = requiredAction(this.#action.catalog, input.capability_id);
    this.#assertEnabled(operation);
    const character = requireSelectedCharacter(this.#action.characters.selected());
    assertActionScopes(operation, character);
    const rawArguments = bindActionCharacter(operation, input.arguments, character);
    const validated = this.#action.actions.validateAction({ operation, arguments: rawArguments });
    await assertActionTargetAccess({
      operation,
      arguments: validated,
      character,
      catalog: this.#action.catalog,
      reads: this.#action.reads,
      signal: context.signal,
    });
    const now = this.#action.clock.now();
    this.#action.plans.expire(now.toISOString());
    this.#action.plans.prune(new Date(now.getTime() - 30 * 86_400_000).toISOString(), 10_000);
    const planId = this.#action.idGenerator.next();
    const confirmation = this.#action.idGenerator.next();
    const summary = actionSummary(operation, validated);
    const targetDigest = this.#action.digest.hex(canonicalJson(summary));
    const plan: ActionPlan = Object.freeze({
      planId,
      capabilityId: input.capability_id,
      operationId: operation.operationId,
      actionFamily: requiredFamily(operation),
      characterId: character.characterId,
      authorizationGeneration: character.authorizationGeneration,
      arguments: validated,
      argumentDigest: this.#action.digest.hex(canonicalJson(validated)),
      confirmationDigest: this.#action.digest.hex(confirmation),
      summary,
      requiredScopes: operation.authorizationScopes,
      requiredRoles: operation.requiredRoles,
      state: 'planned',
      expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    this.#action.plans.create(plan);
    this.#action.audit.append(auditEvent({
      idGenerator: this.#action.idGenerator,
      plan,
      state: 'planned',
      targetDigest,
      now: now.toISOString(),
      errorCode: null,
    }));
    this.#action.audit.prune(new Date(now.getTime() - 30 * 86_400_000).toISOString(), 10_000);
    const response: ResultEnvelope<PreparedActionData> = Object.freeze({
      schema_version: 1,
      request_id: context.requestId,
      character: { id: character.characterId, name: character.verifiedName },
      data: Object.freeze({
        plan_id: planId,
        confirmation,
        capability_id: input.capability_id,
        operation_id: operation.operationId,
        character: { id: character.characterId, name: character.verifiedName },
        effect: summary,
        required_scopes: operation.authorizationScopes,
        expires_at: plan.expiresAt,
        irreversible: isIrreversible(operation),
      }),
      source: { kind: 'local' as const, name: 'EVE Copilot MCP action planner' },
      retrieved_at: now.toISOString(),
      expires_at: plan.expiresAt,
      cache: 'not_applicable',
      estimated: false,
      partial: false,
      warnings: [],
    });
    return response;
  }

  #assertEnabled(operation: EsiOperationFact): void {
    const family = requiredFamily(operation);
    if (!this.#action.enabled(family)) {
      throw new AppError({
        code: 'ACTION_DISABLED',
        safeMessage: 'This EVE action family is disabled locally.',
        details: {
          capability_id: primaryCapability(operation),
          next_step: `Enable actions and the ${family} family in local configuration, then restart the server.`,
        },
      });
    }
  }
}

export function requiredAction(catalog: EsiOperationCatalog, capabilityId: string): EsiOperationFact {
  const operation = catalog.findCapability(capabilityId);
  if (operation === null) {
    throw new AppError({
      code: 'CAPABILITY_UNAVAILABLE',
      safeMessage: 'The requested EVE action capability is not registered.',
      details: { capability_id: capabilityId, next_step: 'Call find_eve_capabilities first.' },
    });
  }
  if (operation.operationClass !== 'action') {
    throw new AppError({
      code: 'CAPABILITY_UNAVAILABLE',
      safeMessage: 'The requested capability is a read and does not use action planning.',
    });
  }
  return operation;
}

export function requiredFamily(operation: EsiOperationFact): EsiActionFamily {
  if (operation.actionFamily === null) throw new Error(`Action has no family: ${operation.operationId}`);
  return operation.actionFamily;
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    const entries = value as readonly JsonValue[];
    return `[${entries.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Readonly<Record<string, JsonValue>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key] ?? null)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function actionSummary(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const targets: Record<string, JsonValue> = {};
  collectTargets(argumentsValue, targets, '');
  const summary: Readonly<Record<string, JsonValue>> = Object.freeze({
    action: operation.summary,
    method: operation.method,
    targets: Object.freeze(targets),
    externally_visible: true,
  });
  assertJsonCompatible(summary);
  return summary;
}

function collectTargets(
  value: Readonly<Record<string, JsonValue>>,
  targets: Record<string, JsonValue>,
  prefix: string,
): void {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (/(?:^|_)(?:id|ids)$/u.test(key)) {
      targets[path] = entry;
      continue;
    }
    if (Array.isArray(entry)) {
      targets[`${path}.count`] = entry.length;
      continue;
    }
    if (typeof entry === 'object' && entry !== null) {
      collectTargets(entry as Readonly<Record<string, JsonValue>>, targets, path);
    }
  }
}

function isIrreversible(operation: EsiOperationFact): boolean {
  return operation.method === 'DELETE'
    || operation.operationId === 'PostCharactersCharacterIdMail'
    || operation.operationId === 'PostFleetsFleetIdMembers';
}

function auditEvent(input: {
  readonly idGenerator: IdGenerator;
  readonly plan: ActionPlan;
  readonly state: ActionAuditEvent['state'];
  readonly targetDigest: string;
  readonly now: string;
  readonly errorCode: string | null;
}): ActionAuditEvent {
  return Object.freeze({
    eventId: input.idGenerator.next(),
    planId: input.plan.planId,
    capabilityId: input.plan.capabilityId,
    operationId: input.plan.operationId,
    characterId: input.plan.characterId,
    authorizationGeneration: input.plan.authorizationGeneration,
    state: input.state,
    targetDigest: input.targetDigest,
    errorCode: input.errorCode,
    createdAt: input.now,
  });
}
