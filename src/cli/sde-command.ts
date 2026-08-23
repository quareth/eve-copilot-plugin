import type { AppConfig } from '../config/config-schema.js';
import { ensurePrivateDirectory } from '../storage/file-permissions.js';
import { openDatabase } from '../storage/sqlite/open-database.js';
import { SystemClock } from '../platform/system-clock.js';
import { UuidGenerator } from '../platform/uuid-generator.js';
import { SdeManager } from '../infrastructure/sde/sde-manager.js';

export async function runSdeCommand(config: Readonly<AppConfig>): Promise<void> {
  const clock = new SystemClock();
  ensurePrivateDirectory(config.dataDir);
  const database = openDatabase({
    path: config.databasePath,
    busyTimeoutMs: config.databaseBusyTimeoutMs,
    clock,
  });
  try {
    const manager = new SdeManager({
      directory: config.sdeDir,
      database,
      clock,
      idGenerator: new UuidGenerator(),
    });
    const result = config.sdeCommand === 'status'
      ? manager.status()
      : await manager.install(config.sdeCommand ?? 'install', new AbortController().signal);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    database.close();
  }
}
