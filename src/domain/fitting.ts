import { AppError } from './errors.js';

export type FittingSlotFamily = 'high' | 'medium' | 'low' | 'rig' | 'subsystem' | 'service';
export type FittingModuleState = 'passive' | 'online' | 'active' | 'overload';

export interface StructuredFittingModuleInput {
  readonly type_id: number;
  readonly slot: string;
  readonly state: FittingModuleState;
  readonly charge_type_id?: number;
}

export interface StructuredFittingInput {
  readonly hull_type_id: number;
  readonly modules: readonly StructuredFittingModuleInput[];
  readonly drones: ReadonlyArray<{
    readonly type_id: number;
    readonly quantity: number;
    readonly active_quantity: number;
  }>;
  readonly cargo?: ReadonlyArray<{ readonly type_id: number; readonly quantity: number }>;
}

export type FittingChangeInput =
  | { readonly action: 'add' | 'replace'; readonly slot: string; readonly type_id: number; readonly state?: FittingModuleState; readonly charge_type_id?: number }
  | { readonly action: 'remove'; readonly slot: string }
  | { readonly action: 'set_state'; readonly slot: string; readonly state: FittingModuleState }
  | { readonly action: 'load_charge'; readonly slot: string; readonly charge_type_id: number | null }
  | { readonly action: 'set_drone'; readonly type_id: number; readonly quantity: number; readonly active_quantity: number };

export interface FittingCandidateInput {
  readonly candidate_id: string;
  readonly fit?: StructuredFittingInput;
  readonly changes?: readonly FittingChangeInput[];
}

export interface CanonicalFittingModule {
  readonly typeId: number;
  readonly slotFamily: FittingSlotFamily;
  readonly slotIndex: number;
  readonly state: FittingModuleState;
  readonly chargeTypeId: number | null;
  readonly itemId: number | null;
}

export interface CanonicalFitSpec {
  readonly hullTypeId: number;
  readonly ownedItemId: number | null;
  readonly modules: readonly CanonicalFittingModule[];
  readonly drones: ReadonlyArray<{ readonly typeId: number; readonly quantity: number; readonly activeQuantity: number }>;
  readonly cargo: ReadonlyArray<{ readonly typeId: number; readonly quantity: number }>;
  readonly source: 'current_ship' | 'owned_ship_item_id' | 'fitting_id' | 'eft' | 'structured' | 'candidate';
}

export const MAX_FITTING_ENTRIES = 128;
export const MAX_FITTING_CANDIDATES = 5;
export const MAX_FITTING_CHANGES = 64;

const SLOT_PATTERN = /^(Hi|Med|Lo|Rig|SubSystem|Service)Slot([0-7])$/u;

const SLOT_FAMILIES: Readonly<Record<string, FittingSlotFamily>> = Object.freeze({
  Hi: 'high',
  Med: 'medium',
  Lo: 'low',
  Rig: 'rig',
  SubSystem: 'subsystem',
  Service: 'service',
});

export function parseFittingSlot(value: string): { readonly family: FittingSlotFamily; readonly index: number } {
  const match = SLOT_PATTERN.exec(value);
  const family = match?.[1] === undefined ? undefined : SLOT_FAMILIES[match[1]];
  const index = Number(match?.[2]);
  if (family === undefined || !Number.isSafeInteger(index)) {
    throw ambiguous('Every fitted module must use an exact EVE slot such as HiSlot0 or MedSlot2.');
  }
  return Object.freeze({ family, index });
}

export function formatFittingSlot(family: FittingSlotFamily, index: number): string {
  const prefix: Readonly<Record<FittingSlotFamily, string>> = {
    high: 'Hi', medium: 'Med', low: 'Lo', rig: 'Rig', subsystem: 'SubSystem', service: 'Service',
  };
  return `${prefix[family]}Slot${String(index)}`;
}

export function canonicalizeStructuredFit(
  fit: StructuredFittingInput,
  source: CanonicalFitSpec['source'] = 'structured',
): CanonicalFitSpec {
  positiveId(fit.hull_type_id, 'hull_type_id');
  const modules = fit.modules.map((module) => {
    positiveId(module.type_id, 'module.type_id');
    if (module.charge_type_id !== undefined) positiveId(module.charge_type_id, 'module.charge_type_id');
    const slot = parseFittingSlot(module.slot);
    return Object.freeze({
      typeId: module.type_id,
      slotFamily: slot.family,
      slotIndex: slot.index,
      state: module.state,
      chargeTypeId: module.charge_type_id ?? null,
      itemId: null,
    });
  });
  assertUniqueSlots(modules);
  const drones = fit.drones.map((drone) => {
    positiveId(drone.type_id, 'drone.type_id');
    boundedQuantity(drone.quantity, 'drone.quantity');
    if (!Number.isSafeInteger(drone.active_quantity) || drone.active_quantity < 0 || drone.active_quantity > drone.quantity) {
      throw ambiguous('Active drone quantity must be between zero and the carried quantity.');
    }
    return Object.freeze({ typeId: drone.type_id, quantity: drone.quantity, activeQuantity: drone.active_quantity });
  });
  const cargo = (fit.cargo ?? []).map((item) => {
    positiveId(item.type_id, 'cargo.type_id');
    boundedQuantity(item.quantity, 'cargo.quantity');
    return Object.freeze({ typeId: item.type_id, quantity: item.quantity });
  });
  assertEntryBound(modules, drones, cargo);
  return Object.freeze({
    hullTypeId: fit.hull_type_id,
    ownedItemId: null,
    modules: Object.freeze(modules),
    drones: Object.freeze(drones),
    cargo: Object.freeze(cargo),
    source,
  });
}

export function applyCandidate(base: CanonicalFitSpec, candidate: FittingCandidateInput): CanonicalFitSpec {
  if ((candidate.fit === undefined) === (candidate.changes === undefined)) {
    throw ambiguous('Each candidate must provide exactly one complete fit or one changes list.');
  }
  if (candidate.fit !== undefined) return canonicalizeStructuredFit(candidate.fit, 'candidate');
  const changes = candidate.changes ?? [];
  if (changes.length > MAX_FITTING_CHANGES) throw ambiguous('A fitting candidate contains too many changes.');
  let modules = [...base.modules];
  let drones = [...base.drones];
  for (const change of changes) {
    ({ modules, drones } = applyChange(modules, drones, change));
  }
  assertUniqueSlots(modules);
  assertEntryBound(modules, drones, base.cargo);
  return Object.freeze({
    ...base,
    ownedItemId: null,
    modules: Object.freeze(modules),
    drones: Object.freeze(drones),
    source: 'candidate',
  });
}

export function canonicalFitForHash(fit: CanonicalFitSpec): object {
  return {
    hull_type_id: fit.hullTypeId,
    modules: [...fit.modules]
      .sort(compareModules)
      .map((module) => ({
        type_id: module.typeId,
        slot: formatFittingSlot(module.slotFamily, module.slotIndex),
        state: module.state,
        charge_type_id: module.chargeTypeId,
      })),
    drones: [...fit.drones]
      .sort((left, right) => left.typeId - right.typeId)
      .map((drone) => ({ type_id: drone.typeId, quantity: drone.quantity, active_quantity: drone.activeQuantity })),
    cargo: [...fit.cargo]
      .sort((left, right) => left.typeId - right.typeId)
      .map((item) => ({ type_id: item.typeId, quantity: item.quantity })),
  };
}

export function assertUniqueSlots(modules: readonly CanonicalFittingModule[]): void {
  const seen = new Set<string>();
  for (const module of modules) {
    const slot = formatFittingSlot(module.slotFamily, module.slotIndex);
    if (seen.has(slot)) throw ambiguous(`The fitting uses ${slot} more than once.`);
    seen.add(slot);
  }
}

function applyChange(
  currentModules: CanonicalFittingModule[],
  currentDrones: Array<CanonicalFitSpec['drones'][number]>,
  change: FittingChangeInput,
): { modules: CanonicalFittingModule[]; drones: Array<CanonicalFitSpec['drones'][number]> } {
  if (change.action === 'set_drone') {
    positiveId(change.type_id, 'change.type_id');
    boundedQuantity(change.quantity, 'change.quantity', true);
    if (!Number.isSafeInteger(change.active_quantity) || change.active_quantity < 0 || change.active_quantity > change.quantity) {
      throw ambiguous('Active drone quantity must be between zero and the carried quantity.');
    }
    const drones = currentDrones.filter((drone) => drone.typeId !== change.type_id);
    if (change.quantity > 0) drones.push(Object.freeze({
      typeId: change.type_id,
      quantity: change.quantity,
      activeQuantity: change.active_quantity,
    }));
    return { modules: currentModules, drones };
  }
  const slot = parseFittingSlot(change.slot);
  const index = currentModules.findIndex(
    (module) => module.slotFamily === slot.family && module.slotIndex === slot.index,
  );
  if (change.action === 'remove') {
    if (index < 0) throw ambiguous(`There is no fitted item in ${change.slot} to remove.`);
    return { modules: currentModules.filter((_module, moduleIndex) => moduleIndex !== index), drones: currentDrones };
  }
  if (change.action === 'set_state') {
    if (index < 0) throw ambiguous(`There is no fitted item in ${change.slot} whose state can change.`);
    const current = currentModules[index];
    if (current === undefined) throw ambiguous(`There is no fitted item in ${change.slot} whose state can change.`);
    return { modules: replaceAt(currentModules, index, { ...current, state: change.state }), drones: currentDrones };
  }
  if (change.action === 'load_charge') {
    if (index < 0) throw ambiguous(`There is no fitted item in ${change.slot} that can receive a charge.`);
    if (change.charge_type_id !== null) positiveId(change.charge_type_id, 'change.charge_type_id');
    const current = currentModules[index];
    if (current === undefined) throw ambiguous(`There is no fitted item in ${change.slot} that can receive a charge.`);
    return { modules: replaceAt(currentModules, index, { ...current, chargeTypeId: change.charge_type_id }), drones: currentDrones };
  }
  positiveId(change.type_id, 'change.type_id');
  if (change.charge_type_id !== undefined) positiveId(change.charge_type_id, 'change.charge_type_id');
  if (change.action === 'add' && index >= 0) throw ambiguous(`${change.slot} is occupied; use replace instead of add.`);
  if (change.action === 'replace' && index < 0) throw ambiguous(`${change.slot} is empty; use add instead of replace.`);
  const module: CanonicalFittingModule = Object.freeze({
    typeId: change.type_id,
    slotFamily: slot.family,
    slotIndex: slot.index,
    state: change.state ?? 'online',
    chargeTypeId: change.charge_type_id ?? null,
    itemId: null,
  });
  return {
    modules: index < 0 ? [...currentModules, module] : replaceAt(currentModules, index, module),
    drones: currentDrones,
  };
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current);
}

function compareModules(left: CanonicalFittingModule, right: CanonicalFittingModule): number {
  return formatFittingSlot(left.slotFamily, left.slotIndex)
    .localeCompare(formatFittingSlot(right.slotFamily, right.slotIndex));
}

function assertEntryBound(
  modules: readonly CanonicalFittingModule[],
  drones: CanonicalFitSpec['drones'],
  cargo: CanonicalFitSpec['cargo'],
): void {
  const count = modules.length
    + drones.reduce((sum, drone) => sum + drone.quantity, 0)
    + cargo.length;
  if (count > MAX_FITTING_ENTRIES) throw ambiguous('The fitting contains more than 128 bounded entries.');
}

function positiveId(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw ambiguous(`${field} must be a positive canonical EVE ID.`);
}

function boundedQuantity(value: number, field: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_FITTING_ENTRIES) {
    throw ambiguous(`${field} is outside the fitting request bound.`);
  }
}

function ambiguous(message: string): AppError {
  return new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: message });
}
