import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pluginDirectory = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(pluginDirectory, '..', '..');
const developmentEntry = resolve(repositoryRoot, 'dist', 'cli', 'main.js');
const explicitRuntimeDirectory = nonEmpty(process.env.EVE_COPILOT_RUNTIME_DIR);
delete process.env.EVE_COPILOT_RUNTIME_DIR;
const runtimeEntry = existsSync(developmentEntry)
  ? developmentEntry
  : findManagedEntry(explicitRuntimeDirectory) ?? findGlobalEntry();
const requestedArguments = process.argv.slice(2);
const serverArguments = requestedArguments.length === 0 ? ['serve'] : requestedArguments;

if (runtimeEntry === null) {
  process.stderr.write([
    "EVE Copilot's local capability runtime is not available.",
    'Open a Codex task and say: Set up EVE Copilot.',
    'The setup skill will check prerequisites and install the runtime after your approval.',
    '',
  ].join('\n'));
  process.exitCode = 127;
} else {
  process.argv = [process.execPath, runtimeEntry, ...serverArguments];
  try {
    await import(pathToFileURL(runtimeEntry).href);
  } catch {
    process.stderr.write("EVE Copilot's local capability runtime failed to start. Ask Codex to repair EVE Copilot.\n");
    process.exitCode = 1;
  }
}

// JavaScript launcher: the return shape is enforced by null/file existence checks.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function findManagedEntry(runtimeOverride) {
  const runtimeDirectories = [
    runtimeOverride,
    join(defaultDataDirectory(), 'runtime', 'current'),
  ].filter((path) => path !== undefined);

  for (const runtimeDirectory of runtimeDirectories) {
    const candidate = join(runtimeDirectory, 'dist', 'cli', 'main.js');
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function defaultDataDirectory() {
  const explicitDataDirectory = nonEmpty(process.env.EVE_COPILOT_DATA_DIR);
  if (explicitDataDirectory !== undefined) return resolve(explicitDataDirectory);

  const userHome = homedir();
  if (process.platform === 'darwin') {
    return join(userHome, 'Library', 'Application Support', 'EVE Copilot MCP');
  }
  if (process.platform === 'win32') {
    const localAppData = nonEmpty(process.env.LOCALAPPDATA)
      ?? join(userHome, 'AppData', 'Local');
    return join(localAppData, 'EVE Copilot MCP');
  }

  const dataRoot = nonEmpty(process.env.XDG_DATA_HOME)
    ?? join(userHome, '.local', 'share');
  return join(dataRoot, 'eve-copilot-mcp');
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function nonEmpty(value) {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

// JavaScript launcher: the return shape is enforced by null/file existence checks.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function findGlobalEntry() {
  const executableName = process.platform === 'win32'
    ? 'eve-copilot-mcp.cmd'
    : 'eve-copilot-mcp';
  const pathDirectories = (process.env.PATH ?? '')
    .split(delimiter)
    .filter((path) => path.length > 0);

  for (const pathDirectory of pathDirectories) {
    const adjacentPackageCandidate = join(
      pathDirectory,
      'node_modules',
      'eve-copilot-mcp',
      'dist',
      'cli',
      'main.js',
    );
    if (existsSync(adjacentPackageCandidate)) return adjacentPackageCandidate;

    if (process.platform !== 'win32') {
      const executable = join(pathDirectory, executableName);
      if (existsSync(executable)) {
        try {
          const target = realpathSync(executable);
          if (existsSync(target) && target.endsWith(join('dist', 'cli', 'main.js'))) return target;
        } catch {
          // Continue through the deterministic npm layout candidates.
        }
      }
    }

    if (process.platform !== 'win32') {
      const packageRoot = resolve(pathDirectory, '..', 'lib', 'node_modules', 'eve-copilot-mcp');
      const candidate = join(packageRoot, 'dist', 'cli', 'main.js');
      if (existsSync(candidate)) return candidate;
    }
  }

  const nodeDirectory = dirname(process.execPath);
  const nodeRelativePackageRoot = process.platform === 'win32'
    ? join(nodeDirectory, 'node_modules', 'eve-copilot-mcp')
    : resolve(nodeDirectory, '..', 'lib', 'node_modules', 'eve-copilot-mcp');
  const nodeRelativeCandidate = join(nodeRelativePackageRoot, 'dist', 'cli', 'main.js');
  return existsSync(nodeRelativeCandidate) ? nodeRelativeCandidate : null;
}
