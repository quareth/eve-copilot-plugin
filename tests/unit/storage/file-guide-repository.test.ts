import { access, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileGuideRepository } from '../../../src/storage/file-guide-repository.js';
import type { GuidePageDraft } from '../../../src/domain/guide.js';

const roots: string[] = [];
const userVisibility = { selectedCharacterId: null };
const signal = new AbortController().signal;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FileGuideRepository', () => {
  it('stores canonical Markdown and returns advisory metadata', async () => {
    const { root, repository } = await fixture();
    const page = await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });

    expect(page).toMatchObject({
      metadata: {
        page_id: 'ships/astero',
        scope: 'user',
        status: 'current',
        revision: 1,
        authority: 'advisory',
        source_type: 'user_guide',
      },
      content: '# Astero\n\nA compact exploration frigate.',
    });
    expect(page.content_sha256).toMatch(/^[a-f0-9]{64}$/u);
    const path = join(root, 'pages', 'ships', 'astero.md');
    expect(await readFile(path, 'utf8')).toMatch(/^---\n\{"schema_version":1,/u);
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('isolates character pages from other or absent selections', async () => {
    const { repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    await repository.create({
      draft: draft({
        page_id: 'skills/astero-progress',
        title: 'Astero progress',
        scope: 'character',
        character_id: 90000001,
        freshness: { kind: 'dated_snapshot', observed_at: '2026-08-21T09:00:00.000Z' },
        content: '# Astero progress\n\nTwo skills remain.',
      }),
      at: '2026-08-21T10:00:00.000Z',
    });

    expect((await repository.search({
      query: 'Astero', statuses: ['current'], limit: 20, visibility: userVisibility, signal,
    })).map((hit) => hit.metadata.page_id)).toEqual(['ships/astero']);
    expect(await repository.read({
      pageId: 'skills/astero-progress', visibility: { selectedCharacterId: 90000002 },
    })).toBeNull();
    expect(await repository.read({
      pageId: 'skills/astero-progress', visibility: { selectedCharacterId: 90000001 },
    })).not.toBeNull();
  });

  it('preserves revisions, enforces optimistic concurrency, and restores removed pages', async () => {
    const { repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    const revised = await repository.revise({
      pageId: 'ships/astero',
      expectedRevision: 1,
      changes: { content: '# Astero\n\nUpdated synthesis.' },
      at: '2026-08-21T11:00:00.000Z',
      visibility: userVisibility,
    });
    expect(revised.metadata.revision).toBe(2);
    expect((await repository.read({
      pageId: 'ships/astero', revision: 1, visibility: userVisibility,
    }))?.content).toContain('compact exploration');
    await expect(repository.revise({
      pageId: 'ships/astero',
      expectedRevision: 1,
      changes: { title: 'Stale writer' },
      at: '2026-08-21T12:00:00.000Z',
      visibility: userVisibility,
    })).rejects.toMatchObject({ code: 'GUIDE_CONFLICT' });

    await repository.remove({
      pageId: 'ships/astero', expectedRevision: 2, at: '2026-08-21T12:00:00.000Z', visibility: userVisibility,
    });
    expect(await repository.read({ pageId: 'ships/astero', visibility: userVisibility })).toBeNull();
    const restored = await repository.restore({
      pageId: 'ships/astero',
      revision: 1,
      expectedRevision: null,
      at: '2026-08-21T13:00:00.000Z',
      visibility: userVisibility,
    });
    expect(restored).toMatchObject({ metadata: { revision: 3, status: 'current' } });
    expect(restored.content).toContain('compact exploration');
  });

  it('supports supersession and excludes inactive pages from ordinary recall', async () => {
    const { repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    await repository.create({
      draft: draft({ page_id: 'ships/astero-v2', title: 'Astero current guide' }),
      at: '2026-08-21T10:00:00.000Z',
    });
    const superseded = await repository.setStatus({
      pageId: 'ships/astero',
      expectedRevision: 1,
      status: 'superseded',
      supersededBy: 'ships/astero-v2',
      at: '2026-08-21T11:00:00.000Z',
      visibility: userVisibility,
    });
    expect(superseded.metadata).toMatchObject({ status: 'superseded', superseded_by: 'ships/astero-v2' });
    expect((await repository.search({
      query: 'Astero', statuses: ['current'], limit: 20, visibility: userVisibility, signal,
    })).map((hit) => hit.metadata.page_id)).toEqual(['ships/astero-v2']);
  });

  it('rejects traversal and credential material', async () => {
    const { repository } = await fixture();
    await expect(repository.create({
      draft: draft({ page_id: '../credentials' }), at: '2026-08-21T10:00:00.000Z',
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
    await expect(repository.create({
      draft: draft({ content: '# Secret\n\nrefresh_token=abcdefghijklmnopqrstuvwxyz' }),
      at: '2026-08-21T10:00:00.000Z',
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
    await expect(repository.create({
      draft: draft({ title: 'Bearer abcdefghijklmnopqrstuvwxyz' }),
      at: '2026-08-21T10:00:00.000Z',
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
    await expect(repository.create({
      draft: draft({ related_pages: ['ships/astero'] }),
      at: '2026-08-21T10:00:00.000Z',
    })).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
  });

  it('isolates malformed pages and reports degraded health', async () => {
    const { root, repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    await writeFile(join(root, 'pages', 'malformed.md'), 'not frontmatter', 'utf8');
    expect(await repository.health()).toEqual({
      state: 'degraded', page_count: 1, invalid_page_count: 1, revision_count: 0,
    });
    expect(await repository.search({
      query: 'Astero', statuses: ['current'], limit: 20, visibility: userVisibility, signal,
    })).toHaveLength(1);
  });

  it('permanently purges character pages and revisions without touching user pages', async () => {
    const { repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    await repository.create({
      draft: draft({
        page_id: 'skills/private-progress',
        title: 'Private progress',
        scope: 'character',
        character_id: 90000001,
        freshness: { kind: 'dated_snapshot', observed_at: '2026-08-21T09:00:00.000Z' },
      }),
      at: '2026-08-21T10:00:00.000Z',
    });
    await repository.revise({
      pageId: 'skills/private-progress',
      expectedRevision: 1,
      changes: { content: '# Progress\n\nUpdated private snapshot.' },
      at: '2026-08-21T11:00:00.000Z',
      visibility: { selectedCharacterId: 90000001 },
    });

    expect(await repository.removeCharacter({
      characterId: 90000001, at: '2026-08-21T12:00:00.000Z',
    })).toEqual({ pagesRemoved: 1, revisionsRemoved: 1 });
    expect(await repository.read({ pageId: 'ships/astero', visibility: userVisibility })).not.toBeNull();
    expect(await repository.read({
      pageId: 'skills/private-progress', revision: 1, visibility: { selectedCharacterId: 90000001 },
    })).toBeNull();
  });

  it('bounds historical revisions to the newest fifty versions', async () => {
    const { repository } = await fixture();
    await repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' });
    for (let revision = 1; revision <= 52; revision += 1) {
      await repository.revise({
        pageId: 'ships/astero',
        expectedRevision: revision,
        changes: { content: `# Astero\n\nRevision ${String(revision + 1)}.` },
        at: '2026-08-21T11:00:00.000Z',
        visibility: userVisibility,
      });
    }
    expect((await repository.health()).revision_count).toBe(50);
    expect(await repository.read({ pageId: 'ships/astero', revision: 1, visibility: userVisibility })).toBeNull();
    expect(await repository.read({ pageId: 'ships/astero', revision: 3, visibility: userVisibility })).not.toBeNull();
  });

  it.runIf(process.platform !== 'win32')('rejects symlinked page directories', async () => {
    const { root, repository } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'eve-guide-outside-'));
    roots.push(outside);
    await repository.health();
    await symlink(outside, join(root, 'pages', 'ships'));
    await expect(repository.create({ draft: draft(), at: '2026-08-21T10:00:00.000Z' }))
      .rejects.toMatchObject({ code: 'GUIDE_UNAVAILABLE' });
    await expect(access(join(outside, 'astero.md'))).rejects.toBeDefined();
  });
});

async function fixture(): Promise<{ readonly root: string; readonly repository: FileGuideRepository }> {
  const root = await mkdtemp(join(tmpdir(), 'eve-guide-test-'));
  roots.push(root);
  return { root, repository: new FileGuideRepository(root) };
}

function draft(overrides: Partial<GuidePageDraft> = {}): GuidePageDraft {
  return {
    page_id: 'ships/astero',
    title: 'Astero',
    page_kind: 'ship',
    scope: 'user',
    character_id: null,
    content: '# Astero\n\nA compact exploration frigate.',
    freshness: { kind: 'stable', observed_at: null },
    related_type_ids: [33468],
    related_pages: [],
    provenance: [{
      source_kind: 'SDE',
      reference: 'type:33468',
      retrieved_at: '2026-08-21T09:00:00.000Z',
      version: '3475087',
    }],
    ...overrides,
  };
}
