import type { SecretKind } from './credential-store.js';

export interface CredentialCleanupEntry {
  readonly reference: string;
  readonly kind: SecretKind;
  readonly createdAt: string;
  readonly attempts: number;
}

export interface CredentialCleanupRepository {
  enqueue(reference: string, kind: SecretKind, createdAt: string): void;
  list(limit: number): readonly CredentialCleanupEntry[];
  markAttempt(reference: string, attemptedAt: string): void;
  remove(reference: string): boolean;
}
