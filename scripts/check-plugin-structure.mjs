import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = join(repositoryRoot, 'plugins', 'eve-copilot');
const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json');
const marketplacePath = join(repositoryRoot, '.agents', 'plugins', 'marketplace.json');
const claudeManifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
const claudeMarketplacePath = join(repositoryRoot, '.claude-plugin', 'marketplace.json');
const packagePath = join(repositoryRoot, 'package.json');
const canonicalRepositoryUrl = 'https://github.com/quareth/eve-copilot-plugin';
const canonicalLicense = 'MIT';

// JavaScript validation script: runtime predicates intentionally avoid a TS build step.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const isDirectory = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const frontmatter = (markdown) => {
  const normalizedMarkdown = markdown
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n');
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(normalizedMarkdown);
  invariant(match, 'Markdown file must start with closed YAML frontmatter');
  const values = new Map();
  for (const line of match[1].split('\n')) {
    const field = /^([a-z][a-z0-9-]*):\s*(.+)$/u.exec(line);
    if (field) values.set(field[1], field[2].trim());
  }
  return values;
};

const windowsFrontmatterProbe = frontmatter(
  '\uFEFF---\r\nname: windows-probe\r\ndescription: CRLF validation\r\n---\r\n',
);
invariant(
  windowsFrontmatterProbe.get('name') === 'windows-probe',
  'frontmatter parser must support Windows CRLF and UTF-8 BOM input',
);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
invariant(manifest.name === basename(pluginRoot), 'plugin name must match its directory');
invariant(manifest.skills === './skills/', 'plugin must expose the canonical skills directory');
invariant(manifest.mcpServers === './.mcp.json', 'plugin must reference .mcp.json');
invariant(manifest.version === packageManifest.version, 'Codex plugin and runtime versions must match');
invariant(manifest.license === canonicalLicense, 'Codex plugin license must match the repository license');
invariant(manifest.homepage === canonicalRepositoryUrl, 'Codex plugin homepage must use the canonical repository URL');
invariant(manifest.repository === canonicalRepositoryUrl, 'Codex plugin repository must use the canonical repository URL');
invariant(manifest.interface?.websiteURL === canonicalRepositoryUrl, 'Codex plugin website must use the canonical repository URL');
invariant(packageManifest.license === canonicalLicense, 'Runtime license metadata must match the repository license');
invariant(packageManifest.homepage === canonicalRepositoryUrl, 'Runtime homepage must use the canonical repository URL');
invariant(packageManifest.repository === canonicalRepositoryUrl, 'Runtime repository must use the canonical repository URL');

const mcpPath = join(pluginRoot, '.mcp.json');
const mcp = JSON.parse(await readFile(mcpPath, 'utf8'));
const eveServer = mcp.mcpServers?.['eve-copilot'];
invariant(eveServer, '.mcp.json must define eve-copilot');
invariant(eveServer.command === 'node', 'eve-copilot MCP command must use the cross-platform Node runtime');
invariant(Array.isArray(eveServer.args), 'eve-copilot MCP arguments are required');
invariant(
  eveServer.args.length === 1 && eveServer.args[0] === './scripts/launch-eve-copilot-mcp.mjs',
  'eve-copilot MCP must use the canonical cross-platform launcher',
);
invariant(await isFile(join(pluginRoot, eveServer.args[0])), 'plugin MCP launcher is missing');
const launcherPath = join(pluginRoot, eveServer.args[0]);
const launcher = await readFile(launcherPath, 'utf8');
const installerPath = join(pluginRoot, 'scripts', 'install-eve-copilot-mcp.mjs');
invariant(await isFile(installerPath), 'plugin runtime installer is missing');
const installer = await readFile(installerPath, 'utf8');
invariant(
  launcher.includes("join(defaultDataDirectory(), 'runtime', 'current')"),
  'plugin launcher must resolve the agent-managed per-user runtime',
);
invariant(
  launcher.includes('Set up EVE Copilot'),
  'missing-runtime guidance must route users to the setup skill',
);
invariant(
  installer.includes(canonicalRepositoryUrl) && installer.includes("['ci', '--no-audit', '--no-fund']"),
  'plugin installer must clone and build the canonical runtime source',
);
invariant(
  !installer.includes('install --global') && !installer.includes("'--global'"),
  'plugin installer must not write a global npm runtime',
);
invariant(!await isDirectory(join(pluginRoot, 'runtime')), 'plugin must not vendor a compiled runtime');
invariant(!await isDirectory(join(pluginRoot, 'node_modules')), 'plugin must not vendor node_modules');
invariant(eveServer.env_vars?.includes('LOCALAPPDATA'), 'plugin must forward Windows LOCALAPPDATA');
invariant(eveServer.env_vars?.includes('USERPROFILE'), 'plugin must forward Windows USERPROFILE');
invariant(
  eveServer.env_vars?.includes('EVE_COPILOT_RUNTIME_DIR'),
  'plugin must forward the optional managed-runtime override',
);
invariant(
  eveServer.env_vars?.includes('EVE_COPILOT_PERSONA'),
  'plugin must forward the optional faction persona override',
);

const claudeManifest = JSON.parse(await readFile(claudeManifestPath, 'utf8'));
invariant(claudeManifest.name === manifest.name, 'Claude and Codex plugin names must match');
invariant(typeof claudeManifest.version === 'string', 'Claude plugin version is required');
invariant(claudeManifest.version === packageManifest.version, 'Claude plugin and runtime versions must match');
invariant(claudeManifest.license === canonicalLicense, 'Claude plugin license must match the repository license');
invariant(claudeManifest.homepage === canonicalRepositoryUrl, 'Claude plugin homepage must use the canonical repository URL');
invariant(claudeManifest.repository === canonicalRepositoryUrl, 'Claude plugin repository must use the canonical repository URL');
invariant(
  claudeManifest.mcpServers === './.claude-mcp.json',
  'Claude plugin must reference its native MCP configuration',
);

const claudeMcpPath = join(pluginRoot, '.claude-mcp.json');
const claudeMcp = JSON.parse(await readFile(claudeMcpPath, 'utf8'));
const claudeServer = claudeMcp.mcpServers?.['eve-copilot'];
invariant(claudeServer?.type === 'stdio', 'Claude plugin MCP server must use stdio');
invariant(claudeServer.command === 'node', 'Claude plugin MCP command must use Node');
invariant(
  claudeServer.args?.length === 1
    && claudeServer.args[0] === '${CLAUDE_PLUGIN_ROOT}/scripts/launch-eve-copilot-mcp.mjs',
  'Claude plugin MCP server must use its cached cross-platform launcher',
);
invariant(claudeServer.timeout === 120_000, 'Claude plugin MCP timeout must cover bounded fitting work');

const marketplace = JSON.parse(await readFile(marketplacePath, 'utf8'));
invariant(typeof marketplace.name === 'string' && marketplace.name.length > 0, 'marketplace name is required');
invariant(Array.isArray(marketplace.plugins), 'marketplace plugins must be an array');
const marketplaceEntry = marketplace.plugins.find((entry) => entry?.name === manifest.name);
invariant(marketplaceEntry, `marketplace entry for ${manifest.name} is required`);
invariant(marketplaceEntry.source?.source === 'local', 'marketplace plugin source must be local');
invariant(
  marketplaceEntry.source?.path === `./plugins/${manifest.name}`,
  'marketplace plugin path must target the canonical plugin directory',
);
invariant(marketplaceEntry.policy?.installation === 'AVAILABLE', 'plugin must be available to install');
invariant(marketplaceEntry.policy?.authentication === 'ON_INSTALL', 'plugin must authenticate on install');
invariant(typeof marketplaceEntry.category === 'string', 'marketplace plugin category is required');

const claudeMarketplace = JSON.parse(await readFile(claudeMarketplacePath, 'utf8'));
invariant(claudeMarketplace.name === 'eve-copilot', 'Claude marketplace name must be eve-copilot');
invariant(typeof claudeMarketplace.owner?.name === 'string', 'Claude marketplace owner is required');
invariant(claudeMarketplace.version === packageManifest.version, 'Claude marketplace and runtime versions must match');
invariant(Array.isArray(claudeMarketplace.plugins), 'Claude marketplace plugins must be an array');
const claudeMarketplaceEntry = claudeMarketplace.plugins.find((entry) => entry?.name === manifest.name);
invariant(claudeMarketplaceEntry, `Claude marketplace entry for ${manifest.name} is required`);
invariant(
  claudeMarketplaceEntry.source === `./plugins/${manifest.name}`,
  'Claude marketplace plugin path must target the shared canonical plugin directory',
);
invariant(claudeMarketplaceEntry.strict === true, 'Claude marketplace plugin must use strict mode');
invariant(
  claudeMarketplaceEntry.version === claudeManifest.version,
  'Claude marketplace and plugin manifest versions must match',
);
invariant(claudeMarketplaceEntry.license === canonicalLicense, 'Claude marketplace license must match the repository license');
invariant(claudeMarketplaceEntry.homepage === canonicalRepositoryUrl, 'Claude marketplace homepage must use the canonical repository URL');
invariant(claudeMarketplaceEntry.repository === canonicalRepositoryUrl, 'Claude marketplace repository must use the canonical repository URL');

const skillsRoot = join(pluginRoot, 'skills');
const skillDirectories = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
invariant(skillDirectories.length > 0, 'plugin must contain at least one skill');

for (const entry of skillDirectories) {
  const skillRoot = join(skillsRoot, entry.name);
  const skillMarkdown = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
  const metadata = frontmatter(skillMarkdown);
  invariant(metadata.get('name') === entry.name, `skill ${entry.name} name must match its directory`);
  invariant(Boolean(metadata.get('description')), `skill ${entry.name} needs a description`);

  for (const match of skillMarkdown.matchAll(/\((references\/[^)#]+\.md)\)/gu)) {
    invariant(await isFile(join(skillRoot, match[1])), `skill ${entry.name} references missing ${match[1]}`);
  }

  const agentYamlPath = join(skillRoot, 'agents', 'openai.yaml');
  if (await isFile(agentYamlPath)) {
    const agentYaml = await readFile(agentYamlPath, 'utf8');
    invariant(agentYaml.includes(`$${entry.name}`), `skill ${entry.name} default prompt must name the skill`);
  }
}

const discoveryRoot = join(repositoryRoot, '.agents', 'skills');
for (const entry of skillDirectories) {
  const discoveryPath = join(discoveryRoot, entry.name);
  invariant((await lstat(discoveryPath)).isSymbolicLink(), `${discoveryPath} must be a symlink`);
  invariant(
    await realpath(discoveryPath) === await realpath(join(skillsRoot, entry.name)),
    `${discoveryPath} must target the canonical plugin skill`,
  );
}

const agentsRoot = join(repositoryRoot, '.codex', 'agents');
invariant(await isDirectory(agentsRoot), '.codex/agents is missing');
const agentFiles = (await readdir(agentsRoot)).filter((name) => name.endsWith('.toml'));
const requiredAgentProfiles = new Map([
  [
    'eve_exploration_preparation.toml',
    { skill: '$eve-exploration', reasoning: 'model_reasoning_effort = "medium"' },
  ],
  [
    'eve_active_exploration.toml',
    { skill: '$eve-exploration', reasoning: 'model_reasoning_effort = "low"' },
  ],
  [
    'eve_mining_preparation.toml',
    { skill: '$eve-mining', reasoning: 'model_reasoning_effort = "medium"' },
  ],
  [
    'eve_active_mining.toml',
    { skill: '$eve-mining', reasoning: 'model_reasoning_effort = "low"' },
  ],
]);

const requiredClaudeAgentProfiles = new Map([
  [
    'eve-active-exploration.md',
    { name: 'eve-active-exploration', skill: 'eve-exploration', effort: 'low' },
  ],
  [
    'eve-active-mining.md',
    { name: 'eve-active-mining', skill: 'eve-mining', effort: 'low' },
  ],
  [
    'eve-exploration-preparation.md',
    { name: 'eve-exploration-preparation', skill: 'eve-exploration', effort: 'medium' },
  ],
  [
    'eve-mining-preparation.md',
    { name: 'eve-mining-preparation', skill: 'eve-mining', effort: 'medium' },
  ],
]);

for (const agentFile of agentFiles) {
  const contents = await readFile(join(agentsRoot, agentFile), 'utf8');
  for (const field of ['name', 'description', 'developer_instructions']) {
    invariant(new RegExp(`^${field}\\s*=`, 'mu').test(contents), `${agentFile} is missing ${field}`);
  }
}

for (const [agentFile, expected] of requiredAgentProfiles) {
  invariant(agentFiles.includes(agentFile), `${agentFile} is required`);
  const contents = await readFile(join(agentsRoot, agentFile), 'utf8');
  invariant(contents.includes('model = "gpt-5.6-sol"'), `${agentFile} must use gpt-5.6-sol`);
  invariant(contents.includes(expected.skill), `${agentFile} must use ${expected.skill}`);
  invariant(contents.includes('$eve-persona'), `${agentFile} must use $eve-persona`);
  invariant(contents.includes(expected.reasoning), `${agentFile} has the wrong reasoning profile`);
}

const claudeAgentsRoot = join(pluginRoot, 'agents');
for (const [agentFile, expected] of requiredClaudeAgentProfiles) {
  const contents = await readFile(join(claudeAgentsRoot, agentFile), 'utf8');
  const metadata = frontmatter(contents);
  invariant(metadata.get('name') === expected.name, `${agentFile} has the wrong Claude agent name`);
  invariant(Boolean(metadata.get('description')), `${agentFile} needs a Claude agent description`);
  invariant(metadata.get('model') === 'inherit', `${agentFile} must inherit the user's Claude model`);
  invariant(metadata.get('effort') === expected.effort, `${agentFile} has the wrong Claude effort profile`);
  invariant(contents.includes(`  - ${expected.skill}`), `${agentFile} must preload ${expected.skill}`);
  invariant(contents.includes('  - eve-persona'), `${agentFile} must preload eve-persona`);
  invariant(contents.includes('  - Write'), `${agentFile} must disallow file writes`);
  invariant(contents.includes('  - Edit'), `${agentFile} must disallow file edits`);
}

process.stdout.write(`Plugin structure is valid: ${pluginRoot}\n`);
