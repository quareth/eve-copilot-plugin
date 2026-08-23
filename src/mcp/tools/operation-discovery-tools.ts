import type { McpServer } from '@modelcontextprotocol/server';
import type { FindEveCapabilities } from '../../application/services/find-eve-capabilities.js';
import { readOnlyToolAnnotations } from '../schemas/common.js';
import {
  findEveCapabilitiesInputSchema,
  findEveCapabilitiesOutputSchema,
} from '../schemas/operation-discovery.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerOperationDiscoveryTools(
  server: McpServer,
  service: FindEveCapabilities,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('find_eve_capabilities', {
    title: 'Find EVE capabilities',
    description: 'Search the complete reviewed ESI capability catalog by player goal, domain, access type, or read/action class. Returns the exact schema needed by execute_eve_read or prepare_eve_action.',
    inputSchema: findEveCapabilitiesInputSchema,
    outputSchema: findEveCapabilitiesOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (args, context) => executeTool({
    name: 'find_eve_capabilities',
    outputSchema: findEveCapabilitiesOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute({
      limit: args.limit,
      ...(args.query === undefined ? {} : { query: args.query }),
      ...(args.domain === undefined ? {} : { domain: args.domain }),
      ...(args.pack === undefined ? {} : { pack: args.pack }),
      ...(args.access === undefined ? {} : { access: args.access }),
      ...(args.operation_class === undefined ? {} : { operation_class: args.operation_class }),
      ...(args.implementation === undefined ? {} : { implementation: args.implementation }),
      ...(args.availability === undefined ? {} : { availability: args.availability }),
    }, { requestId, signal }),
  }));
}
