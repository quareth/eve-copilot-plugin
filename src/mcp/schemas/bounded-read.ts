import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type { BoundedReadData } from '../../application/dto/bounded-read.js';

export const executeEveReadInputSchema = z.object({
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  arguments: z.record(z.string().min(1).max(128), z.unknown())
    .refine((value) => Object.keys(value).length <= 50, 'At most 50 operation arguments are allowed.')
    .default({}),
  continuation: z.string().min(1).max(512).optional(),
  max_items: z.number().int().min(1).max(200).default(200),
}).strict();

const jsonValueSchema = z.json();

const boundedReadDataSchema = z.object({
  capability_id: z.string().regex(/^esi\.[a-z0-9_.-]{1,124}$/u),
  operation_id: z.string().min(1).max(128),
  result: jsonValueSchema,
  page: z.object({
    current: z.number().int().positive(),
    total: z.number().int().positive().nullable(),
  }).strict(),
  continuation: z.string().min(1).max(2048).nullable(),
}).strict() satisfies z.ZodType<BoundedReadData>;

export const executeEveReadOutputSchema = z.union([
  resultEnvelopeSchema(boundedReadDataSchema), toolErrorEnvelopeSchema,
]);
