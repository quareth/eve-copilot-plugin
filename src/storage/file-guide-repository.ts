import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import type {
  GuideRepository,
  GuideVisibility,
} from '../application/ports/guide-repository.js';
import {
  GUIDE_PAGE_STATUSES,
  GUIDE_SCHEMA_VERSION,
  assertGuideChanges,
  assertGuideDraft,
  assertGuidePageId,
  assertGuideTimestamp,
  type GuideHealth,
  type GuidePage,
  type GuidePageChanges,
  type GuidePageDraft,
  type GuidePageMetadata,
  type GuidePageStatus,
  type GuideSearchHit,
} from '../domain/guide.js';
import { AppError } from '../domain/errors.js';
import {
  errorMessage,
  isRecord,
  pageSummary,
  pageWithHash,
  parsePage,
  searchScore,
  searchSnippet,
  serializePage,
  visible,
} from './file-guide-format.js';

const MAX_PAGES = 10_000;
const MAX_REVISIONS_PER_PAGE = 50;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

export class FileGuideRepository implements GuideRepository {
  readonly #root: string;
  readonly #pages: string;
  readonly #revisions: string;
  readonly #lock: string;

  constructor(root: string) {
    this.#root = root;
    this.#pages = join(root, 'pages');
    this.#revisions = join(root, 'revisions');
    this.#lock = join(root, '.maintenance.lock');
  }

  async health(): Promise<GuideHealth> {
    try {
      await this.#ensureLayout();
      const [pageFiles, revisionFiles] = await Promise.all([
        this.#markdownFiles(this.#pages),
        this.#markdownFiles(this.#revisions),
      ]);
      let invalid = 0;
      for (const path of pageFiles) {
        try {
          await this.#readPageFile(path);
        } catch {
          invalid += 1;
        }
      }
      return {
        state: invalid === 0 ? 'available' : 'degraded',
        page_count: pageFiles.length - invalid,
        invalid_page_count: invalid,
        revision_count: revisionFiles.length,
      };
    } catch {
      return { state: 'unavailable', page_count: 0, invalid_page_count: 0, revision_count: 0 };
    }
  }

  async search(input: {
    readonly query: string;
    readonly statuses: readonly GuidePageStatus[];
    readonly limit: number;
    readonly visibility: GuideVisibility;
    readonly signal: AbortSignal;
  }): Promise<readonly GuideSearchHit[]> {
    const query = input.query.trim().toLocaleLowerCase('en-US');
    if (query.length < 1 || query.length > 200) throw invalidGuideInput('Guide search query is invalid.');
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) {
      throw invalidGuideInput('Guide search limit must be between 1 and 20.');
    }
    const statuses = new Set(input.statuses);
    if (statuses.size !== input.statuses.length || input.statuses.some((value) => !isGuideStatus(value))) {
      throw invalidGuideInput('Guide search statuses are invalid.');
    }
    try {
      await this.#ensureLayout();
      const files = await this.#markdownFiles(this.#pages);
      if (files.length > MAX_PAGES) {
        throw new AppError({ code: 'RESULT_LIMIT_EXCEEDED', safeMessage: 'The guide contains more pages than bounded search can inspect.' });
      }
      const terms = query.split(/\s+/u).filter((term) => term.length > 0);
      const hits: GuideSearchHit[] = [];
      for (const path of files) {
        if (input.signal.aborted) throw new AppError({ code: 'CANCELLED', safeMessage: 'The request was cancelled.' });
        let page: GuidePage;
        try {
          page = await this.#readPageFile(path);
        } catch {
          continue;
        }
        if (!visible(page, input.visibility) || !statuses.has(page.metadata.status)) continue;
        const score = searchScore(page, query, terms);
        if (score === 0) continue;
        hits.push({ metadata: pageSummary(page.metadata), snippet: searchSnippet(page.content, terms), score });
      }
      return hits
        .sort((left, right) => right.score - left.score
          || right.metadata.updated_at.localeCompare(left.metadata.updated_at)
          || left.metadata.page_id.localeCompare(right.metadata.page_id))
        .slice(0, input.limit);
    } catch (error) {
      throw guideStorageError(error);
    }
  }

  async read(input: {
    readonly pageId: string;
    readonly revision?: number;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage | null> {
    try {
      assertGuidePageId(input.pageId);
      if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1)) {
        throw new TypeError('Guide revision must be a positive safe integer.');
      }
    } catch (error) {
      throw invalidGuideInput(errorMessage(error));
    }
    try {
      await this.#ensureLayout();
      const path = input.revision === undefined
        ? this.#pagePath(input.pageId)
        : this.#revisionPath(input.pageId, input.revision);
      const page = await this.#readOptionalPageFile(path);
      return page !== null && visible(page, input.visibility) ? page : null;
    } catch (error) {
      throw guideStorageError(error);
    }
  }

  create(input: { readonly draft: GuidePageDraft; readonly at: string }): Promise<GuidePage> {
    try {
      assertGuideDraft(input.draft);
      assertGuideTimestamp(input.at, 'created_at');
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const path = this.#pagePath(input.draft.page_id);
      if (await exists(path)) throw guideConflict('The guide page already exists.');
      const files = await this.#markdownFiles(this.#pages);
      if (files.length >= MAX_PAGES) {
        throw new AppError({ code: 'RESULT_LIMIT_EXCEEDED', safeMessage: 'The guide page limit has been reached.' });
      }
      const metadata: GuidePageMetadata = {
        schema_version: GUIDE_SCHEMA_VERSION,
        page_id: input.draft.page_id,
        title: input.draft.title,
        page_kind: input.draft.page_kind,
        scope: input.draft.scope,
        character_id: input.draft.character_id,
        status: 'current',
        revision: 1,
        created_at: input.at,
        updated_at: input.at,
        authority: 'advisory',
        source_type: 'user_guide',
        freshness: input.draft.freshness,
        related_type_ids: Object.freeze([...input.draft.related_type_ids]),
        related_pages: Object.freeze([...input.draft.related_pages]),
        provenance: Object.freeze(input.draft.provenance.map((value) => Object.freeze({ ...value }))),
        superseded_by: null,
      };
      const page = pageWithHash(metadata, input.draft.content);
      await this.#atomicWrite(path, serializePage(page));
      return page;
    });
  }

  revise(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly changes: GuidePageChanges;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage> {
    try {
      assertGuidePageId(input.pageId);
      assertExpectedRevision(input.expectedRevision);
      assertGuideChanges(input.changes, input.pageId);
      assertGuideTimestamp(input.at, 'updated_at');
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const current = await this.#requiredMutablePage(input.pageId, input.expectedRevision, input.visibility);
      await this.#preserveRevision(current);
      const metadata: GuidePageMetadata = {
        ...current.metadata,
        title: input.changes.title ?? current.metadata.title,
        page_kind: input.changes.page_kind ?? current.metadata.page_kind,
        revision: current.metadata.revision + 1,
        updated_at: input.at,
        freshness: input.changes.freshness ?? current.metadata.freshness,
        related_type_ids: Object.freeze([...(input.changes.related_type_ids ?? current.metadata.related_type_ids)]),
        related_pages: Object.freeze([...(input.changes.related_pages ?? current.metadata.related_pages)]),
        provenance: Object.freeze((input.changes.provenance ?? current.metadata.provenance)
          .map((value) => Object.freeze({ ...value }))),
      };
      const page = pageWithHash(metadata, input.changes.content ?? current.content);
      await this.#atomicWrite(this.#pagePath(input.pageId), serializePage(page));
      await this.#pruneRevisions(input.pageId);
      return page;
    });
  }

  setStatus(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly status: GuidePageStatus;
    readonly supersededBy: string | null;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage> {
    try {
      assertGuidePageId(input.pageId);
      assertExpectedRevision(input.expectedRevision);
      assertGuideTimestamp(input.at, 'updated_at');
      if (!isGuideStatus(input.status)) throw new TypeError('Guide page status is invalid.');
      if ((input.status === 'superseded') !== (input.supersededBy !== null)) {
        throw new TypeError('Superseded guide pages require exactly one replacement page ID.');
      }
      if (input.supersededBy !== null) {
        assertGuidePageId(input.supersededBy);
        if (input.supersededBy === input.pageId) throw new TypeError('A guide page cannot supersede itself.');
      }
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const current = await this.#requiredMutablePage(input.pageId, input.expectedRevision, input.visibility);
      if (input.supersededBy !== null) {
        const replacement = await this.#readOptionalPageFile(this.#pagePath(input.supersededBy));
        if (replacement === null || !visible(replacement, input.visibility)) {
          throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The superseding guide page was not found.' });
        }
      }
      await this.#preserveRevision(current);
      const page = pageWithHash({
        ...current.metadata,
        status: input.status,
        superseded_by: input.supersededBy,
        revision: current.metadata.revision + 1,
        updated_at: input.at,
      }, current.content);
      await this.#atomicWrite(this.#pagePath(input.pageId), serializePage(page));
      await this.#pruneRevisions(input.pageId);
      return page;
    });
  }

  remove(input: {
    readonly pageId: string;
    readonly expectedRevision: number;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<{ readonly pageId: string; readonly removedRevision: number }> {
    try {
      assertGuidePageId(input.pageId);
      assertExpectedRevision(input.expectedRevision);
      assertGuideTimestamp(input.at, 'updated_at');
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const current = await this.#requiredMutablePage(input.pageId, input.expectedRevision, input.visibility);
      await this.#preserveRevision(current);
      await this.#pruneRevisions(input.pageId);
      await unlink(this.#pagePath(input.pageId));
      return { pageId: input.pageId, removedRevision: current.metadata.revision };
    });
  }

  restore(input: {
    readonly pageId: string;
    readonly revision: number;
    readonly expectedRevision: number | null;
    readonly at: string;
    readonly visibility: GuideVisibility;
  }): Promise<GuidePage> {
    try {
      assertGuidePageId(input.pageId);
      assertExpectedRevision(input.revision);
      if (input.expectedRevision !== null) assertExpectedRevision(input.expectedRevision);
      assertGuideTimestamp(input.at, 'updated_at');
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const historical = await this.#readOptionalPageFile(this.#revisionPath(input.pageId, input.revision));
      if (historical === null || !visible(historical, input.visibility)) {
        throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The requested guide revision was not found.' });
      }
      const current = await this.#readOptionalPageFile(this.#pagePath(input.pageId));
      if (current === null && input.expectedRevision !== null) throw guideConflict('The guide page no longer exists.');
      if (current !== null) {
        if (!visible(current, input.visibility)) throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The guide page was not found.' });
        if (input.expectedRevision === null || current.metadata.revision !== input.expectedRevision) {
          throw guideConflict('The guide page changed before it could be restored.');
        }
        await this.#preserveRevision(current);
      }
      const maximumRevision = await this.#maximumRevision(input.pageId, current?.metadata.revision ?? 0);
      const page = pageWithHash({
        ...historical.metadata,
        status: 'current',
        superseded_by: null,
        revision: maximumRevision + 1,
        updated_at: input.at,
      }, historical.content);
      await this.#atomicWrite(this.#pagePath(input.pageId), serializePage(page));
      await this.#pruneRevisions(input.pageId);
      return page;
    });
  }

  removeCharacter(input: {
    readonly characterId: number;
    readonly at: string;
  }): Promise<{ readonly pagesRemoved: number; readonly revisionsRemoved: number }> {
    if (!Number.isSafeInteger(input.characterId) || input.characterId <= 0) {
      return Promise.reject(invalidGuideInput('Guide character ID must be a positive safe integer.'));
    }
    try {
      assertGuideTimestamp(input.at, 'removed_at');
    } catch (error) {
      return Promise.reject(invalidGuideInput(errorMessage(error)));
    }
    return this.#withLock(async () => {
      const [pages, revisions] = await Promise.all([
        this.#markdownFiles(this.#pages),
        this.#markdownFiles(this.#revisions),
      ]);
      const selectedPages = await this.#characterFiles(pages, input.characterId);
      const selectedRevisions = await this.#characterFiles(revisions, input.characterId);
      await Promise.all([...selectedPages, ...selectedRevisions].map((path) => unlink(path)));
      return { pagesRemoved: selectedPages.length, revisionsRemoved: selectedRevisions.length };
    });
  }

  async #requiredMutablePage(
    pageId: string,
    expectedRevision: number,
    visibility: GuideVisibility,
  ): Promise<GuidePage> {
    const page = await this.#readOptionalPageFile(this.#pagePath(pageId));
    if (page === null || !visible(page, visibility)) {
      throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The guide page was not found.' });
    }
    if (page.metadata.revision !== expectedRevision) {
      throw guideConflict('The guide page changed before maintenance completed. Read it again and retry.');
    }
    return page;
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#ensureLayout();
    const started = Date.now();
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    while (handle === null) {
      try {
        const candidate = await open(this.#lock, 'wx', 0o600);
        try {
          await candidate.writeFile(`${String(process.pid)}\n${new Date().toISOString()}\n`, 'utf8');
          handle = candidate;
        } catch (error) {
          await candidate.close().catch(() => undefined);
          await unlink(this.#lock).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw guideStorageError(error);
        await this.#removeStaleLock();
        if (Date.now() - started >= LOCK_TIMEOUT_MS) throw guideConflict('The guide is busy. Retry maintenance shortly.');
        await delay(25);
      }
    }
    try {
      return await operation();
    } catch (error) {
      throw guideStorageError(error);
    } finally {
      await handle.close().catch(() => undefined);
      await unlink(this.#lock).catch(() => undefined);
    }
  }

  async #removeStaleLock(): Promise<void> {
    try {
      const info = await stat(this.#lock);
      if (Date.now() - info.mtimeMs > STALE_LOCK_MS) await unlink(this.#lock);
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
  }

  async #ensureLayout(): Promise<void> {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await this.#assertDirectory(this.#root);
    await this.#ensureSafeDirectory(this.#pages);
    await this.#ensureSafeDirectory(this.#revisions);
    if (process.platform !== 'win32') {
      await chmod(this.#root, 0o700);
      await chmod(this.#pages, 0o700);
      await chmod(this.#revisions, 0o700);
    }
  }

  async #preserveRevision(page: GuidePage): Promise<void> {
    const target = this.#revisionPath(page.metadata.page_id, page.metadata.revision);
    if (await exists(target)) {
      const existing = await this.#readPageFile(target);
      if (serializePage(existing) !== serializePage(page)) {
        throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'The guide revision history is inconsistent.' });
      }
      return;
    }
    await this.#ensureSafeDirectory(dirname(target));
    await this.#assertSafeParent(target);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serializePage(page), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await link(temporary, target);
      if (process.platform !== 'win32') await chmod(target, 0o600);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async #atomicWrite(path: string, value: string): Promise<void> {
    await this.#ensureSafeDirectory(dirname(path));
    await this.#assertSafeParent(path);
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, value, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      if (process.platform !== 'win32') await chmod(temporary, 0o600);
      await rename(temporary, path);
      if (process.platform !== 'win32') await chmod(path, 0o600);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async #readOptionalPageFile(path: string): Promise<GuidePage | null> {
    try {
      return await this.#readPageFile(path);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return null;
      throw error;
    }
  }

  async #readPageFile(path: string): Promise<GuidePage> {
    const [root, resolved] = await Promise.all([realpath(this.#root), realpath(path)]);
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'A guide page resolves outside the private workspace.' });
    }
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'A guide page is not a regular file.' });
    }
    if (info.size > 96 * 1024) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'A guide page exceeds the safe file-size limit.' });
    }
    const raw = await readFile(path, 'utf8');
    return parsePage(raw);
  }

  async #markdownFiles(root: string): Promise<readonly string[]> {
    const output: string[] = [];
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 6) return;
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await visit(path, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.md')) output.push(path);
      }
    };
    await visit(root, 0);
    return output.sort();
  }

  async #characterFiles(files: readonly string[], characterId: number): Promise<readonly string[]> {
    const selected: string[] = [];
    for (const path of files) {
      const page = await this.#readPageFile(path);
      if (page.metadata.scope === 'character' && page.metadata.character_id === characterId) selected.push(path);
    }
    return selected;
  }

  async #maximumRevision(pageId: string, current: number): Promise<number> {
    const directory = dirname(this.#revisionPath(pageId, 1));
    let entries: readonly string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return current;
      throw error;
    }
    return entries.reduce((maximum, name) => {
      const match = /^(\d{8})\.md$/u.exec(name);
      return match === null ? maximum : Math.max(maximum, Number(match[1]));
    }, current);
  }

  async #pruneRevisions(pageId: string): Promise<void> {
    const directory = dirname(this.#revisionPath(pageId, 1));
    let entries: readonly string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }
    const revisions = entries.filter((name) => /^\d{8}\.md$/u.test(name)).sort();
    const remove = revisions.slice(0, Math.max(0, revisions.length - MAX_REVISIONS_PER_PAGE));
    await Promise.all(remove.map((name) => unlink(join(directory, name))));
  }

  async #assertSafeParent(path: string): Promise<void> {
    const [root, parent] = await Promise.all([realpath(this.#root), realpath(dirname(path))]);
    if (parent !== root && !parent.startsWith(`${root}${sep}`)) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'A guide path resolves outside the private workspace.' });
    }
  }

  async #ensureSafeDirectory(directory: string): Promise<void> {
    const suffix = relative(this.#root, directory);
    if (suffix === '' || suffix === '.') return;
    if (suffix === '..' || suffix.startsWith(`..${sep}`)) {
      throw new AppError({ code: 'GUIDE_INVALID', safeMessage: 'A guide directory is outside the private workspace.' });
    }
    let current = this.#root;
    for (const segment of suffix.split(sep)) {
      current = join(current, segment);
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
      }
      await this.#assertDirectory(current);
    }
  }

  async #assertDirectory(path: string): Promise<void> {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new AppError({ code: 'GUIDE_UNAVAILABLE', safeMessage: 'The guide workspace contains an unsafe directory.' });
    }
  }

  #pagePath(pageId: string): string {
    return join(this.#pages, ...pageId.split('/')) + '.md';
  }

  #revisionPath(pageId: string, revision: number): string {
    return join(this.#revisions, ...pageId.split('/'), `${String(revision).padStart(8, '0')}.md`);
  }
}

function isGuideStatus(value: string): value is GuidePageStatus {
  return (GUIDE_PAGE_STATUSES as readonly string[]).includes(value);
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function assertExpectedRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Expected guide revision must be positive.');
}

function invalidGuideInput(message: string): AppError {
  return new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: message });
}

function guideConflict(message: string): AppError {
  return new AppError({ code: 'GUIDE_CONFLICT', safeMessage: message, details: { next_step: 'Read the latest guide page and retry with its revision.' } });
}

function guideStorageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof TypeError) return invalidGuideInput(error.message);
  return new AppError({ code: 'GUIDE_UNAVAILABLE', safeMessage: 'The local EVE guide is unavailable.', cause: error });
}

function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
