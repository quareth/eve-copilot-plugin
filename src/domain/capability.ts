export type CapabilityDomain =
  | 'foundation'
  | 'identity'
  | 'character'
  | 'skills'
  | 'assets'
  | 'fittings'
  | 'wallet'
  | 'market'
  | 'contracts'
  | 'industry'
  | 'navigation'
  | 'corporation'
  | 'communication'
  | 'intelligence'
  | 'guide';

export type AccessClass = 'public' | 'character' | 'corporation';
export type OperationClass = 'read' | 'action' | 'local_mutation';
export type ImplementationState = 'available' | 'degraded' | 'disabled' | 'planned';
export type DataSourceKind = 'local' | 'ESI' | 'SDE' | 'computed' | 'community' | 'user_guide';
export interface PaginationPolicy {
  readonly mode: 'none' | 'cursor' | 'page' | 'bounded_all';
  readonly default_limit?: number;
  readonly maximum_limit?: number;
}

export interface FreshnessPolicy {
  readonly mode: 'static' | 'source_headers' | 'fixed_ttl' | 'uncached';
  readonly ttl_seconds?: number;
  readonly stale_if_error_seconds?: number;
}

export interface CapabilityDefinition {
  readonly id: string;
  readonly domain: CapabilityDomain;
  readonly title: string;
  readonly description: string;
  readonly semantic_tools: readonly string[];
  readonly esi_operations: readonly string[];
  readonly required_scopes: readonly string[];
  readonly required_roles: readonly string[];
  readonly access: AccessClass;
  readonly operation_class: OperationClass;
  readonly sources: readonly DataSourceKind[];
  readonly pagination: PaginationPolicy;
  readonly freshness: FreshnessPolicy;
  readonly implementation: ImplementationState;
  readonly feature_flag?: string;
  readonly attribution_refs: readonly string[];
}
