import type { Availability, LocationData, OverviewData, OverviewIdentity, ShipData } from '../dto/context.js';
import { available, unavailable } from '../dto/context.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { EsiGateway } from '../ports/esi-gateway.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { EsiValue } from '../../domain/esi.js';
import { AppError } from '../../domain/errors.js';
import type { ResultEnvelope } from '../../domain/result.js';
import type { ResultWarning } from '../../domain/warning.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';
import type { RequestContext } from './use-case.js';
import {
  combinedCache,
  contextResult,
  earliestExpiry,
  requiredSdeBuild,
  resolveLocation,
  resolveShip,
} from './context-support.js';

export class GetCharacterOverview {
  readonly #characters: CharacterRepository;
  readonly #clock: Clock;
  readonly #esi: EsiGateway;
  readonly #sde: SdeRepository;

  constructor(input: {
    readonly characters: CharacterRepository;
    readonly clock: Clock;
    readonly esi: EsiGateway;
    readonly sde: SdeRepository;
  }) {
    this.#characters = input.characters;
    this.#clock = input.clock;
    this.#esi = input.esi;
    this.#sde = input.sde;
  }

  async execute(_input: Record<string, never>, context: RequestContext): Promise<ResultEnvelope<OverviewData>> {
    const character = requireSelectedCharacter(this.#characters.selected());
    const sdeBuild = await requiredSdeBuild(this.#sde);
    const [identityResult, locationResult, shipResult] = await Promise.allSettled([
      this.#esi.getCharacterIdentity(character.characterId, context.signal),
      this.#esi.getCharacterLocation(character, context.signal),
      this.#esi.getCharacterShip(character, context.signal),
    ]);
    const warnings: ResultWarning[] = [];
    const values: Array<EsiValue<unknown>> = [];

    let identity: Availability<OverviewIdentity>;
    if (identityResult.status === 'fulfilled') {
      values.push(identityResult.value);
      identity = available({
        character_id: identityResult.value.value.characterId,
        character_name: identityResult.value.value.name,
        corporation_id: identityResult.value.value.corporationId,
        alliance_id: identityResult.value.value.allianceId,
      });
    } else {
      identity = unavailable(reason(identityResult.reason));
      warnings.push(sectionWarning('OVERVIEW_IDENTITY_UNAVAILABLE', identity.reason ?? '', 'identity'));
    }

    let location: Availability<LocationData>;
    if (locationResult.status === 'fulfilled') {
      values.push(locationResult.value);
      try {
        const resolved = await resolveLocation({ esi: locationResult.value, sde: this.#sde, sdeBuild });
        location = available(resolved.data);
        warnings.push(...resolved.warnings);
      } catch (error) {
        location = unavailable(reason(error));
        warnings.push(sectionWarning('OVERVIEW_LOCATION_UNAVAILABLE', location.reason ?? '', 'location'));
      }
    } else {
      location = unavailable(reason(locationResult.reason));
      warnings.push(sectionWarning('OVERVIEW_LOCATION_UNAVAILABLE', location.reason ?? '', 'location'));
    }

    let ship: Availability<ShipData>;
    if (shipResult.status === 'fulfilled') {
      values.push(shipResult.value);
      try {
        const resolved = await resolveShip({ esi: shipResult.value, sde: this.#sde, sdeBuild });
        ship = available(resolved.data);
        warnings.push(...resolved.warnings);
      } catch (error) {
        ship = unavailable(reason(error));
        warnings.push(sectionWarning('OVERVIEW_SHIP_UNAVAILABLE', ship.reason ?? '', 'ship'));
      }
    } else {
      ship = unavailable(reason(shipResult.reason));
      warnings.push(sectionWarning('OVERVIEW_SHIP_UNAVAILABLE', ship.reason ?? '', 'ship'));
    }

    const retrievedAt = values.map((value) => value.retrievedAt).sort().at(-1)
      ?? this.#clock.now().toISOString();
    return contextResult({
      requestId: context.requestId,
      character,
      data: Object.freeze({ identity, location, ship }),
      retrievedAt,
      expiresAt: earliestExpiry(values),
      cache: values.length === 0 ? 'not_applicable' : combinedCache(values),
      partial: warnings.length > 0,
      warnings: Object.freeze(warnings),
      operation: 'character_overview',
      sdeBuild,
    });
  }
}

function reason(error: unknown): string {
  return error instanceof AppError
    ? error.safeMessage
    : 'This section could not be resolved safely.';
}

function sectionWarning(code: string, message: string, field: string): ResultWarning {
  return Object.freeze({ code, message, affectedFields: [field] });
}
