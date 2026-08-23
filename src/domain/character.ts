export const CHARACTER_CONNECTION_STATES = [
  'connected',
  'reauthorization_required',
  'removal_pending',
] as const;

export type CharacterConnectionState = typeof CHARACTER_CONNECTION_STATES[number];

export interface ConnectedCharacter {
  readonly characterId: number;
  readonly verifiedName: string;
  readonly status: CharacterConnectionState;
  readonly credentialReference: string;
  readonly authorizationGeneration: number;
  readonly grantedScopes: readonly string[];
  readonly selected: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastVerifiedAt: string;
}

export interface VerifiedCharacterInput {
  readonly characterId: number;
  readonly verifiedName: string;
  readonly credentialReference: string;
  readonly grantedScopes: readonly string[];
  readonly verifiedAt: string;
}

export function assertCharacterId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('Character ID must be a positive safe integer.');
  }
}

export function normalizeScopes(scopes: readonly string[]): readonly string[] {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()))]
    .filter((scope) => scope.length > 0)
    .sort((left, right) => left.localeCompare(right));
  if (normalized.length !== scopes.length) {
    throw new TypeError('Granted scopes must be non-empty and unique.');
  }
  return Object.freeze(normalized);
}
