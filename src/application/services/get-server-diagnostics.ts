import type { RuntimeInfo } from '../dto/runtime-info.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { DiagnosticsData, DiagnosticsInput, StageThreeDiagnostics } from '../dto/diagnostics.js';
import type { Clock } from '../ports/clock.js';
import type { DatabaseMetadataPort, HealthCheck } from '../ports/health-check.js';
import type { RequestContext, UseCase } from './use-case.js';

export class GetServerDiagnostics implements UseCase<DiagnosticsInput, ResultEnvelope<DiagnosticsData>> {
  readonly #clock: Clock;
  readonly #runtime: RuntimeInfo;
  readonly #database: DatabaseMetadataPort;
  readonly #dataDirectoryKind: 'default' | 'custom';
  readonly #checks: readonly HealthCheck[];
  readonly #stageThree: (() => StageThreeDiagnostics | Promise<StageThreeDiagnostics>) | null;

  constructor(input: {
    readonly clock: Clock;
    readonly runtime: RuntimeInfo;
    readonly database: DatabaseMetadataPort;
    readonly dataDirectoryKind: 'default' | 'custom';
    readonly checks: readonly HealthCheck[];
    readonly stageThree?: () => StageThreeDiagnostics | Promise<StageThreeDiagnostics>;
  }) {
    this.#clock = input.clock;
    this.#runtime = input.runtime;
    this.#database = input.database;
    this.#dataDirectoryKind = input.dataDirectoryKind;
    this.#checks = input.checks;
    this.#stageThree = input.stageThree ?? null;
  }

  async execute(input: DiagnosticsInput, context: RequestContext): Promise<ResultEnvelope<DiagnosticsData>> {
    throwIfAborted(context.signal);
    const selectedGroups = input.include === undefined ? null : new Set(input.include);
    const selected = this.#checks.filter((check) => selectedGroups === null || selectedGroups.has(check.group));
    const checks = (await Promise.all(selected.map((check) => check.run(context.signal))))
      .sort((left, right) => left.id.localeCompare(right.id));
    throwIfAborted(context.signal);
    const mandatoryIds = new Set(selected.filter((check) => check.mandatory).map((check) => check.id));
    const mandatoryUnavailable = checks.some((check) =>
      mandatoryIds.has(check.id) && check.state === 'unavailable');
    const degraded = checks.some((check) => check.state === 'degraded' || check.state === 'unavailable');
    const database = this.#database.inspect(true);
    if (database.mode !== 'wal') {
      throw new AppError({
        code: 'DATABASE_UNAVAILABLE',
        safeMessage: 'The local database is not using its required journal mode.',
      });
    }
    const nextSteps = nextStepsFor(checks);
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: {
        overall: mandatoryUnavailable ? 'unavailable' : degraded ? 'degraded' : 'ready',
        checks,
        build: {
          version: this.#runtime.version,
          node: this.#runtime.node,
          platform: this.#runtime.platform,
          architecture: this.#runtime.architecture,
          mcp_sdk_major: 2,
        },
        storage: {
          database_schema_version: database.schemaVersion,
          database_mode: 'wal',
          data_directory: this.#dataDirectoryKind,
        },
        next_steps: nextSteps,
        stage3: this.#stageThree === null ? null : await this.#stageThree(),
      },
    });
  }
}

function nextStepsFor(checks: ReadonlyArray<{ readonly id: string; readonly state: string }>): string[] {
  const steps = new Set<string>();
  for (const check of checks) {
    if (check.state === 'unavailable' && check.id.startsWith('storage.')) {
      steps.add('Run eve-copilot-mcp doctor and verify the local data directory is writable.');
    } else if (check.state === 'unavailable' && check.id === 'runtime.node') {
      steps.add('Install a supported Node.js version and restart the MCP host.');
    } else if (check.state === 'unavailable') {
      steps.add('Restart the MCP server and inspect its redacted local logs.');
    } else if (check.state === 'not_configured' && check.id === 'eve.sde') {
      steps.add('Run eve-copilot-mcp sde install to install current EVE static data.');
    } else if (check.state === 'not_configured' && (check.id === 'eve.esi' || check.id === 'eve.sso')) {
      steps.add('Run eve-copilot-mcp setup and follow its configuration guidance.');
    } else if (check.state === 'not_configured' && check.id === 'credentials.system') {
      steps.add('Enable and unlock the operating-system credential store before connecting a character.');
    }
  }
  return [...steps];
}
