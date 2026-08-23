import { z } from 'zod';
import { resultEnvelopeSchema } from './common.js';

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const slot = z.string().regex(/^(?:Hi|Med|Lo|Rig|SubSystem|Service)Slot[0-7]$/u);
const moduleState = z.enum(['passive', 'online', 'active', 'overload']);
const profile = z.enum([
  'fitting_only',
  'sustained_combat_prop_off',
  'sustained_combat_prop_on',
  'custom',
]);
const activeProfile = z.enum(['sustained_combat_prop_off', 'sustained_combat_prop_on', 'custom']);

const structuredFitSchema = z.object({
  hull_type_id: positiveId,
  modules: z.array(z.object({
    type_id: positiveId,
    slot,
    state: moduleState,
    charge_type_id: positiveId.optional(),
  }).strict()).max(64),
  drones: z.array(z.object({
    type_id: positiveId,
    quantity: z.number().int().min(1).max(128),
    active_quantity: z.number().int().min(0).max(128),
  }).strict()).max(64),
  cargo: z.array(z.object({
    type_id: positiveId,
    quantity: z.number().int().min(1).max(128),
  }).strict()).max(64).optional(),
}).strict();

const baselineSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('current_ship') }).strict(),
  z.object({ source: z.literal('owned_ship_item_id'), item_id: positiveId }).strict(),
  z.object({ source: z.literal('fitting_id'), fitting_id: positiveId }).strict(),
  z.object({ source: z.literal('eft'), eft: z.string().min(1).max(32_768) }).strict(),
  z.object({ source: z.literal('structured'), fit: structuredFitSchema }).strict(),
]);

const changeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), slot, type_id: positiveId, state: moduleState.optional(), charge_type_id: positiveId.optional() }).strict(),
  z.object({ action: z.literal('replace'), slot, type_id: positiveId, state: moduleState.optional(), charge_type_id: positiveId.optional() }).strict(),
  z.object({ action: z.literal('remove'), slot }).strict(),
  z.object({ action: z.literal('set_state'), slot, state: moduleState }).strict(),
  z.object({ action: z.literal('load_charge'), slot, charge_type_id: positiveId.nullable() }).strict(),
  z.object({
    action: z.literal('set_drone'),
    type_id: positiveId,
    quantity: z.number().int().min(0).max(128),
    active_quantity: z.number().int().min(0).max(128),
  }).strict(),
]);

const candidateSchema = z.object({
  candidate_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  fit: structuredFitSchema.optional(),
  changes: z.array(changeSchema).max(64).optional(),
}).strict().refine((value) => (value.fit === undefined) !== (value.changes === undefined), {
  message: 'Provide exactly one candidate fit or changes list.',
});

const capacitorPolicySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('report_only') }).strict(),
  z.object({ mode: z.literal('require_stable'), profile: activeProfile }).strict(),
  z.object({
    mode: z.literal('minimum_duration'),
    profile: activeProfile,
    seconds: z.number().positive().max(86_400),
  }).strict(),
]);

export const analyzeFittingChangesInputSchema = z.object({
  baseline: baselineSchema,
  candidates: z.array(candidateSchema).max(5),
  profiles: z.array(profile).min(1).max(4).refine((values) => new Set(values).size === values.length, {
    message: 'Operating profiles must be unique.',
  }),
  capacitor_policy: capacitorPolicySchema,
}).strict();

const violationSchema = z.object({
  code: z.string(),
  message: z.string(),
  used: z.number().optional(),
  available: z.number().optional(),
  exceeded_by: z.number().optional(),
  affected_type_ids: z.array(positiveId),
}).strict();

const metricsSchema = z.object({
  cpu_used: z.number(), cpu_available: z.number(),
  powergrid_used: z.number(), powergrid_available: z.number(),
  turret_hardpoints_used: z.number(), turret_hardpoints_available: z.number(),
  launcher_hardpoints_used: z.number(), launcher_hardpoints_available: z.number(),
  calibration_used: z.number(), calibration_available: z.number(),
  active_drones: z.number(),
  drone_bandwidth_used: z.number(), drone_bandwidth_available: z.number(),
  drone_bay_used: z.number(), drone_bay_available: z.number(),
}).strict();

const capacitorSchema = z.object({
  profile,
  available: z.boolean(),
  stable: z.boolean().nullable(),
  depletes_in_seconds: z.number().nullable(),
  capacity_gj: z.number().nullable(),
  peak_recharge_gj_per_second: z.number().nullable(),
  demand_gj_per_second: z.number().nullable(),
  peak_delta_gj_per_second: z.number().nullable(),
  module_demands: z.array(z.object({ type_id: positiveId, slot: z.string(), gj_per_second: z.number() }).strict()).max(64),
  assumptions: z.array(z.string()),
  unsupported_mechanics: z.array(z.string()),
}).strict();

const evaluatedSchema = z.object({
  fit_hash: z.string().length(64),
  fit_valid: z.boolean(),
  policy_satisfied: z.boolean(),
  metrics: metricsSchema,
  capacitor: z.array(capacitorSchema).max(4),
  violations: z.array(violationSchema),
  missing_skills: z.array(z.object({
    skill_type_id: positiveId,
    skill_name: z.string(),
    required_level: z.number().int().min(1).max(5),
    active_level: z.number().int().min(0).max(5),
  }).strict()),
  unsupported_mechanics: z.array(z.string()),
}).strict();

const deltaSchema = z.object({
  cpu_used: z.number(), cpu_available: z.number(),
  powergrid_used: z.number(), powergrid_available: z.number(),
  capacitor_transitions: z.array(z.object({
    profile,
    baseline_state: z.enum(['stable', 'unstable', 'unavailable']),
    candidate_state: z.enum(['stable', 'unstable', 'unavailable']),
    depletion_seconds_delta: z.number().nullable(),
  }).strict()).max(4),
}).strict();

export const analyzeFittingChangesOutputSchema = resultEnvelopeSchema(z.object({
    baseline: evaluatedSchema,
    candidates: z.array(evaluatedSchema.extend({ candidate_id: z.string(), delta: deltaSchema })).max(5),
    assumptions: z.array(z.string()),
    unsupported_mechanics: z.array(z.string()),
    provenance: z.object({
      sde_build: positiveId,
      sde_release_date: z.string(),
      sde_importer_version: z.number().int(),
      fitting_data_contract_version: z.number().int(),
      dogma_repository: z.string(),
      dogma_commit: z.string(),
      dogma_wasm_sha256: z.string().length(64),
      adapter_version: z.number().int(),
      conformance_matrix_version: z.number().int(),
      calculation_duration_ms: z.number().nonnegative(),
      skill_retrieved_at: z.string(),
    }).strict(),
  }).strict());
