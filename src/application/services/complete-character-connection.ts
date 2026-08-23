import type { AuthorizationSessionRepository } from '../ports/authorization-session-repository.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import type { SsoGateway, VerifiedSsoGrant } from '../ports/sso-gateway.js';
import type { OAuthStateHasher } from '../ports/oauth-state-hasher.js';
import { AppError } from '../../domain/errors.js';
import { serializeCharacterGrant } from '../dto/character-grant.js';
import type { CredentialCleanupRepository } from '../ports/credential-cleanup-repository.js';
import { queueCredentialCleanup } from './credential-cleanup.js';

export class CompleteCharacterConnection {
  readonly #clock: Clock;
  readonly #credentials: CredentialStore;
  readonly #sessions: AuthorizationSessionRepository;
  readonly #characters: CharacterRepository;
  readonly #sso: SsoGateway;
  readonly #clientId: string | null;
  readonly #stateHasher: OAuthStateHasher;
  readonly #cleanup: CredentialCleanupRepository | null;

  constructor(input: {
    readonly clock: Clock;
    readonly credentials: CredentialStore;
    readonly sessions: AuthorizationSessionRepository;
    readonly characters: CharacterRepository;
    readonly sso: SsoGateway;
    readonly clientId: string | null;
    readonly stateHasher: OAuthStateHasher;
    readonly cleanup?: CredentialCleanupRepository;
  }) {
    this.#clock = input.clock;
    this.#credentials = input.credentials;
    this.#sessions = input.sessions;
    this.#characters = input.characters;
    this.#sso = input.sso;
    this.#clientId = input.clientId;
    this.#stateHasher = input.stateHasher;
    this.#cleanup = input.cleanup ?? null;
  }

  async execute(input: {
    readonly state: string;
    readonly code: string | null;
    readonly providerError: string | null;
    readonly signal: AbortSignal;
  }): Promise<void> {
    if (this.#clientId === null) throw new AppError({
      code: 'INVALID_CONFIGURATION',
      safeMessage: 'An EVE application client ID is required to complete authorization.',
    });
    const consumedAt = this.#clock.now().toISOString();
    const presentedHash = this.#stateHasher.digest(input.state);
    const session = this.#sessions.consumeByStateHash(presentedHash, consumedAt);
    if (session === null) {
      throw new AppError({
        code: 'AUTHORIZATION_SESSION_NOT_FOUND',
        safeMessage: 'The character authorization session is invalid, expired, or already used.',
      });
    }
    if (!this.#stateHasher.matches(session.stateHash, presentedHash)) {
      throw new AppError({
        code: 'AUTHORIZATION_SESSION_NOT_FOUND',
        safeMessage: 'The character authorization session is invalid, expired, or already used.',
      });
    }
    try {
      if (input.providerError !== null || input.code === null) {
        throw new AppError({
          code: 'CANCELLED',
          safeMessage: 'EVE authorization was declined or cancelled.',
          details: { next_step: 'Start a new character connection when ready.' },
        });
      }
      const verifier = await this.#credentials.read(
        session.verifierReference,
        'pkce_verifier',
        input.signal,
      );
      if (verifier === null) {
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'The protected authorization verifier is no longer available.',
          details: { next_step: 'Start a new character connection.' },
        });
      }
      const grant = await this.#sso.exchangeCode({
        clientId: this.#clientId,
        redirectUri: session.redirectUri,
        code: input.code,
        verifier,
        expectedScopes: session.requestedScopes,
        signal: input.signal,
      });
      if (this.#clock.now().getTime() >= Date.parse(session.expiresAt)) {
        throw new AppError({
          code: 'AUTHORIZATION_SESSION_EXPIRED',
          safeMessage: 'The character authorization session expired before verification completed.',
          details: { session_id: session.sessionId, next_step: 'Start a new character connection.' },
        });
      }
      if (session.reauthorizeCharacterId !== null
        && grant.characterId !== session.reauthorizeCharacterId) {
        throw new AppError({
          code: 'REAUTHORIZATION_REQUIRED',
          safeMessage: 'The selected EVE character does not match the character being reauthorized.',
          details: {
            character_id: session.reauthorizeCharacterId,
            next_step: 'Start reauthorization again and select the requested character.',
          },
        });
      }
      await this.#persistGrant(session.reauthorizeCharacterId, grant, input.signal);
      const terminal = this.#sessions.setTerminal({
        sessionId: session.sessionId,
        from: 'pending',
        status: 'connected',
        terminalAt: this.#clock.now().toISOString(),
        connectedCharacterId: grant.characterId,
      });
      if (terminal === null) throw new Error('Authorization session could not be completed.');
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      const diagnosticCode = error instanceof AppError
        ? error.details.diagnostic_code
        : undefined;
      this.#sessions.setTerminal({
        sessionId: session.sessionId,
        from: 'pending',
        status: 'failed',
        terminalAt: this.#clock.now().toISOString(),
        failureCode: diagnosticCode === undefined ? code : `${code}:${diagnosticCode}`,
      });
      throw error;
    } finally {
      await this.#deleteOrQueue(session.verifierReference, 'pkce_verifier', input.signal);
    }
  }

  async #persistGrant(
    reauthorizeCharacterId: number | null,
    grant: VerifiedSsoGrant,
    signal: AbortSignal,
  ): Promise<void> {
    const existing = this.#characters.find(grant.characterId);
    const authorizationGeneration = existing === null ? 1 : existing.authorizationGeneration + 1;
    const value = serializeCharacterGrant({
      version: 1,
      access_token: grant.accessToken,
      refresh_token: grant.refreshToken,
      access_expires_at: grant.accessExpiresAt,
      subject: grant.subject,
      granted_scopes: grant.grantedScopes,
      authorization_generation: authorizationGeneration,
    });
    const reference = await this.#credentials.create('character_grant', value, signal);
    if (existing === null) {
      try {
        this.#characters.connect({
          characterId: grant.characterId,
          verifiedName: grant.characterName,
          credentialReference: reference,
          grantedScopes: grant.grantedScopes,
          verifiedAt: this.#clock.now().toISOString(),
        });
        return;
      } catch (error) {
        await this.#deleteOrQueue(reference, 'character_grant', signal);
        throw error;
      }
    }
    if (reauthorizeCharacterId === null) {
      await this.#deleteOrQueue(reference, 'character_grant', signal);
      throw new AppError({
        code: 'AMBIGUOUS_INPUT',
        safeMessage: 'This character is already connected. Reauthorize it explicitly instead.',
        details: { character_id: grant.characterId, next_step: 'Call reauthorize_character.' },
      });
    }
    let replacement;
    try {
      replacement = this.#characters.replaceGrant({
        characterId: grant.characterId,
        verifiedName: grant.characterName,
        credentialReference: reference,
        grantedScopes: grant.grantedScopes,
        verifiedAt: this.#clock.now().toISOString(),
      });
    } catch (error) {
      await this.#deleteOrQueue(reference, 'character_grant', signal);
      throw error;
    }
    // The newly persisted grant remains authoritative even if cleanup of the
    // superseded credential must be retried by maintenance.
    await this.#deleteOrQueue(replacement.previousCredentialReference, 'character_grant', signal);
  }

  async #deleteOrQueue(
    reference: string,
    kind: 'character_grant' | 'pkce_verifier',
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.#credentials.delete(reference, kind, signal);
    } catch {
      queueCredentialCleanup({
        cleanup: this.#cleanup,
        reference,
        kind,
        createdAt: this.#clock.now().toISOString(),
      });
    }
  }
}
