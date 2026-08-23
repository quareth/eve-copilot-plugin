import type { McpServer } from '@modelcontextprotocol/server';
import type { GetServerDiagnostics } from '../../application/services/get-server-diagnostics.js';
import { readOnlyToolAnnotations } from '../schemas/common.js';
import {
  getServerDiagnosticsInputSchema,
  getServerDiagnosticsOutputSchema,
} from '../schemas/get-server-diagnostics.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerGetServerDiagnostics(
  server: McpServer,
  service: GetServerDiagnostics,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('get_server_diagnostics', {
    title: 'Get server diagnostics',
    description: 'Inspect safe local readiness checks and remediation guidance.',
    inputSchema: getServerDiagnosticsInputSchema,
    outputSchema: getServerDiagnosticsOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (args, context) => executeTool({
    name: 'get_server_diagnostics',
    outputSchema: getServerDiagnosticsOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute(
      args.include === undefined ? {} : { include: args.include },
      { requestId, signal },
    ),
  }));
}
