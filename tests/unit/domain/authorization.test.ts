import { describe, expect, it } from 'vitest';
import {
  assertOperationScopes,
  bindSelectedCharacterArgument,
  requireSelectedCharacter,
} from '../../../src/domain/authorization.js';
import type { ConnectedCharacter } from '../../../src/domain/character.js';

const character = Object.freeze({
  characterId: 90_000_001,
  verifiedName: 'Policy Pilot',
  status: 'connected',
  credentialReference: 'credential-reference',
  authorizationGeneration: 1,
  grantedScopes: ['scope.read'],
  selected: true,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
  lastVerifiedAt: '2026-08-22T00:00:00.000Z',
} satisfies ConnectedCharacter);

describe('shared ESI authorization policy', () => {
  it('maps every unusable selected-character state consistently', () => {
    expect(() => requireSelectedCharacter(null)).toThrow(expect.objectContaining({ code: 'CHARACTER_NOT_SELECTED' }));
    expect(() => requireSelectedCharacter({ ...character, status: 'reauthorization_required' }))
      .toThrow(expect.objectContaining({ code: 'REAUTHORIZATION_REQUIRED' }));
    expect(() => requireSelectedCharacter({ ...character, status: 'removal_pending' }))
      .toThrow(expect.objectContaining({ code: 'CREDENTIAL_REMOVAL_PENDING' }));
    expect(requireSelectedCharacter(character)).toBe(character);
  });

  it('binds the selected character and rejects a conflicting caller value', () => {
    const operation = {
      parameters: [{ name: 'character_id', location: 'path', required: true, style: 'simple', explode: false }],
    } as const;
    expect(bindSelectedCharacterArgument(operation, {}, character.characterId)).toEqual({
      character_id: String(character.characterId),
    });
    expect(() => bindSelectedCharacterArgument(operation, { character_id: '2' }, character.characterId))
      .toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('reports missing scopes through one shared policy', () => {
    try {
      assertOperationScopes({
        operation: { authorizationScopes: ['scope.read', 'scope.write'], scopeBundle: 'inventory' },
        character,
        capabilityId: 'example.capability',
        nextStep: 'Reauthorize.',
      });
      throw new Error('Expected a missing-scope error.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MISSING_SCOPE',
        details: { missing_scopes: ['scope.write'], scope_bundle: 'inventory' },
      });
    }
  });
});
