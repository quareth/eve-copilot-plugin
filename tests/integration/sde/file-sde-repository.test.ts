import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSdeRepository } from '../../../src/infrastructure/sde/file-sde-repository.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('FileSdeRepository', () => {
  it('reports absent data without network access', async () => {
    const directory = await temporaryDirectory();
    const repository = new FileSdeRepository(directory);
    await expect(repository.status()).resolves.toEqual({
      state: 'unavailable', buildNumber: null, releaseDate: null,
    });
    await expect(repository.resolveType(587)).rejects.toMatchObject({ code: 'SDE_UNAVAILABLE' });
  });

  it('pins one active build and resolves indexed static records', async () => {
    const directory = await temporaryDirectory();
    const databasePath = join(directory, 'sde-42.db');
    const database = new Database(databasePath);
    database.exec(`
      CREATE TABLE sde_categories (category_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, published INTEGER NOT NULL) STRICT;
      CREATE TABLE sde_groups (group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, category_id INTEGER NOT NULL, published INTEGER NOT NULL) STRICT;
      CREATE TABLE sde_market_groups (market_group_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, parent_market_group_id INTEGER) STRICT;
      CREATE TABLE sde_types (type_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, group_id INTEGER NOT NULL, market_group_id INTEGER, published INTEGER NOT NULL) STRICT;
      CREATE TABLE sde_type_requirements (type_id INTEGER NOT NULL, requirement_index INTEGER NOT NULL, skill_type_id INTEGER NOT NULL, level INTEGER NOT NULL, PRIMARY KEY (type_id, requirement_index)) STRICT;
      CREATE TABLE sde_dogma_attributes (attribute_id INTEGER PRIMARY KEY) STRICT;
      CREATE TABLE sde_dogma_effects (effect_id INTEGER PRIMARY KEY) STRICT;
      CREATE TABLE sde_dogma_effect_modifiers (effect_id INTEGER NOT NULL, modifier_index INTEGER NOT NULL, PRIMARY KEY (effect_id, modifier_index)) STRICT;
      CREATE TABLE sde_type_attributes (type_id INTEGER NOT NULL, attribute_id INTEGER NOT NULL, value REAL NOT NULL, PRIMARY KEY (type_id, attribute_id)) STRICT;
      CREATE TABLE sde_type_effects (type_id INTEGER NOT NULL, effect_id INTEGER NOT NULL, PRIMARY KEY (type_id, effect_id)) STRICT;
      CREATE TABLE sde_blueprints (blueprint_type_id INTEGER PRIMARY KEY, max_production_limit INTEGER) STRICT;
      CREATE TABLE sde_blueprint_activities (blueprint_type_id INTEGER NOT NULL, activity TEXT NOT NULL, time_seconds INTEGER, PRIMARY KEY (blueprint_type_id, activity)) STRICT;
      CREATE TABLE sde_blueprint_parts (blueprint_type_id INTEGER NOT NULL, activity TEXT NOT NULL, kind TEXT NOT NULL, type_id INTEGER NOT NULL, quantity INTEGER NOT NULL, PRIMARY KEY (blueprint_type_id, activity, kind, type_id)) STRICT;
      CREATE TABLE sde_solar_systems (
        system_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL,
        constellation_id INTEGER NOT NULL, constellation_name TEXT NOT NULL,
        region_id INTEGER NOT NULL, region_name TEXT NOT NULL
      ) STRICT;
      CREATE TABLE sde_stations (
        station_id TEXT PRIMARY KEY, name TEXT NOT NULL, system_id INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE sde_stargates (stargate_id INTEGER PRIMARY KEY, system_id INTEGER NOT NULL, destination_stargate_id INTEGER NOT NULL, destination_system_id INTEGER NOT NULL) STRICT;
      CREATE TABLE sde_npc_corporations (corporation_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL) STRICT;
      CREATE TABLE sde_factions (faction_id INTEGER PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL) STRICT;
      INSERT INTO sde_categories VALUES (6, 'Ship', 'ship', 1);
      INSERT INTO sde_groups VALUES (25, 'Frigate', 'frigate', 6, 1);
      INSERT INTO sde_market_groups VALUES (64, 'Standard Frigates', 'standard frigates', NULL);
      INSERT INTO sde_types VALUES (587, 'Rifter', 'rifter', 25, 64, 1);
      INSERT INTO sde_solar_systems VALUES (30000142, 'Jita', 'jita', 20000020, 'Kimotoro', 10000002, 'The Forge');
      INSERT INTO sde_stations VALUES ('60003760', 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', 30000142);
      INSERT INTO sde_stargates VALUES (50000001, 30000142, 50000002, 30000144);
      INSERT INTO sde_npc_corporations VALUES (1000035, 'Caldari Navy', 'caldari navy');
      INSERT INTO sde_factions VALUES (500001, 'Caldari State', 'caldari state');
    `);
    database.close();
    await writeFile(join(directory, 'active.json'), `${JSON.stringify({
      version: 2,
      build_number: 42,
      release_date: '2026-08-20T11:08:35Z',
      database_path_token: 'sde-42.db',
    })}\n`, { mode: 0o600 });
    const repository = new FileSdeRepository(directory);
    await expect(repository.status()).resolves.toMatchObject({ state: 'available', buildNumber: 42 });
    const fittingSnapshot = await repository.fittingSnapshot();
    expect(fittingSnapshot).toMatchObject({
      buildNumber: 42,
      releaseDate: '2026-08-20T11:08:35Z',
      importerVersion: 3,
      fittingDataContractVersion: 1,
    });
    expect(fittingSnapshot.databasePath).toMatch(/sde-42\.db$/u);
    await expect(repository.resolveType(587)).resolves.toMatchObject({
      id: 587, name: 'Rifter', groupName: 'Frigate', categoryName: 'Ship', marketGroupName: 'Standard Frigates', buildNumber: 42,
    });
    await expect(repository.searchTypes('RIF', 10)).resolves.toHaveLength(1);
    await expect(repository.resolveSolarSystem(30000142)).resolves.toMatchObject({
      name: 'Jita', constellationName: 'Kimotoro', regionName: 'The Forge', buildNumber: 42,
    });
    await expect(repository.resolveStation('60003760')).resolves.toMatchObject({
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', solarSystemId: 30000142,
    });
    await expect(repository.resolveType(1)).resolves.toBeNull();
    await expect(repository.resolveStargatesFromSystem(30000142)).resolves.toMatchObject([
      { destinationSolarSystemId: 30000144 },
    ]);
    await expect(repository.resolveNpcCorporation(1000035)).resolves.toMatchObject({ name: 'Caldari Navy' });
    await expect(repository.resolveFaction(500001)).resolves.toMatchObject({ name: 'Caldari State' });
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-sde-repository-'));
  directories.push(directory);
  return directory;
}
