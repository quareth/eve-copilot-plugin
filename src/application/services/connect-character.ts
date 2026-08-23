import type { ConnectionSessionData } from '../dto/identity.js';
import { CORE_CHARACTER_SCOPES as requiredScopes } from '../dto/identity.js';
import type { AuthorizationCallbackListener } from '../ports/authorization-callback-listener.js';
import type { AuthorizationSessionRepository } from '../ports/authorization-session-repository.js';
import type { BrowserLauncher } from '../ports/browser-launcher.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { OAuthStateHasher } from '../ports/oauth-state-hasher.js';
import type { SsoGateway } from '../ports/sso-gateway.js';
import type { RequestContext } from './use-case.js';
import type { ResultEnvelope } from '../../domain/result.js';
import { localResult } from '../../domain/result.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import { connectionData, expireSessions } from './identity-support.js';
import type { CredentialCleanupRepository } from '../ports/credential-cleanup-repository.js';
import { drainCredentialCleanup, queueCredentialCleanup } from './credential-cleanup.js';

export interface ConnectCharacterInput {
  readonly open_browser: boolean;
  readonly reauthorize_character_id?: number;
  readonly requested_scopes?: readonly string[];
}

export class ConnectCharacter {
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #credentials: CredentialStore;
  readonly #sessions: AuthorizationSessionRepository;
  readonly #characters: CharacterRepository;
  readonly #sso: SsoGateway;
  readonly #listener: AuthorizationCallbackListener;
  readonly #browser: BrowserLauncher;
  readonly #clientId: string | null;
  readonly #redirectUri: string;
  readonly #sessionTtlMs: number;
  readonly #stateHasher: OAuthStateHasher;
  readonly #cleanup: CredentialCleanupRepository | null;

  constructor(input: {
    readonly clock: Clock;
    readonly idGenerator: IdGenerator;
    readonly credentials: CredentialStore;
    readonly sessions: AuthorizationSessionRepository;
    readonly characters: CharacterRepository;
    readonly sso: SsoGateway;
    readonly listener: AuthorizationCallbackListener;
    readonly browser: BrowserLauncher;
    readonly clientId: string | null;
    readonly redirectUri: string;
    readonly sessionTtlMs: number;
    readonly stateHasher: OAuthStateHasher;
    readonly cleanup?: CredentialCleanupRepository;
  }) {
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#credentials = input.credentials;
    this.#sessions = input.sessions;
    this.#characters = input.characters;
    this.#sso = input.sso;
    this.#listener = input.listener;
    this.#browser = input.browser;
    this.#clientId = input.clientId;
    this.#redirectUri = input.redirectUri;
    this.#sessionTtlMs = input.sessionTtlMs;
    this.#stateHasher = input.stateHasher;
    this.#cleanup = input.cleanup ?? null;
  }

  async execute(
    input: ConnectCharacterInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<ConnectionSessionData>> {
    throwIfAborted(context.signal);
    if (this.#clientId === null) {
      throw new AppError({
        code: 'INVALID_CONFIGURATION',
        safeMessage: 'An EVE application client ID is required to connect a character.',
        details: { next_step: 'Configure EVE_COPILOT_EVE_CLIENT_ID and the registered loopback redirect URI.' },
      });
    }
    if (input.reauthorize_character_id !== undefined) {
      const existing = this.#characters.find(input.reauthorize_character_id);
      if (existing === null) {
        throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
      }
      if (existing.status === 'removal_pending') {
        throw new AppError({
          code: 'CREDENTIAL_REMOVAL_PENDING',
          safeMessage: 'The character is being disconnected and cannot be reauthorized.',
          details: { character_id: existing.characterId },
        });
      }
    }
    const now = this.#clock.now();
    const requestedScopes = input.requested_scopes ?? requiredScopes;
    await drainCredentialCleanup({
      cleanup: this.#cleanup,
      credentials: this.#credentials,
      clock: this.#clock,
      signal: context.signal,
    });
    await expireSessions({
      sessions: this.#sessions,
      credentials: this.#credentials,
      now: now.toISOString(),
      signal: context.signal,
      ...(this.#cleanup === null ? {} : { cleanup: this.#cleanup }),
    });
    if (await this.#credentials.probe(context.signal) !== 'available') {
      throw new AppError({
        code: 'CREDENTIAL_STORE_UNAVAILABLE',
        safeMessage: 'Protected credential storage is unavailable.',
        details: { next_step: 'Unlock or configure the operating-system credential store.' },
      });
    }
    await this.#listener.ensureListening(context.signal);
    const material = await this.#sso.beginAuthorization({
      clientId: this.#clientId,
      redirectUri: this.#redirectUri,
      scopes: requestedScopes,
      signal: context.signal,
    });
    const verifierReference = await this.#credentials.create(
      'pkce_verifier',
      material.verifier,
      context.signal,
    );
    const expiresAt = new Date(now.getTime() + this.#sessionTtlMs).toISOString();
    let session;
    try {
      session = this.#sessions.create({
        sessionId: this.#idGenerator.next(),
        stateHash: this.#stateHasher.digest(material.state),
        verifierReference,
        reauthorizeCharacterId: input.reauthorize_character_id ?? null,
        redirectUri: this.#redirectUri,
        requestedScopes,
        createdAt: now.toISOString(),
        expiresAt,
      });
    } catch (error) {
      try {
        await this.#credentials.delete(verifierReference, 'pkce_verifier', context.signal);
      } catch {
        queueCredentialCleanup({
          cleanup: this.#cleanup,
          reference: verifierReference,
          kind: 'pkce_verifier',
          createdAt: this.#clock.now().toISOString(),
        });
      }
      throw error;
    }
    const browserOpened = input.open_browser
      ? await this.#browser.open(material.authorizationUrl)
      : false;
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: connectionData({
        session,
        characters: this.#characters,
        authorizationUrl: material.authorizationUrl,
        browserOpened,
      }),
    });
  }
}
