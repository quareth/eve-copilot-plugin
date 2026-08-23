import type { CharacterSummary } from '../dto/identity.js';
import { toCharacterSummary } from '../dto/identity.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';

export interface SelectCharacterData {
  readonly character: CharacterSummary;
  readonly changed: boolean;
}

export class SelectCharacter {
  readonly #clock: Clock;
  readonly #characters: CharacterRepository;

  constructor(input: { readonly clock: Clock; readonly characters: CharacterRepository }) {
    this.#clock = input.clock;
    this.#characters = input.characters;
  }

  execute(
    input: { readonly character_id: number },
    context: RequestContext,
  ): Promise<ResultEnvelope<SelectCharacterData>> {
    const previous = this.#characters.selected();
    const selected = this.#characters.select(input.character_id, this.#clock.now().toISOString());
    return Promise.resolve(localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: Object.freeze({
        character: toCharacterSummary(selected),
        changed: previous?.characterId !== selected.characterId,
      }),
    }));
  }
}
