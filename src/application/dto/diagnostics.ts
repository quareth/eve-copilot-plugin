import type { ComponentCheck, DiagnosticGroup } from '../ports/health-check.js';

export interface DiagnosticsInput {
  readonly include?: readonly DiagnosticGroup[];
}

export interface DiagnosticsData {
  readonly overall: 'ready' | 'degraded' | 'unavailable';
  readonly checks: readonly ComponentCheck[];
  readonly build: {
    readonly version: string;
    readonly node: string;
    readonly platform: 'darwin' | 'win32' | 'linux' | 'other';
    readonly architecture: string;
    readonly mcp_sdk_major: 2;
  };
  readonly storage: {
    readonly database_schema_version: number;
    readonly database_mode: 'wal';
    readonly data_directory: 'default' | 'custom';
  };
  readonly next_steps: readonly string[];
  readonly stage3: StageThreeDiagnostics | null;
}

export interface CoverageGroupDiagnostics {
  readonly key: string;
  readonly total: number;
  readonly semantic: number;
  readonly bounded: number;
  readonly excluded: number;
  readonly planned: number;
  readonly accounted_percent: number;
  readonly allowed_execution_percent: number;
}

export interface StageThreeDiagnostics {
  readonly compatibility_date: string;
  readonly snapshot_sha256: string;
  readonly surface_profile: 'complete';
  readonly coverage: {
    readonly total: number;
    readonly semantic: number;
    readonly bounded: number;
    readonly excluded: number;
    readonly planned: number;
    readonly accounted_percent: number;
    readonly allowed_execution_percent: number;
    readonly by_pack: readonly CoverageGroupDiagnostics[];
    readonly by_access: readonly CoverageGroupDiagnostics[];
    readonly by_class: readonly CoverageGroupDiagnostics[];
  };
  readonly actions: {
    readonly enabled: boolean;
    readonly enabled_families: readonly string[];
    readonly plans_by_state: Readonly<Record<string, number>>;
  };
  readonly rate_limits: {
    readonly delayed_requests: number;
    readonly total_delay_ms: number;
    readonly active_buckets: number;
    readonly globally_blocked_until: string | null;
    readonly groups: ReadonlyArray<{
      readonly group: string;
      readonly active_buckets: number;
      readonly reserved_tokens: number;
      readonly delayed_requests: number;
      readonly total_delay_ms: number;
      readonly blocked_until: string | null;
    }>;
  };
  readonly sde: {
    readonly state: 'unavailable' | 'available' | 'invalid';
    readonly build_number: number | null;
    readonly release_date: string | null;
  };
  readonly cache: {
    readonly size_bytes: number;
    readonly hits: number;
    readonly misses: number;
    readonly revalidations: number;
    readonly stale_served: number;
  };
  readonly retries: { readonly read_retries: number };
  readonly recent_error_categories: ReadonlyArray<{
    readonly code: string;
    readonly count: number;
    readonly last_seen_at: string;
  }>;
  readonly scope_bundles: ReadonlyArray<{
    readonly bundle: string;
    readonly kind: 'read' | 'action';
    readonly selected_character_granted: boolean;
    readonly missing_scopes: readonly string[];
    readonly application_registration_check: 'verify_in_eve_developer_portal';
  }>;
}
