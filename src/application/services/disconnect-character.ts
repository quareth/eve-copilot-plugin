import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { CredentialStore } from '../ports/credential-store.js';
import { AppError } from '../../domain/errors.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';
import type { GuideRepository } from '../ports/guide-repository.js';

export interface DisconnectCharacterData {
  readonly character_id: number;
  readonly credentials_removed: true;
  readonly metadata_removed: true;
  readonly selection_cleared: boolean;
  readonly guide_pages_removed: number;
  readonly guide_revisions_removed: number;
}

export class DisconnectCharacter {
  readonly #clock: Clock;
  readonly #characters: CharacterRepository;
  readonly #credentials: CredentialStore;
  readonly #guide: GuideRepository;

  constructor(input: {
    readonly clock: Clock;
    readonly characters: CharacterRepository;
    readonly credentials: CredentialStore;
    readonly guide: GuideRepository;
  }) {
    this.#clock = input.clock;
    this.#characters = input.characters;
    this.#credentials = input.credentials;
    this.#guide = input.guide;
  }

  async execute(
    input: { readonly character_id: number },
    context: RequestContext,
  ): Promise<ResultEnvelope<DisconnectCharacterData>> {
    const existing = this.#characters.find(input.character_id);
    if (existing === null) throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
    const removal = this.#characters.beginRemoval(input.character_id, this.#clock.now().toISOString());
    try {
      await this.#credentials.delete(
        removal.character.credentialReference,
        'character_grant',
        context.signal,
      );
    } catch (error) {
      throw new AppError({
        code: 'CREDENTIAL_REMOVAL_PENDING',
        safeMessage: 'The protected credential could not be removed. The character is disabled locally.',
        details: {
          character_id: input.character_id,
          next_step: 'Unlock the operating-system credential store and retry disconnect_character.',
        },
        cause: error,
      });
    }
    let guideRemoval: { readonly pagesRemoved: number; readonly revisionsRemoved: number };
    try {
      guideRemoval = await this.#guide.removeCharacter({
        characterId: input.character_id,
        at: this.#clock.now().toISOString(),
      });
    } catch (error) {
      throw new AppError({
        code: 'GUIDE_UNAVAILABLE',
        safeMessage: 'The credential was removed, but private character guide cleanup is still required.',
        details: {
          character_id: input.character_id,
          next_step: 'Repair the private guide storage and retry disconnect_character.',
        },
        cause: error,
      });
    }
    if (!this.#characters.completeRemoval(input.character_id)) {
      throw new AppError({
        code: 'DATABASE_UNAVAILABLE',
        safeMessage: 'The credential was removed, but local character cleanup is still required.',
        details: { character_id: input.character_id, next_step: 'Retry disconnect_character.' },
      });
    }
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: Object.freeze({
        character_id: input.character_id,
        credentials_removed: true,
        metadata_removed: true,
        selection_cleared: removal.selectionCleared,
        guide_pages_removed: guideRemoval.pagesRemoved,
        guide_revisions_removed: guideRemoval.revisionsRemoved,
      }),
    });
  }
}
