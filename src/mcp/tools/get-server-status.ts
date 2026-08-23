import type { McpServer } from '@modelcontextprotocol/server';
import type { GetServerStatus } from '../../application/services/get-server-status.js';
import { readOnlyToolAnnotations } from '../schemas/common.js';
import {
  getServerStatusInputSchema,
  getServerStatusOutputSchema,
} from '../schemas/get-server-status.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerGetServerStatus(
  server: McpServer,
  service: GetServerStatus,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('get_server_status', {
    title: 'Get server status',
    description: 'Return a compact readiness summary for EVE Copilot MCP.',
    inputSchema: getServerStatusInputSchema,
    outputSchema: getServerStatusOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (_args, context) => executeTool({
    name: 'get_server_status',
    outputSchema: getServerStatusOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute({}, { requestId, signal }),
  }));
}
