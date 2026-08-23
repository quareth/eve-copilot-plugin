import type { ConnectedCharacter } from '../../domain/character.js';

export interface CharacterAccessToken {
  readonly token: string;
  readonly expiresAt: string;
  readonly authorizationGeneration: number;
}

export interface CharacterAccessTokenProvider {
  get(input: {
    readonly character: ConnectedCharacter;
    readonly requiredScope: string;
    readonly signal: AbortSignal;
  }): Promise<CharacterAccessToken>;
}
