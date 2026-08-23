import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { afterEach, describe, expect, it } from 'vitest';
import { SdeManager } from '../../../src/infrastructure/sde/sde-manager.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import { FixedClock, FixedIdGenerator } from '../../helpers/fakes.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('SdeManager requirement activation', () => {
  it('activates a valid SDE build and publishes its durable pointer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eve-sde-manager-'));
    directories.push(directory);
    const sdeDirectory = join(directory, 'sde');
    const database = openDatabase({
      path: join(directory, 'eve-copilot.db'),
      busyTimeoutMs: 1_000,
      clock: new FixedClock(),
    });
    const archive = await validArchive();
    const manager = new SdeManager({
      directory: sdeDirectory,
      database,
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      fetch: fakeSdeFetch(archive),
    });

    try {
      await expect(manager.install('install', new AbortController().signal)).resolves.toMatchObject({
        state: 'installed',
        build_number: 43,
      });
      expect(manager.status()).toMatchObject({ state: 'available', build_number: 43 });
      expect(await readFile(join(sdeDirectory, 'active.json'), 'utf8'))
        .toContain('"build_number":43');
      expect(database.raw.prepare("SELECT build_number FROM sde_installations WHERE status = 'active'").get())
        .toEqual({ build_number: 43 });
    } finally {
      database.close();
    }
  });

  it('reimports the current build when its importer contract is obsolete', async () => {
    const fixture = await existingBuildFixture();
    const archive = await malformedRequirementArchive();
    const manager = new SdeManager({
      directory: fixture.sdeDirectory,
      database: fixture.database,
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      fetch: fakeSdeFetch(archive, 42),
    });

    await expect(manager.install('update', new AbortController().signal)).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    });
    expect(manager.status()).toMatchObject({ state: 'available', build_number: 42 });
    fixture.database.close();
  });

  it('preserves the previous active build when a staged requirement graph fails validation', async () => {
    const { database, sdeDirectory } = await existingBuildFixture();
    const archive = await malformedRequirementArchive();
    const fetch = fakeSdeFetch(archive);
    const manager = new SdeManager({
      directory: sdeDirectory,
      database,
      clock: new FixedClock(),
      idGenerator: new FixedIdGenerator(),
      fetch,
    });

    await expect(manager.install('update', new AbortController().signal)).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
    });
    expect(manager.status()).toMatchObject({ state: 'available', build_number: 42 });
    expect(await readFile(join(sdeDirectory, 'active.json'), 'utf8'))
      .toContain('"build_number":42');
    expect(database.raw.prepare("SELECT build_number FROM sde_installations WHERE status = 'active'").get())
      .toEqual({ build_number: 42 });
    database.close();
  });
});

async function validArchive(): Promise<Uint8Array> {
  const files: Readonly<Record<string, string>> = {
    'types.jsonl': lines({ _key: 100, name: { en: 'Hull' }, groupID: 10, published: true }),
    'groups.jsonl': lines({ _key: 10, name: { en: 'Ship Group' }, categoryID: 6, published: true }),
    'categories.jsonl': lines({ _key: 6, name: { en: 'Ship' }, published: true }),
    'marketGroups.jsonl': '',
    'dogmaAttributes.jsonl': lines({
      _key: 1,
      name: 'testAttribute',
      defaultValue: 0,
      highIsGood: true,
      stackable: true,
    }),
    'dogmaEffects.jsonl': lines({
      _key: 1,
      name: 'testEffect',
      effectCategoryID: 0,
      electronicChance: false,
      isAssistance: false,
      isOffensive: false,
      isWarpSafe: false,
      propulsionChance: false,
      rangeChance: false,
    }),
    'typeDogma.jsonl': lines({
      _key: 100,
      dogmaAttributes: [],
      dogmaEffects: [{ effectID: 1, isDefault: true }],
    }),
    'blueprints.jsonl': '',
    'factions.jsonl': '',
    'mapRegions.jsonl': lines({ _key: 1, name: { en: 'Region' } }),
    'mapConstellations.jsonl': lines({ _key: 2, name: { en: 'Constellation' }, regionID: 1 }),
    'mapSolarSystems.jsonl': lines({
      _key: 3,
      name: { en: 'System' },
      constellationID: 2,
      regionID: 1,
    }),
    'mapStargates.jsonl': '',
    'mapPlanets.jsonl': '',
    'mapMoons.jsonl': '',
    'npcStations.jsonl': '',
    'npcCorporations.jsonl': '',
    'stationOperations.jsonl': '',
  };
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  for (const [name, contents] of Object.entries(files)) await writer.add(name, new TextReader(contents));
  return writer.close();
}

async function malformedRequirementArchive(): Promise<Uint8Array> {
  const files: Readonly<Record<string, string>> = {
    'types.jsonl': lines(
      { _key: 100, name: { en: 'Target' }, groupID: 10, published: true },
      { _key: 200, name: { en: 'Skill' }, groupID: 20, published: true },
    ),
    'groups.jsonl': lines(
      { _key: 10, name: { en: 'Ship Group' }, categoryID: 6, published: true },
      { _key: 20, name: { en: 'Skill Group' }, categoryID: 16, published: true },
    ),
    'categories.jsonl': lines(
      { _key: 6, name: { en: 'Ship' }, published: true },
      { _key: 16, name: { en: 'Skill' }, published: true },
    ),
    'marketGroups.jsonl': '',
    'dogmaAttributes.jsonl': '',
    'typeDogma.jsonl': lines({
      _key: 100,
      dogmaAttributes: [{ attributeID: 182, value: 200 }],
    }),
    'blueprints.jsonl': '',
    'factions.jsonl': '',
    'mapRegions.jsonl': lines({ _key: 1, name: { en: 'Region' } }),
    'mapConstellations.jsonl': lines({ _key: 2, name: { en: 'Constellation' }, regionID: 1 }),
    'mapSolarSystems.jsonl': lines({
      _key: 3,
      name: { en: 'System' },
      constellationID: 2,
      regionID: 1,
    }),
    'mapStargates.jsonl': '',
    'mapPlanets.jsonl': '',
    'mapMoons.jsonl': '',
    'npcStations.jsonl': '',
    'npcCorporations.jsonl': '',
    'stationOperations.jsonl': '',
  };
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  for (const [name, contents] of Object.entries(files)) await writer.add(name, new TextReader(contents));
  return writer.close();
}

async function existingBuildFixture(): Promise<{
  readonly database: ReturnType<typeof openDatabase>;
  readonly sdeDirectory: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-sde-manager-'));
  directories.push(directory);
  const sdeDirectory = join(directory, 'sde');
  await mkdir(sdeDirectory, { recursive: true });
  await writeFile(join(sdeDirectory, 'sde-42.db'), 'previous build');
  await writeFile(join(sdeDirectory, 'active.json'), `${JSON.stringify({
    version: 2,
    build_number: 42,
    release_date: '2026-08-20T11:08:35Z',
    database_path_token: 'sde-42.db',
  })}\n`);
  const database = openDatabase({
    path: join(directory, 'eve-copilot.db'),
    busyTimeoutMs: 1_000,
    clock: new FixedClock(),
  });
  database.raw.prepare(`
    INSERT INTO sde_installations (
      build_number, release_date, source_url, etag, last_modified, sha256,
      format, importer_version, imported_at, database_path_token, status, validation_json
    ) VALUES (42, ?, ?, NULL, NULL, ?, 'jsonl', 2, ?, 'sde-42.db', 'active', ?)
  `).run(
    '2026-08-20T11:08:35Z',
    'https://developers.eveonline.com/static-data/tranquility/old.zip',
    '0'.repeat(64),
    '2026-08-20T12:00:00.000Z',
    JSON.stringify({ quick_check: 'ok', row_counts: { types: 1 } }),
  );
  return { database, sdeDirectory };
}

function fakeSdeFetch(archive: Uint8Array, buildNumber = 43): typeof fetch {
  const fetchImplementation: typeof fetch = (input) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/latest.jsonl')) {
      return Promise.resolve(new Response(JSON.stringify({
        _key: 'sde',
        buildNumber,
        releaseDate: '2026-08-21T11:08:35Z',
      }), { status: 200 }));
    }
    return Promise.resolve(new Response(archive, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-length': String(archive.byteLength),
      },
    }));
  };
  return fetchImplementation;
}

function lines(...values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join('\n');
}
