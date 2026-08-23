import { z } from 'zod';
import type { CopilotProfileData } from '../../application/dto/copilot-profile.js';
import { PERSONA_FACTIONS } from '../../domain/copilot-profile.js';
import { resultEnvelopeSchema, toolErrorEnvelopeSchema } from './common.js';

export const getEveCopilotProfileInputSchema = z.object({}).strict();

export const copilotProfileDataSchema: z.ZodType<CopilotProfileData> = z.object({
  persona: z.object({
    faction: z.enum(PERSONA_FACTIONS),
    display_name: z.string().min(1).max(64),
    enabled: z.boolean(),
    identity: z.string().min(1).max(500),
    voice: z.array(z.string().min(1).max(500)).min(1).max(10),
    boundaries: z.array(z.string().min(1).max(500)).min(1).max(10),
  }).strict(),
  available_factions: z.array(z.enum(PERSONA_FACTIONS)).length(PERSONA_FACTIONS.length),
  change_command: z.literal(
    'eve-copilot-mcp setup --persona <none|amarr|caldari|gallente|minmatar>',
  ),
  restart_required_after_change: z.literal(true),
}).strict();

export const getEveCopilotProfileOutputSchema = z.union([
  resultEnvelopeSchema(copilotProfileDataSchema),
  toolErrorEnvelopeSchema,
]);
