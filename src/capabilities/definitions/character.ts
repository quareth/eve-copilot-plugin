import type { CapabilityDefinition } from '../../domain/capability.js';
import { defineCapability } from './shared.js';

export const characterCapabilities: readonly CapabilityDefinition[] = [
  defineCapability({ id: 'character.overview', domain: 'character', title: 'Character overview', description: 'Return identity, corporation, alliance, location, and ship summary.', tool: 'get_character_overview', sources: ['ESI', 'SDE'], scopes: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'], esiOperations: ['GetCharactersDetail', 'GetCharactersCharacterIdLocation', 'GetCharactersCharacterIdShip'] }),
  defineCapability({ id: 'character.current_location', domain: 'character', title: 'Current location', description: 'Return the selected character current solar system and structure or station when available.', tool: 'get_current_location', sources: ['ESI', 'SDE'], scopes: ['esi-location.read_location.v1'], esiOperations: ['GetCharactersCharacterIdLocation'] }),
  defineCapability({ id: 'character.current_ship', domain: 'character', title: 'Current ship', description: 'Return the selected character active ship and readable type information.', tool: 'get_current_ship', sources: ['ESI', 'SDE'], scopes: ['esi-location.read_ship_type.v1'], esiOperations: ['GetCharactersCharacterIdShip'] }),
];
