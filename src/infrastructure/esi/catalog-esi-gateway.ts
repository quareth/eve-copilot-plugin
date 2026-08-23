import type { EsiGateway } from '../../application/ports/esi-gateway.js';
import type {
  EsiOperationExecution,
  EsiOperationExecutor,
} from '../../application/ports/esi-operation-executor.js';
import type { ConnectedCharacter } from '../../domain/character.js';
import {
  canonicalUnsignedId,
  type EsiCharacterIdentity,
  type EsiCharacterLocation,
  type EsiCharacterShip,
  type EsiValue,
} from '../../domain/esi.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import type { EsiAccessClass, EsiOperationFact } from '../../domain/esi-operation.js';
import { AppError } from '../../domain/errors.js';
import type { JsonValue } from '../../domain/json.js';

const IDENTITY_OPERATION_ID = 'GetCharactersDetail';
const LOCATION_OPERATION_ID = 'GetCharactersCharacterIdLocation';
const SHIP_OPERATION_ID = 'GetCharactersCharacterIdShip';

type OperationCatalogLookup = Pick<EsiOperationCatalog, 'findOperation'>;

export class CatalogEsiGateway implements EsiGateway {
  readonly #executor: Pick<EsiOperationExecutor, 'execute'>;
  readonly #identity: EsiOperationFact;
  readonly #location: EsiOperationFact;
  readonly #ship: EsiOperationFact;

  constructor(input: {
    readonly catalog: OperationCatalogLookup;
    readonly executor: Pick<EsiOperationExecutor, 'execute'>;
  }) {
    this.#executor = input.executor;
    this.#identity = requiredTypedOperation(input.catalog, IDENTITY_OPERATION_ID, 'public');
    this.#location = requiredTypedOperation(input.catalog, LOCATION_OPERATION_ID, 'character');
    this.#ship = requiredTypedOperation(input.catalog, SHIP_OPERATION_ID, 'character');
  }

  async getCharacterIdentity(
    characterId: number,
    signal: AbortSignal,
  ): Promise<EsiValue<EsiCharacterIdentity>> {
    const canonicalCharacterId = positiveSafeInteger(characterId, 'character identifier');
    const execution = await this.#executor.execute({
      operation: this.#identity,
      arguments: { character_id: String(canonicalCharacterId) },
      character: null,
      signal,
    });
    const value = jsonObject(execution.value, this.#identity.operationId);
    return typedResult(execution, this.#identity, Object.freeze({
      characterId: canonicalCharacterId,
      name: boundedString(value.name, 'character name', 1, 256),
      corporationId: positiveSafeInteger(value.corporation_id, 'corporation identifier'),
      allianceId: value.alliance_id === undefined
        ? null
        : positiveSafeInteger(value.alliance_id, 'alliance identifier'),
    }));
  }

  async getCharacterLocation(
    character: ConnectedCharacter,
    signal: AbortSignal,
  ): Promise<EsiValue<EsiCharacterLocation>> {
    const execution = await this.#executePrivate(this.#location, character, signal);
    const value = jsonObject(execution.value, this.#location.operationId);
    return typedResult(execution, this.#location, Object.freeze({
      solarSystemId: positiveSafeInteger(value.solar_system_id, 'solar system identifier'),
      stationId: optionalUnsignedId(value.station_id, 'station identifier'),
      structureId: optionalUnsignedId(value.structure_id, 'structure identifier'),
    }));
  }

  async getCharacterShip(
    character: ConnectedCharacter,
    signal: AbortSignal,
  ): Promise<EsiValue<EsiCharacterShip>> {
    const execution = await this.#executePrivate(this.#ship, character, signal);
    const value = jsonObject(execution.value, this.#ship.operationId);
    return typedResult(execution, this.#ship, Object.freeze({
      shipItemId: canonicalUnsignedId(value.ship_item_id, 'ship item identifier'),
      shipTypeId: positiveSafeInteger(value.ship_type_id, 'ship type identifier'),
      shipName: boundedString(value.ship_name, 'ship name', 0, 256),
    }));
  }

  #executePrivate(
    operation: EsiOperationFact,
    character: ConnectedCharacter,
    signal: AbortSignal,
  ): Promise<EsiOperationExecution> {
    return this.#executor.execute({
      operation,
      arguments: { character_id: String(character.characterId) },
      character,
      signal,
    });
  }
}

function requiredTypedOperation(
  catalog: OperationCatalogLookup,
  operationId: string,
  access: EsiAccessClass,
): EsiOperationFact {
  const operation = catalog.findOperation(operationId);
  const parameter = operation?.parameters[0];
  if (operation?.operationClass !== 'read'
    || operation.access !== access
    || operation.method !== 'GET'
    || operation.pagination.mode !== 'none'
    || operation.parameters.length !== 1
    || parameter?.name !== 'character_id'
    || parameter.location !== 'path'
    || !parameter.required) {
    throw new AppError({
      code: 'INVALID_CONFIGURATION',
      safeMessage: `The packaged ESI catalog is incompatible with the typed ${operationId} adapter.`,
    });
  }
  return operation;
}

function typedResult<T>(
  execution: EsiOperationExecution,
  operation: EsiOperationFact,
  value: T,
): EsiValue<T> {
  if (execution.operationId !== operation.operationId
    || execution.expiresAt === null
    || execution.cache === 'not_applicable') {
    throw contractMismatch(operation.operationId);
  }
  return Object.freeze({
    value,
    operationId: execution.operationId,
    retrievedAt: execution.retrievedAt,
    expiresAt: execution.expiresAt,
    cache: execution.cache,
  });
}

function jsonObject(value: JsonValue, operationId: string): Readonly<Record<string, JsonValue>> {
  if (!isJsonObject(value)) throw contractMismatch(operationId);
  return value;
}

function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveSafeInteger(value: unknown, field: string): number {
  const number = typeof value === 'string' && /^[1-9][0-9]*$/u.test(value) ? Number(value) : value;
  if (typeof number === 'number' && Number.isSafeInteger(number) && number > 0) return number;
  throw new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: `EVE ESI returned an invalid ${field}.`,
  });
}

function optionalUnsignedId(value: JsonValue | undefined, field: string): string | null {
  return value === undefined ? null : canonicalUnsignedId(value, field);
}

function boundedString(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value === 'string' && value.length >= minimum && value.length <= maximum) return value;
  throw new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: `EVE ESI returned an invalid ${field}.`,
  });
}

function contractMismatch(operationId: string): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: `The shared ESI executor returned incompatible metadata for ${operationId}.`,
  });
}
