import type { AuthorizationSessionRepository } from '../ports/authorization-session-repository.js';
import type { CredentialStore } from '../ports/credential-store.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { AuthorizationSession } from '../../domain/authorization.js';
import { AppError } from '../../domain/errors.js';
import type { ConnectionSessionData } from '../dto/identity.js';
import { toCharacterSummary } from '../dto/identity.js';
import type { CredentialCleanupRepository } from '../ports/credential-cleanup-repository.js';
import { queueCredentialCleanup } from './credential-cleanup.js';

export function connectionData(input: {
  readonly session: AuthorizationSession;
  readonly characters: CharacterRepository;
  readonly authorizationUrl?: string;
  readonly browserOpened?: boolean;
}): ConnectionSessionData {
  const character = input.session.connectedCharacterId === null
    ? null
    : input.characters.find(input.session.connectedCharacterId);
  return Object.freeze({
    session_id: input.session.sessionId,
    state: input.session.status,
    authorization_url: input.session.status === 'authorization_required'
      ? (input.authorizationUrl ?? null)
      : null,
    expires_at: input.session.expiresAt,
    requested_scopes: input.session.requestedScopes,
    browser_opened: input.browserOpened ?? false,
    character: character === null ? null : toCharacterSummary(character),
    next_step: nextStep(input.session),
  });
}

export async function expireSessions(input: {
  readonly sessions: AuthorizationSessionRepository;
  readonly credentials: CredentialStore;
  readonly now: string;
  readonly signal: AbortSignal;
  readonly cleanup?: CredentialCleanupRepository;
}): Promise<void> {
  const expired = input.sessions.expire(input.now);
  await Promise.all(expired.map(async (session) => {
    try {
      await input.credentials.delete(session.verifierReference, 'pkce_verifier', input.signal);
    } catch {
      queueCredentialCleanup({
        cleanup: input.cleanup ?? null,
        reference: session.verifierReference,
        kind: 'pkce_verifier',
        createdAt: input.now,
      });
    }
  }));
}

export function requiredSession(
  sessions: AuthorizationSessionRepository,
  sessionId: string,
): AuthorizationSession {
  const session = sessions.findById(sessionId);
  if (session === null) {
    throw new AppError({
      code: 'AUTHORIZATION_SESSION_NOT_FOUND',
      safeMessage: 'The character authorization session was not found.',
      details: { next_step: 'Start a new character connection.' },
    });
  }
  return session;
}

function nextStep(session: AuthorizationSession): string {
  switch (session.status) {
    case 'authorization_required': return 'Complete authorization in the official EVE sign-in page, then check status.';
    case 'pending': return 'Authorization is being verified. Check status again shortly.';
    case 'connected': return 'The character is connected and ready for selection or context tools.';
    case 'cancelled': return 'Start a new character connection when ready.';
    case 'expired': return 'Start a new character connection.';
    case 'failed': return failedAuthorizationNextStep(session.failureCode);
  }
}

function failedAuthorizationNextStep(failureCode: string | null): string {
  const separator = failureCode?.indexOf(':') ?? -1;
  if (separator < 0 || failureCode === null) {
    return 'Authorization failed. Diagnose the stored failure code before starting another connection.';
  }
  const diagnosticCode = failureCode.slice(separator + 1);
  return `Authorization failed during EVE token verification (${diagnosticCode}). Diagnose this code before retrying.`;
}
