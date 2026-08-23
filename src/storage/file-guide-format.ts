import { createHash } from 'node:crypto';
import type { GuideVisibility } from '../application/ports/guide-repository.js';
import {
  GUIDE_PAGE_KINDS,
  GUIDE_PAGE_STATUSES,
  GUIDE_SCHEMA_VERSION,
  GUIDE_SOURCE_KINDS,
  assertGuideDraft,
  assertGuidePageId,
  assertGuideTimestamp,
  type GuidePage,
  type GuidePageMetadata,
  type GuidePageSummary,
} from '../domain/guide.js';
import { AppError } from '../domain/errors.js';

const FRONTMATTER_START = '---\n';
const FRONTMATTER_END = '\n---\n';

export function serializePage(page: GuidePage): string {
  return `${FRONTMATTER_START}${JSON.stringify(page.metadata)}${FRONTMATTER_END}${page.content}\n`;
}

export function parsePage(raw: string): GuidePage {
  if (!raw.startsWith(FRONTMATTER_START)) throw invalidPage('Guide page frontmatter is missing.');
  const end = raw.indexOf(FRONTMATTER_END, FRONTMATTER_START.length);
  if (end < 0) throw invalidPage('Guide page frontmatter is incomplete.');
  let value: unknown;
  try {
    value = JSON.parse(raw.slice(FRONTMATTER_START.length, end));
  } catch (error) {
    throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'Guide page frontmatter is invalid.', cause: error });
  }
  const contentWithNewline = raw.slice(end + FRONTMATTER_END.length);
  const content = contentWithNewline.endsWith('\n') ? contentWithNewline.slice(0, -1) : contentWithNewline;
  const metadata = parseMetadata(value);
  try {
    assertGuideDraft({
      page_id: metadata.page_id,
      title: metadata.title,
      page_kind: metadata.page_kind,
      scope: metadata.scope,
      character_id: metadata.character_id,
      content,
      freshness: metadata.freshness,
      related_type_ids: metadata.related_type_ids,
      related_pages: metadata.related_pages,
      provenance: metadata.provenance,
    });
    assertGuideTimestamp(metadata.created_at, 'created_at');
    assertGuideTimestamp(metadata.updated_at, 'updated_at');
    if (metadata.updated_at < metadata.created_at) throw new TypeError('Guide update timestamp precedes creation.');
  } catch (error) {
    throw new AppError({ code: 'GUIDE_INVALID', safeMessage: errorMessage(error), cause: error });
  }
  return pageWithHash(metadata, content);
}

function parseMetadata(value: unknown): GuidePageMetadata {
  if (!isRecord(value)) throw invalidPage('Guide page metadata is not an object.');
  const expectedKeys = new Set([
    'schema_version', 'page_id', 'title', 'page_kind', 'scope', 'character_id', 'status', 'revision',
    'created_at', 'updated_at', 'authority', 'source_type', 'freshness', 'related_type_ids',
    'related_pages', 'provenance', 'superseded_by',
  ]);
  if (Object.keys(value).some((key) => !expectedKeys.has(key)) || Object.keys(value).length !== expectedKeys.size) {
    throw invalidPage('Guide page metadata fields do not match schema version 1.');
  }
  if (value.schema_version !== GUIDE_SCHEMA_VERSION
    || typeof value.page_id !== 'string'
    || typeof value.title !== 'string'
    || !isStringMember(value.page_kind, GUIDE_PAGE_KINDS)
    || (value.scope !== 'user' && value.scope !== 'character')
    || !(value.character_id === null || typeof value.character_id === 'number')
    || !isStringMember(value.status, GUIDE_PAGE_STATUSES)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.created_at !== 'string' || typeof value.updated_at !== 'string'
    || value.authority !== 'advisory' || value.source_type !== 'user_guide'
    || !isRecord(value.freshness)
    || !Array.isArray(value.related_type_ids) || !Array.isArray(value.related_pages)
    || !Array.isArray(value.provenance)
    || !(value.superseded_by === null || typeof value.superseded_by === 'string')) {
    throw invalidPage('Guide page metadata values do not match schema version 1.');
  }
  const freshness = value.freshness;
  if ((freshness.kind !== 'stable' && freshness.kind !== 'dated_snapshot' && freshness.kind !== 'unverified')
    || !(freshness.observed_at === null || typeof freshness.observed_at === 'string')) {
    throw invalidPage('Guide page freshness metadata is invalid.');
  }
  const provenance = value.provenance.map((entry) => {
    if (!isRecord(entry)
      || !isStringMember(entry.source_kind, GUIDE_SOURCE_KINDS)
      || typeof entry.reference !== 'string'
      || !(entry.retrieved_at === null || typeof entry.retrieved_at === 'string')
      || !(entry.version === null || typeof entry.version === 'string')
      || Object.keys(entry).length !== 4) {
      throw invalidPage('Guide page provenance metadata is invalid.');
    }
    return {
      source_kind: entry.source_kind,
      reference: entry.reference,
      retrieved_at: entry.retrieved_at,
      version: entry.version,
    };
  });
  if (value.related_type_ids.some((entry) => typeof entry !== 'number')
    || value.related_pages.some((entry) => typeof entry !== 'string')) {
    throw invalidPage('Guide page relationship metadata is invalid.');
  }
  if ((value.status === 'superseded') !== (value.superseded_by !== null)) {
    throw invalidPage('Guide page supersession metadata is invalid.');
  }
  if (value.superseded_by !== null) {
    try {
      assertGuidePageId(value.superseded_by);
    } catch (error) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'Guide page supersession metadata is invalid.', cause: error });
    }
  }
  return {
    schema_version: GUIDE_SCHEMA_VERSION,
    page_id: value.page_id,
    title: value.title,
    page_kind: value.page_kind,
    scope: value.scope,
    character_id: value.character_id,
    status: value.status,
    revision: value.revision,
    created_at: value.created_at,
    updated_at: value.updated_at,
    authority: 'advisory',
    source_type: 'user_guide',
    freshness: { kind: freshness.kind, observed_at: freshness.observed_at },
    related_type_ids: Object.freeze([...(value.related_type_ids as number[])]),
    related_pages: Object.freeze([...(value.related_pages as string[])]),
    provenance: Object.freeze(provenance),
    superseded_by: value.superseded_by,
  };
}

export function pageWithHash(metadata: GuidePageMetadata, content: string): GuidePage {
  const frozenMetadata: GuidePageMetadata = Object.freeze({
    ...metadata,
    freshness: Object.freeze({ ...metadata.freshness }),
    related_type_ids: Object.freeze([...metadata.related_type_ids]),
    related_pages: Object.freeze([...metadata.related_pages]),
    provenance: Object.freeze(metadata.provenance.map((value) => Object.freeze({ ...value }))),
  });
  return Object.freeze({
    metadata: frozenMetadata,
    content,
    content_sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  });
}

export function pageSummary(metadata: GuidePageMetadata): GuidePageSummary {
  return Object.freeze({
    page_id: metadata.page_id,
    title: metadata.title,
    page_kind: metadata.page_kind,
    scope: metadata.scope,
    character_id: metadata.character_id,
    status: metadata.status,
    revision: metadata.revision,
    updated_at: metadata.updated_at,
    authority: 'advisory',
    source_type: 'user_guide',
    freshness: Object.freeze({ ...metadata.freshness }),
  });
}

export function visible(page: GuidePage, visibility: GuideVisibility): boolean {
  return page.metadata.scope === 'user'
    || page.metadata.character_id === visibility.selectedCharacterId;
}

export function searchScore(page: GuidePage, query: string, terms: readonly string[]): number {
  const title = page.metadata.title.toLocaleLowerCase('en-US');
  const pageId = page.metadata.page_id.toLocaleLowerCase('en-US');
  const content = page.content.toLocaleLowerCase('en-US');
  let score = title === query ? 1000 : pageId === query ? 900 : 0;
  for (const term of terms) {
    if (!title.includes(term) && !pageId.includes(term) && !content.includes(term)) return 0;
    if (title.includes(term)) score += 100;
    if (pageId.includes(term)) score += 60;
    score += Math.min(20, occurrences(content, term));
  }
  return score;
}

export function searchSnippet(content: string, terms: readonly string[]): string {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  const lower = normalized.toLocaleLowerCase('en-US');
  const indexes = terms.map((term) => lower.indexOf(term)).filter((value) => value >= 0);
  const match = indexes.length === 0 ? 0 : Math.min(...indexes);
  const start = Math.max(0, match - 80);
  const end = Math.min(normalized.length, start + 320);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
}

function occurrences(value: string, term: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(term, offset)) >= 0) {
    count += 1;
    offset += Math.max(1, term.length);
  }
  return count;
}

function isStringMember<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidPage(message: string): AppError {
  return new AppError({ code: 'GUIDE_INVALID', safeMessage: message });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Guide input is invalid.';
}
