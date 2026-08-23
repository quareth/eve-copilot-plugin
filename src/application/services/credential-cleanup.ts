import type { Clock } from '../ports/clock.js';
import type { CredentialCleanupRepository } from '../ports/credential-cleanup-repository.js';
import type { CredentialStore, SecretKind } from '../ports/credential-store.js';

export function queueCredentialCleanup(input: {
  readonly cleanup: CredentialCleanupRepository | null;
  readonly reference: string;
  readonly kind: SecretKind;
  readonly createdAt: string;
}): void {
  input.cleanup?.enqueue(input.reference, input.kind, input.createdAt);
}

export async function drainCredentialCleanup(input: {
  readonly cleanup: CredentialCleanupRepository | null;
  readonly credentials: CredentialStore;
  readonly clock: Clock;
  readonly signal: AbortSignal;
}): Promise<void> {
  if (input.cleanup === null) return;
  for (const entry of input.cleanup.list(50)) {
    try {
      await input.credentials.delete(entry.reference, entry.kind, input.signal);
      input.cleanup.remove(entry.reference);
    } catch {
      input.cleanup.markAttempt(entry.reference, input.clock.now().toISOString());
    }
  }
}
