import type { AuthorizationSession, AuthorizationSessionState } from '../../domain/authorization.js';

export interface CreateAuthorizationSessionInput {
  readonly sessionId: string;
  readonly stateHash: Uint8Array;
  readonly verifierReference: string;
  readonly reauthorizeCharacterId: number | null;
  readonly redirectUri: string;
  readonly requestedScopes: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AuthorizationSessionRepository {
  create(input: CreateAuthorizationSessionInput): AuthorizationSession;
  findById(sessionId: string): AuthorizationSession | null;
  consumeByStateHash(stateHash: Uint8Array, consumedAt: string): AuthorizationSession | null;
  setTerminal(input: {
    readonly sessionId: string;
    readonly from: 'authorization_required' | 'pending';
    readonly status: Exclude<AuthorizationSessionState, 'authorization_required' | 'pending'>;
    readonly terminalAt: string;
    readonly connectedCharacterId?: number;
    readonly failureCode?: string;
  }): AuthorizationSession | null;
  cancel(sessionId: string, cancelledAt: string): AuthorizationSession | null;
  expire(now: string): readonly AuthorizationSession[];
  removeTerminalBefore(before: string): number;
  countActive(now: string): number;
}
