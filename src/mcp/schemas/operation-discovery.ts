import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type {
  OperationCapabilityView,
  OperationDiscoveryData,
} from '../../application/dto/operation-discovery.js';

const packs = [
  'character_communication',
  'inventory_economy',
  'organizations_operations',
  'universe_static',
  'warfare_intelligence',
  'eve_client_ui',
] as const;

export const findEveCapabilitiesInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().min(1).max(128).optional(),
  pack: z.enum(packs).optional(),
  access: z.enum(['public', 'character', 'corporation', 'alliance', 'fleet']).optional(),
  operation_class: z.enum(['read', 'action']).optional(),
  implementation: z.enum(['available', 'degraded', 'disabled', 'planned']).optional(),
  availability: z.enum(['available', 'unavailable']).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();

const capabilitySchema = z.object({
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  operation_id: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  domain: z.string().min(1).max(128),
  pack: z.enum(packs),
  access: z.enum(['public', 'character', 'corporation', 'alliance', 'fleet']),
  operation_class: z.enum(['read', 'action']),
  exposure: z.literal('bounded'),
  implementation: z.literal('available'),
  required_scopes: z.array(z.string().min(1).max(256)).max(100),
  missing_scopes: z.array(z.string().min(1).max(256)).max(100),
  required_roles_any_of: z.array(z.string().min(1).max(128)).max(100),
  action_family: z.string().min(1).max(128).nullable(),
  scope_bundle: z.string().min(1).max(128).nullable(),
  available: z.boolean(),
  unavailable_reason: z.string().min(1).max(1000).nullable(),
  input_schema: z.json(),
}).strict() satisfies z.ZodType<OperationCapabilityView>;

const operationDiscoveryDataSchema = z.object({
  total_matches: z.number().int().min(0).max(233),
  returned: z.number().int().min(0).max(50),
  capabilities: z.array(capabilitySchema).max(50),
}).strict() satisfies z.ZodType<OperationDiscoveryData>;

export const findEveCapabilitiesOutputSchema = z.union([
  resultEnvelopeSchema(operationDiscoveryDataSchema), toolErrorEnvelopeSchema,
]);
