import type { CharacterRef } from '../../domain/result.js';
import type { AuthorizationSessionRepository } from './authorization-session-repository.js';
import type { CharacterRepository } from './character-repository.js';
import type { Clock } from './clock.js';

export interface CharacterContext {
  readonly status: 'not_supported_yet' | 'not_connected' | 'connected';
  readonly activeCharacter: CharacterRef | null;
  readonly scopes: ReadonlySet<string>;
  readonly roles: ReadonlySet<string>;
  readonly pendingConnections: number;
}

export interface CharacterContextPort {
  get(): CharacterContext;
}

export class NoCharacterContext implements CharacterContextPort {
  get(): CharacterContext {
    return {
      status: 'not_supported_yet',
      activeCharacter: null,
      scopes: new Set<string>(),
      roles: new Set<string>(),
      pendingConnections: 0,
    };
  }
}

export class RepositoryCharacterContext implements CharacterContextPort {
  readonly #characters: CharacterRepository;
  readonly #sessions: AuthorizationSessionRepository;
  readonly #clock: Clock;

  constructor(input: {
    readonly characters: CharacterRepository;
    readonly sessions: AuthorizationSessionRepository;
    readonly clock: Clock;
  }) {
    this.#characters = input.characters;
    this.#sessions = input.sessions;
    this.#clock = input.clock;
  }

  get(): CharacterContext {
    const selected = this.#characters.selected();
    const usable = selected?.status === 'connected' ? selected : null;
    return {
      status: this.#characters.list().length === 0 ? 'not_connected' : 'connected',
      activeCharacter: usable === null ? null : { id: usable.characterId, name: usable.verifiedName },
      scopes: new Set(usable?.grantedScopes ?? []),
      roles: new Set<string>(),
      pendingConnections: this.#sessions.countActive(this.#clock.now().toISOString()),
    };
  }
}
