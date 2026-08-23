import type { ConnectedCharacter } from './character.js';
import { AppError } from './errors.js';
import type { EsiOperationFact } from './esi-operation.js';

export const AUTHORIZATION_SESSION_STATES = [
  'authorization_required',
  'pending',
  'connected',
  'failed',
  'expired',
  'cancelled',
] as const;

export type AuthorizationSessionState = typeof AUTHORIZATION_SESSION_STATES[number];

export interface AuthorizationSession {
  readonly sessionId: string;
  readonly stateHash: Uint8Array;
  readonly verifierReference: string;
  readonly reauthorizeCharacterId: number | null;
  readonly redirectUri: string;
  readonly requestedScopes: readonly string[];
  readonly status: AuthorizationSessionState;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly terminalAt: string | null;
  readonly connectedCharacterId: number | null;
  readonly failureCode: string | null;
}

export function requireSelectedCharacter(character: ConnectedCharacter | null): ConnectedCharacter {
  if (character === null) {
    throw new AppError({
      code: 'CHARACTER_NOT_SELECTED',
      safeMessage: 'No connected EVE character is selected.',
      details: { next_step: 'Connect a character or call select_character.' },
    });
  }
  if (character.status === 'reauthorization_required') {
    throw new AppError({
      code: 'REAUTHORIZATION_REQUIRED',
      safeMessage: 'The selected character authorization must be renewed.',
      details: { character_id: character.characterId, next_step: 'Call reauthorize_character.' },
    });
  }
  if (character.status !== 'connected') {
    throw new AppError({
      code: 'CREDENTIAL_REMOVAL_PENDING',
      safeMessage: 'The selected character is being disconnected.',
      details: { character_id: character.characterId },
    });
  }
  return character;
}

export function bindSelectedCharacterArgument(
  operation: Pick<EsiOperationFact, 'parameters'>,
  argumentsValue: Readonly<Record<string, unknown>>,
  characterId: number,
): Readonly<Record<string, unknown>> {
  if (!operation.parameters.some((parameter) => parameter.name === 'character_id')) return argumentsValue;
  const supplied = argumentsValue.character_id;
  if (supplied !== undefined
    && (typeof supplied !== 'string' && typeof supplied !== 'number'
      || String(supplied) !== String(characterId))) {
    throw new AppError({
      code: 'NOT_FOUND',
      safeMessage: 'The requested character is not the selected locally connected character.',
      details: { character_id: characterId, next_step: 'Call select_character before using this capability.' },
    });
  }
  return Object.freeze({ ...argumentsValue, character_id: String(characterId) });
}

export function assertOperationScopes(input: {
  readonly operation: Pick<EsiOperationFact, 'authorizationScopes' | 'scopeBundle'>;
  readonly character: ConnectedCharacter;
  readonly capabilityId: string;
  readonly nextStep: string;
}): void {
  const missing = input.operation.authorizationScopes.filter((scope) =>
    !input.character.grantedScopes.includes(scope));
  if (missing.length === 0) return;
  throw new AppError({
    code: 'MISSING_SCOPE',
    safeMessage: 'The selected character is missing scopes required for this EVE capability.',
    details: {
      character_id: input.character.characterId,
      capability_id: input.capabilityId,
      missing_scopes: missing,
      ...(input.operation.scopeBundle === null ? {} : { scope_bundle: input.operation.scopeBundle }),
      next_step: input.nextStep,
    },
  });
}
