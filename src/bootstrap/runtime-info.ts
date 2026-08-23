import type { RuntimeInfo } from '../application/dto/runtime-info.js';

export const APP_NAME = 'eve-copilot-mcp' as const;
export const APP_TITLE = 'EVE Copilot MCP' as const;
export const APP_VERSION = '0.1.4';
export const MCP_SDK_MAJOR = 2 as const;

export type { RuntimeInfo } from '../application/dto/runtime-info.js';

export function getRuntimeInfo(): RuntimeInfo {
  const platform = process.platform === 'darwin'
    || process.platform === 'win32'
    || process.platform === 'linux'
    ? process.platform
    : 'other';
  return {
    name: APP_NAME,
    title: APP_TITLE,
    version: APP_VERSION,
    node: process.versions.node,
    platform,
    architecture: process.arch,
    mcpSdkMajor: MCP_SDK_MAJOR,
  };
}
