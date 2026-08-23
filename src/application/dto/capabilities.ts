import type {
  AccessClass,
  CapabilityDomain,
  DataSourceKind,
  ImplementationState,
  OperationClass,
} from '../../domain/capability.js';
import type { CharacterRef } from '../../domain/result.js';
import type { CAPABILITY_SCHEMA_VERSION } from '../../domain/versions.js';

export interface CapabilitiesInput {
  readonly domain?: CapabilityDomain;
  readonly implementation?: ImplementationState;
  readonly include_operations: boolean;
  readonly limit: number;
  readonly cursor?: string;
}

export interface CapabilityView {
  readonly id: string;
  readonly domain: CapabilityDomain;
  readonly title: string;
  readonly description: string;
  readonly implementation: ImplementationState;
  readonly access: AccessClass;
  readonly operation_class: OperationClass;
  readonly sources: readonly DataSourceKind[];
  readonly semantic_tools: readonly string[];
  readonly authorization: {
    readonly status: 'not_required' | 'not_connected' | 'authorized' | 'missing_scope' | 'insufficient_role';
    readonly required_scopes: readonly string[];
    readonly missing_scopes: readonly string[];
    readonly required_roles: readonly string[];
    readonly missing_roles: readonly string[];
  };
  readonly unavailable_reason: string | null;
}

export interface CapabilitiesData {
  readonly registry_version: typeof CAPABILITY_SCHEMA_VERSION;
  readonly connection: {
    readonly status: 'not_supported_yet' | 'not_connected' | 'connected';
    readonly active_character: CharacterRef | null;
    readonly pending_connections: number;
  };
  readonly summary: {
    readonly available: number;
    readonly degraded: number;
    readonly disabled: number;
    readonly planned: number;
  };
  readonly capabilities: readonly CapabilityView[];
  readonly next_cursor: string | null;
}
