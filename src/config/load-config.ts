import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import {
  commandSchema,
  configFileSchema,
  credentialBackendSchema,
  DEFAULT_ESI_CACHE_MAX_BYTES,
  DEFAULT_ESI_TIMEOUT_MS,
  DEFAULT_HTTP_MAX_RESPONSE_BYTES,
  DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
  DEFAULT_OAUTH_SESSION_TTL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SSO_REDIRECT_URI,
  DEFAULT_SSO_TIMEOUT_MS,
  ESI_COMPATIBILITY_DATE,
  logFormatSchema,
  logLevelSchema,
  personaFactionSchema,
  sdeCommandSchema,
  type AppConfig,
  type Command,
  type ConfigFile,
  actionFamilySchema,
} from './config-schema.js';
import {
  assertKnownProjectEnv,
  readOptionalInteger,
  readOptionalString,
  type EnvSource,
} from './env.js';
import { defaultPaths } from './paths.js';

const ALLOWED_ENV = new Set([
  'EVE_COPILOT_CONFIG',
  'EVE_COPILOT_DATA_DIR',
  'EVE_COPILOT_DATABASE',
  'EVE_COPILOT_LOG_LEVEL',
  'EVE_COPILOT_LOG_FORMAT',
  'EVE_COPILOT_REQUEST_TIMEOUT_MS',
  'EVE_COPILOT_DB_BUSY_TIMEOUT_MS',
  'EVE_COPILOT_EVE_CLIENT_ID',
  'EVE_COPILOT_SSO_REDIRECT_URI',
  'EVE_COPILOT_ESI_COMPATIBILITY_DATE',
  'EVE_COPILOT_ESI_USER_AGENT',
  'EVE_COPILOT_PERSONA',
  'EVE_COPILOT_CREDENTIAL_BACKEND',
  'EVE_COPILOT_OAUTH_SESSION_TTL_MS',
  'EVE_COPILOT_SSO_TIMEOUT_MS',
  'EVE_COPILOT_ESI_TIMEOUT_MS',
  'EVE_COPILOT_HTTP_MAX_RESPONSE_BYTES',
  'EVE_COPILOT_ESI_CACHE_MAX_BYTES',
  'EVE_COPILOT_SDE_DIR',
  'EVE_COPILOT_LIVE_TESTS',
  'EVE_COPILOT_ACTIONS_ENABLED',
  'EVE_COPILOT_ACTION_FAMILIES',
]);

interface CliValues {
  readonly command: Command;
  readonly sdeCommand?: 'status' | 'install' | 'update';
  readonly config?: string;
  readonly dataDir?: string;
  readonly database?: string;
  readonly logLevel?: string;
  readonly logFormat?: string;
  readonly requestTimeoutMs?: number;
}

export interface LoadConfigOptions {
  readonly argv?: readonly string[];
  readonly env?: EnvSource;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly userHome?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): Readonly<AppConfig> {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const pathApi = platform === 'win32' ? win32 : posix;
  assertKnownProjectEnv(env, ALLOWED_ENV);

  const cli = parseCli(argv);
  const defaults = defaultPaths(platform, env, options.userHome);
  const explicitConfig = cli.config ?? readOptionalString(env, 'EVE_COPILOT_CONFIG');
  const configPath = explicitConfig === undefined
    ? defaults.configFile
    : resolvePath(explicitConfig, cwd, pathApi);
  const fileConfig = readConfigFile(configPath, explicitConfig !== undefined);
  const storage = resolveStorageConfig({ cli, env, fileConfig, cwd, pathApi, defaultDataDir: defaults.dataDir });
  const runtime = resolveRuntimeConfig(cli, env, fileConfig);
  const features = resolveFeatureConfig(env, fileConfig);
  const configuredSdeDir = readOptionalString(env, 'EVE_COPILOT_SDE_DIR') ?? fileConfig.sde_dir;
  const sdeDir = configuredSdeDir === undefined
    ? pathApi.resolve(storage.dataDir, 'sde')
    : resolvePath(configuredSdeDir, cwd, pathApi);

  return Object.freeze({
    command: cli.command,
    sdeCommand: cli.sdeCommand ?? null,
    dataDir: storage.dataDir,
    configFile: existsSync(configPath) ? configPath : null,
    databasePath: storage.databasePath,
    ...runtime,
    dataDirectoryKind: storage.configuredDataDir === undefined ? 'default' : 'custom',
    sdeDir,
    ...features,
  });
}

function resolveStorageConfig(input: {
  readonly cli: CliValues;
  readonly env: EnvSource;
  readonly fileConfig: ConfigFile;
  readonly cwd: string;
  readonly pathApi: typeof posix;
  readonly defaultDataDir: string;
}): { readonly configuredDataDir: string | undefined; readonly dataDir: string; readonly databasePath: string } {
  const configuredDataDir = input.cli.dataDir
    ?? readOptionalString(input.env, 'EVE_COPILOT_DATA_DIR')
    ?? input.fileConfig.data_dir;
  const dataDir = configuredDataDir === undefined
    ? input.defaultDataDir
    : resolvePath(configuredDataDir, input.cwd, input.pathApi);
  const configuredDatabase = input.cli.database
    ?? readOptionalString(input.env, 'EVE_COPILOT_DATABASE')
    ?? input.fileConfig.database_path;
  const databasePath = configuredDatabase === undefined
    ? input.pathApi.resolve(dataDir, 'eve-copilot.db')
    : resolvePath(configuredDatabase, input.cwd, input.pathApi);
  if (existsSync(dataDir) && !statSync(dataDir).isDirectory()) {
    throw new Error('The configured data directory is not a directory.');
  }
  if (input.pathApi.extname(databasePath).toLowerCase() !== '.db') {
    throw new Error('The configured database path must use the .db extension.');
  }
  if (existsSync(databasePath) && !statSync(databasePath).isFile()) {
    throw new Error('The configured database path is not a file.');
  }
  return { configuredDataDir, dataDir, databasePath };
}

function resolveRuntimeConfig(cli: CliValues, env: EnvSource, fileConfig: ConfigFile): Pick<AppConfig,
  'logLevel' | 'logFormat' | 'requestTimeoutMs' | 'databaseBusyTimeoutMs' | 'eveClientId'
  | 'ssoRedirectUri' | 'esiCompatibilityDate' | 'esiUserAgent' | 'credentialBackend'
  | 'personaFaction' | 'oauthSessionTtlMs' | 'ssoTimeoutMs' | 'esiTimeoutMs'
  | 'httpMaxResponseBytes' | 'esiCacheMaxBytes'> {
  const ssoRedirectUri = readOptionalString(env, 'EVE_COPILOT_SSO_REDIRECT_URI')
    ?? fileConfig.sso_redirect_uri ?? DEFAULT_SSO_REDIRECT_URI;
  assertLoopbackRedirectUri(ssoRedirectUri);
  const esiCompatibilityDate = readOptionalString(env, 'EVE_COPILOT_ESI_COMPATIBILITY_DATE')
    ?? fileConfig.esi_compatibility_date ?? ESI_COMPATIBILITY_DATE;
  if (esiCompatibilityDate !== ESI_COMPATIBILITY_DATE) {
    throw new Error(`ESI compatibility date must match the packaged date ${ESI_COMPATIBILITY_DATE}.`);
  }
  const esiUserAgent = readOptionalString(env, 'EVE_COPILOT_ESI_USER_AGENT') ?? fileConfig.esi_user_agent ?? null;
  if (esiUserAgent !== null && (!/^[\x20-\x7E]{8,256}$/u.test(esiUserAgent)
    || (!esiUserAgent.includes('@') && !/https?:\/\//iu.test(esiUserAgent)))) {
    throw new Error('The ESI User-Agent must contain visible ASCII and an email address or HTTP(S) contact URL.');
  }
  return {
    logLevel: logLevelSchema.parse(cli.logLevel ?? readOptionalString(env, 'EVE_COPILOT_LOG_LEVEL')
      ?? fileConfig.log_level ?? 'info'),
    logFormat: logFormatSchema.parse(cli.logFormat ?? readOptionalString(env, 'EVE_COPILOT_LOG_FORMAT')
      ?? fileConfig.log_format ?? (cli.command === 'serve' ? 'json' : 'pretty')),
    requestTimeoutMs: cli.requestTimeoutMs
      ?? readOptionalInteger(env, 'EVE_COPILOT_REQUEST_TIMEOUT_MS', { min: 100, max: 120_000 })
      ?? fileConfig.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS,
    databaseBusyTimeoutMs: readOptionalInteger(env, 'EVE_COPILOT_DB_BUSY_TIMEOUT_MS', { min: 100, max: 30_000 })
      ?? fileConfig.database_busy_timeout_ms ?? DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
    eveClientId: readOptionalString(env, 'EVE_COPILOT_EVE_CLIENT_ID') ?? fileConfig.eve_client_id ?? null,
    ssoRedirectUri,
    esiCompatibilityDate,
    esiUserAgent,
    personaFaction: personaFactionSchema.parse(
      readOptionalString(env, 'EVE_COPILOT_PERSONA') ?? fileConfig.persona_faction ?? 'none',
    ),
    credentialBackend: credentialBackendSchema.parse(readOptionalString(env, 'EVE_COPILOT_CREDENTIAL_BACKEND')
      ?? fileConfig.credential_backend ?? 'auto'),
    oauthSessionTtlMs: readOptionalInteger(env, 'EVE_COPILOT_OAUTH_SESSION_TTL_MS', { min: 120_000, max: 900_000 })
      ?? fileConfig.oauth_session_ttl_ms ?? DEFAULT_OAUTH_SESSION_TTL_MS,
    ssoTimeoutMs: readOptionalInteger(env, 'EVE_COPILOT_SSO_TIMEOUT_MS', { min: 1_000, max: 60_000 })
      ?? fileConfig.sso_timeout_ms ?? DEFAULT_SSO_TIMEOUT_MS,
    esiTimeoutMs: readOptionalInteger(env, 'EVE_COPILOT_ESI_TIMEOUT_MS', { min: 1_000, max: 60_000 })
      ?? fileConfig.esi_timeout_ms ?? DEFAULT_ESI_TIMEOUT_MS,
    httpMaxResponseBytes: readOptionalInteger(env, 'EVE_COPILOT_HTTP_MAX_RESPONSE_BYTES', { min: 65_536, max: 16_777_216 })
      ?? fileConfig.http_max_response_bytes ?? DEFAULT_HTTP_MAX_RESPONSE_BYTES,
    esiCacheMaxBytes: readOptionalInteger(env, 'EVE_COPILOT_ESI_CACHE_MAX_BYTES', { min: 0, max: 1_073_741_824 })
      ?? fileConfig.esi_cache_max_bytes ?? DEFAULT_ESI_CACHE_MAX_BYTES,
  };
}

function resolveFeatureConfig(env: EnvSource, fileConfig: ConfigFile): Pick<AppConfig,
  'liveTests' | 'actionsEnabled' | 'actionFamilies'> {
  const liveTests = enabledFlag(env, 'EVE_COPILOT_LIVE_TESTS');
  const actionsEnabled = enabledFlag(env, 'EVE_COPILOT_ACTIONS_ENABLED') || fileConfig.actions_enabled === true;
  const configuredFamilies = readOptionalString(env, 'EVE_COPILOT_ACTION_FAMILIES');
  const actionFamilies = configuredFamilies === undefined
    ? fileConfig.action_families ?? []
    : configuredFamilies.split(',').map((entry) => actionFamilySchema.parse(entry.trim()));
  const uniqueActionFamilies = [...new Set(actionFamilies)].sort();
  if (uniqueActionFamilies.length !== actionFamilies.length) throw new Error('Configured action families must be unique.');
  return { liveTests, actionsEnabled, actionFamilies: Object.freeze(uniqueActionFamilies) };
}

function enabledFlag(env: EnvSource, name: 'EVE_COPILOT_LIVE_TESTS' | 'EVE_COPILOT_ACTIONS_ENABLED'): boolean {
  const value = readOptionalString(env, name);
  if (value !== undefined && value !== '1') throw new Error(`${name} must be exactly 1 when enabled.`);
  return value === '1';
}

function parseCli(argv: readonly string[]): CliValues {
  const [rawCommand = 'serve', ...rawArgs] = argv;
  const command = commandSchema.parse(rawCommand);
  const args = [...rawArgs];
  const values: {
    command: Command;
    sdeCommand?: 'status' | 'install' | 'update';
    config?: string;
    dataDir?: string;
    database?: string;
    logLevel?: string;
    logFormat?: string;
    requestTimeoutMs?: number;
  } = { command };
  if (command === 'sde') {
    const rawSdeCommand = args.shift();
    if (rawSdeCommand === undefined) throw new Error('The sde command requires status, install, or update.');
    values.sdeCommand = sdeCommandSchema.parse(rawSdeCommand);
  }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined) break;
    if (!flag.startsWith('--')) throw new Error(`Unexpected CLI argument: ${flag}`);
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`CLI flag ${flag} requires a value.`);
    }
    index += 1;
    switch (flag) {
      case '--config': values.config = value; break;
      case '--data-dir': values.dataDir = value; break;
      case '--database': values.database = value; break;
      case '--log-level': values.logLevel = value; break;
      case '--log-format': values.logFormat = value; break;
      case '--request-timeout-ms':
        values.requestTimeoutMs = parseCliInteger(flag, value, 100, 120_000);
        break;
      default: throw new Error(`Unknown CLI flag: ${flag}`);
    }
  }
  return values;
}

export function assertLoopbackRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('The SSO redirect URI is invalid.', { cause: error });
  }
  if (
    url.protocol !== 'http:'
    || url.hostname !== '127.0.0.1'
    || url.pathname !== '/oauth/callback'
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
    || url.port === ''
  ) {
    throw new Error('The SSO redirect URI must be an exact 127.0.0.1 HTTP loopback callback URI.');
  }
}

function readConfigFile(path: string, required: boolean): ConfigFile {
  if (!existsSync(path)) {
    if (required) throw new Error(`Configuration file does not exist: ${path}`);
    return {};
  }
  if (!statSync(path).isFile()) throw new Error(`Configuration path is not a regular file: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Configuration file is not valid JSON: ${path}`, { cause: error });
  }
  return configFileSchema.parse(parsed);
}

function resolvePath(value: string, cwd: string, pathApi: typeof posix): string {
  return pathApi.isAbsolute(value) ? pathApi.resolve(value) : pathApi.resolve(cwd, value);
}

function parseCliInteger(flag: string, value: string, min: number, max: number): number {
  if (!/^[+-]?\d+$/u.test(value)) throw new Error(`CLI flag ${flag} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`CLI flag ${flag} must be between ${String(min)} and ${String(max)}.`);
  }
  return parsed;
}
