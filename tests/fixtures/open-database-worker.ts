import { openDatabase } from '../../src/storage/sqlite/open-database.js';
import { SqliteSystemStateRepository } from '../../src/storage/sqlite/system-state-repository.js';
import { SystemClock } from '../../src/platform/system-clock.js';
import { UuidGenerator } from '../../src/platform/uuid-generator.js';

const path = process.argv[2];
if (path === undefined) throw new Error('Database path is required.');
const clock = new SystemClock();
const database = openDatabase({ path, busyTimeoutMs: 5000, clock });
const repository = new SqliteSystemStateRepository(database);
repository.initializeInstallation({
  installationId: new UuidGenerator().next(),
  createdAt: clock.now().toISOString(),
});
setTimeout(() => {
  database.close();
}, 50);
