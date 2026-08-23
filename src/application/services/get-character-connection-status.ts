import type { ConnectionSessionData } from '../dto/identity.js';
import type { AuthorizationSessionRepository } from '../ports/authorization-session-repository.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';
import { connectionData, expireSessions, requiredSession } from './identity-support.js';
import type { AuthorizationCallbackListener } from '../ports/authorization-callback-listener.js';
import type { CredentialCleanupRepository } from '../ports/credential-cleanup-repository.js';

export class GetCharacterConnectionStatus {
  readonly #clock: Clock;
  readonly #sessions: AuthorizationSessionRepository;
  readonly #credentials: CredentialStore;
  readonly #characters: CharacterRepository;
  readonly #listener: AuthorizationCallbackListener | null;
  readonly #cleanup: CredentialCleanupRepository | null;

  constructor(input: {
    readonly clock: Clock;
    readonly sessions: AuthorizationSessionRepository;
    readonly credentials: CredentialStore;
    readonly characters: CharacterRepository;
    readonly listener?: AuthorizationCallbackListener;
    readonly cleanup?: CredentialCleanupRepository;
  }) {
    this.#clock = input.clock;
    this.#sessions = input.sessions;
    this.#credentials = input.credentials;
    this.#characters = input.characters;
    this.#listener = input.listener ?? null;
    this.#cleanup = input.cleanup ?? null;
  }

  async execute(
    input: { readonly session_id: string },
    context: RequestContext,
  ): Promise<ResultEnvelope<ConnectionSessionData>> {
    await expireSessions({
      sessions: this.#sessions,
      credentials: this.#credentials,
      now: this.#clock.now().toISOString(),
      signal: context.signal,
      ...(this.#cleanup === null ? {} : { cleanup: this.#cleanup }),
    });
    if (this.#sessions.countActive(this.#clock.now().toISOString()) === 0) {
      await this.#listener?.close();
    }
    const session = requiredSession(this.#sessions, input.session_id);
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: connectionData({ session, characters: this.#characters }),
    });
  }
}
