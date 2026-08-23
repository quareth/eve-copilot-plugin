import { z } from 'zod';
import { resultEnvelopeSchema, resultWarningSchema, toolErrorEnvelopeSchema } from './common.js';

export const diagnosticGroupSchema = z.enum([
  'runtime',
  'storage',
  'registry',
  'transport',
  'planned_adapters',
]);

export const getServerDiagnosticsInputSchema = z.object({
  include: z.array(diagnosticGroupSchema).max(5).optional(),
}).strict();

export const componentCheckSchema = z.object({
  id: z.string().min(1).max(128),
  state: z.enum(['ok', 'degraded', 'unavailable', 'not_configured', 'planned']),
  message: z.string().min(1).max(2000),
  checked_at: z.iso.datetime(),
  version: z.string().min(1).max(256).optional(),
  warnings: z.array(resultWarningSchema).max(100),
}).strict();

export const diagnosticsDataSchema = z.object({
  overall: z.enum(['ready', 'degraded', 'unavailable']),
  checks: z.array(componentCheckSchema).max(20),
  build: z.object({
    version: z.string().min(1).max(100),
    node: z.string().min(1).max(100),
    platform: z.enum(['darwin', 'win32', 'linux', 'other']),
    architecture: z.string().min(1).max(100),
    mcp_sdk_major: z.literal(2),
  }).strict(),
  storage: z.object({
    database_schema_version: z.number().int().min(0),
    database_mode: z.literal('wal'),
    data_directory: z.enum(['default', 'custom']),
  }).strict(),
  next_steps: z.array(z.string().min(1).max(2000)).max(20),
  stage3: z.object({
    compatibility_date: z.iso.date(),
    snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    surface_profile: z.literal('complete'),
    coverage: z.object({
      total: z.number().int().nonnegative(),
      semantic: z.number().int().nonnegative(),
      bounded: z.number().int().nonnegative(),
      excluded: z.number().int().nonnegative(),
      planned: z.number().int().nonnegative(),
      accounted_percent: z.number().min(0).max(100),
      allowed_execution_percent: z.number().min(0).max(100),
      by_pack: z.array(coverageGroupSchema()).max(20),
      by_access: z.array(coverageGroupSchema()).max(20),
      by_class: z.array(coverageGroupSchema()).max(20),
    }).strict(),
    actions: z.object({
      enabled: z.boolean(),
      enabled_families: z.array(z.string().min(1).max(128)).max(20),
      plans_by_state: z.record(z.string().min(1).max(128), z.number().int().nonnegative()),
    }).strict(),
    rate_limits: z.object({
      delayed_requests: z.number().int().nonnegative(),
      total_delay_ms: z.number().int().nonnegative(),
      active_buckets: z.number().int().nonnegative(),
      globally_blocked_until: z.iso.datetime().nullable(),
      groups: z.array(z.object({
        group: z.string().min(1).max(64),
        active_buckets: z.number().int().nonnegative(),
        reserved_tokens: z.number().int().nonnegative(),
        delayed_requests: z.number().int().nonnegative(),
        total_delay_ms: z.number().int().nonnegative(),
        blocked_until: z.iso.datetime().nullable(),
      }).strict()).max(100),
    }).strict(),
    sde: z.object({
      state: z.enum(['unavailable', 'available', 'invalid']),
      build_number: z.number().int().positive().nullable(),
      release_date: z.iso.datetime().nullable(),
    }).strict(),
    cache: z.object({
      size_bytes: z.number().int().nonnegative(),
      hits: z.number().int().nonnegative(),
      misses: z.number().int().nonnegative(),
      revalidations: z.number().int().nonnegative(),
      stale_served: z.number().int().nonnegative(),
    }).strict(),
    retries: z.object({ read_retries: z.number().int().nonnegative() }).strict(),
    recent_error_categories: z.array(z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
      count: z.number().int().positive(),
      last_seen_at: z.iso.datetime(),
    }).strict()).max(20),
    scope_bundles: z.array(z.object({
      bundle: z.string().min(1).max(128),
      kind: z.enum(['read', 'action']),
      selected_character_granted: z.boolean(),
      missing_scopes: z.array(z.string().min(1).max(256)).max(100),
      application_registration_check: z.literal('verify_in_eve_developer_portal'),
    }).strict()).max(20),
  }).strict().nullable(),
}).strict();

function coverageGroupSchema(): z.ZodType {
  return z.object({
    key: z.string().min(1).max(128),
    total: z.number().int().nonnegative(),
    semantic: z.number().int().nonnegative(),
    bounded: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    planned: z.number().int().nonnegative(),
    accounted_percent: z.number().min(0).max(100),
    allowed_execution_percent: z.number().min(0).max(100),
  }).strict();
}

export const getServerDiagnosticsOutputSchema = z.union([
  resultEnvelopeSchema(diagnosticsDataSchema),
  toolErrorEnvelopeSchema,
]);
