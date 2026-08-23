import { z } from 'zod';
import { GUIDE_SCHEMA_VERSION } from '../../domain/guide.js';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';

const pageIdSchema = z.string().min(1).max(192)
  .regex(/^[a-z0-9][a-z0-9-]{0,63}(?:\/[a-z0-9][a-z0-9-]{0,63}){0,3}$/u);
const pageKindSchema = z.enum(['question', 'ship', 'skill', 'fitting', 'item', 'concept', 'comparison']);
const pageStatusSchema = z.enum(['current', 'superseded', 'archived', 'invalid']);
const guideScopeSchema = z.enum(['user', 'character']);
const sourceKindSchema = z.enum(['ESI', 'SDE', 'computed', 'community', 'user', 'general_knowledge']);

const freshnessSchema = z.object({
  kind: z.enum(['stable', 'dated_snapshot', 'unverified']),
  observed_at: z.iso.datetime().nullable(),
}).strict().refine((value) => (value.kind === 'dated_snapshot') === (value.observed_at !== null), {
  message: 'Only dated snapshots have an observed_at timestamp.',
});

const provenanceSchema = z.object({
  source_kind: sourceKindSchema,
  reference: z.string().trim().min(1).max(512),
  retrieved_at: z.iso.datetime().nullable(),
  version: z.string().trim().min(1).max(128).nullable(),
}).strict().superRefine((value, context) => {
  if (value.source_kind === 'ESI' && value.retrieved_at === null) {
    context.addIssue({ code: 'custom', path: ['retrieved_at'], message: 'ESI provenance requires a retrieval timestamp.' });
  }
  if (value.source_kind === 'SDE' && (value.version === null || !/^[1-9][0-9]{0,9}$/u.test(value.version))) {
    context.addIssue({ code: 'custom', path: ['version'], message: 'SDE provenance requires a numeric build version.' });
  }
  if (value.source_kind === 'computed' && value.version === null) {
    context.addIssue({ code: 'custom', path: ['version'], message: 'Computed provenance requires an engine version.' });
  }
});

const metadataSchema = z.object({
  schema_version: z.literal(GUIDE_SCHEMA_VERSION),
  page_id: pageIdSchema,
  title: z.string().trim().min(1).max(160),
  page_kind: pageKindSchema,
  scope: guideScopeSchema,
  character_id: z.number().int().positive().nullable(),
  status: pageStatusSchema,
  revision: z.number().int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  authority: z.literal('advisory'),
  source_type: z.literal('user_guide'),
  freshness: freshnessSchema,
  related_type_ids: z.array(z.number().int().positive()).max(100),
  related_pages: z.array(pageIdSchema).max(100),
  provenance: z.array(provenanceSchema).max(50),
  superseded_by: pageIdSchema.nullable(),
}).strict();

const summarySchema = metadataSchema.pick({
  page_id: true,
  title: true,
  page_kind: true,
  scope: true,
  character_id: true,
  status: true,
  revision: true,
  updated_at: true,
  authority: true,
  source_type: true,
  freshness: true,
});

const pageSchema = z.object({
  metadata: metadataSchema,
  content: z.string().min(1).max(65_536),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

const guideResultIdentitySchema = z.object({
  source_type: z.literal('user_guide'),
  authority: z.literal('advisory'),
  content_trust: z.literal('untrusted_advisory_data'),
  current_claim_policy: z.literal('refresh_authoritative_source'),
}).strict();

export const searchEveGuideInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  statuses: z.array(pageStatusSchema).min(1).max(4)
    .refine((values) => new Set(values).size === values.length, 'Guide statuses must be unique.')
    .optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();

export const searchEveGuideOutputSchema = z.union([
  resultEnvelopeSchema(guideResultIdentitySchema.extend({
    results: z.array(z.object({
      metadata: summarySchema,
      snippet: z.string().max(322),
      score: z.number().int().nonnegative(),
    }).strict()).max(20),
  })),
  toolErrorEnvelopeSchema,
]);

export const readEveGuidePageInputSchema = z.object({
  page_id: pageIdSchema,
  revision: z.number().int().positive().optional(),
}).strict();

export const readEveGuidePageOutputSchema = z.union([
  resultEnvelopeSchema(z.object({
    source_type: z.literal('user_guide'),
    authority: z.literal('advisory'),
    content_trust: z.literal('untrusted_advisory_data'),
    handling_notice: z.string().min(1).max(1000),
    page: pageSchema,
    freshness_assessment: z.object({
      current_claim_policy: z.literal('refresh_authoritative_source'),
      requires_authoritative_refresh: z.boolean(),
      sde_verification: z.enum(['not_applicable', 'current', 'stale', 'unavailable', 'unverified']),
      active_sde_build: z.number().int().positive().nullable(),
    }).strict(),
  }).strict()),
  toolErrorEnvelopeSchema,
]);

const relatedFields = {
  freshness: freshnessSchema,
  related_type_ids: z.array(z.number().int().positive()).max(100).optional(),
  related_pages: z.array(pageIdSchema).max(100).optional(),
  provenance: z.array(provenanceSchema).max(50).optional(),
} as const;

const createSchema = z.object({
  action: z.literal('create'),
  page_id: pageIdSchema,
  title: z.string().trim().min(1).max(160),
  page_kind: pageKindSchema,
  scope: guideScopeSchema,
  content: z.string().trim().min(1).max(65_536),
  ...relatedFields,
}).strict();

const reviseSchema = z.object({
  action: z.literal('revise'),
  page_id: pageIdSchema,
  expected_revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  page_kind: pageKindSchema.optional(),
  content: z.string().trim().min(1).max(65_536).optional(),
  freshness: freshnessSchema.optional(),
  related_type_ids: relatedFields.related_type_ids,
  related_pages: relatedFields.related_pages,
  provenance: relatedFields.provenance,
}).strict();

const setStatusSchema = z.object({
  action: z.literal('set_status'),
  page_id: pageIdSchema,
  expected_revision: z.number().int().positive(),
  status: pageStatusSchema,
  superseded_by: pageIdSchema.optional(),
}).strict().refine((value) => (value.status === 'superseded') === (value.superseded_by !== undefined), {
  message: 'Only superseded pages identify a superseding page.',
});

const removeSchema = z.object({
  action: z.literal('remove'),
  page_id: pageIdSchema,
  expected_revision: z.number().int().positive(),
}).strict();

const restoreSchema = z.object({
  action: z.literal('restore'),
  page_id: pageIdSchema,
  revision: z.number().int().positive(),
  expected_revision: z.number().int().positive().optional(),
}).strict();

export const maintainEveGuideInputSchema = z.object({
  action: z.enum(['create', 'revise', 'set_status', 'remove', 'restore']),
  page_id: pageIdSchema,
  expected_revision: z.number().int().positive().optional(),
  revision: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  page_kind: pageKindSchema.optional(),
  scope: guideScopeSchema.optional(),
  content: z.string().trim().min(1).max(65_536).optional(),
  freshness: freshnessSchema.optional(),
  related_type_ids: relatedFields.related_type_ids,
  related_pages: relatedFields.related_pages,
  provenance: relatedFields.provenance,
  status: pageStatusSchema.optional(),
  superseded_by: pageIdSchema.optional(),
}).strict().superRefine((value, context) => {
  const parsed = value.action === 'create' ? createSchema.safeParse(value)
    : value.action === 'revise' ? reviseSchema.safeParse(value)
      : value.action === 'set_status' ? setStatusSchema.safeParse(value)
        : value.action === 'remove' ? removeSchema.safeParse(value)
          : restoreSchema.safeParse(value);
  if (parsed.success) return;
  context.addIssue({
    code: 'custom',
    message: `Fields do not match the ${value.action} guide action: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
  });
});

export const maintainEveGuideOutputSchema = z.union([
  resultEnvelopeSchema(z.object({
    source_type: z.literal('user_guide'),
    authority: z.literal('advisory'),
    action: z.enum(['create', 'revise', 'set_status', 'remove', 'restore']),
    page: pageSchema.nullable(),
    removed: z.object({
      page_id: pageIdSchema,
      removed_revision: z.number().int().positive(),
    }).strict().nullable(),
  }).strict()),
  toolErrorEnvelopeSchema,
]);
