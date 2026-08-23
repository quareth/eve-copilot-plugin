import { z } from 'zod';

export const localizedNameSchema = z.object({ en: z.string().min(1).max(1024) }).loose();

export const keyedNameSchema = z.object({
  _key: z.number().int().positive(),
  name: localizedNameSchema,
}).loose();

export const categorySchema = z.object({
  _key: z.number().int().nonnegative(),
  name: localizedNameSchema,
  published: z.boolean(),
}).loose();

export const groupSchema = categorySchema.extend({ categoryID: z.number().int().nonnegative() });

export const marketGroupSchema = z.object({
  _key: z.number().int().positive(),
  name: localizedNameSchema,
  parentGroupID: z.number().int().positive().optional(),
}).loose();

export const typeSchema = z.object({
  _key: z.number().int().nonnegative(),
  name: localizedNameSchema,
  groupID: z.number().int().nonnegative(),
  marketGroupID: z.number().int().positive().optional(),
  published: z.boolean(),
  capacity: z.number().nonnegative().optional(),
  mass: z.number().nonnegative().optional(),
  radius: z.number().nonnegative().optional(),
  volume: z.number().nonnegative().optional(),
}).loose();

export const dogmaAttributeSchema = z.object({
  _key: z.number().int().nonnegative(),
  name: z.string().min(1).max(1024),
  defaultValue: z.number(),
  highIsGood: z.boolean(),
  stackable: z.boolean(),
}).loose();

const dogmaModifierSchema = z.object({
  domain: z.enum(['itemID', 'shipID', 'charID', 'otherID', 'structureID', 'target', 'targetID']),
  func: z.enum([
    'ItemModifier',
    'LocationGroupModifier',
    'LocationModifier',
    'LocationRequiredSkillModifier',
    'OwnerRequiredSkillModifier',
    'EffectStopper',
  ]),
  modifiedAttributeID: z.number().int().optional(),
  modifyingAttributeID: z.number().int().optional(),
  operation: z.number().int().min(-1).max(9).optional(),
  groupID: z.number().int().nonnegative().optional(),
  skillTypeID: z.number().int().min(-1).optional(),
  effectID: z.number().int().nonnegative().optional(),
}).strict();

export const dogmaEffectSchema = z.object({
  _key: z.number().int().nonnegative(),
  name: z.string().min(1).max(1024),
  effectCategoryID: z.number().int().min(0).max(7),
  electronicChance: z.boolean(),
  isAssistance: z.boolean(),
  isOffensive: z.boolean(),
  isWarpSafe: z.boolean(),
  propulsionChance: z.boolean(),
  rangeChance: z.boolean(),
  dischargeAttributeID: z.number().int().optional(),
  durationAttributeID: z.number().int().optional(),
  rangeAttributeID: z.number().int().optional(),
  falloffAttributeID: z.number().int().optional(),
  trackingSpeedAttributeID: z.number().int().optional(),
  fittingUsageChanceAttributeID: z.number().int().optional(),
  resistanceAttributeID: z.number().int().optional(),
  modifierInfo: z.array(dogmaModifierSchema).max(1_000).optional(),
}).loose();

export const typeDogmaSchema = z.object({
  _key: z.number().int().nonnegative(),
  dogmaAttributes: z.array(z.object({
    attributeID: z.number().int().nonnegative(),
    value: z.number(),
  }).strict()).max(10_000),
  dogmaEffects: z.array(z.object({
    effectID: z.number().int().nonnegative(),
    isDefault: z.boolean(),
  }).strict()).max(10_000).optional(),
}).loose();

const blueprintPartSchema = z.object({
  typeID: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
}).loose();

const blueprintActivitySchema = z.object({
  time: z.number().int().nonnegative().optional(),
  materials: z.array(blueprintPartSchema).max(10_000).optional(),
  products: z.array(blueprintPartSchema).max(10_000).optional(),
}).loose();

export const blueprintSchema = z.object({
  blueprintTypeID: z.number().int().positive(),
  maxProductionLimit: z.number().int().nonnegative().optional(),
  activities: z.record(z.string().min(1).max(64), blueprintActivitySchema),
}).loose();

export const stargateSchema = z.object({
  _key: z.number().int().positive(),
  solarSystemID: z.number().int().positive(),
  destination: z.object({
    stargateID: z.number().int().positive(),
    solarSystemID: z.number().int().positive(),
  }).loose(),
}).loose();
