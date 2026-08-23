import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

export interface PathEnvironment {
  readonly [key: string]: string | undefined;
  readonly HOME?: string;
  readonly LOCALAPPDATA?: string;
  readonly XDG_CONFIG_HOME?: string;
  readonly XDG_DATA_HOME?: string;
}

export interface DefaultPaths {
  readonly configFile: string;
  readonly dataDir: string;
}

export function defaultPaths(
  platform: NodeJS.Platform = process.platform,
  env: PathEnvironment = process.env,
  userHome: string = homedir(),
): DefaultPaths {
  if (platform === 'darwin') {
    return {
      configFile: posix.join(
        userHome,
        'Library',
        'Application Support',
        'EVE Copilot MCP',
        'config.json',
      ),
      dataDir: posix.join(userHome, 'Library', 'Application Support', 'EVE Copilot MCP'),
    };
  }

  if (platform === 'win32') {
    const localAppData = nonEmpty(env.LOCALAPPDATA)
      ?? win32.join(userHome, 'AppData', 'Local');
    const root = win32.join(localAppData, 'EVE Copilot MCP');
    return { configFile: win32.join(root, 'config.json'), dataDir: root };
  }

  const dataRoot = nonEmpty(env.XDG_DATA_HOME) ?? posix.join(userHome, '.local', 'share');
  const configRoot = nonEmpty(env.XDG_CONFIG_HOME) ?? posix.join(userHome, '.config');
  return {
    configFile: posix.join(configRoot, 'eve-copilot-mcp', 'config.json'),
    dataDir: posix.join(dataRoot, 'eve-copilot-mcp'),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}
