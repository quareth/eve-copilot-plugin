import type {
  GuideHealth,
  GuidePage,
  GuidePageChanges,
  GuidePageDraft,
  GuidePageStatus,
  GuideSearchHit,
} from '../../domain/guide.js';

export interface GuideVisibility {
  readonly selectedCharacterId: number | null;
}

export interface GuideRepository {
  health(): Promise<GuideHealth>;
  search(input: {
    readonly query: string;
    readonly statuses: readonly GuidePageStatus[];
    readonly limit: number;
    readonly visibility: GuideVisibility;
    readonly signal: AbortSignal;
  }): Promise<readonly GuideSearchHit[]>;
  read(input: {
    readonly pageId: string;
    readonly revision?: number;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage | null>;
  create(input: { readonly draft: GuidePageDraft; readonly at: string }): Promise<GuidePage>;
  revise(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly changes: GuidePageChanges;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage>;
  setStatus(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly status: GuidePageStatus;
    readonly supersededBy: string | null;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage>;
  remove(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<{ readonly pageId: string; readonly removedRevision: number }>;
  restore(input: {
    readonly pageId: string;
    readonly revision: number;
    readonly expectedRevision: number | null;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage>;
  removeCharacter(input: {
    readonly characterId: number;
    readonly at: string;
  }): Promise<{ readonly pagesRemoved: number; readonly revisionsRemoved: number }>;
}
