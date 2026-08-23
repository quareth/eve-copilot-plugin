import type { ResultEnvelope } from '../../domain/result.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type {
  GuideFreshnessAssessment,
  ReadEveGuidePageData,
  ReadEveGuidePageInput,
} from '../dto/guide.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuideRepository } from '../ports/guide-repository.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { RequestContext, UseCase } from './use-case.js';
import { GUIDE_HANDLING_NOTICE, guideResult, visibleCharacter } from './guide-support.js';

export class ReadEveGuidePage implements UseCase<ReadEveGuidePageInput, ResultEnvelope<ReadEveGuidePageData>> {
  readonly #guide: GuideRepository;
  readonly #characters: CharacterRepository;
  readonly #sde: SdeRepository;
  readonly #clock: Clock;

  constructor(input: {
    readonly guide: GuideRepository;
    readonly characters: CharacterRepository;
    readonly sde: SdeRepository;
    readonly clock: Clock;
  }) {
    this.#guide = input.guide;
    this.#characters = input.characters;
    this.#sde = input.sde;
    this.#clock = input.clock;
  }

  async execute(input: ReadEveGuidePageInput, context: RequestContext): Promise<ResultEnvelope<ReadEveGuidePageData>> {
    throwIfAborted(context.signal);
    const character = visibleCharacter(this.#characters.selected());
    const page = await this.#guide.read({
      pageId: input.page_id,
      ...(input.revision === undefined ? {} : { revision: input.revision }),
      visibility: { selectedCharacterId: character?.characterId ?? null },
    });
    if (page === null) throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The guide page was not found.' });
    const assessment = await assessFreshness(page, this.#sde);
    throwIfAborted(context.signal);
    return guideResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      character,
      data: Object.freeze({
        source_type: 'user_guide',
        authority: 'advisory',
        content_trust: 'untrusted_advisory_data',
        handling_notice: GUIDE_HANDLING_NOTICE,
        page,
        freshness_assessment: assessment,
      }),
    });
  }
}

async function assessFreshness(
  page: ReadEveGuidePageData['page'],
  sde: SdeRepository,
): Promise<GuideFreshnessAssessment> {
  const sdeSources = page.metadata.provenance.filter((source) => source.source_kind === 'SDE');
  const hasDynamicSource = page.metadata.provenance.some((source) =>
    source.source_kind === 'ESI' || source.source_kind === 'community');
  if (sdeSources.length === 0) {
    return Object.freeze({
      current_claim_policy: 'refresh_authoritative_source',
      requires_authoritative_refresh: page.metadata.freshness.kind !== 'stable' || hasDynamicSource,
      sde_verification: 'not_applicable',
      active_sde_build: null,
    });
  }
  const status = await sde.status();
  const versions = sdeSources.map((source) => source.version).filter((value): value is string => value !== null);
  const verification = versions.length !== sdeSources.length
    ? 'unverified' as const
    : status.state !== 'available' || status.buildNumber === null
      ? 'unavailable' as const
      : versions.every((version) => version === String(status.buildNumber))
        ? 'current' as const
        : 'stale' as const;
  return Object.freeze({
    current_claim_policy: 'refresh_authoritative_source',
    requires_authoritative_refresh: page.metadata.freshness.kind !== 'stable'
      || hasDynamicSource
      || verification !== 'current',
    sde_verification: verification,
    active_sde_build: status.state === 'available' ? status.buildNumber : null,
  });
}
