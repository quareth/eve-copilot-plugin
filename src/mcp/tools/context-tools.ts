import type { McpServer } from '@modelcontextprotocol/server';
import type { AppServices } from '../../application/services/app-services.js';
import {
  characterOverviewOutputSchema,
  contextInputSchema,
  currentLocationOutputSchema,
  currentShipOutputSchema,
} from '../schemas/context.js';
import { contextToolAnnotations } from '../schemas/common.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerContextTools(
  server: McpServer,
  services: AppServices,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('get_character_overview', {
    title: 'Get character overview',
    description: 'Get a compact EVE identity, current location, and current ship overview for the selected character.',
    inputSchema: contextInputSchema,
    outputSchema: characterOverviewOutputSchema,
    annotations: contextToolAnnotations,
  }, (_args, context) => executeTool({
    name: 'get_character_overview', outputSchema: characterOverviewOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.getCharacterOverview.execute({}, { requestId, signal }),
  }));

  server.registerTool('get_current_location', {
    title: 'Get current location',
    description: 'Get the selected EVE character current solar system and docking context.',
    inputSchema: contextInputSchema,
    outputSchema: currentLocationOutputSchema,
    annotations: contextToolAnnotations,
  }, (_args, context) => executeTool({
    name: 'get_current_location', outputSchema: currentLocationOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.getCurrentLocation.execute({}, { requestId, signal }),
  }));

  server.registerTool('get_current_ship', {
    title: 'Get current ship',
    description: 'Get the selected EVE character current ship and SDE-resolved ship type.',
    inputSchema: contextInputSchema,
    outputSchema: currentShipOutputSchema,
    annotations: contextToolAnnotations,
  }, (_args, context) => executeTool({
    name: 'get_current_ship', outputSchema: currentShipOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.getCurrentShip.execute({}, { requestId, signal }),
  }));
}
