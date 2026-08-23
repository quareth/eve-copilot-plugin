import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';

export const characterIdSchema = z.number().int().positive();
export const sessionIdSchema = z.uuid();
export const connectionStateSchema = z.enum([
  'authorization_required', 'pending', 'connected', 'failed', 'expired', 'cancelled',
]);

export const characterSummarySchema = z.object({
  character_id: characterIdSchema,
  character_name: z.string().min(1).max(256),
  selected: z.boolean(),
  connection_state: z.enum(['connected', 'reauthorization_required', 'removal_pending']),
  granted_scopes: z.array(z.string().min(1).max(256)).max(100),
  missing_required_scopes: z.array(z.string().min(1).max(256)).max(2),
  last_verified_at: z.iso.datetime(),
  next_step: z.string().min(1).max(2000).nullable(),
}).strict();

export const connectionSessionDataSchema = z.object({
  session_id: sessionIdSchema,
  state: connectionStateSchema,
  authorization_url: z.url().max(4096).nullable(),
  expires_at: z.iso.datetime(),
  requested_scopes: z.array(z.string().min(1).max(256)).max(100),
  browser_opened: z.boolean(),
  character: characterSummarySchema.nullable(),
  next_step: z.string().min(1).max(2000),
}).strict();

export const connectCharacterInputSchema = z.object({
  open_browser: z.boolean().default(true),
}).strict();

export const connectionSessionInputSchema = z.object({
  session_id: sessionIdSchema,
}).strict();

export const reauthorizeCharacterInputSchema = z.object({
  character_id: characterIdSchema,
  open_browser: z.boolean().default(true),
  capability_id: z.string().regex(/^(?:esi\.[a-z0-9_.-]{1,124}|[a-z][a-z0-9_]{1,127})$/u).optional(),
  scope_mode: z.enum(['minimum', 'all_reads']).default('minimum'),
}).strict().refine(
  (input) => input.scope_mode !== 'all_reads' || input.capability_id === undefined,
  { message: 'capability_id cannot be combined with scope_mode all_reads.', path: ['capability_id'] },
);

export const listCharactersInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(256).optional(),
}).strict();

export const characterIdInputSchema = z.object({ character_id: characterIdSchema }).strict();

const cancelDataSchema = z.object({
  session_id: sessionIdSchema,
  state: z.enum(['cancelled', 'connected', 'failed', 'expired']),
  cancelled: z.boolean(),
}).strict();

const listCharactersDataSchema = z.object({
  characters: z.array(characterSummarySchema).max(100),
  next_cursor: z.string().min(1).max(256).nullable(),
}).strict();

const selectCharacterDataSchema = z.object({
  character: characterSummarySchema,
  changed: z.boolean(),
}).strict();

const disconnectCharacterDataSchema = z.object({
  character_id: characterIdSchema,
  credentials_removed: z.literal(true),
  metadata_removed: z.literal(true),
  selection_cleared: z.boolean(),
  guide_pages_removed: z.number().int().nonnegative(),
  guide_revisions_removed: z.number().int().nonnegative(),
}).strict();

export const connectionSessionOutputSchema = z.union([
  resultEnvelopeSchema(connectionSessionDataSchema), toolErrorEnvelopeSchema,
]);
export const cancelConnectionOutputSchema = z.union([
  resultEnvelopeSchema(cancelDataSchema), toolErrorEnvelopeSchema,
]);
export const listCharactersOutputSchema = z.union([
  resultEnvelopeSchema(listCharactersDataSchema), toolErrorEnvelopeSchema,
]);
export const selectCharacterOutputSchema = z.union([
  resultEnvelopeSchema(selectCharacterDataSchema), toolErrorEnvelopeSchema,
]);
export const disconnectCharacterOutputSchema = z.union([
  resultEnvelopeSchema(disconnectCharacterDataSchema), toolErrorEnvelopeSchema,
]);
