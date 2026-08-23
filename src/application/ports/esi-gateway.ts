import type { ConnectedCharacter } from '../../domain/character.js';
import type {
  EsiCharacterIdentity,
  EsiCharacterLocation,
  EsiCharacterShip,
  EsiValue,
} from '../../domain/esi.js';

export interface EsiGateway {
  getCharacterIdentity(characterId: number, signal: AbortSignal): Promise<EsiValue<EsiCharacterIdentity>>;
  getCharacterLocation(character: ConnectedCharacter, signal: AbortSignal): Promise<EsiValue<EsiCharacterLocation>>;
  getCharacterShip(character: ConnectedCharacter, signal: AbortSignal): Promise<EsiValue<EsiCharacterShip>>;
}
