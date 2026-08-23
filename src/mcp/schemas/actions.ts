import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type {
  ExecuteEveActionInput,
  ExecutedActionData,
  PrepareEveActionInput,
  PreparedActionData,
} from '../../application/dto/actions.js';

export const prepareEveActionInputSchema = z.object({
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  arguments: z.record(z.string().min(1).max(128), z.unknown())
    .refine((value) => Object.keys(value).length <= 50, 'At most 50 operation arguments are allowed.'),
}).strict() satisfies z.ZodType<PrepareEveActionInput>;

export const executeEveActionInputSchema = z.object({
  plan_id: z.uuid(),
  confirmation: z.uuid(),
}).strict() satisfies z.ZodType<ExecuteEveActionInput>;

const preparedActionDataSchema = z.object({
  plan_id: z.uuid(),
  confirmation: z.uuid(),
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  operation_id: z.string().min(1).max(128),
  character: z.object({ id: z.number().int().positive(), name: z.string().min(1).max(256) }).strict(),
  effect: z.record(z.string(), z.json()),
  required_scopes: z.array(z.string().min(1).max(256)).max(100),
  expires_at: z.iso.datetime(),
  irreversible: z.boolean(),
}).strict() satisfies z.ZodType<PreparedActionData>;

export const prepareEveActionOutputSchema = z.union([
  resultEnvelopeSchema(preparedActionDataSchema), toolErrorEnvelopeSchema,
]);

const executedActionDataSchema = z.object({
  plan_id: z.uuid(),
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  operation_id: z.string().min(1).max(128),
  state: z.literal('succeeded'),
  result: z.json(),
}).strict() satisfies z.ZodType<ExecutedActionData>;

export const executeEveActionOutputSchema = z.union([
  resultEnvelopeSchema(executedActionDataSchema), toolErrorEnvelopeSchema,
]);
