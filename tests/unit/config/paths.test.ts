import { describe, expect, it } from 'vitest';
import { defaultPaths } from '../../../src/config/paths.js';

describe('defaultPaths', () => {
  it('uses Application Support on macOS', () => {
    expect(defaultPaths('darwin', {}, '/Users/pilot')).toEqual({
      configFile: '/Users/pilot/Library/Application Support/EVE Copilot MCP/config.json',
      dataDir: '/Users/pilot/Library/Application Support/EVE Copilot MCP',
    });
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(defaultPaths('win32', { LOCALAPPDATA: 'C:\\Users\\pilot\\Local' }, 'C:\\Users\\pilot'))
      .toEqual({
        configFile: 'C:\\Users\\pilot\\Local\\EVE Copilot MCP\\config.json',
        dataDir: 'C:\\Users\\pilot\\Local\\EVE Copilot MCP',
      });
  });

  it('uses XDG paths on Linux', () => {
    expect(defaultPaths('linux', {
      XDG_CONFIG_HOME: '/config',
      XDG_DATA_HOME: '/data',
    }, '/home/pilot')).toEqual({
      configFile: '/config/eve-copilot-mcp/config.json',
      dataDir: '/data/eve-copilot-mcp',
    });
  });
});
