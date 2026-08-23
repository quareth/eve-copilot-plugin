import type { ResultEnvelope } from '../../domain/result.js';
import { throwIfAborted } from '../../domain/errors.js';
import type { MaintainEveGuideData, MaintainEveGuideInput } from '../dto/guide.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuideRepository } from '../ports/guide-repository.js';
import type { RequestContext, UseCase } from './use-case.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';
import { guideResult, visibleCharacter } from './guide-support.js';

export class MaintainEveGuide implements UseCase<MaintainEveGuideInput, ResultEnvelope<MaintainEveGuideData>> {
  readonly #guide: GuideRepository;
  readonly #characters: CharacterRepository;
  readonly #clock: Clock;

  constructor(input: { readonly guide: GuideRepository; readonly characters: CharacterRepository; readonly clock: Clock }) {
    this.#guide = input.guide;
    this.#characters = input.characters;
    this.#clock = input.clock;
  }

  async execute(input: MaintainEveGuideInput, context: RequestContext): Promise<ResultEnvelope<MaintainEveGuideData>> {
    throwIfAborted(context.signal);
    const selected = visibleCharacter(this.#characters.selected());
    const visibility = { selectedCharacterId: selected?.characterId ?? null };
    const at = this.#clock.now().toISOString();
    let page: MaintainEveGuideData['page'] = null;
    let removed: MaintainEveGuideData['removed'] = null;

    switch (input.action) {
      case 'create': {
        const character = input.scope === 'character'
          ? requireSelectedCharacter(this.#characters.selected())
          : null;
        page = await this.#guide.create({
          at,
          draft: {
            page_id: input.page_id,
            title: input.title,
            page_kind: input.page_kind,
            scope: input.scope,
            character_id: character?.characterId ?? null,
            content: input.content,
            freshness: input.freshness,
            related_type_ids: input.related_type_ids ?? [],
            related_pages: input.related_pages ?? [],
            provenance: input.provenance ?? [],
          },
        });
        break;
      }
      case 'revise':
        page = await this.#guide.revise({
          pageId: input.page_id,
          expectedRevision: input.expected_revision,
          at,
          visibility,
          changes: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.page_kind === undefined ? {} : { page_kind: input.page_kind }),
            ...(input.content === undefined ? {} : { content: input.content }),
            ...(input.freshness === undefined ? {} : { freshness: input.freshness }),
            ...(input.related_type_ids === undefined ? {} : { related_type_ids: input.related_type_ids }),
            ...(input.related_pages === undefined ? {} : { related_pages: input.related_pages }),
            ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
          },
        });
        break;
      case 'set_status':
        page = await this.#guide.setStatus({
          pageId: input.page_id,
          expectedRevision: input.expected_revision,
          status: input.status,
          supersededBy: input.superseded_by ?? null,
          at,
          visibility,
        });
        break;
      case 'remove': {
        const result = await this.#guide.remove({
          pageId: input.page_id,
          expectedRevision: input.expected_revision,
          at,
          visibility,
        });
        removed = { page_id: result.pageId, removed_revision: result.removedRevision };
        break;
      }
      case 'restore':
        page = await this.#guide.restore({
          pageId: input.page_id,
          revision: input.revision,
          expectedRevision: input.expected_revision ?? null,
          at,
          visibility,
        });
        break;
    }
    return guideResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      character: selected,
      data: Object.freeze({
        source_type: 'user_guide',
        authority: 'advisory',
        action: input.action,
        page,
        removed,
      }),
    });
  }
}
