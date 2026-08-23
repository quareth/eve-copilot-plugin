import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { APP_VERSION } from '../bootstrap/runtime-info.js';
import {
  configFileSchema,
  DEFAULT_SSO_REDIRECT_URI,
  esiUserAgentSchema,
  eveClientIdSchema,
  personaFactionSchema,
  type ConfigFile,
} from '../config/config-schema.js';
import { readOptionalString, type EnvSource } from '../config/env.js';
import { assertLoopbackRedirectUri } from '../config/load-config.js';
import { defaultPaths } from '../config/paths.js';
import { CORE_CHARACTER_SCOPES } from '../application/dto/identity.js';
import { ESI_SCOPE_BUNDLES } from '../capabilities/generated/scope-bundles.js';
import {
  getCopilotPersonaProfile,
  PERSONA_FACTIONS,
  type PersonaFaction,
} from '../domain/copilot-profile.js';

const DEVELOPER_PORTAL_URL = 'https://developers.eveonline.com/applications';
const SOURCE_URL = 'https://github.com/quareth/eve-copilot-plugin';
const DEFAULT_ESI_USER_AGENT = `EVE-Copilot/${APP_VERSION} (+${SOURCE_URL})`;

interface SetupArguments {
  readonly configPath?: string;
  readonly eveClientId?: string;
  readonly esiUserAgent?: string;
  readonly personaFaction?: PersonaFaction;
  readonly useDefaultUserAgent: boolean;
  readonly showScopes: boolean;
}

export interface SetupCommandOptions {
  readonly argv?: readonly string[];
  readonly env?: EnvSource;
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly userHome?: string;
}

export function runSetupCommand(
  options: SetupCommandOptions = {},
  write: (value: string) => void = (value) => process.stdout.write(value),
): void {
  const args = parseSetupArguments(options.argv ?? []);
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathApi = platform === 'win32' ? win32 : posix;
  const cwd = options.cwd ?? process.cwd();
  const userHome = options.userHome ?? homedir();
  const configuredPath = args.configPath ?? readOptionalString(env, 'EVE_COPILOT_CONFIG');
  const configPath = configuredPath === undefined
    ? defaultPaths(platform, env, userHome).configFile
    : pathApi.resolve(cwd, configuredPath);
  let fileConfig = readSetupConfig(configPath);

  const requestedUserAgent = args.useDefaultUserAgent
    ? DEFAULT_ESI_USER_AGENT
    : args.esiUserAgent;
  if (
    requestedUserAgent !== undefined
    || args.eveClientId !== undefined
    || args.personaFaction !== undefined
  ) {
    fileConfig = configFileSchema.parse({
      ...fileConfig,
      ...(requestedUserAgent === undefined ? {} : { esi_user_agent: requestedUserAgent }),
      ...(args.eveClientId === undefined ? {} : { eve_client_id: args.eveClientId }),
      ...(args.personaFaction === undefined ? {} : { persona_faction: args.personaFaction }),
    });
    writeSetupConfig(configPath, fileConfig);
  }

  const environmentUserAgent = readOptionalString(env, 'EVE_COPILOT_ESI_USER_AGENT');
  const environmentClientId = readOptionalString(env, 'EVE_COPILOT_EVE_CLIENT_ID');
  const environmentPersona = readOptionalString(env, 'EVE_COPILOT_PERSONA');
  const userAgent = environmentUserAgent === undefined
    ? fileConfig.esi_user_agent ?? null
    : esiUserAgentSchema.parse(environmentUserAgent);
  const clientId = environmentClientId === undefined
    ? fileConfig.eve_client_id ?? null
    : eveClientIdSchema.parse(environmentClientId);
  const personaFaction = environmentPersona === undefined
    ? fileConfig.persona_faction ?? 'none'
    : personaFactionSchema.parse(environmentPersona);
  const persona = getCopilotPersonaProfile(personaFaction);
  const redirectUri = readOptionalString(env, 'EVE_COPILOT_SSO_REDIRECT_URI')
    ?? fileConfig.sso_redirect_uri
    ?? DEFAULT_SSO_REDIRECT_URI;
  assertLoopbackRedirectUri(redirectUri);

  const state = userAgent === null
    ? 'incomplete'
    : clientId === null ? 'public_ready' : 'character_ready';
  const nextSteps: string[] = [];
  if (userAgent === null) {
    nextSteps.push('Run eve-copilot-mcp setup --use-default-user-agent.');
  }
  if (clientId === null) {
    nextSteps.push(`Create an EVE application at ${DEVELOPER_PORTAL_URL}, register the callback URI shown here, assign the scopes you intend to use, then save its public client ID with eve-copilot-mcp setup --eve-client-id <id>.`);
  }
  nextSteps.push('Run eve-copilot-mcp sde status, install the SDE when unavailable, then run eve-copilot-mcp doctor.');

  const readScopes = allReadScopes();
  write(`${JSON.stringify({
    state,
    config_file: configPath,
    configuration: {
      esi_user_agent: userAgent === null ? 'missing' : 'configured',
      esi_user_agent_source: environmentUserAgent === undefined
        ? fileConfig.esi_user_agent === undefined ? 'missing' : 'config_file'
        : 'environment',
      eve_client_id: clientId === null ? 'missing' : 'configured',
      eve_client_id_source: environmentClientId === undefined
        ? fileConfig.eve_client_id === undefined ? 'missing' : 'config_file'
        : 'environment',
      persona: {
        faction: persona.faction,
        display_name: persona.displayName,
        enabled: persona.enabled,
        source: environmentPersona === undefined
          ? fileConfig.persona_faction === undefined ? 'default' : 'config_file'
          : 'environment',
        available_factions: PERSONA_FACTIONS,
        change_command: 'eve-copilot-mcp setup --persona <none|amarr|caldari|gallente|minmatar>',
      },
      callback_uri: redirectUri,
      developer_portal_url: DEVELOPER_PORTAL_URL,
      client_secret_required: false,
      initial_character_scopes: CORE_CHARACTER_SCOPES,
      available_read_scope_count: readScopes.length,
      action_scopes_require_explicit_opt_in: true,
      ...(args.showScopes ? { available_read_scopes: readScopes } : {}),
    },
    next_steps: nextSteps,
  }, null, 2)}\n`);
}

function parseSetupArguments(argv: readonly string[]): SetupArguments {
  let configPath: string | undefined;
  let eveClientId: string | undefined;
  let esiUserAgent: string | undefined;
  let personaFaction: PersonaFaction | undefined;
  let useDefaultUserAgent = false;
  let showScopes = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--use-default-user-agent') {
      useDefaultUserAgent = true;
      continue;
    }
    if (flag === '--show-scopes') {
      showScopes = true;
      continue;
    }
    const value = argv[index + 1];
    if (flag?.startsWith('--') !== true) {
      throw new Error(`Unexpected setup argument: ${flag ?? ''}`);
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Setup flag ${flag} requires a value.`);
    }
    index += 1;
    switch (flag) {
      case '--config': configPath = singleValue(configPath, value, flag); break;
      case '--eve-client-id': eveClientId = singleValue(eveClientId, eveClientIdSchema.parse(value), flag); break;
      case '--esi-user-agent': esiUserAgent = singleValue(esiUserAgent, esiUserAgentSchema.parse(value), flag); break;
      case '--persona': personaFaction = singleValue(personaFaction, personaFactionSchema.parse(value), flag); break;
      default: throw new Error(`Unknown setup flag: ${flag}`);
    }
  }
  if (useDefaultUserAgent && esiUserAgent !== undefined) {
    throw new Error('Use either --use-default-user-agent or --esi-user-agent, not both.');
  }
  return {
    ...(configPath === undefined ? {} : { configPath }),
    ...(eveClientId === undefined ? {} : { eveClientId }),
    ...(esiUserAgent === undefined ? {} : { esiUserAgent }),
    ...(personaFaction === undefined ? {} : { personaFaction }),
    useDefaultUserAgent,
    showScopes,
  };
}

function singleValue<Value extends string>(
  current: Value | undefined,
  value: Value,
  flag: string,
): Value {
  if (current !== undefined) throw new Error(`Setup flag ${flag} may be specified only once.`);
  return value;
}

function readSetupConfig(path: string): ConfigFile {
  if (!existsSync(path)) return {};
  if (!statSync(path).isFile()) throw new Error(`Configuration path is not a regular file: ${path}`);
  try {
    return configFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  } catch (error) {
    throw new Error(`Configuration file is invalid and was not changed: ${path}`, { cause: error });
  }
}

function writeSetupConfig(path: string, config: ConfigFile): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const staging = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(staging, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(staging, path);
  } finally {
    try { unlinkSync(staging); } catch { /* the atomic rename normally consumed the staging file */ }
  }
}

function allReadScopes(): readonly string[] {
  return Object.freeze([...new Set(ESI_SCOPE_BUNDLES
    .filter((bundle) => bundle.kind === 'read')
    .flatMap((bundle) => [...bundle.scopes]))].sort());
}
