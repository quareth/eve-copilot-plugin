import { describe, expect, it } from 'vitest';
import type { CharacterRepository } from '../../../src/application/ports/character-repository.js';
import type { ContinuationRepository, ContinuationState } from '../../../src/application/ports/continuation-repository.js';
import type { EsiGateway } from '../../../src/application/ports/esi-gateway.js';
import type { EsiOperationExecutor } from '../../../src/application/ports/esi-operation-executor.js';
import type { IdGenerator } from '../../../src/application/ports/id-generator.js';
import { ExecuteBoundedRead } from '../../../src/application/services/execute-bounded-read.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import { HmacContinuationTokenCodec } from '../../../src/platform/hmac-continuation-token-codec.js';
import { FixedClock } from '../../helpers/fakes.js';
import type { JsonValue } from '../../../src/domain/json.js';
import type { ConnectedCharacter } from '../../../src/domain/character.js';
import { Sha256Digest } from '../../../src/platform/sha256-digest.js';

const signal = new AbortController().signal;

describe('ExecuteBoundedRead', () => {
  it('continues a large single-page response without returning more than the item budget', async () => {
    const values = Array.from({ length: 450 }, (_, index) => ({ type_id: String(index + 1) }));
    const repository = new MemoryContinuations();
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: emptyCharacters(),
      identity: unusedIdentity(),
      executor: fixedExecutor(values),
      continuations: repository,
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const capabilityId = 'esi.get_markets_groups';
    const first = await service.execute({
      capability_id: capabilityId,
      arguments: {},
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000010', signal });
    expect(first.data.result).toHaveLength(200);
    expect(first.partial).toBe(true);
    expect(first.data.continuation).not.toBeNull();

    const second = await service.execute({
      capability_id: capabilityId,
      arguments: {},
      max_items: 200,
      continuation: requiredContinuation(first.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000011', signal });
    expect(second.data.result).toHaveLength(200);
    expect(second.data.continuation).not.toBeNull();

    const third = await service.execute({
      capability_id: capabilityId,
      arguments: {},
      max_items: 200,
      continuation: requiredContinuation(second.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000012', signal });
    expect(third.data.result).toHaveLength(50);
    expect(third.partial).toBe(false);
    expect(third.data.continuation).toBeNull();
  });

  it('honors the smaller internal byte budget used by composed semantic tools', async () => {
    const values = Array.from({ length: 10 }, (_, index) => ({ id: String(index), value: 'x'.repeat(2_000) }));
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: emptyCharacters(),
      identity: unusedIdentity(),
      executor: fixedExecutor(values),
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const result = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsGroups',
      continuation_key: 'semantic.test.0',
      arguments: {},
      max_items: 10,
      maximum_result_bytes: 5_000,
    }, { requestId: '00000000-0000-4000-8000-000000000019', signal });

    expect(Buffer.byteLength(JSON.stringify(result.data.result), 'utf8')).toBeLessThanOrEqual(5_000);
    expect(result.data.continuation).not.toBeNull();
    expect(result.partial).toBe(true);
  });

  it('selects closure-relevant records from a collection nested in an object response', async () => {
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: selectedCharacters(),
      identity: unusedIdentity(),
      executor: fixedExecutor({
        total_sp: 123456,
        skills: [
          { skill_id: '200', trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 1_000 },
          { skill_id: '201', trained_skill_level: 4, active_skill_level: 3, skillpoints_in_skill: 500 },
          { skill_id: '999', trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 999_999 },
        ],
      }),
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const result = await service.executeRegisteredOperation({
      operation_id: 'GetCharactersCharacterIdSkills',
      continuation_key: 'semantic.check_requirements.0',
      arguments: {},
      max_items: 100,
      result_selector: { field: 'skill_id', values: ['200', '201'] },
    }, { requestId: '00000000-0000-4000-8000-000000000009', signal });
    expect(result.data.result).toEqual({
      total_sp: 123456,
      skills: [
        { skill_id: '200', trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 1_000 },
        { skill_id: '201', trained_skill_level: 4, active_skill_level: 3, skillpoints_in_skill: 500 },
      ],
    });
  });

  it('rejects a modified continuation token', () => {
    const codec = new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const token = codec.encode('00000000-0000-4000-8000-000000000001');
    expect(() => codec.decode(`${token.slice(0, -1)}B`)).toThrow(expect.objectContaining({
      code: 'INVALID_CONTINUATION',
    }));
  });

  it('turns upstream cursor pagination into bounded opaque continuations', async () => {
    const calls: Array<Readonly<Record<string, unknown>>> = [];
    const executor: EsiOperationExecutor = {
      execute(input) {
        calls.push(input.arguments);
        const after = input.arguments.after;
        return Promise.resolve(execution(after === undefined
          ? { objectives: [{ id: '1' }, { id: '2' }, { id: '3' }], cursor: { after: 'upstream-secret' } }
          : { objectives: [{ id: '4' }], cursor: {} }));
      },
    };
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: selectedCharacters(),
      identity: unusedIdentity(),
      executor,
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const capability_id = 'esi.get_characters_military_campaigns_objectives_listing';
    const first = await service.execute({ capability_id, arguments: {}, max_items: 2 }, {
      requestId: '00000000-0000-4000-8000-000000000013', signal,
    });
    expect(first.data.result).toEqual({ objectives: [{ id: '1' }, { id: '2' }] });
    expect(JSON.stringify(first.data.result)).not.toContain('upstream-secret');

    const second = await service.execute({
      capability_id,
      arguments: {},
      max_items: 2,
      continuation: requiredContinuation(first.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000014', signal });
    expect(second.data.result).toEqual({ objectives: [{ id: '3' }] });

    const third = await service.execute({
      capability_id,
      arguments: {},
      max_items: 2,
      continuation: requiredContinuation(second.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000015', signal });
    expect(third.data.result).toEqual({ objectives: [{ id: '4' }] });
    expect(third.data.continuation).toBeNull();
    expect(calls).toEqual([
      { character_id: '2112625428' },
      { character_id: '2112625428' },
      { after: 'upstream-secret', character_id: '2112625428' },
    ]);
  });

  it('rejects caller-supplied upstream cursor fields', async () => {
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: selectedCharacters(),
      identity: unusedIdentity(),
      executor: fixedExecutor({ objectives: [] }),
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    await expect(service.execute({
      capability_id: 'esi.get_characters_military_campaigns_objectives_listing',
      arguments: { after: 'raw-upstream-cursor' },
      max_items: 10,
    }, { requestId: '00000000-0000-4000-8000-000000000016', signal }))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT', details: { fields: ['after'] } });
  });

  it('deduplicates changing pages and retains the original page-count ceiling', async () => {
    const calls: Array<Readonly<Record<string, unknown>>> = [];
    const executor: EsiOperationExecutor = {
      execute(input) {
        calls.push(input.arguments);
        const page = input.arguments.page;
        return Promise.resolve({
          ...execution(page === 2
            ? [{ order_id: '2', price: 20 }, { order_id: '3', price: 30 }]
            : [{ order_id: '1', price: 10 }, { order_id: '2', price: 20 }]),
          totalPages: page === 2 ? 3 : 2,
        });
      },
    };
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: emptyCharacters(),
      identity: unusedIdentity(),
      executor,
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const first = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.market_orders',
      arguments: { region_id: '10000002', order_type: 'all' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000017', signal });
    const second = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.market_orders',
      arguments: {},
      max_items: 200,
      continuation: requiredContinuation(first.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000018', signal });
    expect(second.data.result).toEqual([{ order_id: '3', price: 30 }]);
    expect(second.data.page).toEqual({ current: 2, total: 2 });
    expect(second.data.continuation).toBeNull();
    expect(second.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PAGINATION_DUPLICATES_REMOVED' }),
      expect.objectContaining({ code: 'PAGINATION_SOURCE_CHANGED' }),
    ]));
    expect(calls).toEqual([
      { region_id: '10000002', order_type: 'all' },
      { region_id: '10000002', order_type: 'all', page: 2 },
    ]);
  });

  it('honors cancellation before resuming a pagination continuation', async () => {
    let executions = 0;
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: emptyCharacters(),
      identity: unusedIdentity(),
      executor: {
        execute: () => {
          executions += 1;
          return Promise.resolve({ ...execution([{ id: '1' }]), totalPages: 2 });
        },
      },
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const first = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.cancelled_market_orders',
      arguments: { region_id: '10000002', order_type: 'all' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000019', signal });
    const controller = new AbortController();
    controller.abort();
    await expect(service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.cancelled_market_orders',
      arguments: {},
      max_items: 200,
      continuation: requiredContinuation(first.data.continuation),
    }, { requestId: '00000000-0000-4000-8000-000000000020', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    expect(executions).toBe(1);
  });

  it('keeps the current continuation usable when cancellation arrives during a resumed read', async () => {
    const controller = new AbortController();
    let executions = 0;
    const service = new ExecuteBoundedRead({
      catalog: buildEsiOperationCatalog(),
      characters: emptyCharacters(),
      identity: unusedIdentity(),
      executor: {
        execute: (input) => {
          executions += 1;
          if (executions === 2) controller.abort();
          const page = input.arguments.page;
          return Promise.resolve({
            ...execution([{ id: page === 2 ? '2' : '1' }]),
            totalPages: 2,
          });
        },
      },
      continuations: new MemoryContinuations(),
      continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      clock: new FixedClock(),
      idGenerator: new SequentialIds(),
      digest: new Sha256Digest(),
    });
    const first = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.mid_request_cancellation',
      arguments: { region_id: '10000002', order_type: 'all' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000021', signal });
    const continuation = requiredContinuation(first.data.continuation);

    await expect(service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.mid_request_cancellation',
      arguments: {},
      max_items: 200,
      continuation,
    }, { requestId: '00000000-0000-4000-8000-000000000022', signal: controller.signal }))
      .rejects.toMatchObject({ code: 'CANCELLED' });

    const retry = await service.executeRegisteredOperation({
      operation_id: 'GetMarketsRegionIdOrders',
      continuation_key: 'test.mid_request_cancellation',
      arguments: {},
      max_items: 200,
      continuation,
    }, { requestId: '00000000-0000-4000-8000-000000000023', signal });
    expect(retry.data.result).toEqual([{ id: '2' }]);
    expect(retry.data.continuation).toBeNull();
  });

  it('rejects a corporation target that no longer matches current membership', async () => {
    let executions = 0;
    const service = organizationService({
      corporationId: 98000002,
      roles: ['Director'],
      onData: () => { executions += 1; },
    });
    await expect(service.execute({
      capability_id: 'esi.get_corporations_corporation_id_blueprints',
      arguments: { corporation_id: '98000001' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000020', signal }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    expect(executions).toBe(0);
  });

  it('requires a current accepted corporation role and permits any declared alternative', async () => {
    let executions = 0;
    const denied = organizationService({
      corporationId: 98000001,
      roles: [],
      onData: () => { executions += 1; },
    });
    await expect(denied.execute({
      capability_id: 'esi.get_corporations_corporation_id_blueprints',
      arguments: { corporation_id: '98000001' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000021', signal }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    expect(executions).toBe(0);

    const allowed = organizationService({
      corporationId: 98000001,
      roles: ['Director'],
      onData: () => { executions += 1; },
    });
    const result = await allowed.execute({
      capability_id: 'esi.get_corporations_corporation_id_blueprints',
      arguments: { corporation_id: '98000001' },
      max_items: 200,
    }, { requestId: '00000000-0000-4000-8000-000000000022', signal });
    expect(result.data.result).toEqual([]);
    expect(executions).toBe(1);
  });
});

function organizationService(input: {
  readonly corporationId: number;
  readonly roles: readonly string[];
  readonly onData: () => void;
}): ExecuteBoundedRead {
  const executor: EsiOperationExecutor = {
    execute(request) {
      if (request.operation.operationId === 'GetCharactersCharacterIdRoles') {
        return Promise.resolve(execution({ roles: input.roles }));
      }
      input.onData();
      return Promise.resolve(execution([]));
    },
  };
  const identity: EsiGateway = {
    getCharacterIdentity: () => Promise.resolve({
      value: {
        characterId: 2112625428,
        name: 'Test Pilot',
        corporationId: input.corporationId,
        allianceId: null,
      },
      operationId: 'GetCharactersDetail',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-21T10:00:00.000Z',
      cache: 'miss',
    }),
    getCharacterLocation: () => Promise.reject(new Error('unused')),
    getCharacterShip: () => Promise.reject(new Error('unused')),
  };
  return new ExecuteBoundedRead({
    catalog: buildEsiOperationCatalog(),
    characters: selectedCharacters(),
    identity,
    executor,
    continuations: new MemoryContinuations(),
    continuationTokens: new HmacContinuationTokenCodec('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    clock: new FixedClock(),
    idGenerator: new SequentialIds(),
    digest: new Sha256Digest(),
  });
}

function execution(value: JsonValue): {
  readonly value: JsonValue;
  readonly operationId: string;
  readonly retrievedAt: string;
  readonly expiresAt: string;
  readonly cache: 'miss';
  readonly totalPages: null;
} {
  return {
    value,
    operationId: 'test-operation',
    retrievedAt: '2026-08-20T10:00:00.000Z',
    expiresAt: '2026-08-20T11:00:00.000Z',
    cache: 'miss',
    totalPages: null,
  };
}

class MemoryContinuations implements ContinuationRepository {
  readonly #states = new Map<string, ContinuationState>();
  find(id: string): ContinuationState | null { return this.#states.get(id) ?? null; }
  put(state: ContinuationState): void { this.#states.set(state.continuationId, state); }
  remove(id: string): boolean { return this.#states.delete(id); }
  removeExpired(now: string): number {
    let removed = 0;
    for (const [id, state] of this.#states) {
      if (state.expiresAt <= now && this.#states.delete(id)) removed += 1;
    }
    return removed;
  }
  invalidateCharacter(_characterId: number): number { return 0; }
}

class SequentialIds implements IdGenerator {
  #value = 0;
  next(): string {
    this.#value += 1;
    return `00000000-0000-4000-8000-${String(this.#value).padStart(12, '0')}`;
  }
}

function fixedExecutor(value: JsonValue): EsiOperationExecutor {
  return {
    execute(input) {
      return Promise.resolve({
        value,
        operationId: input.operation.operationId,
        retrievedAt: '2026-08-20T10:00:00.000Z',
        expiresAt: '2026-08-20T11:00:00.000Z',
        cache: 'hit',
        totalPages: null,
      });
    },
  };
}

function emptyCharacters(): CharacterRepository {
  return {
    list: () => [],
    find: () => null,
    selected: () => null,
    connect: () => { throw new Error('unused'); },
    replaceGrant: () => { throw new Error('unused'); },
    recordRefresh: () => { throw new Error('unused'); },
    select: () => { throw new Error('unused'); },
    markReauthorizationRequired: () => { throw new Error('unused'); },
    beginRemoval: () => { throw new Error('unused'); },
    completeRemoval: () => false,
  };
}

function selectedCharacters(): CharacterRepository {
  const character: ConnectedCharacter = Object.freeze({
    characterId: 2112625428,
    verifiedName: 'Test Pilot',
    status: 'connected',
    credentialReference: 'credential-ref',
    authorizationGeneration: 1,
    grantedScopes: Object.freeze([
      'esi-corporations.read_blueprints.v1',
      'esi-characters.read_corporation_roles.v1',
      'esi-skills.read_skills.v1',
      'esi.activity.char:read',
    ]),
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
  return {
    ...emptyCharacters(),
    list: () => [character],
    find: (characterId) => characterId === character.characterId ? character : null,
    selected: () => character,
  };
}

function unusedIdentity(): EsiGateway {
  return {
    getCharacterIdentity: () => Promise.reject(new Error('unused')),
    getCharacterLocation: () => Promise.reject(new Error('unused')),
    getCharacterShip: () => Promise.reject(new Error('unused')),
  };
}

function requiredContinuation(value: string | null): string {
  if (value === null) throw new Error('Expected continuation token.');
  return value;
}
