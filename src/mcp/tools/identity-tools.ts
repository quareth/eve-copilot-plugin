import type { McpServer } from '@modelcontextprotocol/server';
import type { AppServices } from '../../application/services/app-services.js';
import {
  connectionToolAnnotations,
  disconnectToolAnnotations,
  localMutationToolAnnotations,
  readOnlyToolAnnotations,
} from '../schemas/common.js';
import {
  cancelConnectionOutputSchema,
  characterIdInputSchema,
  connectCharacterInputSchema,
  connectionSessionInputSchema,
  connectionSessionOutputSchema,
  disconnectCharacterOutputSchema,
  listCharactersInputSchema,
  listCharactersOutputSchema,
  reauthorizeCharacterInputSchema,
  selectCharacterOutputSchema,
} from '../schemas/identity.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerIdentityTools(
  server: McpServer,
  services: AppServices,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('connect_character', {
    title: 'Connect EVE character',
    description: 'Start a secure, non-blocking EVE SSO character authorization session.',
    inputSchema: connectCharacterInputSchema,
    outputSchema: connectionSessionOutputSchema,
    annotations: connectionToolAnnotations,
  }, (args, context) => executeTool({
    name: 'connect_character', outputSchema: connectionSessionOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.connectCharacter.execute(args, { requestId, signal }),
  }));

  server.registerTool('get_character_connection_status', {
    title: 'Get character connection status',
    description: 'Observe a character authorization session without supplying OAuth callback data.',
    inputSchema: connectionSessionInputSchema,
    outputSchema: connectionSessionOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (args, context) => executeTool({
    name: 'get_character_connection_status', outputSchema: connectionSessionOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.getCharacterConnectionStatus.execute(args, { requestId, signal }),
  }));

  server.registerTool('cancel_character_connection', {
    title: 'Cancel character connection',
    description: 'Cancel one pending local authorization session and remove its protected verifier.',
    inputSchema: connectionSessionInputSchema,
    outputSchema: cancelConnectionOutputSchema,
    annotations: localMutationToolAnnotations,
  }, (args, context) => executeTool({
    name: 'cancel_character_connection', outputSchema: cancelConnectionOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.cancelCharacterConnection.execute(args, { requestId, signal }),
  }));

  server.registerTool('reauthorize_character', {
    title: 'Reauthorize EVE character',
    description: 'Start a replacement EVE SSO grant for one connected character. By default, optionally add only one capability\'s reviewed scopes. Set scope_mode to all_reads for one explicit grant covering every reviewed read-only capability; action scopes remain separate.',
    inputSchema: reauthorizeCharacterInputSchema,
    outputSchema: connectionSessionOutputSchema,
    annotations: connectionToolAnnotations,
  }, (args, context) => executeTool({
    name: 'reauthorize_character', outputSchema: connectionSessionOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.reauthorizeCharacter.execute({
      character_id: args.character_id,
      open_browser: args.open_browser,
      scope_mode: args.scope_mode,
      ...(args.capability_id === undefined ? {} : { capability_id: args.capability_id }),
    }, { requestId, signal }),
  }));

  server.registerTool('list_characters', {
    title: 'List connected characters',
    description: 'List locally connected EVE characters and their authorization state.',
    inputSchema: listCharactersInputSchema,
    outputSchema: listCharactersOutputSchema,
    annotations: readOnlyToolAnnotations,
  }, (args, context) => executeTool({
    name: 'list_characters', outputSchema: listCharactersOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.listCharacters.execute({
      limit: args.limit,
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
    }, { requestId, signal }),
  }));

  server.registerTool('select_character', {
    title: 'Select active character',
    description: 'Select one connected, usable EVE character as the active context.',
    inputSchema: characterIdInputSchema,
    outputSchema: selectCharacterOutputSchema,
    annotations: localMutationToolAnnotations,
  }, (args, context) => executeTool({
    name: 'select_character', outputSchema: selectCharacterOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.selectCharacter.execute(args, { requestId, signal }),
  }));

  server.registerTool('disconnect_character', {
    title: 'Disconnect EVE character',
    description: 'Remove one character protected credential and its local metadata.',
    inputSchema: characterIdInputSchema,
    outputSchema: disconnectCharacterOutputSchema,
    annotations: disconnectToolAnnotations,
  }, (args, context) => executeTool({
    name: 'disconnect_character', outputSchema: disconnectCharacterOutputSchema, context, dependencies,
    execute: (requestId, signal) => services.disconnectCharacter.execute(args, { requestId, signal }),
  }));
}
