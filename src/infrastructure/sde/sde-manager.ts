import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import { ZipReader } from '@zip.js/zip.js';
import { z } from 'zod';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { DatabaseHandle } from '../../storage/sqlite/database-handle.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import { assertSafeEntry, FileRangeReader, importJsonLines } from './sde-archive-reader.js';
import { SdeCollector, SDE_IMPORT_ENTRY_NAMES } from './sde-collector.js';

const METADATA_URL = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
const STATIC_ORIGIN = 'https://developers.eveonline.com';
const MAX_METADATA_BYTES = 65_536;
const MAX_ARCHIVE_BYTES = 1_073_741_824;
const MAX_TOTAL_BYTES = 8_589_934_592;
const MAX_ENTRIES = 100_000;
const MAX_IMPORT_MS = 7_200_000;
const IMPORTER_VERSION = 3;
const SELECTED_ENTRIES = new Set(SDE_IMPORT_ENTRY_NAMES);

const metadataSchema = z.object({
  _key: z.literal('sde'),
  buildNumber: z.number().int().positive(),
  releaseDate: z.iso.datetime(),
}).strict();
const activePointerSchema = z.object({
  version: z.literal(2),
  build_number: z.number().int().positive(),
  release_date: z.iso.datetime(),
  database_path_token: z.string().regex(/^sde-[1-9][0-9]*\.db$/u),
}).strict();
export interface SdeCommandResult {
  readonly state: 'unavailable' | 'available' | 'installed' | 'updated' | 'current' | 'invalid';
  readonly build_number: number | null;
  readonly release_date: string | null;
  readonly row_counts: Readonly<Record<string, number>> | null;
}

export class SdeManager {
  readonly #directory: string;
  readonly #database: DatabaseHandle;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #fetch: typeof fetch;

  constructor(input: {
    readonly directory: string;
    readonly database: DatabaseHandle;
    readonly clock: Clock;
    readonly idGenerator: IdGenerator;
    readonly fetch?: typeof fetch;
  }) {
    this.#directory = resolve(input.directory);
    this.#database = input.database;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#fetch = input.fetch ?? globalThis.fetch;
  }

  status(): SdeCommandResult {
    const row = this.#database.raw.prepare(`
      SELECT build_number, release_date, validation_json
      FROM sde_installations WHERE status = 'active'
    `).get() as { build_number: number; release_date: string; validation_json: string } | undefined;
    if (row === undefined) {
      return Object.freeze({ state: 'unavailable', build_number: null, release_date: null, row_counts: null });
    }
    const pointer = join(this.#directory, 'active.json');
    const databasePath = join(this.#directory, `sde-${String(row.build_number)}.db`);
    if (!existsSync(pointer) || !existsSync(databasePath)) {
      return Object.freeze({ state: 'invalid', build_number: row.build_number, release_date: row.release_date, row_counts: null });
    }
    try {
      const active = activePointerSchema.parse(JSON.parse(readFileSync(pointer, 'utf8')) as unknown);
      if (active.build_number !== row.build_number
        || active.database_path_token !== `sde-${String(row.build_number)}.db`) {
        return Object.freeze({ state: 'invalid', build_number: row.build_number, release_date: row.release_date, row_counts: null });
      }
    } catch {
      return Object.freeze({ state: 'invalid', build_number: row.build_number, release_date: row.release_date, row_counts: null });
    }
    let counts: Readonly<Record<string, number>> | null = null;
    try {
      const parsed = JSON.parse(row.validation_json) as { row_counts?: unknown };
      if (parsed.row_counts !== null && typeof parsed.row_counts === 'object') {
        counts = parsed.row_counts as Readonly<Record<string, number>>;
      }
    } catch {
      return Object.freeze({ state: 'invalid', build_number: row.build_number, release_date: row.release_date, row_counts: null });
    }
    return Object.freeze({
      state: 'available',
      build_number: row.build_number,
      release_date: row.release_date,
      row_counts: counts,
    });
  }

  async install(mode: 'install' | 'update', signal: AbortSignal): Promise<SdeCommandResult> {
    throwIfAborted(signal);
    const workSignal = AbortSignal.any([signal, AbortSignal.timeout(MAX_IMPORT_MS)]);
    const current = this.status();
    if (mode === 'install' && current.state === 'available') {
      throw new AppError({
        code: 'AMBIGUOUS_INPUT',
        safeMessage: 'An SDE build is already installed. Use sde update.',
      });
    }
    const metadata = await this.#metadata(workSignal);
    const activeInstallation = this.#database.raw.prepare(
      "SELECT importer_version FROM sde_installations WHERE status = 'active'",
    ).get() as { readonly importer_version: number } | undefined;
    if (current.state === 'available'
      && current.build_number === metadata.buildNumber
      && activeInstallation?.importer_version === IMPORTER_VERSION) {
      return Object.freeze({ ...current, state: 'current' });
    }
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
    const token = this.#idGenerator.next();
    const archivePath = this.#safePath(`.staging-${token}.zip`);
    const databasePath = this.#safePath(`.staging-${token}.db`);
    try {
      const artifact = await this.#download(metadata.buildNumber, archivePath, workSignal);
      const imported = await importArchive({
        archivePath,
        databasePath,
        buildNumber: metadata.buildNumber,
        signal: workSignal,
      });
      const finalToken = `sde-${String(metadata.buildNumber)}.db`;
      const finalPath = this.#safePath(finalToken);
      if (existsSync(finalPath)) unlinkSync(finalPath);
      renameSync(databasePath, finalPath);
      fsyncFile(finalPath);
      const validation = JSON.stringify({
        quick_check: 'ok',
        row_counts: imported,
        importer_version: IMPORTER_VERSION,
      });
      const importedAt = this.#clock.now().toISOString();
      this.#database.raw.transaction(() => {
        this.#database.raw.prepare(
          "UPDATE sde_installations SET status = 'retained' WHERE status = 'active'",
        ).run();
        this.#database.raw.prepare(`
          INSERT INTO sde_installations (
            build_number, release_date, source_url, etag, last_modified,
            sha256, format, importer_version, imported_at,
            database_path_token, status, validation_json
          ) VALUES (?, ?, ?, ?, ?, ?, 'jsonl', ?, ?, ?, 'active', ?)
          ON CONFLICT(build_number) DO UPDATE SET
            release_date = excluded.release_date,
            source_url = excluded.source_url,
            etag = excluded.etag,
            last_modified = excluded.last_modified,
            sha256 = excluded.sha256,
            importer_version = excluded.importer_version,
            imported_at = excluded.imported_at,
            database_path_token = excluded.database_path_token,
            status = 'active',
            validation_json = excluded.validation_json
        `).run(
          metadata.buildNumber,
          metadata.releaseDate,
          artifact.url,
          artifact.etag,
          artifact.lastModified,
          artifact.sha256,
          IMPORTER_VERSION,
          importedAt,
          finalToken,
          validation,
        );
      }).immediate();
      this.#writePointer({
          version: 2,
        build_number: metadata.buildNumber,
        release_date: metadata.releaseDate,
        database_path_token: finalToken,
      });
      try { this.#retainTwoBuilds(); } catch { /* activated build remains authoritative */ }
      return Object.freeze({
        state: current.state === 'available' ? 'updated' : 'installed',
        build_number: metadata.buildNumber,
        release_date: metadata.releaseDate,
        row_counts: imported,
      });
    } finally {
      safeUnlink(archivePath);
      safeUnlink(databasePath);
    }
  }

  async #metadata(signal: AbortSignal): Promise<z.infer<typeof metadataSchema>> {
    const response = await this.#fetch(METADATA_URL, {
      headers: { accept: 'application/x-ndjson' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw sdeUnavailable('Official EVE SDE metadata is unavailable.');
    const text = await boundedText(response, MAX_METADATA_BYTES);
    try {
      return metadataSchema.parse(JSON.parse(text.trim()) as unknown);
    } catch (error) {
      throw sdeContract('Official EVE SDE metadata has an unexpected format.', error);
    }
  }

  async #download(buildNumber: number, path: string, signal: AbortSignal): Promise<{
    readonly url: string;
    readonly sha256: string;
    readonly etag: string | null;
    readonly lastModified: string | null;
  }> {
    const url = `${STATIC_ORIGIN}/static-data/tranquility/eve-online-static-data-${String(buildNumber)}-jsonl.zip`;
    const response = await this.#fetch(url, {
      headers: { accept: 'application/zip' },
      redirect: 'error',
      signal,
    });
    if (!response.ok || response.body === null) throw sdeUnavailable('The official EVE SDE archive is unavailable.');
    if (!/^application\/zip(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) {
      throw sdeContract('The official EVE SDE archive has an unexpected content type.');
    }
    if (new URL(response.url || url).origin !== STATIC_ORIGIN) throw sdeContract('The SDE archive changed origin.');
    const declared = Number(response.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_ARCHIVE_BYTES) {
      throw sdeContract('The SDE archive size is missing or exceeds the safety limit.');
    }
    let bytes = 0;
    const hash = createHash('sha256');
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > MAX_ARCHIVE_BYTES) callback(sdeContract('The SDE archive exceeds the safety limit.'));
        else {
          hash.update(chunk);
          callback(null, chunk);
        }
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
      limiter,
      createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    if (bytes !== declared) throw sdeContract('The SDE archive length did not match its metadata.');
    return Object.freeze({
      url,
      sha256: hash.digest('hex'),
      etag: boundedHeader(response.headers.get('etag')),
      lastModified: boundedHeader(response.headers.get('last-modified')),
    });
  }

  #writePointer(pointer: object): void {
    const staging = this.#safePath(`.active-${this.#idGenerator.next()}.json`);
    const active = this.#safePath('active.json');
    try {
      writeFileSync(staging, `${JSON.stringify(pointer)}\n`, { flag: 'wx', mode: 0o600 });
      fsyncFile(staging);
      renameSync(staging, active);
      fsyncDirectory(this.#directory);
    } finally {
      safeUnlink(staging);
    }
  }

  #retainTwoBuilds(): void {
    const rows = this.#database.raw.prepare(`
      SELECT build_number, database_path_token FROM sde_installations
      WHERE status IN ('active', 'retained') ORDER BY imported_at DESC, build_number DESC
    `).all() as Array<{ build_number: number; database_path_token: string }>;
    for (const row of rows.slice(2)) {
      const path = this.#safePath(row.database_path_token);
      safeUnlink(path);
      this.#database.raw.prepare('DELETE FROM sde_installations WHERE build_number = ?').run(row.build_number);
    }
  }

  #safePath(token: string): string {
    if (basename(token) !== token || token.includes('..')) throw new Error('Unsafe SDE path token.');
    const path = resolve(this.#directory, token);
    if (!path.startsWith(`${this.#directory}${sep}`)) throw new Error('Unsafe SDE path.');
    return path;
  }
}

async function importArchive(input: {
  readonly archivePath: string;
  readonly databasePath: string;
  readonly buildNumber: number;
  readonly signal: AbortSignal;
}): Promise<Readonly<Record<string, number>>> {
  const database = new Database(input.databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  database.exec(`
    CREATE TABLE sde_categories (
      category_id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      normalized_name TEXT NOT NULL, published INTEGER NOT NULL CHECK (published IN (0, 1))
    ) STRICT;
    CREATE TABLE sde_groups (
      group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      category_id INTEGER NOT NULL, published INTEGER NOT NULL CHECK (published IN (0, 1))
    ) STRICT;
    CREATE TABLE sde_market_groups (
      market_group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      parent_market_group_id INTEGER
    ) STRICT;
    CREATE TABLE sde_types (
      type_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      group_id INTEGER NOT NULL, market_group_id INTEGER,
      published INTEGER NOT NULL CHECK (published IN (0, 1)),
      capacity REAL, mass REAL, radius REAL, volume REAL
    ) STRICT;
    CREATE INDEX idx_sde_types_normalized_name ON sde_types (normalized_name, type_id);
    CREATE INDEX idx_sde_types_group ON sde_types (group_id, type_id);
    CREATE INDEX idx_sde_groups_category ON sde_groups (category_id, group_id);
    CREATE TABLE sde_dogma_attributes (
      attribute_id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      default_value REAL NOT NULL,
      high_is_good INTEGER NOT NULL CHECK (high_is_good IN (0, 1)),
      stackable INTEGER NOT NULL CHECK (stackable IN (0, 1))
    ) STRICT;
    CREATE INDEX idx_sde_dogma_attributes_name ON sde_dogma_attributes (name, attribute_id);
    CREATE TABLE sde_type_attributes (
      type_id INTEGER NOT NULL, attribute_id INTEGER NOT NULL, value REAL NOT NULL,
      PRIMARY KEY (type_id, attribute_id)
    ) STRICT;
    CREATE INDEX idx_sde_type_attributes_attribute ON sde_type_attributes (attribute_id, type_id);
    CREATE TABLE sde_dogma_effects (
      effect_id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      effect_category INTEGER NOT NULL CHECK (effect_category BETWEEN 0 AND 7),
      electronic_chance INTEGER NOT NULL CHECK (electronic_chance IN (0, 1)),
      is_assistance INTEGER NOT NULL CHECK (is_assistance IN (0, 1)),
      is_offensive INTEGER NOT NULL CHECK (is_offensive IN (0, 1)),
      is_warp_safe INTEGER NOT NULL CHECK (is_warp_safe IN (0, 1)),
      propulsion_chance INTEGER NOT NULL CHECK (propulsion_chance IN (0, 1)),
      range_chance INTEGER NOT NULL CHECK (range_chance IN (0, 1)),
      discharge_attribute_id INTEGER, duration_attribute_id INTEGER,
      range_attribute_id INTEGER, falloff_attribute_id INTEGER,
      tracking_speed_attribute_id INTEGER, fitting_usage_chance_attribute_id INTEGER,
      resistance_attribute_id INTEGER
    ) STRICT;
    CREATE INDEX idx_sde_dogma_effects_name ON sde_dogma_effects (name, effect_id);
    CREATE TABLE sde_dogma_effect_modifiers (
      effect_id INTEGER NOT NULL, modifier_index INTEGER NOT NULL,
      domain INTEGER NOT NULL CHECK (domain BETWEEN 0 AND 6),
      func INTEGER NOT NULL CHECK (func BETWEEN 0 AND 5),
      modified_attribute_id INTEGER, modifying_attribute_id INTEGER,
      operation INTEGER CHECK (operation BETWEEN -1 AND 9),
      group_id INTEGER, skill_type_id INTEGER, stopped_effect_id INTEGER,
      PRIMARY KEY (effect_id, modifier_index)
    ) STRICT;
    CREATE TABLE sde_type_effects (
      type_id INTEGER NOT NULL, effect_id INTEGER NOT NULL,
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
      PRIMARY KEY (type_id, effect_id)
    ) STRICT;
    CREATE INDEX idx_sde_type_effects_effect ON sde_type_effects (effect_id, type_id);
    CREATE TABLE sde_type_requirements (
      type_id INTEGER NOT NULL, requirement_index INTEGER NOT NULL,
      skill_type_id INTEGER NOT NULL, level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 5),
      PRIMARY KEY (type_id, requirement_index)
    ) STRICT;
    CREATE INDEX idx_sde_type_requirements_skill ON sde_type_requirements (skill_type_id, type_id);
    CREATE TABLE sde_blueprints (
      blueprint_type_id INTEGER PRIMARY KEY, max_production_limit INTEGER
    ) STRICT;
    CREATE TABLE sde_blueprint_activities (
      blueprint_type_id INTEGER NOT NULL, activity TEXT NOT NULL, time_seconds INTEGER,
      PRIMARY KEY (blueprint_type_id, activity)
    ) STRICT;
    CREATE TABLE sde_blueprint_parts (
      blueprint_type_id INTEGER NOT NULL, activity TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('material', 'product')),
      type_id INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (blueprint_type_id, activity, kind, type_id)
    ) STRICT;
    CREATE INDEX idx_sde_blueprint_parts_type ON sde_blueprint_parts (type_id, kind, activity);
    CREATE TABLE sde_solar_systems (
      system_id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      constellation_id INTEGER NOT NULL, constellation_name TEXT NOT NULL,
      region_id INTEGER NOT NULL, region_name TEXT NOT NULL
    ) STRICT;
    CREATE INDEX idx_sde_systems_normalized_name ON sde_solar_systems (normalized_name, system_id);
    CREATE TABLE sde_stations (
      station_id TEXT PRIMARY KEY, name TEXT NOT NULL, system_id INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE sde_stargates (
      stargate_id INTEGER PRIMARY KEY, system_id INTEGER NOT NULL,
      destination_stargate_id INTEGER NOT NULL, destination_system_id INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_sde_stargates_system ON sde_stargates (system_id, stargate_id);
    CREATE TABLE sde_npc_corporations (
      corporation_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE sde_factions (
      faction_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL
    ) STRICT;
  `);
  const collector = new SdeCollector(database);
  const reader = new FileRangeReader(input.archivePath);
  const zip = new ZipReader(reader);
  let totalBytes = 0;
  const seen = new Set<string>();
  let committed = false;
  try {
    database.exec('BEGIN IMMEDIATE');
    const entries = await zip.getEntries();
    if (entries.length > MAX_ENTRIES) throw sdeContract('The SDE archive contains too many entries.');
    for (const entry of entries) {
      throwIfAborted(input.signal);
      assertSafeEntry(entry);
      totalBytes += entry.uncompressedSize;
      if (totalBytes > MAX_TOTAL_BYTES) throw sdeContract('The SDE archive expands beyond the safety limit.');
      if (!entry.directory && SELECTED_ENTRIES.has(entry.filename)) {
        seen.add(entry.filename);
        await importJsonLines(entry, (value) => {
          collector.accept(entry.filename, value);
        }, input.signal);
      }
    }
    for (const required of SELECTED_ENTRIES) {
      if (!seen.has(required)) throw sdeContract(`The SDE archive is missing ${required}.`);
    }
    const counts = collector.finish();
    database.exec('COMMIT');
    committed = true;
    const quickCheck = database.pragma('quick_check', { simple: true });
    if (quickCheck !== 'ok'
      || counts.types === 0
      || counts.solar_systems === 0
      || counts.dogma_attributes === 0
      || counts.dogma_effects === 0
      || counts.type_effects === 0) {
      throw sdeContract('The imported SDE database failed validation.');
    }
    database.pragma('wal_checkpoint(TRUNCATE)');
    return Object.freeze(counts);
  } finally {
    if (!committed) {
      try { database.exec('ROLLBACK'); } catch { /* transaction was not active */ }
    }
    await zip.close().catch(() => undefined);
    await reader.close().catch(() => undefined);
    database.close();
  }
}


async function boundedText(response: Response, maximumBytes: number): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw sdeContract('The SDE metadata response exceeds the safety limit.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function boundedHeader(value: string | null): string | null {
  return value !== null && value.length > 0 && value.length <= 1024 ? value : null;
}

export function fsyncFile(path: string): void {
  const descriptor = openSync(path, 'r+');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

export function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, 'r');
  try {
    try {
      fsyncSync(descriptor);
    } catch (error) {
      if (process.platform !== 'win32' || !isErrnoCode(error, 'EPERM')) throw error;
    }
  } finally {
    closeSync(descriptor);
  }
}

function isErrnoCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function safeUnlink(path: string): void {
  try { if (existsSync(path) && statSync(path).isFile()) unlinkSync(path); } catch { /* bounded staging cleanup */ }
}

function sdeUnavailable(message: string, cause?: unknown): AppError {
  return new AppError({ code: 'UPSTREAM_SERVICE_FAILED', safeMessage: message, cause });
}

function sdeContract(message: string, cause?: unknown): AppError {
  return new AppError({ code: 'UPSTREAM_CONTRACT_MISMATCH', safeMessage: message, cause });
}
