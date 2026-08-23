import type {
  CanonicalFitSpec,
  CapacitorPolicyInput,
  EvaluatedFitting,
  FittingProfile,
} from '../dto/fitting-analysis.js';
import type { SdeFittingSnapshot } from './sde-repository.js';

export interface FittingEngineRequest {
  readonly snapshot: SdeFittingSnapshot;
  readonly fits: readonly CanonicalFitSpec[];
  readonly skills: Readonly<Record<string, number>>;
  readonly profiles: readonly FittingProfile[];
  readonly capacitorPolicy: CapacitorPolicyInput;
  readonly missingSkills: ReadonlyArray<ReadonlyArray<{
    readonly skill_type_id: number;
    readonly skill_name: string;
    readonly required_level: number;
    readonly active_level: number;
  }>>;
}

export interface FittingEngineResponse {
  readonly evaluations: readonly EvaluatedFitting[];
  readonly durationMs: number;
}

export interface FittingCalculationEngine {
  calculate(input: FittingEngineRequest, signal: AbortSignal): Promise<FittingEngineResponse>;
}
