export const ERROR_CODES = [
  'NOT_CONNECTED', 'CHARACTER_NOT_SELECTED', 'AUTHORIZATION_SESSION_NOT_FOUND',
  'AUTHORIZATION_SESSION_EXPIRED', 'AUTHORIZATION_CALLBACK_UNAVAILABLE',
  'REAUTHORIZATION_REQUIRED', 'CREDENTIAL_STORE_UNAVAILABLE', 'CREDENTIAL_REMOVAL_PENDING',
  'MISSING_SCOPE', 'INSUFFICIENT_ROLE', 'NOT_FOUND', 'AMBIGUOUS_INPUT', 'ESI_UNAVAILABLE',
  'RATE_LIMITED', 'STALE_DATA', 'UPSTREAM_SERVICE_FAILED', 'UPSTREAM_CONTRACT_MISMATCH',
  'SDE_UNAVAILABLE', 'SDE_INVALID', 'GUIDE_UNAVAILABLE', 'GUIDE_INVALID', 'GUIDE_CONFLICT',
  'ACTION_REQUIRES_CONFIRMATION', 'INVALID_CONFIGURATION', 'DATABASE_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE', 'INVALID_CONTINUATION', 'RESULT_LIMIT_EXCEEDED',
  'ACTION_OUTCOME_UNCERTAIN', 'ACTION_PLAN_NOT_FOUND', 'ACTION_PLAN_EXPIRED',
  'ACTION_ALREADY_EXECUTED', 'ACTION_DISABLED', 'CANCELLED', 'INTERNAL_ERROR',
] as const;

export type ErrorCode = typeof ERROR_CODES[number];

export const DIAGNOSTIC_CODES = [
  'SSO_REFRESH_TOKEN_MISSING',
  'JWT_ALGORITHM_NOT_ALLOWED',
  'JWT_KEY_ID_MISSING',
  'JWT_SIGNING_KEY_NOT_FOUND',
  'JWT_SIGNING_KEY_AMBIGUOUS',
  'JWT_KEY_IMPORT_FAILED',
  'JWT_SIGNATURE_INVALID',
  'JWT_ISSUER_INVALID',
  'JWT_EXPIRED',
  'JWT_NOT_ACTIVE',
  'JWT_REQUIRED_CLAIM_MISSING',
  'JWT_MALFORMED',
  'JWT_CRYPTO_OPERATION_FAILED',
  'JWT_VERIFICATION_FAILED',
  'JWT_AUDIENCE_INVALID',
  'JWT_SUBJECT_INVALID',
  'JWT_CHARACTER_CLAIMS_INVALID',
  'JWT_SCOPES_INVALID',
  'JWT_EXPIRY_MISSING',
] as const;

export type DiagnosticCode = typeof DIAGNOSTIC_CODES[number];

export interface ErrorDetails {
  readonly fields?: readonly string[];
  readonly capability_id?: string;
  readonly retry_after_ms?: number;
  readonly missing_scopes?: readonly string[];
  readonly scope_bundle?: string;
  readonly next_step?: string;
  readonly session_id?: string;
  readonly character_id?: number;
  readonly diagnostic_code?: DiagnosticCode;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly safeMessage: string;
  readonly details: ErrorDetails;
  override readonly cause: unknown;

  constructor(input: {
    readonly code: ErrorCode;
    readonly safeMessage: string;
    readonly details?: ErrorDetails;
    readonly cause?: unknown;
  }) {
    super(input.safeMessage, { cause: input.cause });
    this.name = 'AppError';
    this.code = input.code;
    this.safeMessage = input.safeMessage;
    this.details = input.details ?? {};
    this.cause = input.cause;
  }
}

export function isRetryableError(code: ErrorCode, transientDatabaseFailure = false): boolean {
  if (
    code === 'RATE_LIMITED'
    || code === 'ESI_UNAVAILABLE'
    || code === 'UPSTREAM_SERVICE_FAILED'
    || code === 'AUTHORIZATION_CALLBACK_UNAVAILABLE'
    || code === 'CREDENTIAL_STORE_UNAVAILABLE'
    || code === 'CREDENTIAL_REMOVAL_PENDING'
    || code === 'GUIDE_UNAVAILABLE'
  ) {
    return true;
  }
  return code === 'DATABASE_UNAVAILABLE' && transientDatabaseFailure;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AppError({ code: 'CANCELLED', safeMessage: 'The request was cancelled.' });
  }
}
