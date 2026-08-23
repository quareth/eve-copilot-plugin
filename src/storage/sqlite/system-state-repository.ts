import { z } from 'zod';
import type {
  CleanShutdownState,
  ContinuationSecretState,
  InstallationState,
  SystemStateRepository,
} from '../../application/ports/system-state-repository.js';
import type { DatabaseHandle } from './database-handle.js';

const installationSchema = z.object({
  installation_id: z.uuid(),
  created_at: z.iso.datetime(),
}).strict();

const cleanShutdownSchema = z.object({
  at: z.iso.datetime(),
  version: z.string().min(1).max(100),
}).strict();

const continuationSecretSchema = z.object({
  secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  created_at: z.iso.datetime(),
}).strict();

interface StateRow {
  readonly value_json: string;
}

export class SqliteSystemStateRepository implements SystemStateRepository {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  getInstallation(): InstallationState | null {
    const row = this.read('installation');
    if (row === null) return null;
    const value = installationSchema.parse(row);
    return { installationId: value.installation_id, createdAt: value.created_at };
  }

  initializeInstallation(state: InstallationState): InstallationState {
    const stored = installationSchema.parse({
      installation_id: state.installationId,
      created_at: state.createdAt,
    });
    this.#database.raw.prepare(`
      INSERT INTO system_state (key, value_json, updated_at)
      VALUES ('installation', ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(JSON.stringify(stored), state.createdAt);
    const result = this.getInstallation();
    if (result === null) throw new Error('Installation state was not persisted.');
    return result;
  }

  getLastCleanShutdown(): CleanShutdownState | null {
    const row = this.read('last_clean_shutdown');
    return row === null ? null : cleanShutdownSchema.parse(row);
  }

  setLastCleanShutdown(state: CleanShutdownState): void {
    const stored = cleanShutdownSchema.parse(state);
    this.#database.raw.prepare(`
      INSERT INTO system_state (key, value_json, updated_at)
      VALUES ('last_clean_shutdown', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(JSON.stringify(stored), state.at);
  }

  getContinuationSecret(): ContinuationSecretState | null {
    const row = this.read('continuation_secret');
    if (row === null) return null;
    const value = continuationSecretSchema.parse(row);
    return { secret: value.secret, createdAt: value.created_at };
  }

  initializeContinuationSecret(state: ContinuationSecretState): ContinuationSecretState {
    const stored = continuationSecretSchema.parse({ secret: state.secret, created_at: state.createdAt });
    this.#database.raw.prepare(`
      INSERT INTO system_state (key, value_json, updated_at)
      VALUES ('continuation_secret', ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(JSON.stringify(stored), state.createdAt);
    const result = this.getContinuationSecret();
    if (result === null) throw new Error('Continuation secret was not persisted.');
    return result;
  }

  private read(key: 'installation' | 'last_clean_shutdown' | 'continuation_secret'): unknown {
    const row = this.#database.raw.prepare('SELECT value_json FROM system_state WHERE key = ?').get(key) as StateRow | undefined;
    return row === undefined ? null : JSON.parse(row.value_json);
  }
}
