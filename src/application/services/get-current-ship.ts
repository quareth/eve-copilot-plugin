import type { ShipData } from '../dto/context.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { EsiGateway } from '../ports/esi-gateway.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { EsiCharacterShip } from '../../domain/esi.js';
import { CurrentContextRead, resolveShip } from './context-support.js';

export class GetCurrentShip extends CurrentContextRead<EsiCharacterShip, ShipData> {
  constructor(input: { readonly characters: CharacterRepository; readonly esi: EsiGateway; readonly sde: SdeRepository }) {
    super({
      characters: input.characters,
      sde: input.sde,
      fetch: (character, signal) => input.esi.getCharacterShip(character, signal),
      resolve: resolveShip,
    });
  }
}
