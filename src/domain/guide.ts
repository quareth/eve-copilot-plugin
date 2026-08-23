export const GUIDE_SCHEMA_VERSION = 1 as const;

export const GUIDE_PAGE_KINDS = [
  'question',
  'ship',
  'skill',
  'fitting',
  'item',
  'concept',
  'comparison',
] as const;

export const GUIDE_PAGE_STATUSES = [
  'current',
  'superseded',
  'archived',
  'invalid',
] as const;

export const GUIDE_SOURCE_KINDS = [
  'ESI',
  'SDE',
  'computed',
  'community',
  'user',
  'general_knowledge',
] as const;

export type GuidePageKind = typeof GUIDE_PAGE_KINDS[number];
export type GuidePageStatus = typeof GUIDE_PAGE_STATUSES[number];
export type GuideSourceKind = typeof GUIDE_SOURCE_KINDS[number];
export type GuideScope = 'user' | 'character';
export type GuideFreshnessKind = 'stable' | 'dated_snapshot' | 'unverified';

export interface GuideProvenance {
  readonly source_kind: GuideSourceKind;
  readonly reference: string;
  readonly retrieved_at: string | null;
  readonly version: string | null;
}

export interface GuideFreshness {
  readonly kind: GuideFreshnessKind;
  readonly observed_at: string | null;
}

export interface GuidePageMetadata {
  readonly schema_version: typeof GUIDE_SCHEMA_VERSION;
  readonly page_id: string;
  readonly title: string;
  readonly page_kind: GuidePageKind;
  readonly scope: GuideScope;
  readonly character_id: number | null;
  readonly status: GuidePageStatus;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly authority: 'advisory';
  readonly source_type: 'user_guide';
  readonly freshness: GuideFreshness;
  readonly related_type_ids: readonly number[];
  readonly related_pages: readonly string[];
  readonly provenance: readonly GuideProvenance[];
  readonly superseded_by: string | null;
}

export interface GuidePage {
  readonly metadata: GuidePageMetadata;
  readonly content: string;
  readonly content_sha256: string;
}

export interface GuidePageDraft {
  readonly page_id: string;
  readonly title: string;
  readonly page_kind: GuidePageKind;
  readonly scope: GuideScope;
  readonly character_id: number | null;
  readonly content: string;
  readonly freshness: GuideFreshness;
  readonly related_type_ids: readonly number[];
  readonly related_pages: readonly string[];
  readonly provenance: readonly GuideProvenance[];
}

export interface GuidePageChanges {
  readonly title?: string;
  readonly page_kind?: GuidePageKind;
  readonly content?: string;
  readonly freshness?: GuideFreshness;
  readonly related_type_ids?: readonly number[];
  readonly related_pages?: readonly string[];
  readonly provenance?: readonly GuideProvenance[];
}

export interface GuidePageSummary {
  readonly page_id: string;
  readonly title: string;
  readonly page_kind: GuidePageKind;
  readonly scope: GuideScope;
  readonly character_id: number | null;
  readonly status: GuidePageStatus;
  readonly revision: number;
  readonly updated_at: string;
  readonly authority: 'advisory';
  readonly source_type: 'user_guide';
  readonly freshness: GuideFreshness;
}

export interface GuideSearchHit {
  readonly metadata: GuidePageSummary;
  readonly snippet: string;
  readonly score: number;
}

export interface GuideHealth {
  readonly state: 'available' | 'degraded' | 'unavailable';
  readonly page_count: number;
  readonly invalid_page_count: number;
  readonly revision_count: number;
}

const PAGE_ID = /^[a-z0-9][a-z0-9-]{0,63}(?:\/[a-z0-9][a-z0-9-]{0,63}){0,3}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/iu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /\b(?:access_token|refresh_token|id_token|client_secret|api[_-]?key|password)\s*[:=]\s*[^\s]{8,}/iu,
  new RegExp(['-----BEGIN ', '(?:RSA |EC |OPENSSH )?', 'PRIVATE KEY-----'].join(''), 'u'),
];

export function assertGuidePageId(value: string): void {
  if (value.length > 192 || !PAGE_ID.test(value)) {
    throw new TypeError('Guide page ID must contain one to four lowercase path segments.');
  }
}

export function assertGuideTimestamp(value: string, field: string): void {
  if (!ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be a UTC ISO timestamp.`);
  }
}

export function assertGuideContentSafe(value: string): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) throw new TypeError('Guide content appears to contain credential material.');
  }
}

export function assertGuideDraft(draft: GuidePageDraft): void {
  assertGuidePageId(draft.page_id);
  assertGuideText(draft.title, 1, 160, 'Guide title');
  assertGuideContentSafe(draft.title);
  assertGuideText(draft.content, 1, 65_536, 'Guide content');
  assertGuideContentSafe(draft.content);
  if ((draft.scope === 'character') !== (draft.character_id !== null)) {
    throw new TypeError('Character-scoped guide pages require exactly one character ID.');
  }
  if (draft.character_id !== null && (!Number.isSafeInteger(draft.character_id) || draft.character_id <= 0)) {
    throw new TypeError('Guide character ID must be a positive safe integer.');
  }
  assertGuideFreshness(draft.freshness);
  assertUniquePositiveIntegers(draft.related_type_ids, 100, 'related type IDs');
  assertUniquePageIds(draft.related_pages, draft.page_id);
  assertGuideProvenance(draft.provenance);
}

export function assertGuideChanges(changes: GuidePageChanges, pageId: string): void {
  const entries = Object.entries(changes);
  if (entries.length === 0) throw new TypeError('A guide revision must change at least one field.');
  if (changes.title !== undefined) {
    assertGuideText(changes.title, 1, 160, 'Guide title');
    assertGuideContentSafe(changes.title);
  }
  if (changes.content !== undefined) {
    assertGuideText(changes.content, 1, 65_536, 'Guide content');
    assertGuideContentSafe(changes.content);
  }
  if (changes.freshness !== undefined) assertGuideFreshness(changes.freshness);
  if (changes.related_type_ids !== undefined) {
    assertUniquePositiveIntegers(changes.related_type_ids, 100, 'related type IDs');
  }
  if (changes.related_pages !== undefined) assertUniquePageIds(changes.related_pages, pageId);
  if (changes.provenance !== undefined) assertGuideProvenance(changes.provenance);
}

function assertGuideFreshness(value: GuideFreshness): void {
  if ((value.kind === 'dated_snapshot') !== (value.observed_at !== null)) {
    throw new TypeError('Only dated guide snapshots have an observed_at timestamp.');
  }
  if (value.observed_at !== null) assertGuideTimestamp(value.observed_at, 'observed_at');
}

function assertGuideProvenance(values: readonly GuideProvenance[]): void {
  if (values.length > 50) throw new TypeError('Guide provenance is limited to 50 sources.');
  const keys = new Set<string>();
  for (const value of values) {
    assertGuideText(value.reference, 1, 512, 'Guide provenance reference');
    assertGuideContentSafe(value.reference);
    if (value.retrieved_at !== null) assertGuideTimestamp(value.retrieved_at, 'retrieved_at');
    if (value.version !== null) {
      assertGuideText(value.version, 1, 128, 'Guide provenance version');
      assertGuideContentSafe(value.version);
    }
    if (value.source_kind === 'ESI' && value.retrieved_at === null) {
      throw new TypeError('ESI guide provenance requires a retrieval timestamp.');
    }
    if (value.source_kind === 'SDE'
      && (value.version === null || !/^[1-9][0-9]{0,9}$/u.test(value.version))) {
      throw new TypeError('SDE guide provenance requires a numeric build version.');
    }
    if (value.source_kind === 'computed' && value.version === null) {
      throw new TypeError('Computed guide provenance requires a resolver or engine version.');
    }
    const key = JSON.stringify(value);
    if (keys.has(key)) throw new TypeError('Guide provenance entries must be unique.');
    keys.add(key);
  }
}

function assertUniquePageIds(values: readonly string[], ownPageId: string): void {
  if (values.length > 100) throw new TypeError('Guide pages are limited to 100 related pages.');
  const unique = new Set<string>();
  for (const value of values) {
    assertGuidePageId(value);
    if (value === ownPageId) throw new TypeError('A guide page cannot link to itself.');
    if (unique.has(value)) throw new TypeError('Related guide pages must be unique.');
    unique.add(value);
  }
}

function assertUniquePositiveIntegers(values: readonly number[], limit: number, label: string): void {
  if (values.length > limit) throw new TypeError(`Guide ${label} are limited to ${String(limit)} entries.`);
  const unique = new Set<number>();
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`Guide ${label} must be positive integers.`);
    if (unique.has(value)) throw new TypeError(`Guide ${label} must be unique.`);
    unique.add(value);
  }
}

function assertGuideText(value: string, minimum: number, maximum: number, label: string): void {
  if (value.trim() !== value || value.length < minimum || value.length > maximum || value.includes('\0')) {
    throw new TypeError(`${label} is invalid.`);
  }
}
