import type { EsiOperationExecutor } from '../ports/esi-operation-executor.js';
import type { ActionAuditRepository } from '../ports/action-audit-repository.js';
import type { ActionPlanRepository } from '../ports/action-plan-repository.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { Digest } from '../ports/digest.js';
import type { EsiActionExecutor } from '../ports/esi-action-executor.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ConnectedCharacter } from '../../domain/character.js';
import { AppError } from '../../domain/errors.js';
import type { EsiActionFamily, EsiOperationFact } from '../../domain/esi-operation.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import type { JsonValue } from '../../domain/json.js';
import { assertOperationScopes, bindSelectedCharacterArgument } from '../../domain/authorization.js';

const FLEET_OPERATION = 'GetCharactersCharacterIdFleet';

export interface ActionServiceDependencies {
  readonly catalog: EsiOperationCatalog;
  readonly characters: CharacterRepository;
  readonly actions: EsiActionExecutor;
  readonly reads: EsiOperationExecutor;
  readonly plans: ActionPlanRepository;
  readonly audit: ActionAuditRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly digest: Digest;
  readonly enabled: boolean;
  readonly families: readonly EsiActionFamily[];
}

export class ActionServiceContext {
  readonly catalog: EsiOperationCatalog;
  readonly characters: CharacterRepository;
  readonly actions: EsiActionExecutor;
  readonly reads: EsiOperationExecutor;
  readonly plans: ActionPlanRepository;
  readonly audit: ActionAuditRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly digest: Digest;
  readonly #enabled: boolean;
  readonly #families: ReadonlySet<EsiActionFamily>;

  constructor(input: ActionServiceDependencies) {
    this.catalog = input.catalog;
    this.characters = input.characters;
    this.actions = input.actions;
    this.reads = input.reads;
    this.plans = input.plans;
    this.audit = input.audit;
    this.clock = input.clock;
    this.idGenerator = input.idGenerator;
    this.digest = input.digest;
    this.#enabled = input.enabled;
    this.#families = new Set(input.families);
  }

  enabled(family: EsiActionFamily): boolean {
    return this.#enabled && this.#families.has(family);
  }
}

export function actionServiceContext(
  input: ActionServiceDependencies | ActionServiceContext,
): ActionServiceContext {
  return input instanceof ActionServiceContext ? input : new ActionServiceContext(input);
}

export function bindActionCharacter(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, unknown>>,
  character: ConnectedCharacter,
): Readonly<Record<string, unknown>> {
  return bindSelectedCharacterArgument(operation, argumentsValue, character.characterId);
}

export function assertActionScopes(operation: EsiOperationFact, character: ConnectedCharacter): void {
  assertOperationScopes({
    operation,
    character,
    capabilityId: primaryCapability(operation),
    nextStep: 'Call reauthorize_character with this capability ID, then prepare the action again.',
  });
}

export async function assertActionTargetAccess(input: {
  readonly operation: EsiOperationFact;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly character: ConnectedCharacter;
  readonly catalog: EsiOperationCatalog;
  readonly reads: EsiOperationExecutor;
  readonly signal: AbortSignal;
}): Promise<void> {
  if (input.operation.access !== 'fleet') return;
  const fleetOperation = input.catalog.findOperation(FLEET_OPERATION);
  if (fleetOperation === null) throw new Error('Fleet authorization operation is absent.');
  const result = await input.reads.execute({
    operation: fleetOperation,
    arguments: { character_id: String(input.character.characterId) },
    character: input.character,
    signal: input.signal,
  });
  const fleetId = objectString(result.value, 'fleet_id');
  if (input.arguments.fleet_id !== fleetId) {
    throw new AppError({
      code: 'INSUFFICIENT_ROLE',
      safeMessage: 'The selected character is not a member of the target fleet.',
    });
  }
  if (input.operation.operationClass === 'action') {
    const role = objectText(result.value, 'role');
    const fleetBossId = objectString(result.value, 'fleet_boss_id');
    if (role !== 'fleet_commander' && fleetBossId !== String(input.character.characterId)) {
      throw new AppError({
        code: 'INSUFFICIENT_ROLE',
        safeMessage: 'The selected character no longer has fleet-command authority for this action.',
        details: { next_step: 'Ask the current fleet boss to perform the action, or prepare it again after command authority changes.' },
      });
    }
  }
}

export function primaryCapability(operation: EsiOperationFact): string {
  const capabilityId = operation.capabilityIds[0];
  if (capabilityId === undefined) throw new Error(`ESI operation has no capability: ${operation.operationId}`);
  return capabilityId;
}

function objectString(value: JsonValue, field: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidAuthorizationResponse();
  const object = value as Readonly<Record<string, JsonValue>>;
  const entry = object[field];
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' && Number.isSafeInteger(entry)) return String(entry);
  throw invalidAuthorizationResponse();
}

function objectText(value: JsonValue, field: string): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalidAuthorizationResponse();
  const entry = (value as Readonly<Record<string, JsonValue>>)[field];
  if (typeof entry === 'string') return entry;
  throw invalidAuthorizationResponse();
}

function invalidAuthorizationResponse(): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: 'EVE returned an invalid fleet authorization response.',
  });
}
