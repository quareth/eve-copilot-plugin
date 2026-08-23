#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryUrl = 'https://github.com/quareth/eve-copilot-plugin.git';
const repositoryRef = 'main';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pluginDirectory = resolve(scriptDirectory, '..');
const pluginManifest = JSON.parse(readFileSync(
  join(pluginDirectory, '.codex-plugin', 'plugin.json'),
  'utf8',
));
const expectedVersion = pluginManifest.version;
const dataDirectory = defaultDataDirectory();
const runtimeRoot = join(dataDirectory, 'runtime');
const currentDirectory = join(runtimeRoot, 'current');
const currentEntry = join(currentDirectory, 'dist', 'cli', 'main.js');
const command = process.argv[2] ?? 'status';

if (command === 'status') {
  writeJson(runtimeStatus());
} else if (command === 'install') {
  await installRuntime();
} else {
  fail(`Unknown command: ${command}. Use status or install.`);
}

async function installRuntime() {
  const status = runtimeStatus();
  if (!status.prerequisites.node.supported) {
    fail(`Node.js 24, 25, or 26 is required; found ${process.versions.node}.`);
    return;
  }
  if (!status.prerequisites.git.available) {
    fail('Git is required to download the EVE Copilot runtime.');
    return;
  }
  if (!status.prerequisites.npm.available) {
    fail('npm is required to install the EVE Copilot runtime dependencies.');
    return;
  }
  if (status.runtime.healthy && status.runtime.version === expectedVersion) {
    writeJson({ ...status, changed: false });
    return;
  }

  await mkdir(runtimeRoot, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const stagingDirectory = join(runtimeRoot, `.staging-${suffix}`);
  const backupDirectory = join(runtimeRoot, `.previous-${suffix}`);
  let currentMoved = false;

  try {
    run('git', [
      'clone',
      '--depth', '1',
      '--single-branch',
      '--branch', repositoryRef,
      repositoryUrl,
      stagingDirectory,
    ]);

    const downloadedManifest = JSON.parse(readFileSync(
      join(stagingDirectory, 'package.json'),
      'utf8',
    ));
    if (downloadedManifest.version !== expectedVersion) {
      throw new Error(
        `The plugin expects runtime ${expectedVersion}, but ${repositoryRef} provides ${downloadedManifest.version}. Update the plugin and try again.`,
      );
    }

    run(npmExecutable(), ['ci', '--no-audit', '--no-fund'], stagingDirectory);
    run(npmExecutable(), ['run', 'build'], stagingDirectory);
    run(npmExecutable(), [
      'prune', '--omit=dev', '--no-audit', '--no-fund',
    ], stagingDirectory);
    await rm(join(stagingDirectory, '.git'), { recursive: true, force: true });

    const stagedEntry = join(stagingDirectory, 'dist', 'cli', 'main.js');
    const versionOutput = run(process.execPath, [stagedEntry, 'version'], stagingDirectory, true).trim();
    if (versionOutput !== `EVE Copilot MCP ${expectedVersion}`) {
      throw new Error(`Runtime verification returned an unexpected version: ${versionOutput}`);
    }

    if (existsSync(currentDirectory)) {
      await rename(currentDirectory, backupDirectory);
      currentMoved = true;
    }
    try {
      await rename(stagingDirectory, currentDirectory);
    } catch (error) {
      if (currentMoved && !existsSync(currentDirectory)) {
        await rename(backupDirectory, currentDirectory);
        currentMoved = false;
      }
      throw error;
    }
    if (currentMoved) await rm(backupDirectory, { recursive: true, force: true });

    writeJson({ ...runtimeStatus(), changed: true });
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    fail(error instanceof Error ? error.message : String(error));
  }
}

function runtimeStatus() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  const installedVersion = runtimeVersion(currentEntry);
  return {
    expected_version: expectedVersion,
    data_directory: dataDirectory,
    runtime: {
      directory: currentDirectory,
      installed: existsSync(currentEntry),
      healthy: installedVersion !== null,
      version: installedVersion,
    },
    prerequisites: {
      node: {
        available: true,
        version: process.versions.node,
        supported: nodeMajor >= 24 && nodeMajor < 27,
      },
      npm: commandStatus(npmExecutable(), ['--version']),
      git: commandStatus('git', ['--version']),
    },
  };
}

function runtimeVersion(entry) {
  if (!existsSync(entry)) return null;
  const result = spawnSync(process.execPath, [entry, 'version'], {
    cwd: currentDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  const match = /^EVE Copilot MCP (\S+)$/u.exec(result.stdout.trim());
  return match?.[1] ?? null;
}

function commandStatus(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return {
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim() : null,
  };
}

function run(executable, args, cwd = undefined, capture = false) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} exited with status ${result.status ?? 'unknown'}.`);
  }
  return result.stdout ?? '';
}

function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

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

function nonEmpty(value) {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
