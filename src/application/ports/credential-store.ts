export type SecretKind = 'character_grant' | 'pkce_verifier' | 'audit_hmac_key';

export type CredentialStoreState = 'available' | 'locked' | 'unavailable';

export interface CredentialStore {
  probe(signal: AbortSignal): Promise<CredentialStoreState>;
  create(kind: SecretKind, value: string, signal: AbortSignal): Promise<string>;
  read(reference: string, expectedKind: SecretKind, signal: AbortSignal): Promise<string | null>;
  replace(
    reference: string,
    expectedKind: SecretKind,
    value: string,
    signal: AbortSignal,
  ): Promise<void>;
  delete(
    reference: string,
    expectedKind: SecretKind,
    signal: AbortSignal,
  ): Promise<'deleted' | 'absent'>;
}
