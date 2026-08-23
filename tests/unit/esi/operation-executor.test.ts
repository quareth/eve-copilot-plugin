import { describe, expect, it } from 'vitest';
import type { CharacterAccessTokenProvider } from '../../../src/application/ports/character-access-token-provider.js';
import type { Delay } from '../../../src/application/ports/delay.js';
import type { EsiCacheEntry, EsiCacheRepository } from '../../../src/application/ports/esi-cache-repository.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import { GeneratedEsiOperationExecutor, quoteUnsafeIntegers } from '../../../src/infrastructure/esi/operation-executor.js';
import { FixedClock } from '../../helpers/fakes.js';
import type { EsiOperationFact } from '../../../src/domain/esi-operation.js';
import type { ConnectedCharacter } from '../../../src/domain/character.js';
import type { EsiRateLimitCoordinator } from '../../../src/application/ports/rate-limit-coordinator.js';
import { AppError } from '../../../src/domain/errors.js';

const signal = new AbortController().signal;

describe('GeneratedEsiOperationExecutor', () => {
  it('executes, validates, and caches a generated public operation', async () => {
    const requests: string[] = [];
    const executor = makeExecutor((request, init) => {
      requests.push(`${urlOf(request)}:${String(init?.method)}`);
      return Promise.resolve(jsonResponse({
        players: 9007199254740993n,
        server_version: '1',
        start_time: '2026-08-21T00:00:00Z',
        vip: false,
      }));
    });
    const operation = requiredOperation('GetStatus');
    const first = await executor.execute({ operation, arguments: {}, character: null, signal });
    const second = await executor.execute({ operation, arguments: {}, character: null, signal });
    expect(first).toMatchObject({ cache: 'miss', value: { players: '9007199254740993' } });
    expect(second).toMatchObject({ cache: 'hit', value: first.value });
    expect(requests).toEqual(['https://esi.evetech.net/status:GET']);
  });

  it('partitions private read cache entries by character and authorization generation', async () => {
    const requests: string[] = [];
    const executor = makePrivateReadExecutor((request, init) => {
      requests.push(`${urlOf(request)}:${new Headers(init?.headers).get('authorization') ?? ''}`);
      return Promise.resolve(jsonResponse({ solar_system_id: 30000142 }));
    });
    const operation = requiredOperation('GetCharactersCharacterIdLocation');
    const firstCharacter = connectedCharacter(2112625428, 1);
    const refreshedAuthorization = connectedCharacter(2112625428, 2);
    const otherCharacter = connectedCharacter(2112625429, 1);

    const first = await executor.execute({
      operation,
      arguments: { character_id: String(firstCharacter.characterId) },
      character: firstCharacter,
      signal,
    });
    const hit = await executor.execute({
      operation,
      arguments: { character_id: String(firstCharacter.characterId) },
      character: firstCharacter,
      signal,
    });
    const refreshed = await executor.execute({
      operation,
      arguments: { character_id: String(refreshedAuthorization.characterId) },
      character: refreshedAuthorization,
      signal,
    });
    const other = await executor.execute({
      operation,
      arguments: { character_id: String(otherCharacter.characterId) },
      character: otherCharacter,
      signal,
    });

    expect([first.cache, hit.cache, refreshed.cache, other.cache]).toEqual(['miss', 'hit', 'miss', 'miss']);
    expect(requests).toEqual([
      'https://esi.evetech.net/characters/2112625428/location:Bearer token-2112625428-1',
      'https://esi.evetech.net/characters/2112625428/location:Bearer token-2112625428-2',
      'https://esi.evetech.net/characters/2112625429/location:Bearer token-2112625429-1',
    ]);
  });

  it('translates rate limiting and bounds Retry-After metadata', async () => {
    const executor = makeExecutor(() => Promise.resolve(new Response('{}', {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '12' },
    })));
    await expect(executor.execute({
      operation: requiredOperation('GetCharactersDetail'),
      arguments: { character_id: '2112625428' },
      character: null,
      signal,
    })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retry_after_ms: 12_000 },
    });
  });

  it('uses the generated 24-hour freshness policy for character identity', async () => {
    const executor = makeExecutor(() => Promise.resolve(jsonResponse({
      achievement_score: 0,
      birthday: '2020-01-01T00:00:00Z',
      bloodline_id: 1,
      corporation_id: 1000169,
      gender: 'female',
      name: 'Verified Pilot',
      race_id: 1,
    })));
    const operation = requiredOperation('GetCharactersDetail');
    const input = {
      operation,
      arguments: { character_id: '2112625428' },
      character: null,
      signal,
    } as const;

    const first = await executor.execute(input);
    const second = await executor.execute(input);

    expect(first).toMatchObject({
      cache: 'miss',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-21T10:00:00.000Z',
    });
    expect(second.cache).toBe('hit');
  });

  it('constructs only descriptor-owned path and query parameters', async () => {
    const requests: string[] = [];
    const executor = makeExecutor((request) => {
      requests.push(urlOf(request));
      return Promise.resolve(jsonResponse([]));
    });
    await executor.execute({
      operation: requiredOperation('GetMarketsRegionIdHistory'),
      arguments: { region_id: '10000002', type_id: '34' },
      character: null,
      signal,
    });
    expect(requests).toEqual([
      'https://esi.evetech.net/markets/10000002/history?type_id=34',
    ]);
  });

  it('rejects unknown input fields and action operations before network access', async () => {
    let requests = 0;
    const executor = makeExecutor(() => {
      requests += 1;
      return Promise.resolve(jsonResponse(null));
    });
    await expect(executor.execute({
      operation: requiredOperation('GetStatus'),
      arguments: { url: 'https://attacker.invalid' },
      character: null,
      signal,
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
    await expect(executor.execute({
      operation: requiredOperation('PostUiAutopilotWaypoint'),
      arguments: {},
      character: null,
      signal,
    })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    expect(requests).toBe(0);
  });

  it('preserves unsafe JSON integer lexemes without changing strings or decimals', () => {
    expect(quoteUnsafeIntegers('{"id":9007199254740993,"safe":42,"ratio":1.5,"text":"9007199254740993"}'))
      .toBe('{"id":"9007199254740993","safe":42,"ratio":1.5,"text":"9007199254740993"}');
  });

  it('rejects upstream schema drift and oversized payloads under the pinned contract', async () => {
    let requests = 0;
    const driftCache = new MemoryCache();
    const drifted = makeExecutor(() => {
      requests += 1;
      return Promise.resolve(new Response(JSON.stringify({
        players: 'not-an-integer',
        server_version: '1',
        start_time: '2026-08-21T00:00:00Z',
        vip: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }, 4_194_304, driftCache);
    await expect(drifted.execute({
      operation: requiredOperation('GetStatus'),
      arguments: {},
      character: null,
      signal,
    })).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });
    expect(requests).toBe(1);
    expect(driftCache.totalBytes()).toBe(0);

    const oversized = makeExecutor(() => Promise.resolve(new Response(
      JSON.stringify({ players: 1, server_version: 'x'.repeat(256), start_time: '2026-08-21T00:00:00Z', vip: false }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )), 128);
    await expect(oversized.execute({
      operation: requiredOperation('GetStatus'),
      arguments: {},
      character: null,
      signal,
    })).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });
  });

  it('executes a validated action exactly once without caching or retrying', async () => {
    const requests: Array<{ readonly url: string; readonly method: string; readonly authorization: string | null }> = [];
    const executor = makePrivateExecutor((request, init) => {
      requests.push({
        url: urlOf(request),
        method: String(init?.method),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const operation = requiredOperation('PostUiOpenwindowInformation');
    expect(executor.validateAction({ operation, arguments: { target_id: '2112625428' } }))
      .toEqual({ target_id: '2112625428' });
    const result = await executor.executeAction({
      operation,
      arguments: { target_id: '2112625428' },
      character: connectedCharacter(),
      signal,
    });
    expect(result.value).toBeNull();
    expect(requests).toEqual([{
      url: 'https://esi.evetech.net/ui/openwindow/information?target_id=2112625428',
      method: 'POST',
      authorization: 'Bearer access-token',
    }]);
  });

  it('does not retry a non-idempotent action when the network result is uncertain', async () => {
    let requests = 0;
    const executor = makePrivateExecutor(() => {
      requests += 1;
      return Promise.reject(new TypeError('connection lost after send'));
    });
    await expect(executor.executeAction({
      operation: requiredOperation('PostUiOpenwindowInformation'),
      arguments: { target_id: '2112625428' },
      character: connectedCharacter(),
      signal,
    })).rejects.toMatchObject({
      code: 'ACTION_OUTCOME_UNCERTAIN',
      details: { next_step: expect.stringContaining('read-only') as string },
    });
    expect(requests).toBe(1);
  });

  it('does not report an uncertain outcome when cancellation happens before transmission', async () => {
    let requests = 0;
    const rateLimits: EsiRateLimitCoordinator = {
      acquire: () => Promise.reject(new AppError({
        code: 'CANCELLED',
        safeMessage: 'The request was cancelled before acquiring a rate-limit slot.',
      })),
      observe: () => undefined,
      snapshot: () => ({
        delayedRequests: 0,
        totalDelayMs: 0,
        activeBuckets: 0,
        globallyBlockedUntil: null,
        groups: [],
      }),
    };
    const executor = makePrivateExecutor(() => {
      requests += 1;
      return Promise.resolve(new Response(null, { status: 204 }));
    }, rateLimits);
    await expect(executor.executeAction({
      operation: requiredOperation('PostUiOpenwindowInformation'),
      arguments: { target_id: '2112625428' },
      character: connectedCharacter(),
      signal,
    })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(requests).toBe(0);
  });
});

function requiredOperation(operationId: string): EsiOperationFact {
  const operation = buildEsiOperationCatalog().findOperation(operationId);
  if (operation === null) throw new Error(`Missing test operation: ${operationId}`);
  return operation;
}

function makeExecutor(
  fetchImplementation: typeof fetch,
  maxResponseBytes = 4_194_304,
  cache: EsiCacheRepository = new MemoryCache(),
): GeneratedEsiOperationExecutor {
  const tokens: CharacterAccessTokenProvider = {
    get: () => Promise.reject(new Error('Public test must not request a token.')),
  };
  const delay: Delay = { wait: () => Promise.resolve() };
  return new GeneratedEsiOperationExecutor({
    fetch: fetchImplementation,
    compatibilityDate: '2026-08-18',
    userAgent: 'eve-copilot-tests test@example.invalid',
    timeoutMs: 5_000,
    maxResponseBytes,
    cacheMaxBytes: 1_000_000,
    clock: new FixedClock(),
    delay,
    cache,
    tokens,
  });
}

function makePrivateReadExecutor(fetchImplementation: typeof fetch): GeneratedEsiOperationExecutor {
  const tokens: CharacterAccessTokenProvider = {
    get(input) {
      return Promise.resolve({
        token: `token-${String(input.character.characterId)}-${String(input.character.authorizationGeneration)}`,
        expiresAt: '2026-08-20T11:00:00.000Z',
        authorizationGeneration: input.character.authorizationGeneration,
      });
    },
  };
  return new GeneratedEsiOperationExecutor({
    fetch: fetchImplementation,
    compatibilityDate: '2026-08-18',
    userAgent: 'eve-copilot-tests test@example.invalid',
    timeoutMs: 5_000,
    maxResponseBytes: 4_194_304,
    cacheMaxBytes: 1_000_000,
    clock: new FixedClock(),
    delay: { wait: () => Promise.resolve() },
    cache: new MemoryCache(),
    tokens,
  });
}

function makePrivateExecutor(
  fetchImplementation: typeof fetch,
  rateLimits?: EsiRateLimitCoordinator,
): GeneratedEsiOperationExecutor {
  const tokens: CharacterAccessTokenProvider = {
    get: () => Promise.resolve({
      token: 'access-token',
      expiresAt: '2026-08-20T11:00:00.000Z',
      authorizationGeneration: 1,
    }),
  };
  const delay: Delay = { wait: () => Promise.reject(new Error('Actions must not retry.')) };
  return new GeneratedEsiOperationExecutor({
    fetch: fetchImplementation,
    compatibilityDate: '2026-08-18',
    userAgent: 'eve-copilot-tests test@example.invalid',
    timeoutMs: 5_000,
    maxResponseBytes: 4_194_304,
    cacheMaxBytes: 1_000_000,
    clock: new FixedClock(),
    delay,
    cache: new MemoryCache(),
    tokens,
    ...(rateLimits === undefined ? {} : { rateLimits }),
  });
}

function connectedCharacter(characterId = 2112625428, authorizationGeneration = 1): ConnectedCharacter {
  return Object.freeze({
    characterId,
    verifiedName: 'Test Pilot',
    status: 'connected',
    credentialReference: 'credential-ref',
    authorizationGeneration,
    grantedScopes: Object.freeze([
      'esi-ui.open_window.v1',
      'esi-location.read_location.v1',
    ]),
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
}

class MemoryCache implements EsiCacheRepository {
  readonly #entries = new Map<string, EsiCacheEntry>();
  find(cacheKey: string, _accessedAt: string): EsiCacheEntry | null { return this.#entries.get(cacheKey) ?? null; }
  put(entry: EsiCacheEntry): void { this.#entries.set(entry.cacheKey, entry); }
  remove(cacheKey: string): boolean { return this.#entries.delete(cacheKey); }
  invalidateCharacter(_characterId: number): number { return 0; }
  pruneTo(_maximumBytes: number): number { return 0; }
  totalBytes(): number { return [...this.#entries.values()].reduce((sum, entry) => sum + entry.byteSize, 0); }
}

function jsonResponse(value: unknown): Response {
  const text = typeof value === 'object' && value !== null && 'players' in value
    ? `{"players":${String((value as { players: bigint }).players)},"server_version":"1","start_time":"2026-08-21T00:00:00Z","vip":false}`
    : JSON.stringify(value);
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/json', expires: '2026-08-21T10:00:05.000Z' },
  });
}

function urlOf(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}
