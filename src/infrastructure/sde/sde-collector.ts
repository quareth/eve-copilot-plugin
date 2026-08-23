import type Database from 'better-sqlite3';
import { z } from 'zod';
import { AppError } from '../../domain/errors.js';
import {
  blueprintSchema,
  categorySchema,
  dogmaAttributeSchema,
  dogmaEffectSchema,
  groupSchema,
  keyedNameSchema,
  localizedNameSchema,
  marketGroupSchema,
  stargateSchema,
  typeDogmaSchema,
  typeSchema,
} from './sde-import-schemas.js';
import { deriveAndValidateTypeRequirements } from './sde-requirement-import.js';

const IMPORT_GROUPS = {
  'types.jsonl': 'core',
  'categories.jsonl': 'core',
  'groups.jsonl': 'core',
  'marketGroups.jsonl': 'core',
  'dogmaAttributes.jsonl': 'dogma',
  'dogmaEffects.jsonl': 'dogma',
  'typeDogma.jsonl': 'dogma',
  'blueprints.jsonl': 'blueprint',
  'mapRegions.jsonl': 'map',
  'mapConstellations.jsonl': 'map',
  'mapSolarSystems.jsonl': 'map',
  'mapStargates.jsonl': 'map',
  'mapPlanets.jsonl': 'map',
  'mapMoons.jsonl': 'map',
  'npcCorporations.jsonl': 'organization',
  'factions.jsonl': 'organization',
  'stationOperations.jsonl': 'organization',
  'npcStations.jsonl': 'organization',
} as const;
type ImportGroup = typeof IMPORT_GROUPS[keyof typeof IMPORT_GROUPS];
export const SDE_IMPORT_ENTRY_NAMES: readonly string[] = Object.freeze(Object.keys(IMPORT_GROUPS));

export class SdeCollector {
  readonly #database: Database.Database;
  readonly #regions = new Map<number, string>();
  readonly #constellations = new Map<number, { name: string; regionId: number }>();
  readonly #systems = new Map<number, { name: string; constellationId: number; regionId: number }>();
  readonly #planets = new Map<number, { systemId: number; index: number }>();
  readonly #moons = new Map<number, { orbitId: number; index: number }>();
  readonly #corporations = new Map<number, string>();
  readonly #operations = new Map<number, string>();
  readonly #stations: Array<{ id: number; systemId: number; orbitId: number; ownerId: number; operationId: number; useOperationName: boolean }> = [];
  readonly #insertType;
  readonly #insertCategory;
  readonly #insertGroup;
  readonly #insertMarketGroup;
  readonly #insertDogmaAttribute;
  readonly #insertTypeAttribute;
  readonly #insertDogmaEffect;
  readonly #insertDogmaModifier;
  readonly #insertTypeEffect;
  readonly #insertBlueprint;
  readonly #insertBlueprintActivity;
  readonly #insertBlueprintPart;
  readonly #insertStargate;
  readonly #insertNpcCorporation;
  readonly #insertFaction;
  #typeCount = 0;
  #typeAttributeCount = 0;
  #dogmaAttributeCount = 0;
  #dogmaEffectCount = 0;
  #dogmaModifierCount = 0;
  #typeEffectCount = 0;
  #blueprintCount = 0;
  #stargateCount = 0;

  constructor(database: Database.Database) {
    this.#database = database;
    this.#insertType = database.prepare(`
      INSERT INTO sde_types (
        type_id, name, normalized_name, group_id, market_group_id, published,
        capacity, mass, radius, volume
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#insertCategory = database.prepare(`
      INSERT INTO sde_categories (category_id, name, normalized_name, published) VALUES (?, ?, ?, ?)
    `);
    this.#insertGroup = database.prepare(`
      INSERT INTO sde_groups (group_id, name, normalized_name, category_id, published) VALUES (?, ?, ?, ?, ?)
    `);
    this.#insertMarketGroup = database.prepare(`
      INSERT INTO sde_market_groups (market_group_id, name, normalized_name, parent_market_group_id)
      VALUES (?, ?, ?, ?)
    `);
    this.#insertDogmaAttribute = database.prepare(`
      INSERT INTO sde_dogma_attributes (
        attribute_id, name, default_value, high_is_good, stackable
      ) VALUES (?, ?, ?, ?, ?)
    `);
    this.#insertTypeAttribute = database.prepare(
      'INSERT INTO sde_type_attributes (type_id, attribute_id, value) VALUES (?, ?, ?)',
    );
    this.#insertDogmaEffect = database.prepare(`
      INSERT INTO sde_dogma_effects (
        effect_id, name, effect_category, electronic_chance, is_assistance,
        is_offensive, is_warp_safe, propulsion_chance, range_chance,
        discharge_attribute_id, duration_attribute_id, range_attribute_id,
        falloff_attribute_id, tracking_speed_attribute_id,
        fitting_usage_chance_attribute_id, resistance_attribute_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#insertDogmaModifier = database.prepare(`
      INSERT INTO sde_dogma_effect_modifiers (
        effect_id, modifier_index, domain, func, modified_attribute_id,
        modifying_attribute_id, operation, group_id, skill_type_id, stopped_effect_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#insertTypeEffect = database.prepare(`
      INSERT INTO sde_type_effects (type_id, effect_id, is_default) VALUES (?, ?, ?)
    `);
    this.#insertBlueprint = database.prepare(
      'INSERT INTO sde_blueprints (blueprint_type_id, max_production_limit) VALUES (?, ?)',
    );
    this.#insertBlueprintActivity = database.prepare(`
      INSERT INTO sde_blueprint_activities (blueprint_type_id, activity, time_seconds) VALUES (?, ?, ?)
    `);
    this.#insertBlueprintPart = database.prepare(`
      INSERT INTO sde_blueprint_parts (blueprint_type_id, activity, kind, type_id, quantity)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.#insertStargate = database.prepare(`
      INSERT INTO sde_stargates (
        stargate_id, system_id, destination_stargate_id, destination_system_id
      ) VALUES (?, ?, ?, ?)
    `);
    this.#insertNpcCorporation = database.prepare(`
      INSERT INTO sde_npc_corporations (corporation_id, name, normalized_name) VALUES (?, ?, ?)
    `);
    this.#insertFaction = database.prepare(`
      INSERT INTO sde_factions (faction_id, name, normalized_name) VALUES (?, ?, ?)
    `);
  }

  accept(filename: string, value: unknown): void {
    const group = (IMPORT_GROUPS as Readonly<Record<string, ImportGroup>>)[filename];
    if (group === undefined) throw sdeContract(`Unsupported selected SDE entry: ${filename}.`);
    switch (group) {
      case 'core': this.#acceptCore(filename, value); break;
      case 'dogma': this.#acceptDogma(filename, value); break;
      case 'blueprint': this.#acceptBlueprint(filename, value); break;
      case 'map': this.#acceptMap(filename, value); break;
      case 'organization': this.#acceptOrganization(filename, value); break;
    }
  }

  #acceptCore(filename: string, value: unknown): void {
    switch (filename) {
      case 'types.jsonl': {
      const row = typeSchema.parse(value);
      this.#insertType.run(
      row._key, row.name.en, normalizeSdeName(row.name.en), row.groupID,
      row.marketGroupID ?? null, row.published ? 1 : 0,
      row.capacity ?? null, row.mass ?? null, row.radius ?? null, row.volume ?? null,
      );
      this.#typeCount += 1;
      break;
      }
      case 'categories.jsonl': {
      const row = categorySchema.parse(value);
      this.#insertCategory.run(row._key, row.name.en, normalizeSdeName(row.name.en), row.published ? 1 : 0);
      break;
      }
      case 'groups.jsonl': {
      const row = groupSchema.parse(value);
      this.#insertGroup.run(
      row._key, row.name.en, normalizeSdeName(row.name.en), row.categoryID, row.published ? 1 : 0,
      );
      break;
      }
      case 'marketGroups.jsonl': {
      const row = marketGroupSchema.parse(value);
      this.#insertMarketGroup.run(row._key, row.name.en, normalizeSdeName(row.name.en), row.parentGroupID ?? null);
      break;
      }
      default: throw sdeContract(`Unexpected ${filename} entry in the core importer.`);
    }
  }

  #acceptDogma(filename: string, value: unknown): void {
    switch (filename) {
      case 'dogmaAttributes.jsonl': {
      const row = dogmaAttributeSchema.parse(value);
      this.#insertDogmaAttribute.run(
      row._key, row.name, row.defaultValue, row.highIsGood ? 1 : 0, row.stackable ? 1 : 0,
      );
      this.#dogmaAttributeCount += 1;
      break;
      }
      case 'dogmaEffects.jsonl': {
      const row = dogmaEffectSchema.parse(value);
      this.#insertDogmaEffect.run(
      row._key, row.name, row.effectCategoryID, row.electronicChance ? 1 : 0,
      row.isAssistance ? 1 : 0, row.isOffensive ? 1 : 0, row.isWarpSafe ? 1 : 0,
      row.propulsionChance ? 1 : 0, row.rangeChance ? 1 : 0,
      row.dischargeAttributeID ?? null, row.durationAttributeID ?? null,
      row.rangeAttributeID ?? null, row.falloffAttributeID ?? null,
      row.trackingSpeedAttributeID ?? null, row.fittingUsageChanceAttributeID ?? null,
      row.resistanceAttributeID ?? null,
      );
      for (const [index, modifier] of (row.modifierInfo ?? []).entries()) {
      this.#insertDogmaModifier.run(
      row._key, index, dogmaDomainId(modifier.domain), dogmaModifierFunctionId(modifier.func),
      modifier.modifiedAttributeID ?? null, modifier.modifyingAttributeID ?? null,
      modifier.operation ?? null, modifier.groupID ?? null, modifier.skillTypeID ?? null,
      modifier.effectID ?? null,
      );
      this.#dogmaModifierCount += 1;
      }
      this.#dogmaEffectCount += 1;
      break;
      }
      case 'typeDogma.jsonl': {
      const row = typeDogmaSchema.parse(value);
      for (const attribute of row.dogmaAttributes) {
      this.#insertTypeAttribute.run(row._key, attribute.attributeID, attribute.value);
      this.#typeAttributeCount += 1;
      }
      for (const effect of row.dogmaEffects ?? []) {
      this.#insertTypeEffect.run(row._key, effect.effectID, effect.isDefault ? 1 : 0);
      this.#typeEffectCount += 1;
      }
      break;
      }
      default: throw sdeContract(`Unexpected ${filename} entry in the dogma importer.`);
    }
  }

  #acceptBlueprint(filename: string, value: unknown): void {
    switch (filename) {
      case 'blueprints.jsonl': {
      const row = blueprintSchema.parse(value);
      this.#insertBlueprint.run(row.blueprintTypeID, row.maxProductionLimit ?? null);
      for (const [activity, details] of Object.entries(row.activities)) {
      this.#insertBlueprintActivity.run(row.blueprintTypeID, activity, details.time ?? null);
      for (const material of details.materials ?? []) {
      this.#insertBlueprintPart.run(row.blueprintTypeID, activity, 'material', material.typeID, material.quantity);
      }
      for (const product of details.products ?? []) {
      this.#insertBlueprintPart.run(row.blueprintTypeID, activity, 'product', product.typeID, product.quantity);
      }
      }
      this.#blueprintCount += 1;
      break;
      }
      default: throw sdeContract(`Unexpected ${filename} entry in the blueprint importer.`);
    }
  }

  #acceptMap(filename: string, value: unknown): void {
    switch (filename) {
      case 'mapRegions.jsonl': {
      const row = keyedNameSchema.parse(value);
      this.#regions.set(row._key, row.name.en);
      break;
      }
      case 'mapConstellations.jsonl': {
      const row = keyedNameSchema.extend({ regionID: z.number().int().positive() }).parse(value);
      this.#constellations.set(row._key, { name: row.name.en, regionId: row.regionID });
      break;
      }
      case 'mapSolarSystems.jsonl': {
      const row = keyedNameSchema.extend({
      constellationID: z.number().int().positive(),
      regionID: z.number().int().positive(),
      }).parse(value);
      this.#systems.set(row._key, {
      name: row.name.en,
      constellationId: row.constellationID,
      regionId: row.regionID,
      });
      break;
      }
      case 'mapStargates.jsonl': {
      const row = stargateSchema.parse(value);
      this.#insertStargate.run(
      row._key, row.solarSystemID, row.destination.stargateID, row.destination.solarSystemID,
      );
      this.#stargateCount += 1;
      break;
      }
      case 'mapPlanets.jsonl': {
      const row = z.object({
      _key: z.number().int().positive(),
      solarSystemID: z.number().int().positive(),
      celestialIndex: z.number().int().positive(),
      }).loose().parse(value);
      this.#planets.set(row._key, { systemId: row.solarSystemID, index: row.celestialIndex });
      break;
      }
      case 'mapMoons.jsonl': {
      const row = z.object({
      _key: z.number().int().positive(),
      orbitID: z.number().int().positive(),
      orbitIndex: z.number().int().positive(),
      }).loose().parse(value);
      this.#moons.set(row._key, { orbitId: row.orbitID, index: row.orbitIndex });
      break;
      }
      default: throw sdeContract(`Unexpected ${filename} entry in the map importer.`);
    }
  }

  #acceptOrganization(filename: string, value: unknown): void {
    switch (filename) {
      case 'npcCorporations.jsonl': {
      const row = keyedNameSchema.parse(value);
      this.#corporations.set(row._key, row.name.en);
      this.#insertNpcCorporation.run(row._key, row.name.en, normalizeSdeName(row.name.en));
      break;
      }
      case 'factions.jsonl': {
      const row = keyedNameSchema.parse(value);
      this.#insertFaction.run(row._key, row.name.en, normalizeSdeName(row.name.en));
      break;
      }
      case 'stationOperations.jsonl': {
      const row = z.object({
      _key: z.number().int().positive(),
      operationName: localizedNameSchema,
      }).loose().parse(value);
      this.#operations.set(row._key, row.operationName.en);
      break;
      }
      case 'npcStations.jsonl': {
      const row = z.object({
      _key: z.number().int().positive(),
      solarSystemID: z.number().int().positive(),
      orbitID: z.number().int().positive(),
      ownerID: z.number().int().positive(),
      operationID: z.number().int().positive(),
      useOperationName: z.boolean(),
      }).loose().parse(value);
      this.#stations.push({
      id: row._key,
      systemId: row.solarSystemID,
      orbitId: row.orbitID,
      ownerId: row.ownerID,
      operationId: row.operationID,
      useOperationName: row.useOperationName,
      });
      break;
      }
      default: throw sdeContract(`Unexpected ${filename} entry in the organization importer.`);
    }
  }

  finish(): Record<string, number> {
    const insertSystem = this.#database.prepare(`
      INSERT INTO sde_solar_systems (
        system_id, name, normalized_name, constellation_id, constellation_name, region_id, region_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [id, system] of this.#systems) {
      const constellation = this.#constellations.get(system.constellationId);
      const region = this.#regions.get(system.regionId);
      if (constellation === undefined || region === undefined || constellation.regionId !== system.regionId) {
        throw sdeContract('The SDE map parent relationships are inconsistent.');
      }
      insertSystem.run(
        id, system.name, normalizeSdeName(system.name), system.constellationId,
        constellation.name, system.regionId, region,
      );
    }
    const orbitNames = new Map<number, string>();
    for (const [id, planet] of this.#planets) {
      const system = this.#systems.get(planet.systemId);
      if (system !== undefined) orbitNames.set(id, `${system.name} ${roman(planet.index)}`);
    }
    for (const [id, moon] of this.#moons) {
      const orbit = orbitNames.get(moon.orbitId);
      if (orbit !== undefined) orbitNames.set(id, `${orbit} - Moon ${String(moon.index)}`);
    }
    const insertStation = this.#database.prepare(
      'INSERT INTO sde_stations (station_id, name, system_id) VALUES (?, ?, ?)',
    );
    let stationCount = 0;
    for (const station of this.#stations) {
      const orbit = orbitNames.get(station.orbitId);
      const corporation = this.#corporations.get(station.ownerId);
      const operation = this.#operations.get(station.operationId);
      if (orbit === undefined || corporation === undefined || (station.useOperationName && operation === undefined)) continue;
      const name = station.useOperationName
        ? `${orbit} - ${corporation} ${operation ?? ''}`
        : `${orbit} - ${corporation}`;
      insertStation.run(String(station.id), name, station.systemId);
      stationCount += 1;
    }
    const requirementValidation = deriveAndValidateTypeRequirements(this.#database);
    return {
      types: this.#typeCount,
      solar_systems: this.#systems.size,
      constellations: this.#constellations.size,
      regions: this.#regions.size,
      stations: stationCount,
      type_attributes: this.#typeAttributeCount,
      dogma_attributes: this.#dogmaAttributeCount,
      dogma_effects: this.#dogmaEffectCount,
      dogma_effect_modifiers: this.#dogmaModifierCount,
      type_effects: this.#typeEffectCount,
      blueprints: this.#blueprintCount,
      stargates: this.#stargateCount,
      ...requirementValidation,
    };
  }
}

function roman(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 3999) throw sdeContract('An SDE celestial index is invalid.');
  const parts: Array<readonly [number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remaining = value;
  let output = '';
  for (const [amount, symbol] of parts) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }
  return output;
}

function normalizeSdeName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

const DOGMA_DOMAIN_IDS = {
  itemID: 0,
  shipID: 1,
  charID: 2,
  otherID: 3,
  structureID: 4,
  target: 5,
  targetID: 6,
} as const;

const DOGMA_MODIFIER_FUNCTION_IDS = {
  ItemModifier: 0,
  LocationGroupModifier: 1,
  LocationModifier: 2,
  LocationRequiredSkillModifier: 3,
  OwnerRequiredSkillModifier: 4,
  EffectStopper: 5,
} as const;

function dogmaDomainId(domain: keyof typeof DOGMA_DOMAIN_IDS): number {
  return DOGMA_DOMAIN_IDS[domain];
}

function dogmaModifierFunctionId(func: keyof typeof DOGMA_MODIFIER_FUNCTION_IDS): number {
  return DOGMA_MODIFIER_FUNCTION_IDS[func];
}

function sdeContract(message: string, cause?: unknown): AppError {
  return new AppError({ code: 'UPSTREAM_CONTRACT_MISMATCH', safeMessage: message, cause });
}
