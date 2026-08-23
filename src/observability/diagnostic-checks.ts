import { closeSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../config/config-schema.js';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type {
  ComponentCheck,
  ComponentState,
  DatabaseMetadata,
  DatabaseMetadataPort,
  DiagnosticGroup,
  HealthCheck,
  ProtocolStatePort,
} from '../application/ports/health-check.js';
import type { CapabilityRegistry } from '../domain/capability-registry.js';
import { throwIfAborted } from '../domain/errors.js';
import type { DatabaseHandle } from '../storage/sqlite/database-handle.js';
import { inspectDatabase } from '../storage/sqlite/integrity-check.js';
import type { RuntimeInfo } from '../bootstrap/runtime-info.js';
import { inspectPrivatePermissions } from '../storage/file-permissions.js';
import type { ResultWarning } from '../domain/warning.js';
import type { CredentialStore } from '../application/ports/credential-store.js';
import type { SdeRepository } from '../application/ports/sde-repository.js';
import type { GuideRepository } from '../application/ports/guide-repository.js';

export class MutableProtocolState implements ProtocolStatePort {
  #version: string | null = null;

  negotiatedVersion(): string | null {
    return this.#version;
  }

  setNegotiatedVersion(value: string | null): void {
    this.#version = value;
  }
}

export class SqliteMetadataPort implements DatabaseMetadataPort {
  readonly #database: DatabaseHandle;

  constructor(database: DatabaseHandle) {
    this.#database = database;
  }

  inspect(full: boolean): DatabaseMetadata {
    const inspection = inspectDatabase(this.#database, full);
    return { schemaVersion: inspection.schemaVersion, mode: inspection.journalMode };
  }
}

export function createDiagnosticChecks(input: {
  readonly config: Readonly<AppConfig>;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly runtime: RuntimeInfo;
  readonly database: DatabaseHandle;
  readonly registry: CapabilityRegistry;
  readonly credentials: CredentialStore;
  readonly sde: SdeRepository;
  readonly guide: GuideRepository;
  readonly transportState: () => 'constructed' | 'connected' | 'closed';
}): readonly HealthCheck[] {
  return [
    check('runtime.node', 'runtime', true, input.clock, (signal) => {
      throwIfAborted(signal);
      const major = Number(input.runtime.node.split('.')[0]);
      return major >= 24 && major < 27
        ? result('ok', 'The Node.js runtime is supported.', input.runtime.node)
        : result('unavailable', 'The Node.js runtime is not supported.', input.runtime.node);
    }),
    check('storage.data_directory', 'storage', true, input.clock, (signal) => {
      throwIfAborted(signal);
      const probe = join(input.config.dataDir, `.write-probe-${input.idGenerator.next()}`);
      try {
        const descriptor = openSync(probe, 'wx', 0o600);
        closeSync(descriptor);
        unlinkSync(probe);
        const permissions = inspectPrivatePermissions(input.config.dataDir, 0o700);
        if (!permissions.secure) {
          return result('degraded', 'The local data directory permissions are broader than recommended.', undefined, [{
            code: 'DATA_DIRECTORY_PERMISSIONS',
            message: 'Restrict the local data directory to the current user.',
          }]);
        }
        return result('ok', 'The local data directory is writable.');
      } catch {
        try { unlinkSync(probe); } catch { /* exact probe may not exist */ }
        return result('unavailable', 'The local data directory is not writable.');
      }
    }),
    check('storage.sqlite', 'storage', true, input.clock, (signal) => {
      throwIfAborted(signal);
      const inspection = inspectDatabase(input.database, false);
      const permissions = inspectPrivatePermissions(input.database.path, 0o600);
      if (!permissions.secure) {
        return result('degraded', 'The local SQLite database permissions are broader than recommended.', undefined, [{
          code: 'DATABASE_FILE_PERMISSIONS',
          message: 'Restrict the local database file to the current user.',
        }]);
      }
      return inspection.quickCheck === 'ok'
        && inspection.foreignKeys
        && inspection.journalMode === 'wal'
        ? result('ok', 'The local SQLite database is ready.', String(inspection.schemaVersion))
        : result('unavailable', 'The local SQLite database is not ready.');
    }),
    asyncCheck('storage.guide', 'storage', false, input.clock, async (signal) => {
      throwIfAborted(signal);
      const health = await input.guide.health();
      if (health.state === 'available') {
        return result('ok', `The private EVE guide is ready with ${String(health.page_count)} pages and ${String(health.revision_count)} revisions.`, '1');
      }
      if (health.state === 'degraded') {
        return result('degraded', `The private EVE guide isolated ${String(health.invalid_page_count)} malformed pages.`, '1', [{
          code: 'GUIDE_PAGES_INVALID',
          message: 'Malformed guide pages are excluded from recall until repaired or removed.',
        }]);
      }
      return result('degraded', 'The private EVE guide is unavailable; authoritative EVE tools remain usable.');
    }),
    check('registry.capabilities', 'registry', true, input.clock, (signal) => {
      throwIfAborted(signal);
      const counts = input.registry.counts();
      return counts.available > 0 && counts.degraded === 0 && counts.planned === 0
        ? result('ok', 'The capability registry is valid.', `available=${String(counts.available)}`)
        : result('unavailable', 'The capability registry is incomplete.');
    }),
    check('transport.stdio', 'transport', input.config.command === 'serve', input.clock, (signal) => {
      throwIfAborted(signal);
      if (input.config.command !== 'serve') return result('not_configured', 'The stdio transport is not started by this command.');
      const state = input.transportState();
      return state === 'closed'
        ? result('unavailable', 'The stdio transport is closed.')
        : result('ok', `The stdio transport is ${state}.`);
    }),
    asyncCheck('eve.sde', 'planned_adapters', false, input.clock, async (signal) => {
      throwIfAborted(signal);
      const status = await input.sde.status();
      if (status.state === 'available') {
        return result('ok', 'The active local EVE SDE build is valid.', String(status.buildNumber));
      }
      return status.state === 'invalid'
        ? result('degraded', 'The active local EVE SDE build is invalid.')
        : result('not_configured', 'EVE static data is not installed.');
    }),
    check('eve.esi', 'planned_adapters', false, input.clock, (signal) => {
      throwIfAborted(signal);
      return input.config.esiUserAgent === null
        ? result('not_configured', 'The ESI User-Agent is not configured.')
        : result('ok', 'The EVE ESI adapter is configured.', input.config.esiCompatibilityDate);
    }),
    check('eve.sso', 'planned_adapters', false, input.clock, (signal) => {
      throwIfAborted(signal);
      return input.config.eveClientId === null
        ? result('not_configured', 'The EVE SSO client ID is not configured.')
        : result('ok', 'EVE SSO character connection is configured.');
    }),
    asyncCheck('credentials.system', 'planned_adapters', false, input.clock, async (signal) => {
      if (input.config.credentialBackend === 'disabled') {
        return result('not_configured', 'Protected credential storage is explicitly disabled.');
      }
      const state = await input.credentials.probe(signal);
      return state === 'available'
        ? result('ok', 'The operating-system credential adapter is available.')
        : result('degraded', 'The operating-system credential adapter is locked or unavailable.');
    }),
  ];
}

function asyncCheck(
  id: string,
  group: DiagnosticGroup,
  mandatory: boolean,
  clock: Clock,
  run: (signal: AbortSignal) => Promise<Omit<ComponentCheck, 'id' | 'checked_at' | 'warnings'> & {
    readonly warnings?: readonly ResultWarning[];
  }>,
): HealthCheck {
  return {
    id,
    group,
    mandatory,
    async run(signal): Promise<ComponentCheck> {
      const value = await run(signal);
      return {
        ...value,
        id,
        checked_at: clock.now().toISOString(),
        warnings: value.warnings ?? [],
      };
    },
  };
}

function check(
  id: string,
  group: DiagnosticGroup,
  mandatory: boolean,
  clock: Clock,
  run: (signal: AbortSignal) => Omit<ComponentCheck, 'id' | 'checked_at' | 'warnings'> & {
    readonly warnings?: readonly ResultWarning[];
  },
): HealthCheck {
  return {
    id,
    group,
    mandatory,
    run(signal): Promise<ComponentCheck> {
      const value = run(signal);
      return Promise.resolve({
        ...value,
        id,
        checked_at: clock.now().toISOString(),
        warnings: value.warnings ?? [],
      });
    },
  };
}

function result(
  state: ComponentState,
  message: string,
  version?: string,
  warnings?: readonly ResultWarning[],
): Omit<ComponentCheck, 'id' | 'checked_at'> {
  return {
    state,
    message,
    ...(version === undefined ? {} : { version }),
    warnings: warnings ?? [],
  };
}
