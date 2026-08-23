import type { AuthorizationSessionState } from '../../domain/authorization.js';
import type { CharacterConnectionState, ConnectedCharacter } from '../../domain/character.js';

export const CORE_CHARACTER_SCOPES = Object.freeze([
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
] as const);

export interface CharacterSummary {
  readonly character_id: number;
  readonly character_name: string;
  readonly selected: boolean;
  readonly connection_state: CharacterConnectionState;
  readonly granted_scopes: readonly string[];
  readonly missing_required_scopes: readonly string[];
  readonly last_verified_at: string;
  readonly next_step: string | null;
}

export interface ConnectionSessionData {
  readonly session_id: string;
  readonly state: AuthorizationSessionState;
  readonly authorization_url: string | null;
  readonly expires_at: string;
  readonly requested_scopes: readonly string[];
  readonly browser_opened: boolean;
  readonly character: CharacterSummary | null;
  readonly next_step: string;
}

export function toCharacterSummary(character: ConnectedCharacter): CharacterSummary {
  const missing = CORE_CHARACTER_SCOPES.filter((scope) => !character.grantedScopes.includes(scope));
  return Object.freeze({
    character_id: character.characterId,
    character_name: character.verifiedName,
    selected: character.selected,
    connection_state: character.status,
    granted_scopes: character.grantedScopes,
    missing_required_scopes: Object.freeze(missing),
    last_verified_at: character.lastVerifiedAt,
    next_step: character.status === 'reauthorization_required'
      ? 'Call reauthorize_character for this character.'
      : character.status === 'removal_pending'
        ? 'Retry disconnect_character for this character.'
        : missing.length > 0
          ? 'Reauthorize the character to grant the missing required scopes.'
          : null,
  });
}
