import { z } from 'zod';
import { DIAGNOSTIC_CODES, ERROR_CODES } from '../../domain/errors.js';
import type { CharacterRef, ResultSource } from '../../domain/result.js';
import { RESULT_SCHEMA_VERSION } from '../../domain/versions.js';
import type { ResultWarning } from '../../domain/warning.js';

export const resultWarningSchema: z.ZodType<ResultWarning> = z.object({
  code: z.string().min(1).max(128),
  message: z.string().min(1).max(2000),
  affectedFields: z.array(z.string().min(1).max(256)).max(100).optional(),
}).strict();

export const characterRefSchema: z.ZodType<CharacterRef> = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(256),
}).strict();

export const resultSourceSchema: z.ZodType<ResultSource> = z.object({
  kind: z.enum(['local', 'ESI', 'SDE', 'computed', 'community', 'user_guide']),
  name: z.string().min(1).max(256),
  operation: z.string().min(1).max(256).optional(),
  version: z.string().min(1).max(256).optional(),
}).strict();

// Inference intentionally preserves the concrete data schema for each tool output.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function resultEnvelopeSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    schema_version: z.literal(RESULT_SCHEMA_VERSION),
    request_id: z.uuid(),
    character: characterRefSchema.nullable(),
    data,
    source: resultSourceSchema,
    retrieved_at: z.iso.datetime(),
    expires_at: z.iso.datetime().nullable(),
    cache: z.enum(['not_applicable', 'miss', 'hit', 'revalidated', 'stale']),
    estimated: z.boolean(),
    partial: z.boolean(),
    warnings: z.array(resultWarningSchema).max(100),
  }).strict();
}

export const toolErrorEnvelopeSchema = z.object({
  schema_version: z.literal(RESULT_SCHEMA_VERSION),
  request_id: z.uuid(),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1).max(2000),
    retryable: z.boolean(),
    details: z.object({
      fields: z.array(z.string().min(1).max(256)).max(100).optional(),
      capability_id: z.string().min(1).max(128).optional(),
      retry_after_ms: z.number().int().min(0).max(3_600_000).optional(),
      missing_scopes: z.array(z.string().min(1).max(256)).max(100).optional(),
      scope_bundle: z.string().min(1).max(128).optional(),
      next_step: z.string().min(1).max(2000).optional(),
      session_id: z.uuid().optional(),
      character_id: z.number().int().positive().optional(),
      diagnostic_code: z.enum(DIAGNOSTIC_CODES).optional(),
    }).strict(),
  }).strict(),
}).strict();

export const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const localMutationToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const guideMaintenanceToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const connectionToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const disconnectToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const contextToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
