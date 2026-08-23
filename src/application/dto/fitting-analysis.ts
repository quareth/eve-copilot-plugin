import type { ResultEnvelope } from '../../domain/result.js';
import type {
  FittingCandidateInput,
  StructuredFittingInput,
} from '../../domain/fitting.js';
export type {
  CanonicalFitSpec,
  CanonicalFittingModule,
  FittingCandidateInput,
  FittingChangeInput,
  FittingModuleState,
  FittingSlotFamily,
  StructuredFittingInput,
  StructuredFittingModuleInput,
} from '../../domain/fitting.js';

export type FittingProfile =
  | 'fitting_only'
  | 'sustained_combat_prop_off'
  | 'sustained_combat_prop_on'
  | 'custom';

export type FittingBaselineInput =
  | { readonly source: 'current_ship' }
  | { readonly source: 'owned_ship_item_id'; readonly item_id: number }
  | { readonly source: 'fitting_id'; readonly fitting_id: number }
  | { readonly source: 'eft'; readonly eft: string }
  | { readonly source: 'structured'; readonly fit: StructuredFittingInput };

export type CapacitorPolicyInput =
  | { readonly mode: 'report_only' }
  | { readonly mode: 'require_stable'; readonly profile: Exclude<FittingProfile, 'fitting_only'> }
  | { readonly mode: 'minimum_duration'; readonly profile: Exclude<FittingProfile, 'fitting_only'>; readonly seconds: number };

export interface AnalyzeFittingChangesInput {
  readonly baseline: FittingBaselineInput;
  readonly candidates: readonly FittingCandidateInput[];
  readonly profiles: readonly FittingProfile[];
  readonly capacitor_policy: CapacitorPolicyInput;
}

export interface FittingViolation {
  readonly code: string;
  readonly message: string;
  readonly used?: number;
  readonly available?: number;
  readonly exceeded_by?: number;
  readonly affected_type_ids: readonly number[];
}

export interface FittingMetrics {
  readonly cpu_used: number;
  readonly cpu_available: number;
  readonly powergrid_used: number;
  readonly powergrid_available: number;
  readonly turret_hardpoints_used: number;
  readonly turret_hardpoints_available: number;
  readonly launcher_hardpoints_used: number;
  readonly launcher_hardpoints_available: number;
  readonly calibration_used: number;
  readonly calibration_available: number;
  readonly active_drones: number;
  readonly drone_bandwidth_used: number;
  readonly drone_bandwidth_available: number;
  readonly drone_bay_used: number;
  readonly drone_bay_available: number;
}

export interface CapacitorProfileResult {
  readonly profile: FittingProfile;
  readonly available: boolean;
  readonly stable: boolean | null;
  readonly depletes_in_seconds: number | null;
  readonly capacity_gj: number | null;
  readonly peak_recharge_gj_per_second: number | null;
  readonly demand_gj_per_second: number | null;
  readonly peak_delta_gj_per_second: number | null;
  readonly module_demands: ReadonlyArray<{ readonly type_id: number; readonly slot: string; readonly gj_per_second: number }>;
  readonly assumptions: readonly string[];
  readonly unsupported_mechanics: readonly string[];
}

export interface EvaluatedFitting {
  readonly fit_hash: string;
  readonly fit_valid: boolean;
  readonly policy_satisfied: boolean;
  readonly metrics: FittingMetrics;
  readonly capacitor: readonly CapacitorProfileResult[];
  readonly violations: readonly FittingViolation[];
  readonly missing_skills: ReadonlyArray<{
    readonly skill_type_id: number;
    readonly skill_name: string;
    readonly required_level: number;
    readonly active_level: number;
  }>;
  readonly unsupported_mechanics: readonly string[];
}

export interface FittingDelta {
  readonly cpu_used: number;
  readonly cpu_available: number;
  readonly powergrid_used: number;
  readonly powergrid_available: number;
  readonly capacitor_transitions: ReadonlyArray<{
    readonly profile: FittingProfile;
    readonly baseline_state: 'stable' | 'unstable' | 'unavailable';
    readonly candidate_state: 'stable' | 'unstable' | 'unavailable';
    readonly depletion_seconds_delta: number | null;
  }>;
}

export interface AnalyzeFittingChangesData {
  readonly baseline: EvaluatedFitting;
  readonly candidates: ReadonlyArray<EvaluatedFitting & { readonly candidate_id: string; readonly delta: FittingDelta }>;
  readonly assumptions: readonly string[];
  readonly unsupported_mechanics: readonly string[];
  readonly provenance: {
    readonly sde_build: number;
    readonly sde_release_date: string;
    readonly sde_importer_version: number;
    readonly fitting_data_contract_version: number;
    readonly dogma_repository: string;
    readonly dogma_commit: string;
    readonly dogma_wasm_sha256: string;
    readonly adapter_version: number;
    readonly conformance_matrix_version: number;
    readonly calculation_duration_ms: number;
    readonly skill_retrieved_at: string;
  };
}

export type AnalyzeFittingChangesResult = ResultEnvelope<AnalyzeFittingChangesData>;
