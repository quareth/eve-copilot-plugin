export interface AuthorizationCallbackInput {
  readonly state: string;
  readonly code: string | null;
  readonly providerError: string | null;
}

export interface AuthorizationCallbackListener {
  ensureListening(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export type AuthorizationCallbackHandler = (
  input: AuthorizationCallbackInput,
) => Promise<void>;
