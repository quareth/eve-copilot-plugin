import { z } from 'zod';
import { assertCharacterId, normalizeScopes } from '../../domain/character.js';

const characterGrantSchema = z.object({
  version: z.literal(1),
  access_token: z.string().min(1).max(131_072),
  refresh_token: z.string().min(1).max(131_072),
  access_expires_at: z.iso.datetime(),
  subject: z.string().regex(/^CHARACTER:EVE:[1-9][0-9]*$/u).max(128),
  granted_scopes: z.array(z.string().min(1).max(256)).max(100),
  authorization_generation: z.number().int().positive(),
}).strict();

export type CharacterGrant = z.infer<typeof characterGrantSchema>;

export function parseCharacterGrant(value: string): Readonly<CharacterGrant> {
  const parsed = characterGrantSchema.parse(JSON.parse(value) as unknown);
  const characterId = Number(parsed.subject.slice('CHARACTER:EVE:'.length));
  assertCharacterId(characterId);
  const scopes = normalizeScopes(parsed.granted_scopes);
  if (scopes.length !== parsed.granted_scopes.length
    || scopes.some((scope, index) => scope !== parsed.granted_scopes[index])) {
    throw new TypeError('Stored character grant scopes are not normalized.');
  }
  return Object.freeze(parsed);
}

export function serializeCharacterGrant(input: Omit<CharacterGrant, 'granted_scopes'> & {
  readonly granted_scopes: readonly string[];
}): string {
  const scopes = normalizeScopes(input.granted_scopes);
  return JSON.stringify(characterGrantSchema.parse({ ...input, granted_scopes: [...scopes] }));
}
