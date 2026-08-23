import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type {
  LocationData,
  OverviewData,
  OverviewIdentity,
  ShipData,
} from '../../application/dto/context.js';

export const contextInputSchema = z.object({}).strict();

// Inference intentionally preserves each availability value schema.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function availabilitySchema<T extends z.ZodType>(value: T) {
  return z.object({
    status: z.enum(['available', 'unavailable', 'unresolved']),
    value: value.nullable(),
    reason: z.string().min(1).max(2000).nullable(),
  }).strict();
}

const namedSafeIdSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(256),
}).strict();
const namedLargeIdSchema = z.object({
  id: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  name: z.string().min(1).max(256),
}).strict();

export const locationDataSchema = z.object({
  state: z.enum(['space', 'station', 'structure']),
  solar_system: availabilitySchema(namedSafeIdSchema),
  constellation: availabilitySchema(namedSafeIdSchema),
  region: availabilitySchema(namedSafeIdSchema),
  station: availabilitySchema(namedLargeIdSchema),
  structure: availabilitySchema(namedLargeIdSchema),
  sde_build: z.number().int().positive(),
}).strict() satisfies z.ZodType<LocationData>;

export const shipDataSchema = z.object({
  ship_item_id: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  ship_type: availabilitySchema(namedSafeIdSchema),
  player_assigned_name: z.string().max(256),
  sde_build: z.number().int().positive(),
}).strict() satisfies z.ZodType<ShipData>;

const overviewIdentitySchema = z.object({
  character_id: z.number().int().positive(),
  character_name: z.string().min(1).max(256),
  corporation_id: z.number().int().positive(),
  alliance_id: z.number().int().positive().nullable(),
}).strict() satisfies z.ZodType<OverviewIdentity>;

export const overviewDataSchema = z.object({
  identity: availabilitySchema(overviewIdentitySchema),
  location: availabilitySchema(locationDataSchema),
  ship: availabilitySchema(shipDataSchema),
}).strict() satisfies z.ZodType<OverviewData>;

export const currentLocationOutputSchema = z.union([
  resultEnvelopeSchema(locationDataSchema), toolErrorEnvelopeSchema,
]);
export const currentShipOutputSchema = z.union([
  resultEnvelopeSchema(shipDataSchema), toolErrorEnvelopeSchema,
]);
export const characterOverviewOutputSchema = z.union([
  resultEnvelopeSchema(overviewDataSchema), toolErrorEnvelopeSchema,
]);
