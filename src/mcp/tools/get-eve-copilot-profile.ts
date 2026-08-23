import type { McpServer } from '@modelcontextprotocol/server';
import type { GetEveCopilotProfile } from '../../application/services/get-eve-copilot-profile.js';
import { readOnlyToolAnnotations } from '../schemas/common.js';
import {
  getEveCopilotProfileInputSchema,
  getEveCopilotProfileOutputSchema,
} from '../schemas/get-eve-copilot-profile.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerGetEveCopilotProfile(
  server: McpServer,
  service: GetEveCopilotProfile,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('get_eve_copilot_profile', {
    title: 'Get EVE Copilot profile',
    description: 'Return the persistent EVE Copilot faction persona and its presentation boundaries.',
    inputSchema: getEveCopilotProfileInputSchema,
    outputSchema: getEveCopilotProfileOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (_args, context) => executeTool({
    name: 'get_eve_copilot_profile',
    outputSchema: getEveCopilotProfileOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute({}, { requestId, signal }),
  }));
}
