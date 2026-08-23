import { z } from 'zod';
import { characterRefSchema, resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type { CapabilitiesData, CapabilityView } from '../../application/dto/capabilities.js';
import { CAPABILITY_SCHEMA_VERSION } from '../../domain/versions.js';

export const capabilityDomainSchema = z.enum([
  'foundation', 'identity', 'character', 'skills', 'assets', 'fittings',
  'wallet', 'market', 'contracts', 'industry', 'navigation', 'corporation',
  'communication', 'intelligence', 'guide',
]);

export const implementationStateSchema = z.enum(['available', 'degraded', 'disabled', 'planned']);

export const getEveCapabilitiesInputSchema = z.object({
  domain: capabilityDomainSchema.optional(),
  implementation: implementationStateSchema.optional(),
  include_operations: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.string().min(1).max(256).optional(),
}).strict();

export const capabilityViewSchema: z.ZodType<CapabilityView> = z.object({
  id: z.string().min(1).max(128),
  domain: capabilityDomainSchema,
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(2000),
  implementation: implementationStateSchema,
  access: z.enum(['public', 'character', 'corporation']),
  operation_class: z.enum(['read', 'action', 'local_mutation']),
  sources: z.array(z.enum(['local', 'ESI', 'SDE', 'computed', 'community', 'user_guide'])).max(6),
  semantic_tools: z.array(z.string().min(1).max(128)).max(20),
  authorization: z.object({
    status: z.enum(['not_required', 'not_connected', 'authorized', 'missing_scope', 'insufficient_role']),
    required_scopes: z.array(z.string().min(1).max(256)).max(100),
    missing_scopes: z.array(z.string().min(1).max(256)).max(100),
    required_roles: z.array(z.string().min(1).max(256)).max(100),
    missing_roles: z.array(z.string().min(1).max(256)).max(100),
  }).strict(),
  unavailable_reason: z.string().min(1).max(2000).nullable(),
}).strict();

export const capabilitiesDataSchema: z.ZodType<CapabilitiesData> = z.object({
  registry_version: z.literal(CAPABILITY_SCHEMA_VERSION),
  connection: z.object({
    status: z.enum(['not_supported_yet', 'not_connected', 'connected']),
    active_character: characterRefSchema.nullable(),
    pending_connections: z.number().int().min(0),
  }).strict(),
  summary: z.object({
    available: z.number().int().min(0),
    degraded: z.number().int().min(0),
    disabled: z.number().int().min(0),
    planned: z.number().int().min(0),
  }).strict(),
  capabilities: z.array(capabilityViewSchema).max(200),
  next_cursor: z.string().min(1).max(256).nullable(),
}).strict();

export const getEveCapabilitiesOutputSchema = z.union([
  resultEnvelopeSchema(capabilitiesDataSchema),
  toolErrorEnvelopeSchema,
]);
