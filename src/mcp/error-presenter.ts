import type { CallToolResult } from '@modelcontextprotocol/server';
import { AppError, isRetryableError } from '../domain/errors.js';
import type { ErrorDetails } from '../domain/errors.js';
import { RESULT_SCHEMA_VERSION } from '../domain/versions.js';
import { assertJsonCompatible } from '../domain/json.js';
import { toolErrorEnvelopeSchema } from './schemas/common.js';

export interface ToolErrorEnvelope {
  readonly schema_version: 1;
  readonly request_id: string;
  readonly error: {
    readonly code: AppError['code'];
    readonly message: string;
    readonly retryable: boolean;
    readonly details: ErrorDetails;
  };
}

export function presentError(error: unknown, requestId: string): CallToolResult {
  const appError = error instanceof AppError
    ? error
    : new AppError({
      code: 'INTERNAL_ERROR',
      safeMessage: 'The request could not be completed because of an internal error.',
      cause: error,
    });
  const envelope: ToolErrorEnvelope = {
    schema_version: RESULT_SCHEMA_VERSION,
    request_id: requestId,
    error: {
      code: appError.code,
      message: appError.safeMessage,
      retryable: isRetryableError(appError.code),
      details: appError.details,
    },
  };
  const parsed = toolErrorEnvelopeSchema.parse(envelope);
  assertJsonCompatible(parsed);
  const text = JSON.stringify(parsed);
  return {
    content: [{ type: 'text', text }],
    structuredContent: parsed,
    isError: true,
  };
}
