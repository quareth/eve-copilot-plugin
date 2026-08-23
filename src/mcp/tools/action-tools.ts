import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ExecuteEveAction } from '../../application/services/execute-eve-action.js';
import type { PrepareEveAction } from '../../application/services/prepare-eve-action.js';
import { ESI_OPERATION_FACTS } from '../../capabilities/generated/esi-operation-facts.js';
import type { EsiActionFamily } from '../../domain/esi-operation.js';
import type { JsonValue } from '../../domain/json.js';
import {
  executeEveActionInputSchema,
  executeEveActionOutputSchema,
  prepareEveActionInputSchema,
  prepareEveActionOutputSchema,
} from '../schemas/actions.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

const prepareAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const executeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const USER_CONFIRMATION_INSTRUCTION = [
  'After preparation, stop and show the returned character and exact effect to the user.',
  'Do not call execute_eve_action in the same turn.',
  'Call it only after the user sends a new message explicitly approving that exact action.',
  'Never infer approval from the original request, enabled configuration, or earlier consent.',
].join(' ');

const directActions = [
  {
    name: 'set_autopilot_waypoint',
    title: 'Prepare an autopilot waypoint',
    description: 'Prepare an expiring plan to change the selected character\'s EVE client autopilot route. This does not execute the change.',
    operationId: 'PostUiAutopilotWaypoint',
    capabilityId: 'esi.post_ui_autopilot_waypoint',
    family: 'ui_actions',
  },
  {
    name: 'respond_to_calendar_event',
    title: 'Prepare a calendar response',
    description: 'Prepare an expiring plan to respond to one EVE calendar event. This does not send the response.',
    operationId: 'PutCharactersCharacterIdCalendarEventId',
    capabilityId: 'esi.put_characters_character_id_calendar_event_id',
    family: 'calendar_respond',
  },
  {
    name: 'send_eve_mail',
    title: 'Prepare EVE mail',
    description: 'Prepare an expiring plan to send one EVE mail. The message is not sent until the returned plan is explicitly confirmed.',
    operationId: 'PostCharactersCharacterIdMail',
    capabilityId: 'esi.post_characters_character_id_mail',
    family: 'mail_send',
  },
  {
    name: 'save_fitting',
    title: 'Prepare fitting save',
    description: 'Prepare an expiring plan to save one fitting for the selected character. This does not save it yet.',
    operationId: 'PostCharactersCharacterIdFittings',
    capabilityId: 'esi.post_characters_character_id_fittings',
    family: 'fittings_write',
  },
  {
    name: 'delete_saved_fitting',
    title: 'Prepare fitting deletion',
    description: 'Prepare an expiring plan to delete one saved fitting. This does not delete it until explicit confirmation.',
    operationId: 'DeleteCharactersCharacterIdFittingsFittingId',
    capabilityId: 'esi.delete_characters_character_id_fittings_fitting_id',
    family: 'fittings_write',
  },
] as const satisfies ReadonlyArray<{
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly operationId: string;
  readonly capabilityId: string;
  readonly family: EsiActionFamily;
}>;

export function registerActionTools(
  server: McpServer,
  services: { readonly prepare: PrepareEveAction; readonly execute: ExecuteEveAction },
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('prepare_eve_action', {
    title: 'Prepare an EVE action',
    description: `Validate an enabled EVE state change and return an exact, expiring plan. This tool never performs the action. ${USER_CONFIRMATION_INSTRUCTION}`,
    inputSchema: prepareEveActionInputSchema,
    outputSchema: prepareEveActionOutputSchema,
    annotations: prepareAnnotations,
  }, (args, context) => executeTool({
    name: 'prepare_eve_action',
    outputSchema: prepareEveActionOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => services.prepare.execute({
      capability_id: args.capability_id,
      arguments: args.arguments,
    }, { requestId, signal }),
  }));

  server.registerTool('execute_eve_action', {
    title: 'Execute a confirmed EVE action',
    description: 'Execute one unexpired, single-use EVE action plan. Call this only after preparation has stopped, the exact effect has been shown to the user, and the user has replied in a new message explicitly approving that exact action. Never treat the original request or earlier consent as approval. Arguments cannot be changed after preparation.',
    inputSchema: executeEveActionInputSchema,
    outputSchema: executeEveActionOutputSchema,
    annotations: executeAnnotations,
  }, (args, context) => executeTool({
    name: 'execute_eve_action',
    outputSchema: executeEveActionOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => services.execute.execute(args, { requestId, signal }),
  }));

  for (const definition of directActions) {
    if (!dependencies.config.actionFamilies.includes(definition.family)) continue;
    const inputSchema = directActionInputSchema(definition.operationId);
    server.registerTool(definition.name, {
      title: definition.title,
      description: `${definition.description} ${USER_CONFIRMATION_INSTRUCTION}`,
      inputSchema,
      outputSchema: prepareEveActionOutputSchema,
      annotations: prepareAnnotations,
    }, (args, context) => executeTool({
      name: definition.name,
      outputSchema: prepareEveActionOutputSchema,
      context,
      dependencies,
      execute: (requestId, signal) => services.prepare.execute({
        capability_id: definition.capabilityId,
        arguments: args,
      }, { requestId, signal }),
    }));
  }
}

function directActionInputSchema(operationId: string): z.ZodType<Record<string, unknown>> {
  const operation = ESI_OPERATION_FACTS.find((fact) => fact.operationId === operationId);
  if (operation?.operationClass !== 'action') throw new Error(`Direct action operation is unavailable: ${operationId}`);
  const source = operation.inputSchema as Readonly<Record<string, JsonValue>>;
  const properties = source.properties;
  if (!isJsonObject(properties)) throw new Error(`Direct action schema has no properties: ${operationId}`);
  const required = Array.isArray(source.required)
    ? source.required.filter((entry): entry is string => typeof entry === 'string' && entry !== 'character_id')
    : [];
  const schema = {
    ...source,
    properties: Object.fromEntries(Object.entries(properties).filter(([name]) => name !== 'character_id')),
    required,
  };
  return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodType<Record<string, unknown>>;
}

function isJsonObject(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
