import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import type {
  ResolvedSolarSystem,
  ResolvedBlueprint,
  ResolvedSdeName,
  ResolvedStation,
  ResolvedStargate,
  ResolvedType,
  SdeEffectiveRequirement,
  SdeFittingSnapshot,
  SdeRequirementEdge,
  SdeTypeRequirement,
  SdeTypeRequirementClosure,
  SdeRepository,
  SdeStatus,
} from '../../application/ports/sde-repository.js';
import { AppError } from '../../domain/errors.js';

const REQUIREMENT_RESOLVER_CONTRACT_VERSION = 1;
const MAX_REQUIREMENT_NODES = 4_096;
const MAX_REQUIREMENT_EDGES = 8_192;
const MAX_REQUIREMENT_DEPTH = 64;
const MAX_REQUIREMENT_CACHE_ENTRIES = 512;

const pointerSchema = z.object({
  version: z.literal(2),
  build_number: z.number().int().positive(),
  release_date: z.iso.datetime(),
  database_path_token: z.string().regex(/^sde-[1-9][0-9]*\.db$/u),
}).strict();

interface TypeRow {
  readonly type_id: number;
  readonly name: string;
  readonly group_id: number;
  readonly group_name: string;
  readonly category_id: number;
  readonly category_name: string;
  readonly market_group_id: number | null;
  readonly market_group_name: string | null;
  readonly published: number;
}
interface SystemRow {
  readonly system_id: number;
  readonly name: string;
  readonly constellation_id: number;
  readonly constellation_name: string;
  readonly region_id: number;
  readonly region_name: string;
}
interface StationRow { readonly station_id: string; readonly name: string; readonly system_id: number }
interface NameRow { readonly id: number; readonly name: string }
interface RequirementRow { readonly skill_type_id: number; readonly skill_name: string; readonly level: number }
interface ClosureEdgeRow {
  readonly source_type_id: number;
  readonly source_type_name: string;
  readonly requirement_index: number;
  readonly skill_type_id: number;
  readonly skill_name: string | null;
  readonly level: number;
  readonly skill_published: number | null;
  readonly skill_category_id: number | null;
}
type ValidClosureEdgeRow = ClosureEdgeRow & { readonly skill_name: string };
interface BlueprintPartRow {
  readonly activity: string;
  readonly time_seconds: number | null;
  readonly kind: 'material' | 'product';
  readonly type_id: number;
  readonly name: string;
  readonly quantity: number;
}
interface StargateRow {
  readonly stargate_id: number;
  readonly system_id: number;
  readonly destination_stargate_id: number;
  readonly destination_system_id: number;
}

export class FileSdeRepository implements SdeRepository {
  readonly #directory: string;
  readonly #requirementClosureCache = new Map<string, SdeTypeRequirementClosure>();

  constructor(directory: string) {
    this.#directory = resolve(directory);
  }

  status(): Promise<SdeStatus> {
    try {
      const active = this.#active();
      if (active === null) {
        return Promise.resolve({ state: 'unavailable', buildNumber: null, releaseDate: null });
      }
      const database = this.#open(active.databasePath);
      try {
        const result = database.pragma('quick_check', { simple: true });
        if (result !== 'ok') throw new Error('SDE integrity check failed.');
      } finally {
        database.close();
      }
      return Promise.resolve({
        state: 'available',
        buildNumber: active.buildNumber,
        releaseDate: active.releaseDate,
      });
    } catch {
      return Promise.resolve({ state: 'invalid', buildNumber: null, releaseDate: null });
    }
  }

  fittingSnapshot(): Promise<SdeFittingSnapshot> {
    return Promise.resolve().then(() => {
      const active = this.#active();
      if (active === null) throw unavailable();
      const database = this.#open(active.databasePath);
      try {
        const requiredTables = [
          'sde_dogma_attributes',
          'sde_dogma_effects',
          'sde_dogma_effect_modifiers',
          'sde_type_attributes',
          'sde_type_effects',
        ];
        const rows = database.prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables.map(() => '?').join(',')})`,
        ).all(...requiredTables) as Array<{ readonly name: string }>;
        if (rows.length !== requiredTables.length) throw new Error('The fitting-data tables are incomplete.');
        return Object.freeze({
          buildNumber: active.buildNumber,
          releaseDate: active.releaseDate,
          databasePath: active.databasePath,
          importerVersion: 3 as const,
          fittingDataContractVersion: 1 as const,
        });
      } catch (error) {
        throw new AppError({
          code: 'SDE_INVALID',
          safeMessage: 'The active EVE static data build cannot support fitting calculation.',
          cause: error,
        });
      } finally {
        database.close();
      }
    });
  }

  resolveType(typeId: number): Promise<ResolvedType | null> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const row = database.prepare(
        `SELECT t.type_id, t.name, t.group_id, g.name AS group_name,
          g.category_id, c.name AS category_name, t.market_group_id,
          mg.name AS market_group_name, t.published
        FROM sde_types t
        JOIN sde_groups g ON g.group_id = t.group_id
        JOIN sde_categories c ON c.category_id = g.category_id
        LEFT JOIN sde_market_groups mg ON mg.market_group_id = t.market_group_id
        WHERE t.type_id = ?`,
      ).get(typeId) as TypeRow | undefined;
      return row === undefined ? null : mapType(row, active.buildNumber);
    }));
  }

  resolveTypes(typeIds: readonly number[]): Promise<ReadonlyMap<number, ResolvedType>> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const ids = boundedIds(typeIds);
      if (ids.length === 0) return new Map();
      const placeholders = ids.map(() => '?').join(',');
      const rows = database.prepare(`
        SELECT t.type_id, t.name, t.group_id, g.name AS group_name,
          g.category_id, c.name AS category_name, t.market_group_id,
          mg.name AS market_group_name, t.published
        FROM sde_types t
        JOIN sde_groups g ON g.group_id = t.group_id
        JOIN sde_categories c ON c.category_id = g.category_id
        LEFT JOIN sde_market_groups mg ON mg.market_group_id = t.market_group_id
        WHERE t.type_id IN (${placeholders})
      `).all(...ids) as TypeRow[];
      return new Map(rows.map((row) => [row.type_id, mapType(row, active.buildNumber)]));
    }));
  }

  typeIdsByCategory(categoryId: number, limit: number): Promise<readonly number[]> {
    return Promise.resolve().then(() => this.#query((database) => {
      if (!Number.isSafeInteger(categoryId) || categoryId < 0
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
        throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'The SDE category lookup is invalid.' });
      }
      const rows = database.prepare(`
        SELECT t.type_id FROM sde_types t
        JOIN sde_groups g ON g.group_id = t.group_id
        WHERE g.category_id = ? AND t.published = 1
        ORDER BY t.type_id LIMIT ?
      `).all(categoryId, limit) as Array<{ readonly type_id: number }>;
      return Object.freeze(rows.map((row) => row.type_id));
    }));
  }

  searchTypes(name: string, limit: number): Promise<readonly ResolvedType[]> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const boundedLimit = boundedLimitValue(limit);
      const normalized = normalizeName(name);
      const rows = database.prepare(`
        SELECT t.type_id, t.name, t.group_id, g.name AS group_name,
          g.category_id, c.name AS category_name, t.market_group_id,
          mg.name AS market_group_name, t.published
        FROM sde_types t
        JOIN sde_groups g ON g.group_id = t.group_id
        JOIN sde_categories c ON c.category_id = g.category_id
        LEFT JOIN sde_market_groups mg ON mg.market_group_id = t.market_group_id
        WHERE t.normalized_name = ? OR t.normalized_name LIKE ? ESCAPE '\\'
        ORDER BY t.normalized_name = ? DESC, t.name, t.type_id
        LIMIT ?
      `).all(normalized, `${escapeLike(normalized)}%`, normalized, boundedLimit) as TypeRow[];
      return Object.freeze(rows.map((row) => mapType(row, active.buildNumber)));
    }));
  }

  resolveGroup(groupId: number): Promise<ResolvedSdeName | null> {
    return this.#resolveName('sde_groups', 'group_id', groupId);
  }

  resolveCategory(categoryId: number): Promise<ResolvedSdeName | null> {
    return this.#resolveName('sde_categories', 'category_id', categoryId);
  }

  resolveMarketGroup(marketGroupId: number): Promise<ResolvedSdeName | null> {
    return this.#resolveName('sde_market_groups', 'market_group_id', marketGroupId);
  }

  resolveTypeRequirements(typeId: number): Promise<readonly SdeTypeRequirement[]> {
    return Promise.resolve().then(() => this.#query((database) => Object.freeze((database.prepare(`
      SELECT r.skill_type_id, t.name AS skill_name, r.level
      FROM sde_type_requirements r
      JOIN sde_types t ON t.type_id = r.skill_type_id
      WHERE r.type_id = ? ORDER BY r.requirement_index
    `).all(typeId) as RequirementRow[]).map((row) => Object.freeze({
      skillTypeId: row.skill_type_id,
      skillName: row.skill_name,
      level: row.level,
    })))));
  }

  resolveTypeRequirementClosure(typeId: number): Promise<SdeTypeRequirementClosure> {
    if (!Number.isSafeInteger(typeId) || typeId <= 0) {
      return Promise.reject(new AppError({
        code: 'AMBIGUOUS_INPUT',
        safeMessage: 'The requirement target must be a positive canonical EVE type ID.',
      }));
    }
    return Promise.resolve().then(() => {
      try {
        return this.#query((database, active) => {
          const cacheKey = `${String(active.buildNumber)}:${String(REQUIREMENT_RESOLVER_CONTRACT_VERSION)}:${String(typeId)}`;
          const cached = this.#requirementClosureCache.get(cacheKey);
          if (cached !== undefined) return cached;
          const closure = resolveRequirementClosure(database, active, typeId);
          boundedCacheSet(this.#requirementClosureCache, cacheKey, closure);
          return closure;
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError({
          code: 'SDE_INVALID',
          safeMessage: 'The active SDE requirement graph could not be read safely.',
          details: { next_step: 'Install or update to a valid EVE SDE build.' },
          cause: error,
        });
      }
    });
  }

  resolveBlueprint(blueprintTypeId: number): Promise<ResolvedBlueprint | null> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const blueprint = database.prepare(`
        SELECT b.blueprint_type_id, t.name
        FROM sde_blueprints b JOIN sde_types t ON t.type_id = b.blueprint_type_id
        WHERE b.blueprint_type_id = ?
      `).get(blueprintTypeId) as { readonly blueprint_type_id: number; readonly name: string } | undefined;
      if (blueprint === undefined) return null;
      const rows = database.prepare(`
        SELECT a.activity, a.time_seconds, p.kind, p.type_id, t.name, p.quantity
        FROM sde_blueprint_activities a
        LEFT JOIN sde_blueprint_parts p
          ON p.blueprint_type_id = a.blueprint_type_id AND p.activity = a.activity
        LEFT JOIN sde_types t ON t.type_id = p.type_id
        WHERE a.blueprint_type_id = ? ORDER BY a.activity, p.kind, p.type_id
      `).all(blueprintTypeId) as Array<BlueprintPartRow & { readonly kind: 'material' | 'product' | null }>;
      const activities = [...new Set(rows.map((row) => row.activity))].map((activity) => {
        const activityRows = rows.filter((row) => row.activity === activity);
        const timeSeconds = activityRows[0]?.time_seconds ?? null;
        const parts = (kind: 'material' | 'product'): Array<{
          readonly typeId: number;
          readonly name: string;
          readonly quantity: number;
        }> => activityRows
          .filter((row) => row.kind === kind)
          .map((row) => Object.freeze({ typeId: row.type_id, name: row.name, quantity: row.quantity }));
        return Object.freeze({ activity, timeSeconds, materials: Object.freeze(parts('material')), products: Object.freeze(parts('product')) });
      });
      return Object.freeze({
        blueprintTypeId: blueprint.blueprint_type_id,
        blueprintName: blueprint.name,
        activities: Object.freeze(activities),
        buildNumber: active.buildNumber,
      });
    }));
  }

  resolveSolarSystem(systemId: number): Promise<ResolvedSolarSystem | null> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const row = database.prepare(`
        SELECT system_id, name, constellation_id, constellation_name, region_id, region_name
        FROM sde_solar_systems WHERE system_id = ?
      `).get(systemId) as SystemRow | undefined;
      return row === undefined ? null : mapSystem(row, active.buildNumber);
    }));
  }

  resolveSolarSystems(systemIds: readonly number[]): Promise<ReadonlyMap<number, ResolvedSolarSystem>> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const ids = boundedIds(systemIds);
      if (ids.length === 0) return new Map();
      const placeholders = ids.map(() => '?').join(',');
      const rows = database.prepare(`
        SELECT system_id, name, constellation_id, constellation_name, region_id, region_name
        FROM sde_solar_systems WHERE system_id IN (${placeholders})
      `).all(...ids) as SystemRow[];
      return new Map(rows.map((row) => [row.system_id, mapSystem(row, active.buildNumber)]));
    }));
  }

  resolveStation(stationId: string): Promise<ResolvedStation | null> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const row = database.prepare(
        'SELECT station_id, name, system_id FROM sde_stations WHERE station_id = ?',
      ).get(stationId) as StationRow | undefined;
      return row === undefined ? null : Object.freeze({
        id: row.station_id,
        name: row.name,
        solarSystemId: row.system_id,
        buildNumber: active.buildNumber,
      });
    }));
  }

  searchSolarSystems(name: string, limit: number): Promise<readonly ResolvedSolarSystem[]> {
    return Promise.resolve().then(() => this.#query((database, active) => {
      const normalized = normalizeName(name);
      const rows = database.prepare(`
        SELECT system_id, name, constellation_id, constellation_name, region_id, region_name
        FROM sde_solar_systems
        WHERE normalized_name = ? OR normalized_name LIKE ? ESCAPE '\\'
        ORDER BY normalized_name = ? DESC, name, system_id LIMIT ?
      `).all(normalized, `${escapeLike(normalized)}%`, normalized, boundedLimitValue(limit)) as SystemRow[];
      return Object.freeze(rows.map((row) => mapSystem(row, active.buildNumber)));
    }));
  }

  resolveStargatesFromSystem(systemId: number): Promise<readonly ResolvedStargate[]> {
    return Promise.resolve().then(() => this.#query((database, active) => Object.freeze((database.prepare(`
      SELECT stargate_id, system_id, destination_stargate_id, destination_system_id
      FROM sde_stargates WHERE system_id = ? ORDER BY stargate_id
    `).all(systemId) as StargateRow[]).map((row) => Object.freeze({
      id: row.stargate_id,
      solarSystemId: row.system_id,
      destinationStargateId: row.destination_stargate_id,
      destinationSolarSystemId: row.destination_system_id,
      buildNumber: active.buildNumber,
    })))));
  }

  resolveNpcCorporation(corporationId: number): Promise<ResolvedSdeName | null> {
    return this.#resolveName('sde_npc_corporations', 'corporation_id', corporationId);
  }

  resolveFaction(factionId: number): Promise<ResolvedSdeName | null> {
    return this.#resolveName('sde_factions', 'faction_id', factionId);
  }

  #resolveName(table: string, idColumn: string, id: number): Promise<ResolvedSdeName | null> {
    if (!/^[a-z_]+$/u.test(table) || !/^[a-z_]+$/u.test(idColumn)) throw new Error('Unsafe SDE table metadata.');
    return Promise.resolve().then(() => this.#query((database, active) => {
      const row = database.prepare(`SELECT ${idColumn} AS id, name FROM ${table} WHERE ${idColumn} = ?`)
        .get(id) as NameRow | undefined;
      return row === undefined ? null : Object.freeze({ id: row.id, name: row.name, buildNumber: active.buildNumber });
    }));
  }

  #query<T>(operation: (database: Database.Database, active: ActiveBuild) => T): T {
    const active = this.#active();
    if (active === null) throw unavailable();
    let database: Database.Database;
    try {
      database = this.#open(active.databasePath);
    } catch (error) {
      throw unavailable(error);
    }
    try {
      return operation(database, active);
    } finally {
      database.close();
    }
  }

  #active(): ActiveBuild | null {
    const pointerPath = join(this.#directory, 'active.json');
    if (!existsSync(pointerPath)) return null;
    const parsed = pointerSchema.parse(JSON.parse(readFileSync(pointerPath, 'utf8')) as unknown);
    const databasePath = resolve(this.#directory, parsed.database_path_token);
    if (!databasePath.startsWith(`${this.#directory}${sep}`) || !existsSync(databasePath)) {
      throw new Error('SDE active pointer is invalid.');
    }
    const realDirectory = realpathSync(this.#directory);
    const realDatabasePath = realpathSync(databasePath);
    if (!realDatabasePath.startsWith(`${realDirectory}${sep}`)) {
      throw new Error('SDE active database resolves outside the configured directory.');
    }
    return Object.freeze({
      buildNumber: parsed.build_number,
      releaseDate: parsed.release_date,
      databasePath: realDatabasePath,
    });
  }

  #open(path: string): Database.Database {
    const database = new Database(path, { readonly: true, fileMustExist: true });
    database.pragma('query_only = ON');
    return database;
  }
}

interface ActiveBuild {
  readonly buildNumber: number;
  readonly releaseDate: string;
  readonly databasePath: string;
}

function unavailable(cause?: unknown): AppError {
  return new AppError({
    code: 'SDE_UNAVAILABLE',
    safeMessage: 'The EVE static data build is not installed or valid.',
    details: { next_step: 'Run eve-copilot-mcp sde install.' },
    cause,
  });
}

function mapType(row: TypeRow, buildNumber: number): ResolvedType {
  return Object.freeze({
    id: row.type_id,
    name: row.name,
    groupId: row.group_id,
    groupName: row.group_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketGroupId: row.market_group_id,
    marketGroupName: row.market_group_name,
    published: row.published === 1,
    buildNumber,
  });
}

function mapSystem(row: SystemRow, buildNumber: number): ResolvedSolarSystem {
  return Object.freeze({
    id: row.system_id,
    name: row.name,
    constellationId: row.constellation_id,
    constellationName: row.constellation_name,
    regionId: row.region_id,
    regionName: row.region_name,
    buildNumber,
  });
}

function normalizeName(value: string): string {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (normalized.length < 1 || normalized.length > 256) {
    throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'The SDE search name must contain 1 to 256 characters.' });
  }
  return normalized;
}

function boundedLimitValue(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'The SDE result limit must be between 1 and 200.' });
  }
  return value;
}

function boundedIds(values: readonly number[]): readonly number[] {
  const ids = [...new Set(values)];
  if (ids.length > 500 || ids.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new AppError({ code: 'RESULT_LIMIT_EXCEEDED', safeMessage: 'The SDE batch exceeds the 500-ID lookup budget.' });
  }
  return ids;
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function resolveRequirementClosure(
  database: Database.Database,
  active: ActiveBuild,
  targetTypeId: number,
): SdeTypeRequirementClosure {
  const targetRow = database.prepare(`
    SELECT t.type_id, t.name, t.group_id, g.name AS group_name,
      g.category_id, c.name AS category_name, t.market_group_id,
      mg.name AS market_group_name, t.published
    FROM sde_types t
    JOIN sde_groups g ON g.group_id = t.group_id
    JOIN sde_categories c ON c.category_id = g.category_id
    LEFT JOIN sde_market_groups mg ON mg.market_group_id = t.market_group_id
    WHERE t.type_id = ?
  `).get(targetTypeId) as TypeRow | undefined;
  if (targetRow?.published !== 1) {
    throw new AppError({
      code: 'NOT_FOUND',
      safeMessage: 'The published EVE requirement target was not found in the active SDE build.',
      details: { fields: ['type_id'] },
    });
  }

  const directQuery = database.prepare(`
    SELECT r.type_id AS source_type_id, source.name AS source_type_name,
      r.requirement_index, r.skill_type_id, skill.name AS skill_name, r.level,
      skill.published AS skill_published, skill_group.category_id AS skill_category_id
    FROM sde_type_requirements r
    JOIN sde_types source ON source.type_id = r.type_id
    LEFT JOIN sde_types skill ON skill.type_id = r.skill_type_id
    LEFT JOIN sde_groups skill_group ON skill_group.group_id = skill.group_id
    WHERE r.type_id = ?
    ORDER BY r.requirement_index, r.skill_type_id
  `);
  const visitState = new Map<number, 'visiting' | 'complete'>();
  const rawEdges: ValidClosureEdgeRow[] = [];
  const requiredSkillIds = new Set<number>();
  const skillNames = new Map<number, string>();

  const visit = (sourceTypeId: number, traversalDepth: number): void => {
    if (traversalDepth > MAX_REQUIREMENT_DEPTH) throw requirementLimit('depth');
    const state = visitState.get(sourceTypeId);
    if (state === 'visiting') throw invalidRequirementGraph('The active SDE requirement graph contains a cycle.');
    if (state === 'complete') return;
    visitState.set(sourceTypeId, 'visiting');
    const rows = directQuery.all(sourceTypeId) as ClosureEdgeRow[];
    for (const row of rows) {
      validateClosureEdge(row);
      if (row.source_type_id === row.skill_type_id) {
        throw invalidRequirementGraph('The active SDE requirement graph contains a self-edge.');
      }
      rawEdges.push(row);
      if (rawEdges.length > MAX_REQUIREMENT_EDGES) throw requirementLimit('edges');
      requiredSkillIds.add(row.skill_type_id);
      if (requiredSkillIds.size > MAX_REQUIREMENT_NODES) throw requirementLimit('nodes');
      skillNames.set(row.skill_type_id, row.skill_name);
      if (row.level > 0) visit(row.skill_type_id, traversalDepth + 1);
    }
    visitState.set(sourceTypeId, 'complete');
  };
  visit(targetTypeId, 0);

  const maximumDepth = longestRequirementDepth(targetTypeId, rawEdges);
  if (maximumDepth > MAX_REQUIREMENT_DEPTH) throw requirementLimit('depth');
  const depths = shortestRequirementDepths(targetTypeId, rawEdges);
  const dependencyEdges = Object.freeze(rawEdges
    .map((row): SdeRequirementEdge => Object.freeze({
      sourceTypeId: row.source_type_id,
      sourceTypeName: row.source_type_name,
      requirementIndex: row.requirement_index,
      skillTypeId: row.skill_type_id,
      skillName: row.skill_name,
      requiredLevel: row.level,
      depth: (depths.get(row.source_type_id) ?? 0) + 1,
      direct: row.source_type_id === targetTypeId,
    }))
    .sort(compareRequirementEdges));
  const requirements = effectiveRequirements(targetTypeId, dependencyEdges, skillNames);
  const target = mapType(targetRow, active.buildNumber);
  const closure: SdeTypeRequirementClosure = Object.freeze({
    target,
    directRequirements: Object.freeze(dependencyEdges.filter((edge) => edge.direct)),
    dependencyEdges,
    requirements,
    complete: true,
    nodeCount: requiredSkillIds.size,
    edgeCount: dependencyEdges.length,
    maximumDepth,
    buildNumber: active.buildNumber,
  });
  return closure;
}

function validateClosureEdge(row: ClosureEdgeRow): asserts row is ValidClosureEdgeRow {
  if (!Number.isSafeInteger(row.requirement_index) || row.requirement_index < 1 || row.requirement_index > 6
    || !Number.isSafeInteger(row.skill_type_id) || row.skill_type_id <= 0
    || !Number.isSafeInteger(row.level) || row.level < 0 || row.level > 5
    || row.skill_name === null || row.skill_published !== 1 || row.skill_category_id !== 16) {
    throw invalidRequirementGraph('The active SDE requirement graph contains an invalid skill edge.');
  }
}

function longestRequirementDepth(root: number, rows: readonly ClosureEdgeRow[]): number {
  const children = positiveRequirementChildren(rows);
  const memo = new Map<number, number>();
  const depth = (source: number): number => {
    const cached = memo.get(source);
    if (cached !== undefined) return cached;
    const value = (children.get(source) ?? []).reduce((maximum, skillTypeId) =>
      Math.max(maximum, 1 + depth(skillTypeId)), 0);
    memo.set(source, value);
    return value;
  };
  return depth(root);
}

function shortestRequirementDepths(root: number, rows: readonly ClosureEdgeRow[]): ReadonlyMap<number, number> {
  const children = positiveRequirementChildren(rows);
  const depths = new Map<number, number>([[root, 0]]);
  const queue = [root];
  for (const source of queue) {
    const sourceDepth = depths.get(source);
    if (sourceDepth === undefined) throw new Error('Requirement traversal depth is missing.');
    const nextDepth = sourceDepth + 1;
    for (const child of children.get(source) ?? []) {
      const known = depths.get(child);
      if (known === undefined || nextDepth < known) {
        depths.set(child, nextDepth);
        queue.push(child);
      }
    }
  }
  return depths;
}

function positiveRequirementChildren(rows: readonly ClosureEdgeRow[]): ReadonlyMap<number, readonly number[]> {
  const values = new Map<number, Set<number>>();
  for (const row of rows) {
    if (row.level <= 0) continue;
    const children = values.get(row.source_type_id) ?? new Set<number>();
    children.add(row.skill_type_id);
    values.set(row.source_type_id, children);
  }
  return new Map([...values].map(([source, children]) => [source, [...children].sort((left, right) => left - right)]));
}

function effectiveRequirements(
  targetTypeId: number,
  edges: readonly SdeRequirementEdge[],
  skillNames: ReadonlyMap<number, string>,
): readonly SdeEffectiveRequirement[] {
  const merged = new Map<number, { requiredLevel: number; direct: boolean; requiredBy: Set<number> }>();
  for (const edge of edges) {
    const value = merged.get(edge.skillTypeId) ?? {
      requiredLevel: 0,
      direct: false,
      requiredBy: new Set<number>(),
    };
    value.requiredLevel = Math.max(value.requiredLevel, edge.requiredLevel);
    value.direct ||= edge.direct;
    value.requiredBy.add(edge.sourceTypeId);
    merged.set(edge.skillTypeId, value);
  }
  const orderedIds = topologicalRequirementOrder(targetTypeId, edges, new Set(merged.keys()));
  return Object.freeze(orderedIds.map((skillTypeId, index): SdeEffectiveRequirement => {
    const value = merged.get(skillTypeId);
    const skillName = skillNames.get(skillTypeId);
    if (value === undefined || skillName === undefined) throw new Error('Merged requirement evidence is incomplete.');
    return Object.freeze({
      order: index + 1,
      skillTypeId,
      skillName,
      requiredLevel: value.requiredLevel,
      direct: value.direct,
      requiredByTypeIds: Object.freeze([...value.requiredBy].sort((left, right) => left - right)),
    });
  }));
}

function topologicalRequirementOrder(
  targetTypeId: number,
  edges: readonly SdeRequirementEdge[],
  nodeIds: ReadonlySet<number>,
): readonly number[] {
  const dependents = new Map<number, Set<number>>();
  const indegree = new Map([...nodeIds].map((id) => [id, 0]));
  for (const edge of edges) {
    if (edge.requiredLevel <= 0 || edge.sourceTypeId === targetTypeId || !nodeIds.has(edge.sourceTypeId)) continue;
    const values = dependents.get(edge.skillTypeId) ?? new Set<number>();
    if (!values.has(edge.sourceTypeId)) {
      values.add(edge.sourceTypeId);
      dependents.set(edge.skillTypeId, values);
      indegree.set(edge.sourceTypeId, (indegree.get(edge.sourceTypeId) ?? 0) + 1);
    }
  }
  const available = [...indegree].filter(([, value]) => value === 0).map(([id]) => id).sort((left, right) => left - right);
  const ordered: number[] = [];
  while (available.length > 0) {
    const id = available.shift();
    if (id === undefined) throw new Error('Topological requirement frontier is inconsistent.');
    ordered.push(id);
    for (const dependent of [...(dependents.get(id) ?? [])].sort((left, right) => left - right)) {
      const current = indegree.get(dependent);
      if (current === undefined) throw new Error('Topological requirement indegree is missing.');
      const next = current - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        available.push(dependent);
        available.sort((left, right) => left - right);
      }
    }
  }
  if (ordered.length !== nodeIds.size) {
    throw invalidRequirementGraph('The active SDE requirement graph cannot be ordered because it contains a cycle.');
  }
  return Object.freeze(ordered);
}

function compareRequirementEdges(left: SdeRequirementEdge, right: SdeRequirementEdge): number {
  return left.depth - right.depth
    || left.sourceTypeId - right.sourceTypeId
    || left.requirementIndex - right.requirementIndex
    || left.skillTypeId - right.skillTypeId;
}

function invalidRequirementGraph(message: string): AppError {
  return new AppError({
    code: 'SDE_INVALID',
    safeMessage: message,
    details: { next_step: 'Install or update to a valid EVE SDE build.' },
  });
}

function requirementLimit(kind: 'nodes' | 'edges' | 'depth'): AppError {
  return new AppError({
    code: 'RESULT_LIMIT_EXCEEDED',
    safeMessage: `The requirement graph exceeded the defensive ${kind} limit.`,
    details: { next_step: 'Install or update to a valid EVE SDE build.' },
  });
}

function boundedCacheSet(
  cache: Map<string, SdeTypeRequirementClosure>,
  key: string,
  value: SdeTypeRequirementClosure,
): void {
  if (cache.size >= MAX_REQUIREMENT_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}
