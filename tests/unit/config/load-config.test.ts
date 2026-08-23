import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/load-config.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-config-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('loadConfig', () => {
  it('uses platform defaults and serve logging defaults', () => {
    const config = loadConfig({ argv: ['serve'], env: {}, platform: 'linux', userHome: '/home/pilot' });
    expect(config).toMatchObject({
      command: 'serve',
      dataDir: '/home/pilot/.local/share/eve-copilot-mcp',
      databasePath: '/home/pilot/.local/share/eve-copilot-mcp/eve-copilot.db',
      logLevel: 'info',
      logFormat: 'json',
      requestTimeoutMs: 30_000,
      databaseBusyTimeoutMs: 5_000,
      dataDirectoryKind: 'default',
      actionsEnabled: false,
      actionFamilies: [],
      personaFaction: 'none',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('loads a validated persistent persona from file or environment', () => {
    const directory = temporaryDirectory();
    const configFile = join(directory, 'config.json');
    writeFileSync(configFile, JSON.stringify({ persona_faction: 'amarr' }));

    expect(loadConfig({ argv: ['serve', '--config', configFile], env: {} }).personaFaction)
      .toBe('amarr');
    expect(loadConfig({
      argv: ['serve', '--config', configFile],
      env: { EVE_COPILOT_PERSONA: 'minmatar' },
    }).personaFaction).toBe('minmatar');
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_PERSONA: 'jove' },
    })).toThrow();
  });

  it('requires an explicit master switch and reviewed action families', () => {
    const config = loadConfig({
      argv: ['serve'],
      env: {
        EVE_COPILOT_ACTIONS_ENABLED: '1',
        EVE_COPILOT_ACTION_FAMILIES: 'ui_actions,mail_send,mail_organize,calendar_respond',
      },
      platform: 'linux',
      userHome: '/home/pilot',
    });
    expect(config.actionsEnabled).toBe(true);
    expect(config.actionFamilies).toEqual([
      'calendar_respond',
      'mail_organize',
      'mail_send',
      'ui_actions',
    ]);
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_ACTIONS_ENABLED: 'true' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow(/must be exactly 1/u);
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_ACTION_FAMILIES: 'ui_actions,unknown' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow();
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_ACTION_FAMILIES: 'mail_write' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow();
  });

  it('applies CLI over environment over file over defaults', () => {
    const directory = temporaryDirectory();
    const configFile = join(directory, 'config.json');
    writeFileSync(configFile, JSON.stringify({
      data_dir: './from-file',
      log_level: 'warn',
      log_format: 'pretty',
      request_timeout_ms: 1000,
      database_busy_timeout_ms: 2000,
    }));

    const config = loadConfig({
      argv: ['doctor', '--config', configFile, '--data-dir', './from-cli', '--log-level', 'debug'],
      env: {
        EVE_COPILOT_LOG_LEVEL: 'error',
        EVE_COPILOT_REQUEST_TIMEOUT_MS: '3000',
      },
      cwd: directory,
    });

    expect(config.dataDir).toBe(join(directory, 'from-cli'));
    expect(config.databasePath).toBe(join(directory, 'from-cli', 'eve-copilot.db'));
    expect(config.logLevel).toBe('debug');
    expect(config.logFormat).toBe('pretty');
    expect(config.requestTimeoutMs).toBe(3000);
    expect(config.databaseBusyTimeoutMs).toBe(2000);
    expect(config.dataDirectoryKind).toBe('custom');
  });

  it('rejects unknown project environment variables', () => {
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_TYPO: 'true' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow(/Unknown EVE Copilot environment variable/u);
  });

  it('rejects malformed bounded integers', () => {
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_REQUEST_TIMEOUT_MS: '1e3' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow(/must be an integer/u);
    expect(() => loadConfig({
      argv: ['serve'],
      env: { EVE_COPILOT_REQUEST_TIMEOUT_MS: '99' },
      platform: 'linux',
      userHome: '/home/pilot',
    })).toThrow(/between 100 and 120000/u);
  });

  it('rejects unknown file keys', () => {
    const directory = temporaryDirectory();
    const configFile = join(directory, 'config.json');
    writeFileSync(configFile, JSON.stringify({ unknown: true }));
    expect(() => loadConfig({ argv: ['serve', '--config', configFile], env: {} })).toThrow();
  });

  it('rejects unknown commands and flags', () => {
    expect(() => loadConfig({ argv: ['launch'], env: {} })).toThrow();
    expect(() => loadConfig({ argv: ['serve', '--unknown', 'x'], env: {} })).toThrow(/Unknown CLI flag/u);
  });

  it('rejects non-directory data targets and non-db database names', () => {
    const directory = temporaryDirectory();
    const occupied = join(directory, 'occupied');
    writeFileSync(occupied, 'file', 'utf8');
    expect(() => loadConfig({ argv: ['serve', '--data-dir', occupied], env: {} }))
      .toThrow(/not a directory/u);
    expect(() => loadConfig({
      argv: ['serve', '--data-dir', directory, '--database', join(directory, 'state.sqlite')],
      env: {},
    })).toThrow(/\.db extension/u);
  });
});
