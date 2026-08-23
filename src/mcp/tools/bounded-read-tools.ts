import type { McpServer } from '@modelcontextprotocol/server';
import type { ExecuteBoundedRead } from '../../application/services/execute-bounded-read.js';
import { contextToolAnnotations } from '../schemas/common.js';
import { executeEveReadInputSchema, executeEveReadOutputSchema } from '../schemas/bounded-read.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerBoundedReadTools(
  server: McpServer,
  service: ExecuteBoundedRead,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('execute_eve_read', {
    title: 'Execute a reviewed EVE read capability',
    description: 'Execute one registered read-only EVE capability. Use find_eve_capabilities to obtain its ID and exact arguments. URLs, methods, headers, scopes, and tokens are never accepted.',
    inputSchema: executeEveReadInputSchema,
    outputSchema: executeEveReadOutputSchema,
    annotations: contextToolAnnotations,
  }, (args, context) => executeTool({
    name: 'execute_eve_read',
    outputSchema: executeEveReadOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute({
      capability_id: args.capability_id,
      arguments: args.arguments,
      max_items: args.max_items,
      ...(args.continuation === undefined ? {} : { continuation: args.continuation }),
    }, { requestId, signal }),
  }));
}
