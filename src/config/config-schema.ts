import { z } from 'zod';
import { PERSONA_FACTIONS, type PersonaFaction } from '../domain/copilot-profile.js';

export const commandSchema = z.enum(['serve', 'doctor', 'version', 'sde', 'setup']);
export const sdeCommandSchema = z.enum(['status', 'install', 'update']);
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const logFormatSchema = z.enum(['json', 'pretty']);
export const credentialBackendSchema = z.enum(['auto', 'system', 'disabled']);
export const personaFactionSchema = z.enum(PERSONA_FACTIONS);
export const actionFamilySchema = z.enum([
  'calendar_respond',
  'contacts_write',
  'fittings_write',
  'mail_send',
  'mail_organize',
  'fleet_write',
  'ui_actions',
]);
export const eveClientIdSchema = z.string().trim().min(1).max(128).regex(/^[\x21-\x7E]+$/u);
export const esiUserAgentSchema = z.string().trim().min(8).max(256)
  .regex(/^[\x20-\x7E]+$/u)
  .refine((value) => value.includes('@') || /https?:\/\//iu.test(value), {
    message: 'ESI User-Agent must include an email address or HTTP(S) contact URL.',
  });

export type Command = z.infer<typeof commandSchema>;
export type SdeCommand = z.infer<typeof sdeCommandSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogFormat = z.infer<typeof logFormatSchema>;

export interface AppConfig {
  readonly command: Command;
  readonly sdeCommand: SdeCommand | null;
  readonly dataDir: string;
  readonly configFile: string | null;
  readonly databasePath: string;
  readonly logLevel: LogLevel;
  readonly logFormat: LogFormat;
  readonly requestTimeoutMs: number;
  readonly databaseBusyTimeoutMs: number;
  readonly dataDirectoryKind: 'default' | 'custom';
  readonly eveClientId: string | null;
  readonly ssoRedirectUri: string;
  readonly esiCompatibilityDate: typeof ESI_COMPATIBILITY_DATE;
  readonly esiUserAgent: string | null;
  readonly personaFaction: PersonaFaction;
  readonly credentialBackend: z.infer<typeof credentialBackendSchema>;
  readonly oauthSessionTtlMs: number;
  readonly ssoTimeoutMs: number;
  readonly esiTimeoutMs: number;
  readonly httpMaxResponseBytes: number;
  readonly esiCacheMaxBytes: number;
  readonly sdeDir: string;
  readonly liveTests: boolean;
  readonly actionsEnabled: boolean;
  readonly actionFamilies: ReadonlyArray<z.infer<typeof actionFamilySchema>>;
}

export const configFileSchema = z.object({
  data_dir: z.string().trim().min(1).optional(),
  database_path: z.string().trim().min(1).optional(),
  log_level: logLevelSchema.optional(),
  log_format: logFormatSchema.optional(),
  request_timeout_ms: z.number().int().min(100).max(120_000).optional(),
  database_busy_timeout_ms: z.number().int().min(100).max(30_000).optional(),
  eve_client_id: eveClientIdSchema.optional(),
  sso_redirect_uri: z.url().max(2048).optional(),
  esi_compatibility_date: z.literal('2026-08-18').optional(),
  esi_user_agent: esiUserAgentSchema.optional(),
  persona_faction: personaFactionSchema.optional(),
  credential_backend: credentialBackendSchema.optional(),
  oauth_session_ttl_ms: z.number().int().min(120_000).max(900_000).optional(),
  sso_timeout_ms: z.number().int().min(1_000).max(60_000).optional(),
  esi_timeout_ms: z.number().int().min(1_000).max(60_000).optional(),
  http_max_response_bytes: z.number().int().min(65_536).max(16_777_216).optional(),
  esi_cache_max_bytes: z.number().int().min(0).max(1_073_741_824).optional(),
  sde_dir: z.string().trim().min(1).optional(),
  actions_enabled: z.boolean().optional(),
  action_families: z.array(actionFamilySchema).max(7).optional(),
}).strict();

export type ConfigFile = z.infer<typeof configFileSchema>;

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_DATABASE_BUSY_TIMEOUT_MS = 5_000;
export const ESI_COMPATIBILITY_DATE = '2026-08-18' as const;
export const DEFAULT_SSO_REDIRECT_URI = 'http://127.0.0.1:17600/oauth/callback';
export const DEFAULT_OAUTH_SESSION_TTL_MS = 600_000;
export const DEFAULT_SSO_TIMEOUT_MS = 15_000;
export const DEFAULT_ESI_TIMEOUT_MS = 15_000;
export const DEFAULT_HTTP_MAX_RESPONSE_BYTES = 4_194_304;
export const DEFAULT_ESI_CACHE_MAX_BYTES = 268_435_456;
