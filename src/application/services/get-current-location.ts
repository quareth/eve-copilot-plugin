import type { LocationData } from '../dto/context.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { EsiGateway } from '../ports/esi-gateway.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { EsiCharacterLocation } from '../../domain/esi.js';
import { CurrentContextRead, resolveLocation } from './context-support.js';

export class GetCurrentLocation extends CurrentContextRead<EsiCharacterLocation, LocationData> {
  constructor(input: { readonly characters: CharacterRepository; readonly esi: EsiGateway; readonly sde: SdeRepository }) {
    super({
      characters: input.characters,
      sde: input.sde,
      fetch: (character, signal) => input.esi.getCharacterLocation(character, signal),
      resolve: resolveLocation,
    });
  }
}
