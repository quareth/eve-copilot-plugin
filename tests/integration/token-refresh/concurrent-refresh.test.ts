import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CredentialStore, CredentialStoreState, SecretKind } from '../../../src/application/ports/credential-store.js';
import type { Delay } from '../../../src/application/ports/delay.js';
import type { IdGenerator } from '../../../src/application/ports/id-generator.js';
import type { SsoGateway } from '../../../src/application/ports/sso-gateway.js';
import { serializeCharacterGrant, parseCharacterGrant } from '../../../src/application/dto/character-grant.js';
import { ManagedCharacterAccessTokenProvider } from '../../../src/application/services/managed-character-access-token-provider.js';
import { FixedClock } from '../../helpers/fakes.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import { SqliteCharacterRepository } from '../../../src/storage/sqlite/character-repository.js';
import { SqliteTokenRefreshCoordinator } from '../../../src/storage/sqlite/token-refresh-coordinator.js';
import { throwIfAborted } from '../../../src/domain/errors.js';

const directories: string[] = [];
const signal = new AbortController().signal;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('coordinated token refresh', () => {
  it('performs one refresh for simultaneous expired-token requests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eve-token-refresh-'));
    directories.push(directory);
    const clock = new FixedClock();
    const database = openDatabase({ path: join(directory, 'test.db'), busyTimeoutMs: 5_000, clock });
    try {
      const characters = new SqliteCharacterRepository(database);
      const reference = '00000000-0000-4000-8000-000000000001';
      const scopes = ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'];
      const credentials = new MemoryCredentialStore(reference, serializeCharacterGrant({
        version: 1,
        access_token: 'expired-access-token',
        refresh_token: 'refresh-token',
        access_expires_at: '2026-08-20T09:59:00.000Z',
        subject: 'CHARACTER:EVE:90000001',
        granted_scopes: scopes,
        authorization_generation: 1,
      }));
      const character = characters.connect({
        characterId: 90000001,
        verifiedName: 'Verified Pilot',
        credentialReference: reference,
        grantedScopes: scopes,
        verifiedAt: '2026-08-20T09:00:00.000Z',
      });
      let refreshes = 0;
      const sso: SsoGateway = {
        beginAuthorization: () => Promise.reject(new Error('Not used.')),
        exchangeCode: () => Promise.reject(new Error('Not used.')),
        async refresh() {
          refreshes += 1;
          await wait(5);
          return {
            characterId: character.characterId,
            characterName: character.verifiedName,
            subject: 'CHARACTER:EVE:90000001',
            grantedScopes: scopes,
            accessToken: 'fresh-access-token',
            refreshToken: 'rotated-refresh-token',
            accessExpiresAt: '2026-08-20T11:00:00.000Z',
          };
        },
      };
      const delay: Delay = { wait: () => wait(1) };
      const provider = new ManagedCharacterAccessTokenProvider({
        clock,
        credentials,
        characters,
        sso,
        coordinator: new SqliteTokenRefreshCoordinator(database),
        idGenerator: new SequenceIdGenerator(),
        delay,
        clientId: 'client-id',
      });
      const [first, second] = await Promise.all([
        provider.get({ character, requiredScope: scopes[0] ?? '', signal }),
        provider.get({ character, requiredScope: scopes[0] ?? '', signal }),
      ]);
      expect(refreshes).toBe(1);
      expect(first.token).toBe('fresh-access-token');
      expect(second.token).toBe('fresh-access-token');
      const stored = await credentials.read(reference, 'character_grant', signal);
      if (stored === null) throw new Error('Expected stored refreshed grant.');
      expect(parseCharacterGrant(stored)).toMatchObject({
        access_token: 'fresh-access-token', refresh_token: 'rotated-refresh-token',
      });
    } finally {
      database.close();
    }
  });

  it('cancels an in-flight refresh and releases its coordination lease', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eve-token-cancel-'));
    directories.push(directory);
    const clock = new FixedClock();
    const database = openDatabase({ path: join(directory, 'test.db'), busyTimeoutMs: 5_000, clock });
    try {
      const characters = new SqliteCharacterRepository(database);
      const reference = '00000000-0000-4000-8000-000000000002';
      const scopes = ['esi-location.read_location.v1'];
      const credentials = new MemoryCredentialStore(reference, serializeCharacterGrant({
        version: 1,
        access_token: 'expired-access-token',
        refresh_token: 'refresh-token',
        access_expires_at: '2026-08-20T09:59:00.000Z',
        subject: 'CHARACTER:EVE:90000002',
        granted_scopes: scopes,
        authorization_generation: 1,
      }));
      const character = characters.connect({
        characterId: 90000002,
        verifiedName: 'Cancelled Pilot',
        credentialReference: reference,
        grantedScopes: scopes,
        verifiedAt: '2026-08-20T09:00:00.000Z',
      });
      const controller = new AbortController();
      const sso: SsoGateway = {
        beginAuthorization: () => Promise.reject(new Error('Not used.')),
        exchangeCode: () => Promise.reject(new Error('Not used.')),
        refresh(input) {
          controller.abort();
          throwIfAborted(input.signal);
          return Promise.reject(new Error('unreachable'));
        },
      };
      const coordinator = new SqliteTokenRefreshCoordinator(database);
      const provider = new ManagedCharacterAccessTokenProvider({
        clock,
        credentials,
        characters,
        sso,
        coordinator,
        idGenerator: new SequenceIdGenerator(),
        delay: { wait: () => Promise.resolve() },
        clientId: 'client-id',
      });
      await expect(provider.get({
        character,
        requiredScope: scopes[0] ?? '',
        signal: controller.signal,
      })).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(coordinator.acquire(
        character.characterId,
        'replacement-owner',
        '2026-08-20T10:00:00.000Z',
        '2026-08-20T10:00:30.000Z',
      )).not.toBeNull();
    } finally {
      database.close();
    }
  });
});

class MemoryCredentialStore implements CredentialStore {
  readonly #reference: string;
  #value: string;
  constructor(reference: string, value: string) { this.#reference = reference; this.#value = value; }
  probe(_signal: AbortSignal): Promise<CredentialStoreState> { return Promise.resolve('available'); }
  create(_kind: SecretKind, _value: string, _signal: AbortSignal): Promise<string> {
    return Promise.reject(new Error('Not used.'));
  }
  read(reference: string, kind: SecretKind, _signal: AbortSignal): Promise<string | null> {
    return Promise.resolve(reference === this.#reference && kind === 'character_grant' ? this.#value : null);
  }
  replace(reference: string, kind: SecretKind, value: string, _signal: AbortSignal): Promise<void> {
    if (reference !== this.#reference || kind !== 'character_grant') return Promise.reject(new Error('Wrong credential.'));
    this.#value = value;
    return Promise.resolve();
  }
  delete(
    _reference: string,
    _kind: SecretKind,
    _signal: AbortSignal,
  ): Promise<'deleted' | 'absent'> { return Promise.resolve('absent'); }
}

class SequenceIdGenerator implements IdGenerator {
  #value = 0;
  next(): string {
    this.#value += 1;
    return `00000000-0000-4000-8000-${String(this.#value).padStart(12, '0')}`;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
