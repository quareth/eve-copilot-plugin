import type { CapabilityDefinition } from '../../domain/capability.js';
import { defineCapability } from './shared.js';

export const identityCapabilities: readonly CapabilityDefinition[] = [
  defineCapability({ id: 'identity.connect_character', domain: 'identity', title: 'Connect character', description: 'Authorize an EVE character using official EVE SSO.', tool: 'connect_character', access: 'public', sources: ['local'], operationClass: 'action' }),
  defineCapability({ id: 'identity.connection_status', domain: 'identity', title: 'Connection status', description: 'Observe an EVE SSO authorization session.', tool: 'get_character_connection_status', access: 'public', sources: ['local'] }),
  defineCapability({ id: 'identity.cancel_connection', domain: 'identity', title: 'Cancel connection', description: 'Cancel a pending EVE SSO authorization session.', tool: 'cancel_character_connection', access: 'public', sources: ['local'], operationClass: 'action' }),
  defineCapability({ id: 'identity.reauthorize_character', domain: 'identity', title: 'Reauthorize character', description: 'Replace one character authorization safely.', tool: 'reauthorize_character', access: 'public', sources: ['local'], operationClass: 'action' }),
  defineCapability({ id: 'identity.list_characters', domain: 'identity', title: 'List connected characters', description: 'List locally connected EVE characters.', tool: 'list_characters', access: 'public', sources: ['local'] }),
  defineCapability({ id: 'identity.select_character', domain: 'identity', title: 'Select active character', description: 'Select the active character for private EVE tools.', tool: 'select_character', access: 'public', sources: ['local'], operationClass: 'action' }),
  defineCapability({ id: 'identity.disconnect_character', domain: 'identity', title: 'Disconnect character', description: 'Remove a character and its local authorization.', tool: 'disconnect_character', access: 'public', sources: ['local'], operationClass: 'action' }),
];
