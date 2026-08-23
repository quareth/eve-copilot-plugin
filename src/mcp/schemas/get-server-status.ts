import { z } from 'zod';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';
import type { ServerStatusData } from '../../application/dto/server-status.js';

export const getServerStatusInputSchema = z.object({}).strict();

export const serverStatusDataSchema: z.ZodType<ServerStatusData> = z.object({
  name: z.literal('eve-copilot-mcp'),
  version: z.string().min(1).max(100),
  status: z.enum(['ready', 'degraded']),
  transport: z.literal('stdio'),
  protocol: z.object({
    sdk_major: z.literal(2),
    negotiated_version: z.string().min(1).max(64).nullable(),
  }).strict(),
  database_schema_version: z.number().int().min(0),
  capabilities: z.object({
    available: z.number().int().min(0),
    degraded: z.number().int().min(0),
    disabled: z.number().int().min(0),
    planned: z.number().int().min(0),
  }).strict(),
}).strict();

export const getServerStatusOutputSchema = z.union([
  resultEnvelopeSchema(serverStatusDataSchema),
  toolErrorEnvelopeSchema,
]);
