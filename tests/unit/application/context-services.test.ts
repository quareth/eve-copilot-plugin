import { describe, expect, it } from 'vitest';
import type { CharacterRepository } from '../../../src/application/ports/character-repository.js';
import type { EsiGateway } from '../../../src/application/ports/esi-gateway.js';
import type {
  ResolvedSolarSystem,
  ResolvedStation,
  ResolvedType,
  SdeRepository,
} from '../../../src/application/ports/sde-repository.js';
import { GetCharacterOverview } from '../../../src/application/services/get-character-overview.js';
import { GetCurrentLocation } from '../../../src/application/services/get-current-location.js';
import { GetCurrentShip } from '../../../src/application/services/get-current-ship.js';
import type { ConnectedCharacter, VerifiedCharacterInput } from '../../../src/domain/character.js';
import { AppError } from '../../../src/domain/errors.js';
import type { EsiCharacterIdentity, EsiCharacterLocation, EsiCharacterShip, EsiValue } from '../../../src/domain/esi.js';
import { FixedClock } from '../../helpers/fakes.js';

const signal = new AbortController().signal;
const character = makeCharacter();

describe('character context services', () => {
  it('maps location and ship identifiers through the active SDE build', async () => {
    const dependencies = makeDependencies();
    const location = await new GetCurrentLocation(dependencies).execute({}, { requestId: 'request-1', signal });
    const ship = await new GetCurrentShip(dependencies).execute({}, { requestId: 'request-2', signal });
    expect(location.data).toMatchObject({
      state: 'station',
      solar_system: { status: 'available', value: { id: 30000142, name: 'Jita' } },
      constellation: { value: { id: 20000020, name: 'Kimotoro' } },
      region: { value: { id: 10000002, name: 'The Forge' } },
      station: { value: { id: '60003760', name: 'Jita IV - Caldari Navy' } },
      sde_build: 42,
    });
    expect(ship.data).toMatchObject({
      ship_item_id: '1000000000001',
      ship_type: { status: 'available', value: { id: 587, name: 'Rifter' } },
      player_assigned_name: 'Clear Skies',
      sde_build: 42,
    });
    expect(location.character).toEqual({ id: character.characterId, name: character.verifiedName });
  });

  it('returns an explicit partial overview when one upstream section fails', async () => {
    const dependencies = makeDependencies();
    const failingEsi: EsiGateway = {
      ...dependencies.esi,
      getCharacterIdentity() {
        return Promise.reject(new AppError({ code: 'ESI_UNAVAILABLE', safeMessage: 'Identity is unavailable.' }));
      },
    };
    const overview = await new GetCharacterOverview({
      ...dependencies,
      esi: failingEsi,
      clock: new FixedClock(),
    }).execute({}, { requestId: 'request-3', signal });
    expect(overview.partial).toBe(true);
    expect(overview.data.identity).toEqual({
      status: 'unavailable', value: null, reason: 'Identity is unavailable.',
    });
    expect(overview.data.location.status).toBe('available');
    expect(overview.data.ship.status).toBe('available');
    expect(overview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OVERVIEW_IDENTITY_UNAVAILABLE' }),
    ]));
  });

  it('fails before ESI access when no SDE build is active', async () => {
    const dependencies = makeDependencies();
    const unavailableSde: SdeRepository = {
      ...dependencies.sde,
      status: () => Promise.resolve({ state: 'unavailable', buildNumber: null, releaseDate: null }),
    };
    await expect(new GetCurrentLocation({ ...dependencies, sde: unavailableSde })
      .execute({}, { requestId: 'request-4', signal })).rejects.toMatchObject({ code: 'SDE_UNAVAILABLE' });
  });
});

function makeDependencies(): {
  readonly characters: CharacterRepository;
  readonly esi: EsiGateway;
  readonly sde: SdeRepository;
} {
  const characters = new SelectedCharacterRepository(character);
  const esi: EsiGateway = {
    getCharacterIdentity: () => Promise.resolve(esiValue<EsiCharacterIdentity>({
      characterId: character.characterId,
      name: character.verifiedName,
      corporationId: 1000169,
      allianceId: null,
    }, 'GetCharactersDetail')),
    getCharacterLocation: () => Promise.resolve(esiValue<EsiCharacterLocation>({
      solarSystemId: 30000142,
      stationId: '60003760',
      structureId: null,
    }, 'GetCharactersCharacterIdLocation')),
    getCharacterShip: () => Promise.resolve(esiValue<EsiCharacterShip>({
      shipItemId: '1000000000001',
      shipTypeId: 587,
      shipName: 'Clear Skies',
    }, 'GetCharactersCharacterIdShip')),
  };
  const sde: SdeRepository = {
    status: () => Promise.resolve({ state: 'available', buildNumber: 42, releaseDate: '2026-08-20T11:08:35Z' }),
    resolveType: () => Promise.resolve<ResolvedType>({
      id: 587,
      name: 'Rifter',
      groupId: 25,
      groupName: 'Frigate',
      categoryId: 6,
      categoryName: 'Ship',
      marketGroupId: 64,
      marketGroupName: 'Standard Frigates',
      published: true,
      buildNumber: 42,
    }),
    resolveTypes: () => Promise.resolve(new Map()),
    typeIdsByCategory: () => Promise.resolve([]),
    searchTypes: () => Promise.resolve([]),
    resolveGroup: () => Promise.resolve(null),
    resolveCategory: () => Promise.resolve(null),
    resolveMarketGroup: () => Promise.resolve(null),
    resolveTypeRequirements: () => Promise.resolve([]),
    resolveTypeRequirementClosure: () => Promise.reject(new Error('Requirement closure is not used by this test.')),
    resolveBlueprint: () => Promise.resolve(null),
    resolveSolarSystem: () => Promise.resolve<ResolvedSolarSystem>({
      id: 30000142,
      name: 'Jita',
      constellationId: 20000020,
      constellationName: 'Kimotoro',
      regionId: 10000002,
      regionName: 'The Forge',
      buildNumber: 42,
    }),
    resolveSolarSystems: () => Promise.resolve(new Map()),
    resolveStation: () => Promise.resolve<ResolvedStation>({
      id: '60003760', name: 'Jita IV - Caldari Navy', solarSystemId: 30000142, buildNumber: 42,
    }),
    searchSolarSystems: () => Promise.resolve([]),
    resolveStargatesFromSystem: () => Promise.resolve([]),
    resolveNpcCorporation: () => Promise.resolve(null),
    resolveFaction: () => Promise.resolve(null),
  };
  return { characters, esi, sde };
}

class SelectedCharacterRepository implements CharacterRepository {
  readonly #character: ConnectedCharacter;
  constructor(characterValue: ConnectedCharacter) { this.#character = characterValue; }
  list(): readonly ConnectedCharacter[] { return [this.#character]; }
  find(characterId: number): ConnectedCharacter | null {
    return characterId === this.#character.characterId ? this.#character : null;
  }
  selected(): ConnectedCharacter { return this.#character; }
  connect(_input: VerifiedCharacterInput): ConnectedCharacter { throw new Error('Not used.'); }
  replaceGrant(_input: VerifiedCharacterInput): { readonly character: ConnectedCharacter; readonly previousCredentialReference: string } { throw new Error('Not used.'); }
  recordRefresh(): ConnectedCharacter { throw new Error('Not used.'); }
  select(): ConnectedCharacter { throw new Error('Not used.'); }
  markReauthorizationRequired(): ConnectedCharacter { throw new Error('Not used.'); }
  beginRemoval(): { readonly character: ConnectedCharacter; readonly selectionCleared: boolean } { throw new Error('Not used.'); }
  completeRemoval(): boolean { throw new Error('Not used.'); }
}

function esiValue<T>(value: T, operationId: EsiValue<T>['operationId']): EsiValue<T> {
  return Object.freeze({
    value,
    operationId,
    retrievedAt: '2026-08-20T10:00:00.000Z',
    expiresAt: '2026-08-20T10:00:05.000Z',
    cache: 'miss',
  });
}

function makeCharacter(): ConnectedCharacter {
  return Object.freeze({
    characterId: 90000001,
    verifiedName: 'Verified Pilot',
    status: 'connected',
    credentialReference: '00000000-0000-4000-8000-000000000001',
    authorizationGeneration: 1,
    grantedScopes: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'],
    selected: true,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    lastVerifiedAt: '2026-08-20T09:00:00.000Z',
  });
}
