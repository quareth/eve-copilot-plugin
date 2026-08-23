import type { LocationData, ShipData } from '../dto/context.js';
import { available, unavailable, unresolved } from '../dto/context.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { RequestContext } from './use-case.js';
import type { ConnectedCharacter } from '../../domain/character.js';
import type { EsiCharacterLocation, EsiCharacterShip, EsiValue } from '../../domain/esi.js';
import { AppError } from '../../domain/errors.js';
import type { CacheState, ResultEnvelope } from '../../domain/result.js';
import type { ResultWarning } from '../../domain/warning.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';

export async function requiredSdeBuild(sde: SdeRepository): Promise<number> {
  const status = await sde.status();
  if (status.state !== 'available' || status.buildNumber === null) {
    throw new AppError({
      code: 'SDE_UNAVAILABLE',
      safeMessage: 'The EVE static data build is not installed or valid.',
      details: { next_step: 'Run eve-copilot-mcp sde install.' },
    });
  }
  return status.buildNumber;
}

type ContextResolver<TSource, TData> = (input: {
  readonly esi: EsiValue<TSource>;
  readonly sde: SdeRepository;
  readonly sdeBuild: number;
}) => Promise<{ readonly data: TData; readonly warnings: readonly ResultWarning[] }>;

export class CurrentContextRead<TSource, TData> {
  readonly #characters: CharacterRepository;
  readonly #sde: SdeRepository;
  readonly #fetch: (character: ConnectedCharacter, signal: AbortSignal) => Promise<EsiValue<TSource>>;
  readonly #resolve: ContextResolver<TSource, TData>;

  constructor(input: {
    readonly characters: CharacterRepository;
    readonly sde: SdeRepository;
    readonly fetch: (character: ConnectedCharacter, signal: AbortSignal) => Promise<EsiValue<TSource>>;
    readonly resolve: ContextResolver<TSource, TData>;
  }) {
    this.#characters = input.characters;
    this.#sde = input.sde;
    this.#fetch = input.fetch;
    this.#resolve = input.resolve;
  }

  async execute(_input: Record<string, never>, context: RequestContext): Promise<ResultEnvelope<TData>> {
    const character = requireSelectedCharacter(this.#characters.selected());
    const sdeBuild = await requiredSdeBuild(this.#sde);
    const esi = await this.#fetch(character, context.signal);
    const resolved = await this.#resolve({ esi, sde: this.#sde, sdeBuild });
    return contextResult({
      requestId: context.requestId,
      character,
      data: resolved.data,
      retrievedAt: esi.retrievedAt,
      expiresAt: esi.expiresAt,
      cache: esi.cache,
      partial: resolved.warnings.length > 0,
      warnings: resolved.warnings,
      operation: esi.operationId,
      sdeBuild,
    });
  }
}

export async function resolveLocation(input: {
  readonly esi: EsiValue<EsiCharacterLocation>;
  readonly sde: SdeRepository;
  readonly sdeBuild: number;
}): Promise<{ readonly data: LocationData; readonly warnings: readonly ResultWarning[] }> {
  const location = input.esi.value;
  const warnings: ResultWarning[] = [];
  const system = await input.sde.resolveSolarSystem(location.solarSystemId);
  const state = location.structureId !== null ? 'structure'
    : location.stationId !== null ? 'station'
      : 'space';
  const unresolvedSystem = 'The identifier is not present in the active SDE build.';
  if (system === null) warnings.push({
    code: 'SDE_NAME_UNRESOLVED',
    message: 'The current solar system was not found in the active SDE build.',
    affectedFields: ['solar_system', 'constellation', 'region'],
  });
  let station = unavailable<{ readonly id: string; readonly name: string }>('The character is not docked in an NPC station.');
  if (location.stationId !== null) {
    const resolvedStation = await input.sde.resolveStation(location.stationId);
    station = resolvedStation === null
      ? unresolved('The station identifier is not present in the active SDE build.')
      : available({ id: resolvedStation.id, name: resolvedStation.name });
    if (resolvedStation === null) warnings.push({
      code: 'SDE_NAME_UNRESOLVED',
      message: 'The current station was not found in the active SDE build.',
      affectedFields: ['station'],
    });
  }
  const structure = location.structureId === null
    ? unavailable<{ readonly id: string; readonly name: string }>('The character is not docked in a player structure.')
    : unresolved<{ readonly id: string; readonly name: string }>(
      `Structure ${location.structureId} requires an additional authorization scope for name resolution.`,
    );
  if (location.structureId !== null) warnings.push({
    code: 'STRUCTURE_NAME_UNRESOLVED',
    message: 'The player structure name is unavailable without the optional structures scope.',
    affectedFields: ['structure.name'],
  });
  return Object.freeze({
    data: Object.freeze({
      state,
      solar_system: system === null
        ? unresolved<{ readonly id: number; readonly name: string }>(unresolvedSystem)
        : available({ id: system.id, name: system.name }),
      constellation: system === null
        ? unresolved<{ readonly id: number; readonly name: string }>(unresolvedSystem)
        : available({ id: system.constellationId, name: system.constellationName }),
      region: system === null
        ? unresolved<{ readonly id: number; readonly name: string }>(unresolvedSystem)
        : available({ id: system.regionId, name: system.regionName }),
      station,
      structure,
      sde_build: input.sdeBuild,
    }),
    warnings: Object.freeze(warnings),
  });
}

export async function resolveShip(input: {
  readonly esi: EsiValue<EsiCharacterShip>;
  readonly sde: SdeRepository;
  readonly sdeBuild: number;
}): Promise<{ readonly data: ShipData; readonly warnings: readonly ResultWarning[] }> {
  const type = await input.sde.resolveType(input.esi.value.shipTypeId);
  const warnings: ResultWarning[] = type === null ? [{
    code: 'SDE_NAME_UNRESOLVED',
    message: 'The current ship type was not found in the active SDE build.',
    affectedFields: ['ship_type'],
  }] : [];
  return Object.freeze({
    data: Object.freeze({
      ship_item_id: input.esi.value.shipItemId,
      ship_type: type === null
        ? unresolved<{ readonly id: number; readonly name: string }>('The type identifier is not present in the active SDE build.')
        : available({ id: type.id, name: type.name }),
      player_assigned_name: input.esi.value.shipName,
      sde_build: input.sdeBuild,
    }),
    warnings: Object.freeze(warnings),
  });
}

export function contextResult<T>(input: {
  readonly requestId: string;
  readonly character: ConnectedCharacter;
  readonly data: T;
  readonly retrievedAt: string;
  readonly expiresAt: string | null;
  readonly cache: CacheState;
  readonly partial: boolean;
  readonly warnings: readonly ResultWarning[];
  readonly operation: string;
  readonly sdeBuild: number;
}): ResultEnvelope<T> {
  return Object.freeze({
    schema_version: 1,
    request_id: input.requestId,
    character: { id: input.character.characterId, name: input.character.verifiedName },
    data: input.data,
    source: {
      kind: 'computed',
      name: 'EVE ESI + EVE Static Data',
      operation: input.operation,
      version: `SDE ${String(input.sdeBuild)}`,
    },
    retrieved_at: input.retrievedAt,
    expires_at: input.expiresAt,
    cache: input.cache,
    estimated: false,
    partial: input.partial,
    warnings: input.warnings,
  });
}

export function combinedCache(values: ReadonlyArray<EsiValue<unknown>>): CacheState {
  if (values.some((value) => value.cache === 'stale')) return 'stale';
  if (values.some((value) => value.cache === 'miss')) return 'miss';
  if (values.some((value) => value.cache === 'revalidated')) return 'revalidated';
  return 'hit';
}

export function earliestExpiry(values: ReadonlyArray<EsiValue<unknown>>): string | null {
  if (values.length === 0) return null;
  return values.map((value) => value.expiresAt).sort()[0] ?? null;
}
