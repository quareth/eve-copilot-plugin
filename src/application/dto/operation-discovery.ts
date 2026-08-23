import type { EsiAccessClass, EsiOperationClass, EsiOperationPack } from '../../domain/esi-operation.js';
import type { ImplementationState } from '../../domain/capability.js';
import type { JsonValue } from '../../domain/json.js';

export interface FindEveCapabilitiesInput {
  readonly query?: string;
  /** Official ESI domain/tag, matched case-insensitively. */
  readonly domain?: string;
  readonly pack?: EsiOperationPack;
  readonly access?: EsiAccessClass;
  readonly operation_class?: EsiOperationClass;
  readonly implementation?: ImplementationState;
  readonly availability?: 'available' | 'unavailable';
  readonly limit: number;
}

export interface OperationCapabilityView {
  readonly capability_id: string;
  readonly operation_id: string;
  readonly title: string;
  readonly domain: string;
  readonly pack: EsiOperationPack;
  readonly access: EsiAccessClass;
  readonly operation_class: EsiOperationClass;
  readonly exposure: 'bounded';
  readonly implementation: 'available';
  readonly required_scopes: readonly string[];
  readonly missing_scopes: readonly string[];
  readonly required_roles_any_of: readonly string[];
  readonly action_family: string | null;
  readonly scope_bundle: string | null;
  readonly available: boolean;
  readonly unavailable_reason: string | null;
  readonly input_schema: JsonValue;
}

export interface OperationDiscoveryData {
  readonly total_matches: number;
  readonly returned: number;
  readonly capabilities: readonly OperationCapabilityView[];
}
