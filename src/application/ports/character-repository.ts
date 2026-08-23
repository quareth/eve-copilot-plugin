import type { ConnectedCharacter, VerifiedCharacterInput } from '../../domain/character.js';

export interface CharacterRepository {
  list(): readonly ConnectedCharacter[];
  find(characterId: number): ConnectedCharacter | null;
  selected(): ConnectedCharacter | null;
  connect(input: VerifiedCharacterInput): ConnectedCharacter;
  replaceGrant(input: VerifiedCharacterInput): {
    readonly character: ConnectedCharacter;
    readonly previousCredentialReference: string;
  };
  recordRefresh(input: {
    readonly characterId: number;
    readonly verifiedName: string;
    readonly grantedScopes: readonly string[];
    readonly verifiedAt: string;
  }): ConnectedCharacter;
  select(characterId: number, selectedAt: string): ConnectedCharacter;
  markReauthorizationRequired(characterId: number, updatedAt: string): ConnectedCharacter;
  beginRemoval(characterId: number, updatedAt: string): {
    readonly character: ConnectedCharacter;
    readonly selectionCleared: boolean;
  };
  completeRemoval(characterId: number): boolean;
}
