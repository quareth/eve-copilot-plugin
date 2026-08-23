import type {
  CharacterAccessToken,
  CharacterAccessTokenProvider,
} from '../ports/character-access-token-provider.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import type { Delay } from '../ports/delay.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { SsoGateway } from '../ports/sso-gateway.js';
import type { RefreshLease, TokenRefreshCoordinator } from '../ports/token-refresh-coordinator.js';
import type { LeaseHeartbeat } from '../ports/lease-heartbeat.js';
import type { CharacterGrant } from '../dto/character-grant.js';
import type { ConnectedCharacter } from '../../domain/character.js';
import { parseCharacterGrant, serializeCharacterGrant } from '../dto/character-grant.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';

const REFRESH_WINDOW_MS = 300_000;
const LEASE_MS = 30_000;
const WAIT_LIMIT_MS = 5_000;
const POLL_MS = 200;

export class ManagedCharacterAccessTokenProvider implements CharacterAccessTokenProvider {
  readonly #clock: Clock;
  readonly #credentials: CredentialStore;
  readonly #characters: CharacterRepository;
  readonly #sso: SsoGateway;
  readonly #coordinator: TokenRefreshCoordinator;
  readonly #idGenerator: IdGenerator;
  readonly #delay: Delay;
  readonly #clientId: string | null;
  readonly #heartbeat: LeaseHeartbeat | null;

  constructor(input: {
    readonly clock: Clock;
    readonly credentials: CredentialStore;
    readonly characters: CharacterRepository;
    readonly sso: SsoGateway;
    readonly coordinator: TokenRefreshCoordinator;
    readonly idGenerator: IdGenerator;
    readonly delay: Delay;
    readonly clientId: string | null;
    readonly heartbeat?: LeaseHeartbeat;
  }) {
    this.#clock = input.clock;
    this.#credentials = input.credentials;
    this.#characters = input.characters;
    this.#sso = input.sso;
    this.#coordinator = input.coordinator;
    this.#idGenerator = input.idGenerator;
    this.#delay = input.delay;
    this.#clientId = input.clientId;
    this.#heartbeat = input.heartbeat ?? null;
  }

  async get(input: {
    readonly character: ConnectedCharacter;
    readonly requiredScope: string;
    readonly signal: AbortSignal;
  }): Promise<CharacterAccessToken> {
    throwIfAborted(input.signal);
    this.#assertUsable(input.character, input.requiredScope);
    let grant = await this.#read(input.character, input.signal);
    if (!needsRefresh(grant.access_expires_at, this.#clock.now())) {
      return tokenResult(grant);
    }
    if (this.#clientId === null) throw invalidClientConfiguration();
    const ownerId = this.#idGenerator.next();
    let waited = 0;
    let lease = this.#acquire(input.character.characterId, ownerId);
    while (lease === null && waited < WAIT_LIMIT_MS) {
      await this.#delay.wait(POLL_MS, input.signal);
      waited += POLL_MS;
      const current = this.#characters.find(input.character.characterId);
      if (current === null) throw notConnected();
      this.#assertUsable(current, input.requiredScope);
      grant = await this.#read(current, input.signal);
      if (!needsRefresh(grant.access_expires_at, this.#clock.now())) return tokenResult(grant);
      lease = this.#acquire(input.character.characterId, ownerId);
    }
    if (lease === null) {
      throw new AppError({
        code: 'UPSTREAM_SERVICE_FAILED',
        safeMessage: 'Authorization refresh is already in progress.',
        details: { retry_after_ms: POLL_MS, next_step: 'Retry this request shortly.' },
      });
    }
    const leaseState = { lost: false };
    const stopHeartbeat = this.#heartbeat?.start({
      intervalMs: 10_000,
      signal: input.signal,
      beat: () => {
        const now = this.#clock.now();
        leaseState.lost = !this.#coordinator.renew(
          input.character.characterId,
          ownerId,
          new Date(now.getTime() + LEASE_MS).toISOString(),
        );
      },
    }) ?? (() => undefined);
    try {
      const current = this.#characters.find(input.character.characterId);
      if (current === null) throw notConnected();
      this.#assertUsable(current, input.requiredScope);
      grant = await this.#read(current, input.signal);
      if (!needsRefresh(grant.access_expires_at, this.#clock.now())) return tokenResult(grant);
      const refreshed = await this.#sso.refresh({
        clientId: this.#clientId,
        refreshToken: grant.refresh_token,
        expectedCharacterId: current.characterId,
        expectedScopes: current.grantedScopes,
        signal: input.signal,
      });
      if (leaseState.lost) {
        this.#characters.markReauthorizationRequired(current.characterId, this.#clock.now().toISOString());
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'Authorization refresh ownership was lost before rotated credentials could be stored.',
          details: { character_id: current.characterId, next_step: 'Call reauthorize_character.' },
        });
      }
      if (!refreshed.grantedScopes.includes(input.requiredScope)) {
        this.#characters.markReauthorizationRequired(current.characterId, this.#clock.now().toISOString());
        throw missingScope(current.characterId, input.requiredScope);
      }
      const updatedValue = serializeCharacterGrant({
        version: 1,
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken ?? grant.refresh_token,
        access_expires_at: refreshed.accessExpiresAt,
        subject: refreshed.subject,
        granted_scopes: refreshed.grantedScopes,
        authorization_generation: current.authorizationGeneration,
      });
      try {
        await this.#credentials.replace(
          current.credentialReference,
          'character_grant',
          updatedValue,
          input.signal,
        );
      } catch (error) {
        this.#characters.markReauthorizationRequired(current.characterId, this.#clock.now().toISOString());
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'The refreshed authorization could not be stored safely.',
          details: { character_id: current.characterId, next_step: 'Call reauthorize_character.' },
          cause: error,
        });
      }
      try {
        this.#characters.recordRefresh({
          characterId: current.characterId,
          verifiedName: refreshed.characterName,
          grantedScopes: refreshed.grantedScopes,
          verifiedAt: this.#clock.now().toISOString(),
        });
      } catch (error) {
        this.#characters.markReauthorizationRequired(current.characterId, this.#clock.now().toISOString());
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'The refreshed authorization state could not be committed safely.',
          details: { character_id: current.characterId, next_step: 'Call reauthorize_character.' },
          cause: error,
        });
      }
      return Object.freeze({
        token: refreshed.accessToken,
        expiresAt: refreshed.accessExpiresAt,
        authorizationGeneration: current.authorizationGeneration,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'REAUTHORIZATION_REQUIRED') {
        this.#characters.markReauthorizationRequired(
          input.character.characterId,
          this.#clock.now().toISOString(),
        );
      }
      throw error;
    } finally {
      stopHeartbeat();
      this.#coordinator.release(input.character.characterId, ownerId);
    }
  }

  #acquire(characterId: number, ownerId: string): RefreshLease | null {
    const now = this.#clock.now();
    return this.#coordinator.acquire(
      characterId,
      ownerId,
      now.toISOString(),
      new Date(now.getTime() + LEASE_MS).toISOString(),
    );
  }

  #assertUsable(character: ConnectedCharacter, requiredScope: string): void {
    if (character.status === 'reauthorization_required') {
      throw new AppError({
        code: 'REAUTHORIZATION_REQUIRED',
        safeMessage: 'The selected character authorization must be renewed.',
        details: { character_id: character.characterId, next_step: 'Call reauthorize_character.' },
      });
    }
    if (character.status === 'removal_pending') {
      throw new AppError({
        code: 'CREDENTIAL_REMOVAL_PENDING',
        safeMessage: 'The selected character is being disconnected.',
        details: { character_id: character.characterId },
      });
    }
    if (!character.grantedScopes.includes(requiredScope)) {
      throw missingScope(character.characterId, requiredScope);
    }
  }

  async #read(character: ConnectedCharacter, signal: AbortSignal): Promise<Readonly<CharacterGrant>> {
    const stored = await this.#credentials.read(character.credentialReference, 'character_grant', signal);
    if (stored === null) {
      this.#characters.markReauthorizationRequired(character.characterId, this.#clock.now().toISOString());
      throw new AppError({
        code: 'REAUTHORIZATION_REQUIRED',
        safeMessage: 'The selected character authorization is no longer available.',
        details: { character_id: character.characterId, next_step: 'Call reauthorize_character.' },
      });
    }
    try {
      const grant = parseCharacterGrant(stored);
      if (grant.subject !== `CHARACTER:EVE:${String(character.characterId)}`
        || grant.authorization_generation !== character.authorizationGeneration) {
        throw new Error('Character grant identity or generation mismatch.');
      }
      return grant;
    } catch (error) {
      this.#characters.markReauthorizationRequired(character.characterId, this.#clock.now().toISOString());
      throw new AppError({
        code: 'REAUTHORIZATION_REQUIRED',
        safeMessage: 'The selected character authorization is invalid.',
        details: { character_id: character.characterId, next_step: 'Call reauthorize_character.' },
        cause: error,
      });
    }
  }
}

function needsRefresh(expiresAt: string, now: Date): boolean {
  return Date.parse(expiresAt) <= now.getTime() + REFRESH_WINDOW_MS;
}

function tokenResult(grant: ReturnType<typeof parseCharacterGrant>): CharacterAccessToken {
  return Object.freeze({
    token: grant.access_token,
    expiresAt: grant.access_expires_at,
    authorizationGeneration: grant.authorization_generation,
  });
}

function missingScope(characterId: number, scope: string): AppError {
  return new AppError({
    code: 'MISSING_SCOPE',
    safeMessage: 'The selected character did not grant the required EVE scope.',
    details: {
      character_id: characterId,
      missing_scopes: [scope],
      next_step: 'Call reauthorize_character and approve the requested scopes.',
    },
  });
}

function notConnected(): AppError {
  return new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
}

function invalidClientConfiguration(): AppError {
  return new AppError({
    code: 'INVALID_CONFIGURATION',
    safeMessage: 'An EVE application client ID is required for token refresh.',
  });
}
