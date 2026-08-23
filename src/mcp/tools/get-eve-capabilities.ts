import type { McpServer } from '@modelcontextprotocol/server';
import type { GetEveCapabilities } from '../../application/services/get-eve-capabilities.js';
import { readOnlyToolAnnotations } from '../schemas/common.js';
import {
  getEveCapabilitiesInputSchema,
  getEveCapabilitiesOutputSchema,
} from '../schemas/get-eve-capabilities.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerGetEveCapabilities(
  server: McpServer,
  service: GetEveCapabilities,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('get_eve_capabilities', {
    title: 'Get EVE capabilities',
    description: 'List available and planned EVE Copilot MCP capabilities.',
    inputSchema: getEveCapabilitiesInputSchema,
    outputSchema: getEveCapabilitiesOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (args, context) => executeTool({
    name: 'get_eve_capabilities',
    outputSchema: getEveCapabilitiesOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute({
      include_operations: args.include_operations,
      limit: args.limit,
      ...(args.domain === undefined ? {} : { domain: args.domain }),
      ...(args.implementation === undefined ? {} : { implementation: args.implementation }),
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    }, { requestId, signal }),
  }));
}
