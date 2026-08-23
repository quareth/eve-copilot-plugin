import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type { SemanticReadComponent, SemanticReadData } from '../../application/dto/semantic-read.js';

export const semanticReadInputSchema = z.object({
  arguments: z.record(z.string().min(1).max(128), z.unknown())
    .refine((value) => Object.keys(value).length <= 50, 'At most 50 semantic arguments are allowed.')
    .default({}),
  continuations: z.record(z.string().min(1).max(128), z.string().min(1).max(2048))
    .refine((value) => Object.keys(value).length <= 20, 'At most 20 continuations are allowed.')
    .default({}),
  max_items: z.number().int().min(1).max(200).default(100),
}).strict();

export const semanticComponentSchema = z.object({
  operation_id: z.string().min(1).max(128),
  purpose: z.string().min(1).max(512),
  result: z.json(),
  page: z.object({
    current: z.number().int().positive(),
    total: z.number().int().positive().nullable(),
  }).strict(),
  continuation: z.string().min(1).max(2048).nullable(),
  cache: z.enum(['not_applicable', 'miss', 'hit', 'revalidated', 'stale']),
  retrieved_at: z.iso.datetime(),
  expires_at: z.iso.datetime().nullable(),
  sde_build: z.number().int().positive().nullable(),
}).strict() satisfies z.ZodType<SemanticReadComponent>;

const semanticReadDataSchema = z.object({
  tool: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/u),
  summary: z.json(),
  components: z.array(semanticComponentSchema).min(1).max(20),
  continuations: z.record(z.string().min(1).max(128), z.string().min(1).max(2048)),
}).strict() satisfies z.ZodType<SemanticReadData>;

export const semanticReadOutputSchema = z.union([
  resultEnvelopeSchema(semanticReadDataSchema), toolErrorEnvelopeSchema,
]);

export const checkRequirementsInputSchema = z.object({
  arguments: z.object({
    type_id: z.string().regex(/^[1-9][0-9]*$/u),
  }).strict(),
}).strict();

const requirementEdgeSchema = z.object({
  source_type_id: z.number().int().positive(),
  source_type_name: z.string().min(1).max(1024),
  requirement_index: z.number().int().min(1).max(6),
  skill_type_id: z.number().int().positive(),
  skill_name: z.string().min(1).max(1024),
  required_level: z.number().int().min(0).max(5),
  depth: z.number().int().positive(),
  direct: z.boolean(),
}).strict();

const effectiveRequirementSchema = z.object({
  order: z.number().int().positive(),
  skill_type_id: z.number().int().positive(),
  skill_name: z.string().min(1).max(1024),
  required_level: z.number().int().min(0).max(5),
  direct: z.boolean(),
  required_by_type_ids: z.array(z.number().int().positive()).max(4_096),
  trained_level: z.number().int().min(0).max(5),
  active_level: z.number().int().min(0).max(5),
  training_level_gap: z.number().int().min(0).max(5),
  active_level_gap: z.number().int().min(0).max(5),
  status: z.enum(['satisfied', 'trained_inactive', 'partially_trained', 'missing']),
}).strict();

export const checkRequirementsOutputSchema = z.union([resultEnvelopeSchema(z.object({
  tool: z.literal('check_requirements'),
  summary: z.object({
    target: z.object({
      type_id: z.number().int().positive(),
      name: z.string().min(1).max(1024),
      group_id: z.number().int().nonnegative(),
      group_name: z.string().min(1).max(1024),
      category_id: z.number().int().nonnegative(),
      category_name: z.string().min(1).max(1024),
      published: z.literal(true),
    }).strict(),
    direct_requirements: z.array(requirementEdgeSchema.omit({
      source_type_id: true,
      source_type_name: true,
      depth: true,
      direct: true,
    })).max(6),
    dependency_edges: z.array(requirementEdgeSchema).max(8_192),
    requirements: z.array(effectiveRequirementSchema).max(4_096),
    requirements_satisfied: z.boolean(),
    closure: z.object({
      complete: z.literal(true),
      node_count: z.number().int().min(0).max(4_096),
      edge_count: z.number().int().min(0).max(8_192),
      maximum_depth: z.number().int().min(0).max(64),
    }).strict(),
    provenance: z.object({
      sde: z.object({ build_number: z.number().int().positive() }).strict(),
      esi: z.object({
        operation_id: z.literal('GetCharactersCharacterIdSkills'),
        retrieved_at: z.iso.datetime().nullable(),
        expires_at: z.iso.datetime().nullable(),
        cache: z.enum(['not_applicable', 'miss', 'hit', 'revalidated', 'stale']),
      }).strict(),
    }).strict(),
  }).strict(),
  components: z.array(semanticComponentSchema).length(2),
  continuations: z.record(z.string(), z.never()),
}).strict()), toolErrorEnvelopeSchema]);
