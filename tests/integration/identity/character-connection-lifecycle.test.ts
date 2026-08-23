import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthorizationCallbackListener } from '../../../src/application/ports/authorization-callback-listener.js';
import type { BrowserLauncher } from '../../../src/application/ports/browser-launcher.js';
import type { CredentialStore, CredentialStoreState, SecretKind } from '../../../src/application/ports/credential-store.js';
import type { SsoGateway } from '../../../src/application/ports/sso-gateway.js';
import { CancelCharacterConnection } from '../../../src/application/services/cancel-character-connection.js';
import { CompleteCharacterConnection } from '../../../src/application/services/complete-character-connection.js';
import { ConnectCharacter } from '../../../src/application/services/connect-character.js';
import { parseCharacterGrant } from '../../../src/application/dto/character-grant.js';
import { Sha256OAuthStateHasher } from '../../../src/platform/sha256-oauth-state-hasher.js';
import { SqliteAuthorizationSessionRepository } from '../../../src/storage/sqlite/authorization-session-repository.js';
import { SqliteCharacterRepository } from '../../../src/storage/sqlite/character-repository.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import type { DatabaseHandle } from '../../../src/storage/sqlite/database-handle.js';
import { FixedClock, FixedIdGenerator } from '../../helpers/fakes.js';
import { AppError } from '../../../src/domain/errors.js';
import { connectionData } from '../../../src/application/services/identity-support.js';

const directories: string[] = [];
const signal = new AbortController().signal;
const context = { requestId: '00000000-0000-4000-8000-000000000099', signal };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('character connection lifecycle', () => {
  it('persists only state hash/verifier reference, consumes once, and selects the first verified character', async () => {
    const fixture = await makeFixture();
    try {
      const started = await fixture.connect.execute({ open_browser: false }, context);
      expect(started.data).toMatchObject({
        state: 'authorization_required',
        authorization_url: 'https://login.eveonline.com/v2/oauth/authorize?state=public-state',
        browser_opened: false,
      });
      expect(fixture.listener.starts).toBe(1);
      const stored = fixture.database.raw.prepare(
        'SELECT state_hash, verifier_reference FROM authorization_sessions',
      ).get() as { state_hash: Uint8Array; verifier_reference: string };
      expect(stored.state_hash).toHaveLength(32);
      expect(Buffer.from(stored.state_hash).toString('utf8')).not.toContain('public-state');
      expect(fixture.credentials.values()).not.toContain('public-state');
      expect(fixture.credentials.values()).toContain('pkce-verifier');

      await fixture.complete.execute({
        state: 'public-state', code: 'one-time-code', providerError: null, signal,
      });
      const character = fixture.characters.selected();
      expect(character).toMatchObject({
        characterId: 90000001,
        verifiedName: 'Verified Pilot',
        selected: true,
        authorizationGeneration: 1,
      });
      if (character === null) throw new Error('Expected selected character.');
      const protectedGrant = await fixture.credentials.read(
        character.credentialReference, 'character_grant', signal,
      );
      if (protectedGrant === null) throw new Error('Expected protected character grant.');
      expect(parseCharacterGrant(protectedGrant)).toMatchObject({
        authorization_generation: 1,
        refresh_token: 'refresh-token',
      });
      expect(fixture.credentials.values()).not.toContain('pkce-verifier');
      await expect(fixture.complete.execute({
        state: 'public-state', code: 'replayed-code', providerError: null, signal,
      })).rejects.toMatchObject({ code: 'AUTHORIZATION_SESSION_NOT_FOUND' });
    } finally {
      fixture.database.close();
    }
  });

  it('cancels idempotently and deletes protected PKCE material', async () => {
    const fixture = await makeFixture();
    try {
      const started = await fixture.connect.execute({ open_browser: false }, context);
      const cancel = new CancelCharacterConnection({
        clock: fixture.clock,
        sessions: fixture.sessions,
        credentials: fixture.credentials,
      });
      const first = await cancel.execute({ session_id: started.data.session_id }, context);
      const second = await cancel.execute({ session_id: started.data.session_id }, context);
      expect(first.data).toMatchObject({ state: 'cancelled', cancelled: true });
      expect(second.data).toMatchObject({ state: 'cancelled', cancelled: false });
      expect(fixture.credentials.values()).not.toContain('pkce-verifier');
    } finally {
      fixture.database.close();
    }
  });

  it('persists and reports only an allowlisted JWT diagnostic code on failure', async () => {
    const fixture = await makeFixture();
    try {
      const started = await fixture.connect.execute({ open_browser: false }, context);
      fixture.sso.exchangeError = new AppError({
        code: 'UPSTREAM_CONTRACT_MISMATCH',
        safeMessage: 'The EVE SSO access token could not be verified.',
        details: { diagnostic_code: 'JWT_SIGNATURE_INVALID' },
      });
      await expect(fixture.complete.execute({
        state: 'public-state', code: 'one-time-code', providerError: null, signal,
      })).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });
      const session = fixture.sessions.findById(started.data.session_id);
      expect(session).not.toBeNull();
      if (session === null) throw new Error('Expected failed authorization session.');
      expect(session.failureCode).toBe('UPSTREAM_CONTRACT_MISMATCH:JWT_SIGNATURE_INVALID');
      expect(connectionData({ session, characters: fixture.characters }).next_step)
        .toBe('Authorization failed during EVE token verification (JWT_SIGNATURE_INVALID). Diagnose this code before retrying.');
    } finally {
      fixture.database.close();
    }
  });
});

async function makeFixture(): Promise<{
  readonly clock: FixedClock;
  readonly database: DatabaseHandle;
  readonly sessions: SqliteAuthorizationSessionRepository;
  readonly characters: SqliteCharacterRepository;
  readonly credentials: MemoryCredentialStore;
  readonly listener: FakeListener;
  readonly connect: ConnectCharacter;
  readonly complete: CompleteCharacterConnection;
  readonly sso: FakeSsoGateway;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-identity-lifecycle-'));
  directories.push(directory);
  const clock = new FixedClock();
  const database = openDatabase({ path: join(directory, 'test.db'), busyTimeoutMs: 5_000, clock });
  const sessions = new SqliteAuthorizationSessionRepository(database);
  const characters = new SqliteCharacterRepository(database);
  const credentials = new MemoryCredentialStore();
  const listener = new FakeListener();
  const sso = new FakeSsoGateway();
  const hasher = new Sha256OAuthStateHasher();
  const connect = new ConnectCharacter({
    clock,
    idGenerator: new FixedIdGenerator(),
    credentials,
    sessions,
    characters,
    sso,
    listener,
    browser: { open: () => Promise.resolve(false) } satisfies BrowserLauncher,
    clientId: 'client-id',
    redirectUri: 'http://127.0.0.1:17600/oauth/callback',
    sessionTtlMs: 600_000,
    stateHasher: hasher,
  });
  const complete = new CompleteCharacterConnection({
    clock, credentials, sessions, characters, sso, clientId: 'client-id', stateHasher: hasher,
  });
  return { clock, database, sessions, characters, credentials, listener, connect, complete, sso };
}

class FakeListener implements AuthorizationCallbackListener {
  starts = 0;
  ensureListening(): Promise<void> { this.starts += 1; return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

class FakeSsoGateway implements SsoGateway {
  exchangeError: AppError | null = null;
  beginAuthorization(): Promise<{ readonly state: string; readonly verifier: string; readonly authorizationUrl: string }> {
    return Promise.resolve({
      state: 'public-state',
      verifier: 'pkce-verifier',
      authorizationUrl: 'https://login.eveonline.com/v2/oauth/authorize?state=public-state',
    });
  }
  exchangeCode(): Promise<{
    readonly characterId: number;
    readonly characterName: string;
    readonly subject: string;
    readonly grantedScopes: readonly string[];
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessExpiresAt: string;
  }> {
    if (this.exchangeError !== null) return Promise.reject(this.exchangeError);
    return Promise.resolve({
      characterId: 90000001,
      characterName: 'Verified Pilot',
      subject: 'CHARACTER:EVE:90000001',
      grantedScopes: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'],
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessExpiresAt: '2026-08-20T11:00:00.000Z',
    });
  }
  refresh(): Promise<never> { return Promise.reject(new Error('Not used.')); }
}

class MemoryCredentialStore implements CredentialStore {
  readonly #values = new Map<string, { kind: SecretKind; value: string }>();
  #next = 1;
  probe(_signal: AbortSignal): Promise<CredentialStoreState> { return Promise.resolve('available'); }
  create(kind: SecretKind, value: string, _signal: AbortSignal): Promise<string> {
    const reference = `00000000-0000-4000-8000-${String(this.#next).padStart(12, '0')}`;
    this.#next += 1;
    this.#values.set(reference, { kind, value });
    return Promise.resolve(reference);
  }
  read(reference: string, expectedKind: SecretKind, _signal: AbortSignal): Promise<string | null> {
    const stored = this.#values.get(reference);
    return Promise.resolve(stored?.kind === expectedKind ? stored.value : null);
  }
  replace(
    reference: string,
    expectedKind: SecretKind,
    value: string,
    _signal: AbortSignal,
  ): Promise<void> {
    const stored = this.#values.get(reference);
    if (stored?.kind !== expectedKind) return Promise.reject(new Error('Credential mismatch.'));
    this.#values.set(reference, { kind: expectedKind, value });
    return Promise.resolve();
  }
  delete(
    reference: string,
    expectedKind: SecretKind,
    _signal: AbortSignal,
  ): Promise<'deleted' | 'absent'> {
    const stored = this.#values.get(reference);
    if (stored?.kind !== expectedKind) return Promise.resolve('absent');
    this.#values.delete(reference);
    return Promise.resolve('deleted');
  }
  values(): string[] { return [...this.#values.values()].map((entry) => entry.value); }
}
