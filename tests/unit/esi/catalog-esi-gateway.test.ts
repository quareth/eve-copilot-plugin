import { describe, expect, it } from 'vitest';
import type {
  EsiOperationExecution,
  EsiOperationExecutor,
} from '../../../src/application/ports/esi-operation-executor.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import type { ConnectedCharacter } from '../../../src/domain/character.js';
import type { EsiOperationCatalog } from '../../../src/domain/esi-operation-catalog.js';
import type { EsiOperationFact } from '../../../src/domain/esi-operation.js';
import type { JsonValue } from '../../../src/domain/json.js';
import { CatalogEsiGateway } from '../../../src/infrastructure/esi/catalog-esi-gateway.js';

const signal = new AbortController().signal;
const character = connectedCharacter();

describe('CatalogEsiGateway', () => {
  it('delegates the typed operations and maps their validated values and metadata', async () => {
    const calls: Array<Parameters<EsiOperationExecutor['execute']>[0]> = [];
    const executor: Pick<EsiOperationExecutor, 'execute'> = {
      execute(input) {
        calls.push(input);
        switch (input.operation.operationId) {
          case 'GetCharactersDetail':
            return Promise.resolve(execution(input.operation, {
              name: 'Verified Pilot',
              corporation_id: '1000169',
            }));
          case 'GetCharactersCharacterIdLocation':
            return Promise.resolve(execution(input.operation, {
              solar_system_id: 30000142,
              station_id: '9007199254740993',
            }));
          case 'GetCharactersCharacterIdShip':
            return Promise.resolve(execution(input.operation, {
              ship_item_id: '9007199254740995',
              ship_type_id: '587',
              ship_name: 'Shared Transport',
            }));
          default:
            throw new Error(`Unexpected operation: ${input.operation.operationId}`);
        }
      },
    };
    const gateway = new CatalogEsiGateway({ catalog: buildEsiOperationCatalog(), executor });

    const identity = await gateway.getCharacterIdentity(character.characterId, signal);
    const location = await gateway.getCharacterLocation(character, signal);
    const ship = await gateway.getCharacterShip(character, signal);

    expect(identity).toEqual({
      value: {
        characterId: character.characterId,
        name: 'Verified Pilot',
        corporationId: 1000169,
        allianceId: null,
      },
      operationId: 'GetCharactersDetail',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-21T10:00:00.000Z',
      cache: 'revalidated',
    });
    expect(location.value).toEqual({
      solarSystemId: 30000142,
      stationId: '9007199254740993',
      structureId: null,
    });
    expect(ship.value).toEqual({
      shipItemId: '9007199254740995',
      shipTypeId: 587,
      shipName: 'Shared Transport',
    });
    expect(calls.map((call) => ({
      operationId: call.operation.operationId,
      arguments: call.arguments,
      character: call.character,
      signal: call.signal,
    }))).toEqual([
      {
        operationId: 'GetCharactersDetail',
        arguments: { character_id: String(character.characterId) },
        character: null,
        signal,
      },
      {
        operationId: 'GetCharactersCharacterIdLocation',
        arguments: { character_id: String(character.characterId) },
        character,
        signal,
      },
      {
        operationId: 'GetCharactersCharacterIdShip',
        arguments: { character_id: String(character.characterId) },
        character,
        signal,
      },
    ]);
  });

  it('reports incompatible mapped values and execution metadata as contract mismatches', async () => {
    const invalidValue = gatewayWithExecution({
      value: { name: 'Pilot', corporation_id: '9007199254740993' },
      operationId: 'GetCharactersDetail',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-21T10:00:00.000Z',
      cache: 'miss',
      totalPages: null,
    });
    await expect(invalidValue.getCharacterIdentity(character.characterId, signal)).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    });

    const invalidMetadata = gatewayWithExecution({
      value: { name: 'Pilot', corporation_id: 1000169 },
      operationId: 'GetCharactersDetail',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: null,
      cache: 'miss',
      totalPages: null,
    });
    await expect(invalidMetadata.getCharacterIdentity(character.characterId, signal)).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    });
  });

  it('fails construction when a required catalog operation is missing or incompatible', () => {
    const executor: Pick<EsiOperationExecutor, 'execute'> = {
      execute: () => Promise.reject(new Error('Construction must not execute operations.')),
    };
    const missing: Pick<EsiOperationCatalog, 'findOperation'> = { findOperation: () => null };
    expect(() => new CatalogEsiGateway({ catalog: missing, executor })).toThrow(expect.objectContaining({
      code: 'INVALID_CONFIGURATION',
    }));

    const catalog = buildEsiOperationCatalog();
    const identity = requiredOperation(catalog, 'GetCharactersDetail');
    const incompatible: Pick<EsiOperationCatalog, 'findOperation'> = {
      findOperation(operationId) {
        return operationId === identity.operationId ? { ...identity, access: 'character' } : catalog.findOperation(operationId);
      },
    };
    expect(() => new CatalogEsiGateway({ catalog: incompatible, executor })).toThrow(expect.objectContaining({
      code: 'INVALID_CONFIGURATION',
    }));
  });
});

function gatewayWithExecution(result: EsiOperationExecution): CatalogEsiGateway {
  return new CatalogEsiGateway({
    catalog: buildEsiOperationCatalog(),
    executor: { execute: () => Promise.resolve(result) },
  });
}

function execution(operation: EsiOperationFact, value: JsonValue): EsiOperationExecution {
  return Object.freeze({
    value,
    operationId: operation.operationId,
    retrievedAt: '2026-08-20T10:00:00.000Z',
    expiresAt: '2026-08-21T10:00:00.000Z',
    cache: 'revalidated',
    totalPages: null,
  });
}

function requiredOperation(catalog: EsiOperationCatalog, operationId: string): EsiOperationFact {
  const operation = catalog.findOperation(operationId);
  if (operation === null) throw new Error(`Missing test operation: ${operationId}`);
  return operation;
}

function connectedCharacter(): ConnectedCharacter {
  return Object.freeze({
    characterId: 2112625428,
    verifiedName: 'Test Pilot',
    status: 'connected',
    credentialReference: 'credential-ref',
    authorizationGeneration: 1,
    grantedScopes: Object.freeze([
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
    ]),
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
}
