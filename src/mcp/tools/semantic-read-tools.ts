import type { McpServer } from '@modelcontextprotocol/server';
import type { ExecuteSemanticRead } from '../../application/services/execute-semantic-read.js';
import { ESI_SEMANTIC_TOOLS } from '../../capabilities/generated/semantic-tools.js';
import { contextToolAnnotations } from '../schemas/common.js';
import {
  checkRequirementsInputSchema,
  checkRequirementsOutputSchema,
  semanticReadInputSchema,
  semanticReadOutputSchema,
} from '../schemas/semantic-read.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerSemanticReadTools(
  server: McpServer,
  service: ExecuteSemanticRead,
  dependencies: ToolExecutionDependencies,
): void {
  for (const definition of ESI_SEMANTIC_TOOLS) {
    if (definition.behavior === 'requirements') {
      server.registerTool(definition.name, {
        title: definition.title,
        description: definition.description,
        inputSchema: checkRequirementsInputSchema,
        outputSchema: checkRequirementsOutputSchema,
        annotations: contextToolAnnotations,
      }, (args, context) => executeTool({
        name: definition.name,
        outputSchema: checkRequirementsOutputSchema,
        context,
        dependencies,
        execute: (requestId, signal) => service.execute({
          tool_name: definition.name,
          arguments: args.arguments,
          continuations: {},
          max_items: 200,
        }, { requestId, signal }),
      }));
      continue;
    }
    server.registerTool(definition.name, {
      title: definition.title,
      description: definition.description,
      inputSchema: semanticReadInputSchema,
      outputSchema: semanticReadOutputSchema,
      annotations: contextToolAnnotations,
    }, (args, context) => executeTool({
      name: definition.name,
      outputSchema: semanticReadOutputSchema,
      context,
      dependencies,
      execute: (requestId, signal) => service.execute({
        tool_name: definition.name,
        arguments: args.arguments,
        continuations: args.continuations,
        max_items: args.max_items,
      }, { requestId, signal }),
    }));
  }
}
