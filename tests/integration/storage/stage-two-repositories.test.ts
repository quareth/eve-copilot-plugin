import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteAuthorizationSessionRepository } from '../../../src/storage/sqlite/authorization-session-repository.js';
import { SqliteCharacterRepository } from '../../../src/storage/sqlite/character-repository.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import { SqliteTokenRefreshCoordinator } from '../../../src/storage/sqlite/token-refresh-coordinator.js';
import { SqliteCredentialCleanupRepository } from '../../../src/storage/sqlite/credential-cleanup-repository.js';
import { SqliteEsiCacheRepository } from '../../../src/storage/sqlite/esi-cache-repository.js';
import { FixedClock } from '../../helpers/fakes.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(): ReturnType<typeof openDatabase> {
  const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-stage-two-db-'));
  directories.push(directory);
  return openDatabase({
    path: join(directory, 'state.db'),
    busyTimeoutMs: 5_000,
    clock: new FixedClock(),
  });
}

describe('SQLite repositories', () => {
  it('persists characters, scopes, deterministic selection, grant replacement, and removal', () => {
    const database = fixture();
    const repository = new SqliteCharacterRepository(database);
    const first = repository.connect({
      characterId: 90_000_001,
      verifiedName: 'Synthetic Alpha',
      credentialReference: '00000000-0000-4000-8000-000000000001',
      grantedScopes: ['esi-location.read_ship_type.v1', 'esi-location.read_location.v1'],
      verifiedAt: '2026-08-21T08:00:00.000Z',
    });
    expect(first.selected).toBe(true);
    expect(first.grantedScopes).toEqual([
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
    ]);

    const second = repository.connect({
      characterId: 90_000_002,
      verifiedName: 'Synthetic Beta',
      credentialReference: '00000000-0000-4000-8000-000000000002',
      grantedScopes: ['esi-location.read_location.v1'],
      verifiedAt: '2026-08-21T08:01:00.000Z',
    });
    expect(second.selected).toBe(false);
    expect(repository.selected()?.characterId).toBe(first.characterId);

    expect(repository.select(second.characterId, '2026-08-21T08:02:00.000Z').selected).toBe(true);
    const replacement = repository.replaceGrant({
      characterId: second.characterId,
      verifiedName: 'Synthetic Beta Renamed',
      credentialReference: '00000000-0000-4000-8000-000000000003',
      grantedScopes: ['esi-location.read_ship_type.v1'],
      verifiedAt: '2026-08-21T08:03:00.000Z',
    });
    expect(replacement.previousCredentialReference).toBe('00000000-0000-4000-8000-000000000002');
    expect(replacement.character.authorizationGeneration).toBe(2);
    expect(replacement.character.selected).toBe(true);

    const removal = repository.beginRemoval(second.characterId, '2026-08-21T08:04:00.000Z');
    expect(removal.selectionCleared).toBe(true);
    expect(removal.character.status).toBe('removal_pending');
    expect(repository.selected()).toBeNull();
    expect(repository.completeRemoval(second.characterId)).toBe(true);
    expect(repository.find(second.characterId)).toBeNull();
    expect(repository.find(first.characterId)?.selected).toBe(false);
    database.close();
  });

  it('rejects duplicate connection and selection of a character requiring reauthorization', () => {
    const database = fixture();
    const repository = new SqliteCharacterRepository(database);
    const input = {
      characterId: 90_000_003,
      verifiedName: 'Synthetic Gamma',
      credentialReference: '00000000-0000-4000-8000-000000000004',
      grantedScopes: ['esi-location.read_location.v1'],
      verifiedAt: '2026-08-21T08:00:00.000Z',
    } as const;
    repository.connect(input);
    expect(() => repository.connect(input)).toThrow(expect.objectContaining({ code: 'AMBIGUOUS_INPUT' }));
    repository.markReauthorizationRequired(input.characterId, '2026-08-21T08:05:00.000Z');
    expect(() => repository.select(input.characterId, '2026-08-21T08:06:00.000Z'))
      .toThrow(expect.objectContaining({ code: 'REAUTHORIZATION_REQUIRED' }));
    database.close();
  });

  it('atomically consumes, completes, cancels, and expires authorization sessions', () => {
    const database = fixture();
    const repository = new SqliteAuthorizationSessionRepository(database);
    const stateHash = new Uint8Array(32).fill(7);
    repository.create({
      sessionId: '00000000-0000-4000-8000-000000000010',
      stateHash,
      verifierReference: '00000000-0000-4000-8000-000000000011',
      reauthorizeCharacterId: null,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      requestedScopes: ['esi-location.read_location.v1'],
      createdAt: '2026-08-21T08:00:00.000Z',
      expiresAt: '2026-08-21T08:10:00.000Z',
    });
    const consumed = repository.consumeByStateHash(stateHash, '2026-08-21T08:01:00.000Z');
    expect(consumed?.status).toBe('pending');
    expect(repository.consumeByStateHash(stateHash, '2026-08-21T08:01:01.000Z')).toBeNull();
    expect(repository.setTerminal({
      sessionId: consumed?.sessionId ?? '',
      from: 'pending',
      status: 'connected',
      terminalAt: '2026-08-21T08:02:00.000Z',
      connectedCharacterId: 90_000_001,
    })?.status).toBe('connected');

    const cancelledId = '00000000-0000-4000-8000-000000000012';
    repository.create({
      sessionId: cancelledId,
      stateHash: new Uint8Array(32).fill(8),
      verifierReference: '00000000-0000-4000-8000-000000000013',
      reauthorizeCharacterId: null,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      requestedScopes: [],
      createdAt: '2026-08-21T08:00:00.000Z',
      expiresAt: '2026-08-21T08:10:00.000Z',
    });
    expect(repository.cancel(cancelledId, '2026-08-21T08:03:00.000Z')?.status).toBe('cancelled');
    expect(repository.cancel(cancelledId, '2026-08-21T08:04:00.000Z')?.status).toBe('cancelled');

    const expiredId = '00000000-0000-4000-8000-000000000014';
    repository.create({
      sessionId: expiredId,
      stateHash: new Uint8Array(32).fill(9),
      verifierReference: '00000000-0000-4000-8000-000000000015',
      reauthorizeCharacterId: null,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      requestedScopes: [],
      createdAt: '2026-08-21T08:00:00.000Z',
      expiresAt: '2026-08-21T08:05:00.000Z',
    });
    expect(repository.expire('2026-08-21T08:06:00.000Z').map((item) => item.sessionId))
      .toEqual([expiredId]);
    database.close();
  });

  it('coordinates refresh leases with bounded ownership and stale takeover', () => {
    const database = fixture();
    const coordinator = new SqliteTokenRefreshCoordinator(database);
    const first = coordinator.acquire(
      90_000_001,
      '00000000-0000-4000-8000-000000000020',
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T08:00:30.000Z',
    );
    expect(first?.attempt).toBe(1);
    expect(coordinator.acquire(
      90_000_001,
      '00000000-0000-4000-8000-000000000021',
      '2026-08-21T08:00:10.000Z',
      '2026-08-21T08:00:40.000Z',
    )).toBeNull();
    expect(coordinator.acquire(
      90_000_001,
      '00000000-0000-4000-8000-000000000021',
      '2026-08-21T08:00:31.000Z',
      '2026-08-21T08:01:01.000Z',
    )?.attempt).toBe(2);
    expect(coordinator.renew(
      90_000_001,
      '00000000-0000-4000-8000-000000000020',
      '2026-08-21T08:02:00.000Z',
    )).toBe(false);
    expect(coordinator.release(90_000_001, '00000000-0000-4000-8000-000000000021')).toBe(true);
    database.close();
  });

  it('persists targeted credential cleanup and privacy-partitioned cache metadata', () => {
    const database = fixture();
    const cleanup = new SqliteCredentialCleanupRepository(database);
    const reference = '00000000-0000-4000-8000-000000000030';
    cleanup.enqueue(reference, 'character_grant', '2026-08-21T08:00:00.000Z');
    cleanup.enqueue(reference, 'character_grant', '2026-08-21T08:00:01.000Z');
    expect(cleanup.list(10)).toEqual([{
      reference,
      kind: 'character_grant',
      createdAt: '2026-08-21T08:00:00.000Z',
      attempts: 0,
    }]);
    cleanup.markAttempt(reference, '2026-08-21T08:01:00.000Z');
    expect(cleanup.list(10)[0]?.attempts).toBe(1);
    expect(cleanup.remove(reference)).toBe(true);

    const cache = new SqliteEsiCacheRepository(database);
    for (const [index, characterId] of [90_000_001, 90_000_002].entries()) {
      cache.put({
        cacheKey: String(index + 1).repeat(64),
        operationId: 'GetCharactersCharacterIdLocation',
        compatibilityDate: '2026-08-18',
        characterId,
        authorizationGeneration: index + 1,
        requestVariantHash: new Uint8Array(32).fill(index + 1),
        responseStatus: 200,
        etag: null,
        lastModified: null,
        freshUntil: '2026-08-21T08:00:05.000Z',
        staleUntil: null,
        validatedPayloadJson: JSON.stringify({ solarSystemId: 30_000_142 + index }),
        byteSize: 100,
        accessedAt: `2026-08-21T08:00:0${String(index)}.000Z`,
        createdAt: `2026-08-21T08:00:0${String(index)}.000Z`,
      });
    }
    expect(cache.totalBytes()).toBe(200);
    expect(cache.invalidateCharacter(90_000_001)).toBe(1);
    expect(cache.totalBytes()).toBe(100);
    expect(cache.find('2'.repeat(64), '2026-08-21T08:02:00.000Z')).toMatchObject({
      characterId: 90_000_002,
      authorizationGeneration: 2,
    });
    database.close();
  });
});
