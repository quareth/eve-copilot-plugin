#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { runNpm } from './npm-cli.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = await mkdtemp(join(tmpdir(), 'eve-copilot-package-'));
const tarballDirectory = join(fixtureRoot, 'tarball');
const installDirectory = join(fixtureRoot, 'install');
const dataDirectory = join(fixtureRoot, 'data');
const concurrentDataDirectory = join(fixtureRoot, 'concurrent-data');
const actionToolNames = [
  'prepare_eve_action',
  'execute_eve_action',
  'set_autopilot_waypoint',
  'respond_to_calendar_event',
  'send_eve_mail',
  'save_fitting',
  'delete_saved_fitting',
];

try {
  await mkdir(tarballDirectory, { recursive: true });
  const packOutput = runNpm([
    'pack',
    '--json',
    '--pack-destination',
    tarballDirectory,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [pack] = JSON.parse(packOutput);
  if (pack === undefined || typeof pack.filename !== 'string') {
    throw new Error('npm pack did not report a tarball filename.');
  }
  const tarball = join(tarballDirectory, pack.filename);
  runNpm([
    'install',
    '--no-audit',
    '--no-fund',
    '--prefix',
    installDirectory,
    tarball,
  ], { cwd: fixtureRoot, stdio: 'inherit' });

  const executable = join(
    installDirectory,
    'node_modules',
    'eve-copilot-mcp',
    'dist',
    'cli',
    'main.js',
  );
  const semanticModule = await import(pathToFileURL(join(
    installDirectory,
    'node_modules',
    'eve-copilot-mcp',
    'dist',
    'capabilities',
    'generated',
    'semantic-tools.js',
  )).href);
  const semanticTools = semanticModule.ESI_SEMANTIC_TOOLS;
  if (!Array.isArray(semanticTools) || semanticTools.length !== 45) {
    throw new Error('Installed package is missing the generated semantic tool registry.');
  }
  const installedDogmaDirectory = join(
    installDirectory,
    'node_modules',
    'eve-copilot-mcp',
    'vendor',
    'dogma-engine',
  );
  const installedWasmHash = createHash('sha256')
    .update(readFileSync(join(installedDogmaDirectory, 'esf_dogma_engine_bg.wasm')))
    .digest('hex');
  if (installedWasmHash !== '8ab0ed0365e0a8b6cc097f46d6bf552786720100630b83de1b176263980865cf') {
    throw new Error('Installed package Dogma WASM hash does not match the pinned artifact.');
  }
  const installedGlue = readFileSync(
    join(installedDogmaDirectory, 'esf_dogma_engine.js'),
    'utf8',
  ).replace(/\r\n?/gu, '\n');
  const installedGlueHash = createHash('sha256')
    .update(installedGlue, 'utf8')
    .digest('hex');
  if (installedGlueHash !== '271eccacd1e6df09601b708dfd0af81e1e669209652e93fd1fe5844fcc4373ce') {
    throw new Error('Installed package Dogma JavaScript hash does not match the pinned artifact.');
  }
  const installedLicense = readFileSync(
    join(installedDogmaDirectory, 'LICENSE'),
    'utf8',
  ).replace(/\r\n?/gu, '\n');
  const installedLicenseHash = createHash('sha256').update(installedLicense, 'utf8').digest('hex');
  if (installedLicenseHash !== '6ec726b4a0c6b120e9f5ffe12554247d30aac65beceee9c3f7f9d1e60a0290c6') {
    throw new Error('Installed package is missing the Dogma engine MIT license.');
  }
  const installedDogmaModule = await import(pathToFileURL(join(
    installDirectory,
    'node_modules',
    'eve-copilot-mcp',
    'dist',
    'infrastructure',
    'fitting',
    'one-shot-dogma-engine.js',
  )).href);
  const conformanceDatabase = join(fixtureRoot, 'fitting-conformance.db');
  const compressedConformanceDatabase = Buffer.from(readFileSync(join(
    projectRoot,
    'tests',
    'fixtures',
    'fitting',
    'retribution-sde.db.gz.base64',
  ), 'utf8').trim(), 'base64');
  writeFileSync(conformanceDatabase, gunzipSync(compressedConformanceDatabase), { mode: 0o600 });
  const dogmaResult = await new installedDogmaModule.OneShotDogmaEngine().calculate({
    snapshot: {
      buildNumber: 3464040,
      releaseDate: '2026-08-11T00:00:00Z',
      databasePath: conformanceDatabase,
      importerVersion: 3,
      fittingDataContractVersion: 1,
    },
    fits: [{
      hullTypeId: 11393,
      ownedItemId: null,
      modules: [
        { typeId: 439, slotFamily: 'medium', slotIndex: 0, state: 'active', chargeTypeId: null, itemId: null },
        { typeId: 523, slotFamily: 'low', slotIndex: 0, state: 'active', chargeTypeId: null, itemId: null },
      ],
      drones: [],
      cargo: [],
      source: 'structured',
    }],
    skills: { 3426: 5 },
    profiles: ['sustained_combat_prop_on'],
    capacitorPolicy: { mode: 'report_only' },
    missingSkills: [[]],
  }, new globalThis.AbortController().signal);
  const packagedEvaluation = dogmaResult.evaluations[0];
  if (packagedEvaluation?.metrics.cpu_available !== 175
    || packagedEvaluation.capacitor[0]?.stable !== false
    || packagedEvaluation.capacitor[0]?.depletes_in_seconds !== 234) {
    throw new Error('Installed package Dogma worker failed the pinned Retribution conformance check.');
  }
  const version = execFileSync(process.execPath, [executable, 'version'], {
    encoding: 'utf8',
  }).trim();
  if (version !== 'EVE Copilot MCP 0.1.8') {
    throw new Error(`Unexpected installed version output: ${version}`);
  }
  const pluginLauncher = join(
    projectRoot,
    'plugins',
    'eve-copilot',
    'scripts',
    'launch-eve-copilot-mcp.mjs',
  );
  const pluginVersion = execFileSync(process.execPath, [pluginLauncher, 'version'], {
    encoding: 'utf8',
  }).trim();
  if (pluginVersion !== version) {
    throw new Error(`Unexpected plugin launcher version output: ${pluginVersion}`);
  }
  const pluginInstaller = join(
    projectRoot,
    'plugins',
    'eve-copilot',
    'scripts',
    'install-eve-copilot-mcp.mjs',
  );
  const installerStatus = JSON.parse(execFileSync(process.execPath, [pluginInstaller, 'status'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVE_COPILOT_DATA_DIR: join(fixtureRoot, 'installer-status-data'),
    },
  }));
  if (installerStatus.expected_version !== '0.1.8'
    || installerStatus.runtime?.installed !== false
    || installerStatus.prerequisites?.node?.supported !== true
    || installerStatus.prerequisites?.npm?.available !== true
    || !/^\d+\.\d+\.\d+$/u.test(installerStatus.prerequisites.npm.version ?? '')) {
    throw new Error('Plugin installer status did not report the expected clean state.');
  }
  const setupConfig = join(fixtureRoot, 'setup-config.json');
  const setup = JSON.parse(execFileSync(process.execPath, [
    executable,
    'setup',
    '--config',
    setupConfig,
    '--use-default-user-agent',
    '--persona',
    'caldari',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVE_COPILOT_CONFIG: '',
      EVE_COPILOT_ESI_USER_AGENT: '',
      EVE_COPILOT_EVE_CLIENT_ID: '',
    },
  }));
  if (setup.state !== 'public_ready'
    || setup.configuration?.callback_uri !== 'http://127.0.0.1:17600/oauth/callback') {
    throw new Error('Installed setup command did not configure public ESI readiness.');
  }
  const setupFile = JSON.parse(readFileSync(setupConfig, 'utf8'));
  if (!setupFile.esi_user_agent?.includes('github.com/quareth/eve-copilot-plugin')) {
    throw new Error('Installed setup command did not persist the project User-Agent.');
  }
  if (setupFile.persona_faction !== 'caldari') {
    throw new Error('Installed setup command did not persist the selected faction persona.');
  }
  const cachedLauncher = join(
    fixtureRoot,
    'plugin-cache',
    'scripts',
    'launch-eve-copilot-mcp.mjs',
  );
  await mkdir(dirname(cachedLauncher), { recursive: true });
  await copyFile(pluginLauncher, cachedLauncher);
  const cachedPluginVersion = execFileSync(process.execPath, [cachedLauncher, 'version'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVE_COPILOT_RUNTIME_DIR: join(
        installDirectory,
        'node_modules',
        'eve-copilot-mcp',
      ),
    },
  }).trim();
  if (cachedPluginVersion !== version) {
    throw new Error(`Unexpected cached plugin launcher version output: ${cachedPluginVersion}`);
  }
  const doctor = JSON.parse(execFileSync(process.execPath, [executable,
    'doctor',
    '--data-dir',
    dataDirectory,
    '--log-level',
    'error',
  ], { encoding: 'utf8' }));
  if (doctor.overall !== 'ready') throw new Error('Installed doctor command is not ready.');

  const installed = createInstalledClient(
    executable,
    dataDirectory,
    fixtureRoot,
    'package-smoke',
    { EVE_COPILOT_PERSONA: 'caldari' },
  );
  try {
    await installed.client.connect(installed.transport);
    const tools = await installed.client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    if (names.join(',') !== [
      'get_eve_copilot_profile',
      'get_eve_capabilities',
      'get_server_diagnostics',
      'get_server_status',
      'connect_character',
      'get_character_connection_status',
      'cancel_character_connection',
      'reauthorize_character',
      'list_characters',
      'select_character',
      'disconnect_character',
      'get_character_overview',
      'get_current_location',
      'get_current_ship',
      'execute_eve_read',
      'find_eve_capabilities',
      ...semanticTools.map((tool) => tool.name),
      'analyze_fitting_changes',
      'search_eve_guide',
      'read_eve_guide_page',
      'maintain_eve_guide',
    ].join(',')) {
      throw new Error(`Unexpected installed tool surface: ${names.join(',')}`);
    }
    const result = await installed.client.callTool({ name: 'get_server_status', arguments: {} });
    if (result.isError === true || result.structuredContent === undefined) {
      throw new Error('Installed MCP server status call failed.');
    }
    const profile = await installed.client.callTool({
      name: 'get_eve_copilot_profile', arguments: {},
    });
    if (profile.isError === true
      || profile.structuredContent?.data?.persona?.faction !== 'caldari') {
      throw new Error('Installed MCP server did not expose the selected faction persona.');
    }
    const createdGuidePage = await installed.client.callTool({
      name: 'maintain_eve_guide',
      arguments: {
        action: 'create',
        page_id: 'ships/package-smoke',
        title: 'Package smoke guide page',
        page_kind: 'ship',
        scope: 'user',
        content: '# Package smoke\n\nAdvisory packaged-install verification.',
        freshness: { kind: 'unverified', observed_at: null },
      },
    });
    if (createdGuidePage.isError === true || createdGuidePage.structuredContent === undefined) {
      throw new Error('Installed MCP server guide maintenance call failed.');
    }
    const readGuidePage = await installed.client.callTool({
      name: 'read_eve_guide_page', arguments: { page_id: 'ships/package-smoke' },
    });
    if (readGuidePage.isError === true
      || readGuidePage.structuredContent?.data?.page?.content !== '# Package smoke\n\nAdvisory packaged-install verification.') {
      throw new Error('Installed MCP server guide read did not return canonical advisory content.');
    }
  } finally {
    await installed.client.close();
  }

  const masterOnly = createInstalledClient(
    executable,
    dataDirectory,
    fixtureRoot,
    'package-actions-master-only',
    { EVE_COPILOT_ACTIONS_ENABLED: '1' },
  );
  try {
    await masterOnly.client.connect(masterOnly.transport);
    const tools = await masterOnly.client.listTools();
    if (tools.tools.some((tool) => actionToolNames.includes(tool.name))) {
      throw new Error('Action tools appeared without an explicitly selected action family.');
    }
  } finally {
    await masterOnly.client.close();
  }

  const actionsEnabled = createInstalledClient(
    executable,
    dataDirectory,
    fixtureRoot,
    'package-actions-enabled',
    {
      EVE_COPILOT_ACTIONS_ENABLED: '1',
      EVE_COPILOT_ACTION_FAMILIES: 'ui_actions',
    },
  );
  try {
    await actionsEnabled.client.connect(actionsEnabled.transport);
    const tools = await actionsEnabled.client.listTools();
    const actionNames = tools.tools
      .map((tool) => tool.name)
      .filter((name) => actionToolNames.includes(name));
    if (actionNames.join(',') !== 'prepare_eve_action,execute_eve_action,set_autopilot_waypoint') {
      throw new Error(`Unexpected installed action tool surface: ${actionNames.join(',')}`);
    }
  } finally {
    await actionsEnabled.client.close();
  }

  const concurrent = [
    createInstalledClient(executable, concurrentDataDirectory, fixtureRoot, 'package-concurrent-a'),
    createInstalledClient(executable, concurrentDataDirectory, fixtureRoot, 'package-concurrent-b'),
  ];
  try {
    await Promise.all(concurrent.map(({ client, transport }) => client.connect(transport)));
    const results = await Promise.all(concurrent.map(async ({ client }) => {
      const status = await client.callTool({ name: 'get_server_status', arguments: {} });
      const resource = await client.readResource({ uri: 'eve://server/info' });
      return { status, resource };
    }));
    for (const result of results) {
      if (result.status.isError === true || result.status.structuredContent === undefined) {
        throw new Error('A concurrent installed MCP status call failed.');
      }
      if (result.resource.contents.length !== 1) {
        throw new Error('A concurrent installed MCP resource read failed.');
      }
    }
  } finally {
    await Promise.allSettled(concurrent.map(({ client }) => client.close()));
  }

  process.stdout.write('Package smoke test passed.\n');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

// JavaScript packaging script: the constructed SDK objects define the runtime return shape.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createInstalledClient(executable, dataDir, cwd, name, extraEnvironment = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable, 'serve', '--data-dir', dataDir, '--log-level', 'error'],
    cwd,
    env: serverEnvironment(extraEnvironment),
    stderr: 'pipe',
  });
  transport.stderr?.resume();
  return {
    transport,
    client: new Client({ name, version: '1.0.0' }),
  };
}

// The installed server must start and serve MCP without inheriting a model
// provider credential. EVE SSO configuration is intentionally independent.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function serverEnvironment(extraEnvironment = {}) {
  const blocked = new Set([
    'ANTHROPIC_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'COHERE_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'MISTRAL_API_KEY',
    'OPENAI_API_KEY',
  ]);
  const environmentWithSentinels = {
    ...process.env,
    ...extraEnvironment,
    ...Object.fromEntries([...blocked].map((name) => [name, 'package-smoke-sentinel'])),
  };
  const environment = Object.fromEntries(Object.entries(environmentWithSentinels)
    .filter((entry) => entry[1] !== undefined && !blocked.has(entry[0])));
  if ([...blocked].some((name) => name in environment)) {
    throw new Error('Installed server environment retained a model-provider API key.');
  }
  return environment;
}
