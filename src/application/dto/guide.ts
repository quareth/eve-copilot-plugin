import type {
  GuideFreshness,
  GuidePage,
  GuidePageKind,
  GuidePageStatus,
  GuideProvenance,
  GuideScope,
  GuideSearchHit,
} from '../../domain/guide.js';

export interface SearchEveGuideInput {
  readonly query: string;
  readonly statuses?: readonly GuidePageStatus[];
  readonly limit?: number;
}

export interface SearchEveGuideData {
  readonly source_type: 'user_guide';
  readonly authority: 'advisory';
  readonly content_trust: 'untrusted_advisory_data';
  readonly current_claim_policy: 'refresh_authoritative_source';
  readonly results: readonly GuideSearchHit[];
}

export interface ReadEveGuidePageInput {
  readonly page_id: string;
  readonly revision?: number;
}

export interface GuideFreshnessAssessment {
  readonly current_claim_policy: 'refresh_authoritative_source';
  readonly requires_authoritative_refresh: boolean;
  readonly sde_verification: 'not_applicable' | 'current' | 'stale' | 'unavailable' | 'unverified';
  readonly active_sde_build: number | null;
}

export interface ReadEveGuidePageData {
  readonly source_type: 'user_guide';
  readonly authority: 'advisory';
  readonly content_trust: 'untrusted_advisory_data';
  readonly handling_notice: string;
  readonly page: GuidePage;
  readonly freshness_assessment: GuideFreshnessAssessment;
}

export interface GuidePageWriteInput {
  readonly title: string;
  readonly page_kind: GuidePageKind;
  readonly scope: GuideScope;
  readonly content: string;
  readonly freshness: GuideFreshness;
  readonly related_type_ids?: readonly number[];
  readonly related_pages?: readonly string[];
  readonly provenance?: readonly GuideProvenance[];
}

export type MaintainEveGuideInput =
  | ({ readonly action: 'create'; readonly page_id: string } & GuidePageWriteInput)
  | ({
    readonly action: 'revise';
    readonly page_id: string;
    readonly expected_revision: number;
    readonly title?: string;
    readonly page_kind?: GuidePageKind;
    readonly content?: string;
    readonly freshness?: GuideFreshness;
    readonly related_type_ids?: readonly number[];
    readonly related_pages?: readonly string[];
    readonly provenance?: readonly GuideProvenance[];
  })
  | {
    readonly action: 'set_status';
    readonly page_id: string;
    readonly expected_revision: number;
    readonly status: GuidePageStatus;
    readonly superseded_by?: string;
  }
  | {
    readonly action: 'remove';
    readonly page_id: string;
    readonly expected_revision: number;
  }
  | {
    readonly action: 'restore';
    readonly page_id: string;
    readonly revision: number;
    readonly expected_revision?: number;
  };

export interface MaintainEveGuideData {
  readonly source_type: 'user_guide';
  readonly authority: 'advisory';
  readonly action: MaintainEveGuideInput['action'];
  readonly page: GuidePage | null;
  readonly removed: { readonly page_id: string; readonly removed_revision: number } | null;
}
