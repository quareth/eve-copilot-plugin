import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import type {
  CanonicalFitSpec,
  CapacitorPolicyInput,
  CapacitorProfileResult,
  EvaluatedFitting,
  FittingMetrics,
  FittingModuleState,
  FittingProfile,
  FittingViolation,
} from '../../application/dto/fitting-analysis.js';
import { canonicalFitForHash, formatFittingSlot } from '../../domain/fitting.js';
import type { FittingEngineRequest, FittingEngineResponse } from '../../application/ports/fitting-calculation-engine.js';
import {
  DERIVED_ATTRIBUTES,
  DERIVED_ATTRIBUTE_IDS,
  DERIVED_ATTRIBUTE_NAMES,
  DERIVED_EFFECTS,
  DERIVED_EFFECT_IDS,
} from './dogma-derived-data.js';
import { DOGMA_JAVASCRIPT_SHA256, DOGMA_WASM_SHA256 } from './dogma-version.js';

interface RawAttribute { readonly base_value: number; readonly value?: number }
interface RawItem {
  readonly type_id: number;
  readonly attributes: ReadonlyMap<number, RawAttribute>;
}
interface RawCalculation { readonly hull: RawItem; readonly items: readonly RawItem[] }
interface TypeRow {
  readonly groupID: number;
  readonly categoryID: number;
  readonly published: number;
  readonly capacity: number | null;
  readonly mass: number | null;
  readonly radius: number | null;
  readonly volume: number | null;
}
interface TypeEffect { readonly effectID: number; readonly isDefault: boolean }
interface SdeBridge {
  readonly get_dogma_attributes: (typeId: number) => unknown;
  readonly get_dogma_attribute: (attributeId: number) => unknown;
  readonly get_dogma_effects: (typeId: number) => unknown;
  readonly get_dogma_effect: (effectId: number) => unknown;
  readonly get_type: (typeId: number) => unknown;
  readonly type_name_to_id: (name: string) => number;
  readonly attribute_name_to_id: (name: string) => number;
  readonly typeRow: (typeId: number) => TypeRow;
  readonly typeAttributeIds: (typeId: number) => Set<number>;
}
interface DogmaModule {
  readonly calculate: (fit: object, skills: Readonly<Record<string, number>>) => RawCalculation;
  readonly init: () => void;
  readonly initSync: (input: { readonly module: Uint8Array }) => unknown;
}

const request = workerData as FittingEngineRequest;
const startedAt = performance.now();

void run().then(
  (value) => parentPort?.postMessage({ ok: true, value }),
  (error: unknown) => parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : 'The fitting worker failed.',
  }),
);

async function run(): Promise<FittingEngineResponse> {
  const openedDatabase = new Database(request.snapshot.databasePath, { readonly: true, fileMustExist: true });
  openedDatabase.pragma('query_only = ON');
  openedDatabase.pragma('trusted_schema = OFF');
  try {
    const bridge = createSdeBridge(openedDatabase);
    (globalThis as unknown as { window: SdeBridge }).window = bridge;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () => { throw new Error('Network access is disabled in the fitting worker.'); },
    });
    const wasmPath = new URL('../../../vendor/dogma-engine/esf_dogma_engine_bg.wasm', import.meta.url);
    const gluePath = new URL('../../../vendor/dogma-engine/esf_dogma_engine.js', import.meta.url);
    const wasm = readFileSync(wasmPath);
    const actualHash = createHash('sha256').update(wasm).digest('hex');
    if (actualHash !== DOGMA_WASM_SHA256) throw new Error('The pinned Dogma artifact hash did not match its provenance.');
    const glueSource = readFileSync(gluePath, 'utf8').replace(/\r\n?/gu, '\n');
    const glueHash = createHash('sha256').update(glueSource, 'utf8').digest('hex');
    if (glueHash !== DOGMA_JAVASCRIPT_SHA256) throw new Error('The pinned Dogma JavaScript glue hash did not match its provenance.');
    const dogma = await import(gluePath.href) as DogmaModule;
    dogma.initSync({ module: wasm });
    dogma.init();
    const evaluations = request.fits.map((fit, index) => evaluateFit(
      openedDatabase, bridge, dogma, fit, request.skills, request.profiles,
      request.capacitorPolicy, request.missingSkills[index] ?? [],
    ));
    return Object.freeze({
      evaluations: Object.freeze(evaluations),
      durationMs: Math.max(0, performance.now() - startedAt),
    });
  } finally {
    openedDatabase.close();
    Reflect.deleteProperty(globalThis, 'window');
  }
}

function createSdeBridge(db: Database.Database): SdeBridge {
  const typeAttributes = db.prepare(
    'SELECT attribute_id AS attributeID, value FROM sde_type_attributes WHERE type_id = ? ORDER BY attribute_id',
  );
  const dogmaAttribute = db.prepare(
    'SELECT default_value AS defaultValue, high_is_good AS highIsGood, stackable FROM sde_dogma_attributes WHERE attribute_id = ?',
  );
  const typeEffects = db.prepare(
    'SELECT effect_id AS effectID, is_default AS isDefault FROM sde_type_effects WHERE type_id = ? ORDER BY effect_id',
  );
  const dogmaEffect = db.prepare('SELECT * FROM sde_dogma_effects WHERE effect_id = ?');
  const modifiers = db.prepare(
    'SELECT * FROM sde_dogma_effect_modifiers WHERE effect_id = ? ORDER BY modifier_index',
  );
  const type = db.prepare(`
    SELECT t.group_id AS groupID, g.category_id AS categoryID, t.published,
      t.capacity, t.mass, t.radius, t.volume
    FROM sde_types t JOIN sde_groups g ON g.group_id = t.group_id WHERE t.type_id = ?
  `);
  const typeName = db.prepare(
    'SELECT type_id FROM sde_types WHERE normalized_name = ? ORDER BY type_id LIMIT 2',
  );
  const attributeName = db.prepare(
    'SELECT attribute_id FROM sde_dogma_attributes WHERE name = ? ORDER BY attribute_id LIMIT 1',
  );
  const attributePresence = db.prepare(
    'SELECT attribute_id FROM sde_type_attributes WHERE type_id = ?',
  );
  const typeCache = new Map<number, TypeRow>();
  const attributeIdCache = new Map<number, Set<number>>();

  const getType = (typeId: number): TypeRow => {
    const cached = typeCache.get(typeId);
    if (cached !== undefined) return cached;
    const row = type.get(typeId) as TypeRow | undefined;
    if (row === undefined) throw new Error(`Dogma requested unknown type ${String(typeId)}.`);
    const frozen = Object.freeze({ ...row, published: row.published });
    typeCache.set(typeId, frozen);
    return frozen;
  };
  const attributesFor = (typeId: number): Set<number> => {
    const cached = attributeIdCache.get(typeId);
    if (cached !== undefined) return cached;
    const ids = new Set((attributePresence.all(typeId) as Array<{ readonly attribute_id: number }>).map((row) => row.attribute_id));
    attributeIdCache.set(typeId, ids);
    return ids;
  };
  const derivedTypeEffects = (typeId: number): TypeEffect[] => {
    const row = getType(typeId);
    const attributes = attributesFor(typeId);
    const result: TypeEffect[] = [];
    if (row.categoryID === 6) {
      result.push(
        { effectID: DERIVED_EFFECT_IDS.cpuPowerFree, isDefault: false },
        { effectID: DERIVED_EFFECT_IDS.capacitorPeakRecharge, isDefault: false },
        { effectID: DERIVED_EFFECT_IDS.capacitorPeakDelta, isDefault: false },
      );
    }
    if (row.categoryID === 7 || row.categoryID === 32 || row.categoryID === 66) {
      result.push({ effectID: DERIVED_EFFECT_IDS.cpuPowerLoad, isDefault: false });
      if (attributes.has(6)) {
        result.push({ effectID: DERIVED_EFFECT_IDS.capacitorPeakLoad, isDefault: false });
        if (attributes.has(73)) result.push({ effectID: DERIVED_EFFECT_IDS.cycleTimeDuration, isDefault: false });
        if (attributes.has(3115)) result.push({ effectID: DERIVED_EFFECT_IDS.cycleTimeDurationHighIsGood, isDefault: false });
        if (attributes.has(51)) result.push({ effectID: DERIVED_EFFECT_IDS.cycleTimeSpeed, isDefault: false });
        if (attributes.has(669)) result.push({ effectID: DERIVED_EFFECT_IDS.cycleTimeReactivation, isDefault: false });
      }
    }
    if (row.categoryID === 18) result.push({ effectID: DERIVED_EFFECT_IDS.droneActive, isDefault: false });
    return result;
  };

  return Object.freeze({
    get_dogma_attributes(typeId: number) {
      return typeAttributes.all(typeId);
    },
    get_dogma_attribute(attributeId: number) {
      const derived = DERIVED_ATTRIBUTES.get(attributeId);
      if (derived !== undefined) return derived;
      const row = dogmaAttribute.get(attributeId) as { defaultValue: number; highIsGood: number; stackable: number } | undefined;
      if (row === undefined) throw new Error(`Dogma requested unknown attribute ${String(attributeId)}.`);
      return { defaultValue: row.defaultValue, highIsGood: row.highIsGood === 1, stackable: row.stackable === 1 };
    },
    get_dogma_effects(typeId: number) {
      const official = (typeEffects.all(typeId) as Array<{ effectID: number; isDefault: number }>)
        .map((row) => ({ effectID: row.effectID, isDefault: row.isDefault === 1 }));
      return [...official, ...derivedTypeEffects(typeId)];
    },
    get_dogma_effect(effectId: number) {
      const derived = DERIVED_EFFECTS.get(effectId);
      if (derived !== undefined) return derived;
      const row = dogmaEffect.get(effectId) as Readonly<Record<string, number | null>> | undefined;
      if (row === undefined) throw new Error(`Dogma requested unknown effect ${String(effectId)}.`);
      const modifierInfo = (modifiers.all(effectId) as Array<Readonly<Record<string, number | null>>>)
        .filter((modifier) => modifier.func !== 5)
        .map((modifier) => ({
          domain: modifier.domain,
          func: modifier.func,
          modifiedAttributeID: modifier.modified_attribute_id,
          modifyingAttributeID: modifier.modifying_attribute_id,
          operation: modifier.operation,
          groupID: modifier.group_id,
          skillTypeID: modifier.skill_type_id,
        }));
      return {
        dischargeAttributeID: row.discharge_attribute_id,
        durationAttributeID: row.duration_attribute_id,
        effectCategory: effectId === 16 ? 4 : row.effect_category,
        electronicChance: row.electronic_chance === 1,
        isAssistance: row.is_assistance === 1,
        isOffensive: row.is_offensive === 1,
        isWarpSafe: row.is_warp_safe === 1,
        propulsionChance: row.propulsion_chance === 1,
        rangeChance: row.range_chance === 1,
        rangeAttributeID: row.range_attribute_id,
        falloffAttributeID: row.falloff_attribute_id,
        trackingSpeedAttributeID: row.tracking_speed_attribute_id,
        fittingUsageChanceAttributeID: row.fitting_usage_chance_attribute_id,
        resistanceAttributeID: row.resistance_attribute_id,
        modifierInfo,
      };
    },
    get_type(typeId: number) {
      const row = getType(typeId);
      return {
        groupID: row.groupID,
        categoryID: row.categoryID,
        capacity: row.capacity,
        mass: row.mass,
        radius: row.radius,
        volume: row.volume,
      };
    },
    type_name_to_id(name: string) {
      const normalized = name.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
      const rows = typeName.all(normalized) as Array<{ readonly type_id: number }>;
      if (rows.length !== 1) throw new Error(`Dogma could not resolve exact type name ${name}.`);
      const row = rows[0];
      if (row === undefined) throw new Error(`Dogma could not resolve exact type name ${name}.`);
      return row.type_id;
    },
    attribute_name_to_id(name: string) {
      const derived = DERIVED_ATTRIBUTE_NAMES[name];
      if (derived !== undefined) return derived;
      const row = attributeName.get(name) as { readonly attribute_id: number } | undefined;
      if (row === undefined) throw new Error(`Dogma requested unknown attribute name ${name}.`);
      return row.attribute_id;
    },
    typeRow: getType,
    typeAttributeIds: attributesFor,
  });
}

function evaluateFit(
  db: Database.Database,
  bridge: SdeBridge,
  dogma: DogmaModule,
  fit: CanonicalFitSpec,
  skills: Readonly<Record<string, number>>,
  profiles: readonly FittingProfile[],
  policy: CapacitorPolicyInput,
  missingSkills: EvaluatedFitting['missing_skills'],
): EvaluatedFitting {
  const fittingCalculation = calculateProfile(dogma, db, fit, skills, 'fitting_only');
  const violations = validateHardConstraints(db, bridge, fit, fittingCalculation, missingSkills);
  const unsupported = unsupportedMechanics(bridge, fit);
  if (unsupported.some((value) => value.startsWith('subsystem:'))) {
    violations.push(violation('UNSUPPORTED_MECHANIC', 'Subsystem fitting is not in the supported conformance matrix.',
      fit.modules.filter((module) => module.slotFamily === 'subsystem').map((module) => module.typeId)));
  }
  const metrics = fittingMetrics(db, bridge, fit, fittingCalculation);
  const capacitor = profiles.map((profile) => capacitorResult(
    db, dogma, fit, skills, profile, unsupported,
  ));
  const policySatisfied = capacitorPolicySatisfied(policy, capacitor);
  const fitHash = createHash('sha256').update(JSON.stringify(canonicalFitForHash(fit))).digest('hex');
  return Object.freeze({
    fit_hash: fitHash,
    fit_valid: violations.length === 0,
    policy_satisfied: policySatisfied,
    metrics,
    capacitor: Object.freeze(capacitor),
    violations: Object.freeze(violations),
    missing_skills: Object.freeze([...missingSkills]),
    unsupported_mechanics: Object.freeze(unsupported),
  });
}

function calculateProfile(
  dogma: DogmaModule,
  db: Database.Database,
  fit: CanonicalFitSpec,
  skills: Readonly<Record<string, number>>,
  profile: FittingProfile,
): RawCalculation {
  const propulsion = propulsionTypeIds(db, fit);
  const sustained = sustainedActiveTypeIds(db, fit);
  const modules = fit.modules.map((module) => ({
    type_id: module.typeId,
    slot: { type: engineSlot(module.slotFamily), index: module.slotIndex },
    state: engineState(profileState(
      module.state,
      profile,
      propulsion.has(module.typeId),
      sustained.has(module.typeId),
    )),
    charge: module.chargeTypeId === null ? undefined : { type_id: module.chargeTypeId },
  }));
  const drones = fit.drones.flatMap((drone) => Array.from({ length: drone.quantity }, (_unused, index) => ({
    type_id: drone.typeId,
    state: index < drone.activeQuantity && profile !== 'fitting_only' ? 'Active' : 'Passive',
  })));
  const result = dogma.calculate({ ship_type_id: fit.hullTypeId, modules, drones }, skills);
  assertFiniteCalculation(result);
  return result;
}

function profileState(
  declared: FittingModuleState,
  profile: FittingProfile,
  propulsion: boolean,
  sustained: boolean,
): FittingModuleState {
  if (profile === 'fitting_only') return 'online';
  if (profile === 'custom') return declared;
  if (propulsion) return profile === 'sustained_combat_prop_on' ? 'active' : 'online';
  if (sustained) return 'active';
  return declared;
}

function engineState(state: FittingModuleState): string {
  return `${state.slice(0, 1).toUpperCase()}${state.slice(1)}`;
}

function engineSlot(family: CanonicalFitSpec['modules'][number]['slotFamily']): string {
  const values = { high: 'High', medium: 'Medium', low: 'Low', rig: 'Rig', subsystem: 'SubSystem', service: 'Service' } as const;
  return values[family];
}

function propulsionTypeIds(db: Database.Database, fit: CanonicalFitSpec): Set<number> {
  if (fit.modules.length === 0) return new Set();
  const query = db.prepare(`
    SELECT DISTINCT te.type_id FROM sde_type_effects te
    JOIN sde_dogma_effects e ON e.effect_id = te.effect_id
    WHERE te.type_id IN (${fit.modules.map(() => '?').join(',')})
      AND (e.propulsion_chance = 1 OR e.name IN ('moduleBonusAfterburner', 'moduleBonusMicrowarpdrive', 'microJumpDrive'))
  `);
  return new Set((query.all(...fit.modules.map((module) => module.typeId)) as Array<{ type_id: number }>).map((row) => row.type_id));
}

function sustainedActiveTypeIds(db: Database.Database, fit: CanonicalFitSpec): Set<number> {
  if (fit.modules.length === 0) return new Set();
  const query = db.prepare(`
    SELECT DISTINCT te.type_id FROM sde_type_effects te
    JOIN sde_dogma_effects e ON e.effect_id = te.effect_id
    WHERE te.type_id IN (${fit.modules.map(() => '?').join(',')})
      AND e.effect_id != 16
      AND e.effect_category IN (1, 2, 3)
      AND e.discharge_attribute_id IS NOT NULL
      AND e.duration_attribute_id IS NOT NULL
  `);
  return new Set((query.all(...fit.modules.map((module) => module.typeId)) as Array<{ type_id: number }>)
    .map((row) => row.type_id));
}

function fittingMetrics(
  db: Database.Database,
  bridge: SdeBridge,
  fit: CanonicalFitSpec,
  calculation: RawCalculation,
): FittingMetrics {
  const hull = calculation.hull;
  const rigs = fit.modules.filter((module) => module.slotFamily === 'rig');
  const calibrationUsed = rigs.reduce(
    (sum, module) => sum + rawAttribute(requiredItem(calculation, indexForModule(fit, module)), 1153),
    0,
  );
  const activeDrones = fit.drones.reduce((sum, drone) => sum + drone.activeQuantity, 0);
  const droneBandwidthUsed = fit.drones.reduce(
    (sum, drone) => sum + typeAttribute(db, drone.typeId, 1272) * drone.activeQuantity, 0,
  );
  const droneBayUsed = fit.drones.reduce(
    (sum, drone) => sum + (bridge.typeRow(drone.typeId).volume ?? 0) * drone.quantity, 0,
  );
  const turretUsed = fit.modules.filter((module) => typeHasEffect(db, module.typeId, 42)).length;
  const launcherUsed = fit.modules.filter((module) => typeHasEffect(db, module.typeId, 40)).length;
  return freezeMetrics({
    cpu_used: rawAttribute(hull, 49),
    cpu_available: rawAttribute(hull, 48),
    powergrid_used: rawAttribute(hull, 15),
    powergrid_available: rawAttribute(hull, 11),
    turret_hardpoints_used: turretUsed,
    turret_hardpoints_available: rawAttribute(hull, 102),
    launcher_hardpoints_used: launcherUsed,
    launcher_hardpoints_available: rawAttribute(hull, 101),
    calibration_used: calibrationUsed,
    calibration_available: rawAttribute(hull, 1132),
    active_drones: activeDrones,
    drone_bandwidth_used: droneBandwidthUsed,
    drone_bandwidth_available: rawAttribute(hull, 1271),
    drone_bay_used: droneBayUsed,
    drone_bay_available: rawAttribute(hull, 283),
  });
}

function validateHardConstraints(
  db: Database.Database,
  bridge: SdeBridge,
  fit: CanonicalFitSpec,
  calculation: RawCalculation,
  missingSkills: EvaluatedFitting['missing_skills'],
): FittingViolation[] {
  const violations: FittingViolation[] = [];
  const hull = bridge.typeRow(fit.hullTypeId);
  if (hull.categoryID !== 6 || hull.published !== 1) {
    violations.push(violation('INVALID_HULL', 'The hull is not a published ship.', [fit.hullTypeId]));
  }
  const slotAttributes = { high: 14, medium: 13, low: 12, rig: 1137, subsystem: 1366, service: 2056 } as const;
  const slotEffects = { high: 12, medium: 13, low: 11, rig: 2663, subsystem: 3772, service: 6306 } as const;
  for (const module of fit.modules) {
    const available = typeAttribute(db, fit.hullTypeId, slotAttributes[module.slotFamily]);
    if (module.slotIndex >= available) {
      violations.push(violation('SLOT_NOT_AVAILABLE', `${formatFittingSlot(module.slotFamily, module.slotIndex)} does not exist on this hull.`, [module.typeId]));
    }
    if (!typeHasEffect(db, module.typeId, slotEffects[module.slotFamily])) {
      violations.push(violation('ITEM_SLOT_MISMATCH', 'The item does not belong in its declared slot family.', [module.typeId]));
    }
    if (module.chargeTypeId !== null) validateCharge(db, module.typeId, module.chargeTypeId, violations);
    if (module.slotFamily === 'rig') {
      const hullRigSize = typeAttribute(db, fit.hullTypeId, 1547);
      const rigSize = typeAttribute(db, module.typeId, 1547);
      if (hullRigSize > 0 && rigSize > 0 && hullRigSize !== rigSize) {
        violations.push(violation('RIG_SIZE_MISMATCH', 'The rig size does not match the hull.', [module.typeId]));
      }
    }
  }
  for (const drone of fit.drones) {
    if (bridge.typeRow(drone.typeId).categoryID !== 18) {
      violations.push(violation('INVALID_DRONE', 'A drone-bay entry is not a drone type.', [drone.typeId]));
    }
  }
  const metrics = fittingMetrics(db, bridge, fit, calculation);
  if (metrics.cpu_used > metrics.cpu_available + 1e-9) {
    violations.push(quantitativeViolation('CPU_EXCEEDED', 'CPU use exceeds character-adjusted output.', metrics.cpu_used, metrics.cpu_available, fit.modules.map((module) => module.typeId)));
  }
  if (metrics.powergrid_used > metrics.powergrid_available + 1e-9) {
    violations.push(quantitativeViolation('POWERGRID_EXCEEDED', 'Powergrid use exceeds character-adjusted output.', metrics.powergrid_used, metrics.powergrid_available, fit.modules.map((module) => module.typeId)));
  }
  if (metrics.turret_hardpoints_used > metrics.turret_hardpoints_available) {
    violations.push(quantitativeViolation('TURRET_HARDPOINTS_EXCEEDED', 'Turret hardpoints are exceeded.', metrics.turret_hardpoints_used, metrics.turret_hardpoints_available, fit.modules.filter((module) => typeHasEffect(db, module.typeId, 42)).map((module) => module.typeId)));
  }
  if (metrics.launcher_hardpoints_used > metrics.launcher_hardpoints_available) {
    violations.push(quantitativeViolation('LAUNCHER_HARDPOINTS_EXCEEDED', 'Launcher hardpoints are exceeded.', metrics.launcher_hardpoints_used, metrics.launcher_hardpoints_available, fit.modules.filter((module) => typeHasEffect(db, module.typeId, 40)).map((module) => module.typeId)));
  }
  if (metrics.calibration_used > metrics.calibration_available + 1e-9) {
    violations.push(quantitativeViolation('CALIBRATION_EXCEEDED', 'Rig calibration is exceeded.', metrics.calibration_used, metrics.calibration_available, fit.modules.filter((module) => module.slotFamily === 'rig').map((module) => module.typeId)));
  }
  const activeDroneLimit = Math.min(5, rawAttribute(calculation.hull, 352));
  if (metrics.active_drones > activeDroneLimit) {
    violations.push(quantitativeViolation('ACTIVE_DRONE_LIMIT_EXCEEDED', 'The active drone count is exceeded.', metrics.active_drones, activeDroneLimit, fit.drones.map((drone) => drone.typeId)));
  }
  if (metrics.drone_bandwidth_used > metrics.drone_bandwidth_available + 1e-9) {
    violations.push(quantitativeViolation('DRONE_BANDWIDTH_EXCEEDED', 'Active drone bandwidth is exceeded.', metrics.drone_bandwidth_used, metrics.drone_bandwidth_available, fit.drones.map((drone) => drone.typeId)));
  }
  if (metrics.drone_bay_used > metrics.drone_bay_available + 1e-9) {
    violations.push(quantitativeViolation('DRONE_BAY_EXCEEDED', 'Drone bay capacity is exceeded.', metrics.drone_bay_used, metrics.drone_bay_available, fit.drones.map((drone) => drone.typeId)));
  }
  if (missingSkills.length > 0) {
    violations.push(violation('SKILL_REQUIREMENT_UNMET', 'The active character lacks one or more required skill levels.', missingSkills.map((skill) => skill.skill_type_id)));
  }
  return violations;
}

function validateCharge(db: Database.Database, moduleTypeId: number, chargeTypeId: number, violations: FittingViolation[]): void {
  const charge = db.prepare(`
    SELECT t.group_id, g.category_id FROM sde_types t JOIN sde_groups g ON g.group_id = t.group_id
    WHERE t.type_id = ?
  `).get(chargeTypeId) as { group_id: number; category_id: number } | undefined;
  if (charge?.category_id !== 8) {
    violations.push(violation('CHARGE_INCOMPATIBLE', 'The loaded type is not a charge.', [moduleTypeId, chargeTypeId]));
    return;
  }
  const groupAttributeIds = (db.prepare(
    "SELECT attribute_id FROM sde_dogma_attributes WHERE name GLOB 'chargeGroup*' ORDER BY attribute_id",
  ).all() as Array<{ attribute_id: number }>).map((row) => row.attribute_id);
  const allowedGroups = groupAttributeIds.map((attributeId) => typeAttribute(db, moduleTypeId, attributeId)).filter((value) => value > 0);
  const moduleSize = typeAttribute(db, moduleTypeId, 128);
  const chargeSize = typeAttribute(db, chargeTypeId, 128);
  if (!allowedGroups.includes(charge.group_id) || (moduleSize > 0 && chargeSize > 0 && moduleSize !== chargeSize)) {
    violations.push(violation('CHARGE_INCOMPATIBLE', 'The charge group or size is incompatible with the module.', [moduleTypeId, chargeTypeId]));
  }
}

function capacitorResult(
  db: Database.Database,
  dogma: DogmaModule,
  fit: CanonicalFitSpec,
  skills: Readonly<Record<string, number>>,
  profile: FittingProfile,
  unsupported: readonly string[],
): CapacitorProfileResult {
  const assumptions = [profileAssumption(profile)];
  if (profile === 'fitting_only') return Object.freeze({
    profile,
    available: false,
    stable: null,
    depletes_in_seconds: null,
    capacity_gj: null,
    peak_recharge_gj_per_second: null,
    demand_gj_per_second: null,
    peak_delta_gj_per_second: null,
    module_demands: Object.freeze([]),
    assumptions: Object.freeze(assumptions),
    unsupported_mechanics: Object.freeze([]),
  });
  const activeUnsupported = unsupported.filter((entry) => entry.startsWith('capacitor:'));
  if (activeUnsupported.length > 0) return Object.freeze({
    profile,
    available: false,
    stable: null,
    depletes_in_seconds: null,
    capacity_gj: null,
    peak_recharge_gj_per_second: null,
    demand_gj_per_second: null,
    peak_delta_gj_per_second: null,
    module_demands: Object.freeze([]),
    assumptions: Object.freeze(assumptions),
    unsupported_mechanics: Object.freeze(activeUnsupported),
  });
  const calculation = calculateProfile(dogma, db, fit, skills, profile);
  const capacity = nullableRawAttribute(calculation.hull, 482);
  const recharge = nullableRawAttribute(calculation.hull, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge);
  const demand = nullableRawAttribute(calculation.hull, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad) ?? 0;
  const delta = nullableRawAttribute(calculation.hull, DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta);
  const depletes = nullableRawAttribute(calculation.hull, DERIVED_ATTRIBUTE_IDS.capacitorDepletesIn);
  if (capacity === null || recharge === null || delta === null || (delta < 0 && depletes === null)) {
    return Object.freeze({
      profile, available: false, stable: null, depletes_in_seconds: null,
      capacity_gj: capacity, peak_recharge_gj_per_second: recharge,
      demand_gj_per_second: demand, peak_delta_gj_per_second: delta,
      module_demands: Object.freeze([]), assumptions: Object.freeze(assumptions),
      unsupported_mechanics: Object.freeze(['capacitor:required-engine-output-missing']),
    });
  }
  const stable = delta >= 0 || (depletes !== null && depletes < 0);
  const moduleDemands = fit.modules.flatMap((module, index) => {
    const value = nullableRawAttribute(requiredItem(calculation, index), DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad);
    return value === null || value <= 0 ? [] : [{
      type_id: module.typeId,
      slot: formatFittingSlot(module.slotFamily, module.slotIndex),
      gj_per_second: value,
    }];
  }).slice(0, 64);
  return Object.freeze({
    profile,
    available: true,
    stable,
    depletes_in_seconds: stable || depletes === null ? null : Math.max(0, depletes),
    capacity_gj: capacity,
    peak_recharge_gj_per_second: recharge,
    demand_gj_per_second: demand,
    peak_delta_gj_per_second: delta,
    module_demands: Object.freeze(moduleDemands),
    assumptions: Object.freeze(assumptions),
    unsupported_mechanics: Object.freeze([]),
  });
}

function unsupportedMechanics(bridge: SdeBridge, fit: CanonicalFitSpec): string[] {
  const unsupported = new Set<string>();
  for (const module of fit.modules) {
    if (module.slotFamily === 'subsystem') unsupported.add(`subsystem:${String(module.typeId)}`);
    if (bridge.typeAttributeIds(module.typeId).has(67)) unsupported.add(`capacitor:injection-or-ancillary:${String(module.typeId)}`);
  }
  return [...unsupported].sort();
}

function capacitorPolicySatisfied(policy: CapacitorPolicyInput, results: readonly CapacitorProfileResult[]): boolean {
  if (policy.mode === 'report_only') return true;
  const result = results.find((candidate) => candidate.profile === policy.profile);
  if (result?.available !== true || result.stable === null) return false;
  if (policy.mode === 'require_stable') return result.stable;
  return result.stable || (result.depletes_in_seconds !== null && result.depletes_in_seconds >= policy.seconds);
}

function profileAssumption(profile: FittingProfile): string {
  switch (profile) {
    case 'fitting_only': return 'All fitted modules are online; no modules cycle.';
    case 'sustained_combat_prop_off': return 'Declared active modules cycle continuously; propulsion effects are online but not active.';
    case 'sustained_combat_prop_on': return 'Declared active modules and propulsion effects cycle continuously.';
    case 'custom': return 'Every module uses its exact caller-declared state.';
  }
}

function typeAttribute(db: Database.Database, typeId: number, attributeId: number): number {
  const row = db.prepare(
    'SELECT value FROM sde_type_attributes WHERE type_id = ? AND attribute_id = ?',
  ).get(typeId, attributeId) as { readonly value: number } | undefined;
  return row?.value ?? 0;
}

function typeHasEffect(db: Database.Database, typeId: number, effectId: number): boolean {
  return db.prepare('SELECT 1 FROM sde_type_effects WHERE type_id = ? AND effect_id = ?')
    .get(typeId, effectId) !== undefined;
}

function rawAttribute(item: RawItem, attributeId: number): number {
  return nullableRawAttribute(item, attributeId) ?? 0;
}

function nullableRawAttribute(item: RawItem, attributeId: number): number | null {
  const attribute = item.attributes.get(attributeId);
  const value = attribute?.value ?? attribute?.base_value;
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function indexForModule(fit: CanonicalFitSpec, target: CanonicalFitSpec['modules'][number]): number {
  return fit.modules.findIndex((module) => module === target);
}

function requiredItem(calculation: RawCalculation, index: number): RawItem {
  const item = calculation.items[index];
  if (item === undefined) throw new Error('The Dogma engine omitted a fitted item result.');
  return item;
}

function assertFiniteCalculation(calculation: RawCalculation): void {
  if (!(calculation.hull.attributes instanceof Map)
    || Object.prototype.toString.call(calculation.items) !== '[object Array]') {
    throw new Error('The Dogma engine returned an unexpected result shape.');
  }
  assertFiniteItem(calculation.hull);
  for (const item of calculation.items) assertFiniteItem(item);
}

function assertFiniteItem(item: RawItem): void {
  for (const attribute of item.attributes.values()) {
    const value = attribute.value ?? attribute.base_value;
    if (!Number.isFinite(value)) throw new Error('The Dogma engine returned a non-finite attribute.');
  }
}

function violation(code: string, message: string, affectedTypeIds: readonly number[]): FittingViolation {
  return Object.freeze({ code, message, affected_type_ids: Object.freeze([...new Set(affectedTypeIds)]) });
}

function quantitativeViolation(
  code: string,
  message: string,
  used: number,
  available: number,
  affectedTypeIds: readonly number[],
): FittingViolation {
  return Object.freeze({
    code,
    message,
    used,
    available,
    exceeded_by: used - available,
    affected_type_ids: Object.freeze([...new Set(affectedTypeIds)]),
  });
}

function freezeMetrics(metrics: FittingMetrics): FittingMetrics {
  for (const value of Object.values(metrics)) {
    if (!Number.isFinite(value)) throw new Error('A normalized fitting metric is non-finite.');
  }
  return Object.freeze(metrics);
}
