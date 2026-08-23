import type { AuthorizationSessionRepository } from '../ports/authorization-session-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';
import { requiredSession } from './identity-support.js';
import { AppError } from '../../domain/errors.js';
import type { AuthorizationCallbackListener } from '../ports/authorization-callback-listener.js';

export interface CancelConnectionData {
  readonly session_id: string;
  readonly state: 'cancelled' | 'connected' | 'failed' | 'expired';
  readonly cancelled: boolean;
}

export class CancelCharacterConnection {
  readonly #clock: Clock;
  readonly #sessions: AuthorizationSessionRepository;
  readonly #credentials: CredentialStore;
  readonly #listener: AuthorizationCallbackListener | null;

  constructor(input: {
    readonly clock: Clock;
    readonly sessions: AuthorizationSessionRepository;
    readonly credentials: CredentialStore;
    readonly listener?: AuthorizationCallbackListener;
  }) {
    this.#clock = input.clock;
    this.#sessions = input.sessions;
    this.#credentials = input.credentials;
    this.#listener = input.listener ?? null;
  }

  async execute(
    input: { readonly session_id: string },
    context: RequestContext,
  ): Promise<ResultEnvelope<CancelConnectionData>> {
    const previous = requiredSession(this.#sessions, input.session_id);
    if (previous.status === 'pending') {
      throw new AppError({
        code: 'AMBIGUOUS_INPUT',
        safeMessage: 'The authorization callback is already being verified and can no longer be cancelled safely.',
        details: { session_id: previous.sessionId, next_step: 'Check the connection status again shortly.' },
      });
    }
    const session = this.#sessions.cancel(input.session_id, this.#clock.now().toISOString()) ?? previous;
    if (session.status === 'authorization_required' || session.status === 'pending') {
      throw new Error('Authorization cancellation did not reach a terminal state.');
    }
    if (session.status === 'cancelled') {
      await this.#credentials.delete(session.verifierReference, 'pkce_verifier', context.signal);
    }
    if (this.#sessions.countActive(this.#clock.now().toISOString()) === 0) {
      await this.#listener?.close();
    }
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: Object.freeze({
        session_id: session.sessionId,
        state: session.status,
        cancelled: session.status === 'cancelled' && previous.status !== 'cancelled',
      }),
    });
  }
}
