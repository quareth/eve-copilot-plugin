import type { ResultEnvelope } from '../../domain/result.js';
import { throwIfAborted } from '../../domain/errors.js';
import type { SearchEveGuideData, SearchEveGuideInput } from '../dto/guide.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuideRepository } from '../ports/guide-repository.js';
import type { RequestContext, UseCase } from './use-case.js';
import { guideResult, visibleCharacter } from './guide-support.js';

export class SearchEveGuide implements UseCase<SearchEveGuideInput, ResultEnvelope<SearchEveGuideData>> {
  readonly #guide: GuideRepository;
  readonly #characters: CharacterRepository;
  readonly #clock: Clock;

  constructor(input: { readonly guide: GuideRepository; readonly characters: CharacterRepository; readonly clock: Clock }) {
    this.#guide = input.guide;
    this.#characters = input.characters;
    this.#clock = input.clock;
  }

  async execute(input: SearchEveGuideInput, context: RequestContext): Promise<ResultEnvelope<SearchEveGuideData>> {
    throwIfAborted(context.signal);
    const character = visibleCharacter(this.#characters.selected());
    const results = await this.#guide.search({
      query: input.query,
      statuses: input.statuses ?? ['current'],
      limit: input.limit ?? 10,
      visibility: { selectedCharacterId: character?.characterId ?? null },
      signal: context.signal,
    });
    throwIfAborted(context.signal);
    return guideResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      character,
      data: Object.freeze({
        source_type: 'user_guide',
        authority: 'advisory',
        content_trust: 'untrusted_advisory_data',
        current_claim_policy: 'refresh_authoritative_source',
        results: Object.freeze([...results]),
      }),
    });
  }
}
