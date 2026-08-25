import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSetupCommand } from '../../../src/cli/setup-command.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('runSetupCommand', () => {
  it('reports the exact portal configuration without creating a file', async () => {
    const userHome = await temporaryDirectory();
    const output = runSetup({ userHome });

    expect(output).toMatchObject({
      state: 'incomplete',
      configuration: {
        esi_user_agent: 'missing',
        eve_client_id: 'missing',
        persona: {
          faction: 'none',
          display_name: 'None',
          enabled: false,
          source: 'default',
          available_factions: ['none', 'amarr', 'caldari', 'gallente', 'minmatar'],
        },
        callback_uri: 'http://127.0.0.1:17600/oauth/callback',
        developer_portal_url: 'https://developers.eveonline.com/applications',
        client_secret_required: false,
        initial_character_scopes: [
          'esi-location.read_location.v1',
          'esi-location.read_ship_type.v1',
        ],
        available_read_scope_count: 64,
        action_scopes_require_explicit_opt_in: true,
      },
    });
    expect(existsSync(output.config_file)).toBe(false);
  });

  it('stores the project contact and public client ID in the private config file', async () => {
    const userHome = await temporaryDirectory();
    const output = runSetup({
      userHome,
      argv: [
        '--use-default-user-agent',
        '--eve-client-id', 'public-client-id',
        '--persona', 'amarr',
      ],
    });

    expect(output.state).toBe('character_ready');
    expect(JSON.parse(readFileSync(output.config_file, 'utf8'))).toEqual({
      esi_user_agent: 'EVE-Copilot/0.1.8 (+https://github.com/quareth/eve-copilot-plugin)',
      eve_client_id: 'public-client-id',
      persona_faction: 'amarr',
    });
  });

  it('preserves existing settings and can expose the complete reviewed read-scope set', async () => {
    const directory = await temporaryDirectory();
    const configFile = join(directory, 'custom.json');
    const initial = runSetup({
      argv: [
        '--config', configFile,
        '--esi-user-agent', 'EVE-Copilot/0.1 pilot@example.com',
      ],
      cwd: directory,
    });
    expect(initial.state).toBe('public_ready');
    expect(initial.config_file).toBe(configFile);

    const output = runSetup({
      argv: ['--config', configFile, '--eve-client-id', 'client', '--show-scopes'],
      cwd: directory,
    });
    expect(output.state).toBe('character_ready');
    expect(output.configuration.available_read_scopes).toHaveLength(64);
    expect(output.configuration.available_read_scopes).toContain('esi-skills.read_skills.v1');
    expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
      esi_user_agent: 'EVE-Copilot/0.1 pilot@example.com',
      eve_client_id: 'client',
    });
  });

  it('rejects invalid or ambiguous setup input without writing configuration', async () => {
    const userHome = await temporaryDirectory();
    expect(() => {
      runSetup({ userHome, argv: ['--esi-user-agent', 'anonymous-agent'] });
    }).toThrow();
    expect(() => {
      runSetup({
        userHome,
        argv: ['--use-default-user-agent', '--esi-user-agent', 'EVE/1 pilot@example.com'],
      });
    }).toThrow(/either/u);
    expect(() => {
      runSetup({ userHome, argv: ['--persona', 'jove'] });
    }).toThrow();
  });
});

interface SetupOutput {
  readonly state: string;
  readonly config_file: string;
  readonly configuration: {
    readonly available_read_scopes?: readonly string[];
    readonly [key: string]: unknown;
  };
}

function runSetup(input: {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly userHome?: string;
}): SetupOutput {
  let output = '';
  runSetupCommand({
    argv: input.argv ?? [],
    env: {},
    platform: process.platform,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.userHome === undefined ? {} : { userHome: input.userHome }),
  }, (value) => { output += value; });
  return JSON.parse(output) as SetupOutput;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'eve-copilot-setup-'));
  directories.push(directory);
  return directory;
}
