interface DerivedAttribute {
  readonly defaultValue: number;
  readonly highIsGood: boolean;
  readonly stackable: boolean;
}

interface DerivedModifier {
  readonly domain: number;
  readonly func: number;
  readonly modifiedAttributeID: number;
  readonly modifyingAttributeID: number;
  readonly operation: number;
}

export interface DerivedEffect {
  readonly effectCategory: number;
  readonly electronicChance: false;
  readonly isAssistance: false;
  readonly isOffensive: false;
  readonly isWarpSafe: true;
  readonly propulsionChance: false;
  readonly rangeChance: false;
  readonly modifierInfo: readonly DerivedModifier[];
}

export const DERIVED_ATTRIBUTE_IDS = Object.freeze({
  thousand: -1001,
  cpuFree: -1002,
  powerFree: -1003,
  capacitorPeakRecharge: -1004,
  cycleTime: -1005,
  capacitorPeakLoad: -1006,
  capacitorPeakDelta: -1007,
  capacitorPeakDeltaPercentage: -1008,
  capacitorDepletesIn: -1009,
  droneActive: -1010,
  droneUsage: -1011,
});

export const DERIVED_EFFECT_IDS = Object.freeze({
  cpuPowerLoad: -2001,
  cpuPowerFree: -2002,
  capacitorPeakRecharge: -2003,
  cycleTimeDuration: -2004,
  cycleTimeDurationHighIsGood: -2005,
  cycleTimeSpeed: -2006,
  cycleTimeReactivation: -2007,
  capacitorPeakLoad: -2008,
  capacitorPeakDelta: -2009,
  droneActive: -2010,
});

export const DERIVED_ATTRIBUTES: ReadonlyMap<number, DerivedAttribute> = new Map([
  [DERIVED_ATTRIBUTE_IDS.thousand, { defaultValue: 1000, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.cpuFree, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.powerFree, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, { defaultValue: 2.5, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.cycleTime, { defaultValue: 0, highIsGood: false, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.capacitorPeakDeltaPercentage, { defaultValue: 100, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.capacitorDepletesIn, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.droneActive, { defaultValue: 0, highIsGood: true, stackable: true }],
  [DERIVED_ATTRIBUTE_IDS.droneUsage, { defaultValue: 1, highIsGood: true, stackable: true }],
]);

const modifier = (
  domain: number,
  modifiedAttributeID: number,
  modifyingAttributeID: number,
  operation: number,
): DerivedModifier => Object.freeze({ domain, func: 0, modifiedAttributeID, modifyingAttributeID, operation });

const effect = (effectCategory: number, modifierInfo: readonly DerivedModifier[]): DerivedEffect => Object.freeze({
  effectCategory,
  electronicChance: false,
  isAssistance: false,
  isOffensive: false,
  isWarpSafe: true,
  propulsionChance: false,
  rangeChance: false,
  modifierInfo: Object.freeze(modifierInfo),
});

export const DERIVED_EFFECTS: ReadonlyMap<number, DerivedEffect> = new Map([
  [DERIVED_EFFECT_IDS.cpuPowerLoad, effect(4, [
    modifier(1, 49, 50, 2),
    modifier(1, 15, 30, 2),
  ])],
  [DERIVED_EFFECT_IDS.cpuPowerFree, effect(0, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.cpuFree, 48, -1),
    modifier(0, DERIVED_ATTRIBUTE_IDS.cpuFree, 49, 3),
    modifier(0, DERIVED_ATTRIBUTE_IDS.powerFree, 11, -1),
    modifier(0, DERIVED_ATTRIBUTE_IDS.powerFree, 15, 3),
  ])],
  [DERIVED_EFFECT_IDS.capacitorPeakRecharge, effect(0, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, 482, 4),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, 55, 5),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, DERIVED_ATTRIBUTE_IDS.thousand, 4),
  ])],
  [DERIVED_EFFECT_IDS.cycleTimeDuration, effect(1, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.cycleTime, 73, 2),
  ])],
  [DERIVED_EFFECT_IDS.cycleTimeDurationHighIsGood, effect(1, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.cycleTime, 3115, 2),
  ])],
  [DERIVED_EFFECT_IDS.cycleTimeSpeed, effect(1, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.cycleTime, 51, 2),
  ])],
  [DERIVED_EFFECT_IDS.cycleTimeReactivation, effect(1, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.cycleTime, 669, 2),
  ])],
  [DERIVED_EFFECT_IDS.capacitorPeakLoad, effect(1, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, 6, -1),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, DERIVED_ATTRIBUTE_IDS.cycleTime, 5),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, DERIVED_ATTRIBUTE_IDS.thousand, 4),
    modifier(1, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, 2),
  ])],
  [DERIVED_EFFECT_IDS.capacitorPeakDelta, effect(0, [
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, -1),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta, DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad, 3),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakDeltaPercentage, DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta, 4),
    modifier(0, DERIVED_ATTRIBUTE_IDS.capacitorPeakDeltaPercentage, DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge, 5),
  ])],
  [DERIVED_EFFECT_IDS.droneActive, effect(1, [
    modifier(1, DERIVED_ATTRIBUTE_IDS.droneActive, DERIVED_ATTRIBUTE_IDS.droneUsage, 2),
    modifier(1, 1273, 1272, 2),
  ])],
]);

export const DERIVED_ATTRIBUTE_NAMES: Readonly<Record<string, number>> = Object.freeze({
  thousand: DERIVED_ATTRIBUTE_IDS.thousand,
  cpuFree: DERIVED_ATTRIBUTE_IDS.cpuFree,
  powerFree: DERIVED_ATTRIBUTE_IDS.powerFree,
  capacitorPeakRecharge: DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge,
  cycleTime: DERIVED_ATTRIBUTE_IDS.cycleTime,
  capacitorPeakLoad: DERIVED_ATTRIBUTE_IDS.capacitorPeakLoad,
  capacitorPeakDelta: DERIVED_ATTRIBUTE_IDS.capacitorPeakDelta,
  capacitorPeakDeltaPercentage: DERIVED_ATTRIBUTE_IDS.capacitorPeakDeltaPercentage,
  capacitorDepletesIn: DERIVED_ATTRIBUTE_IDS.capacitorDepletesIn,
  droneActive: DERIVED_ATTRIBUTE_IDS.droneActive,
  droneUsage: DERIVED_ATTRIBUTE_IDS.droneUsage,
});
