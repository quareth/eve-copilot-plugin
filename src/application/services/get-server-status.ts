import type { Clock } from '../ports/clock.js';
import type { DatabaseMetadataPort, HealthCheck, ProtocolStatePort } from '../ports/health-check.js';
import type { ServerStatusData } from '../dto/server-status.js';
import type { RequestContext, UseCase } from './use-case.js';
import type { CapabilityRegistry } from '../../domain/capability-registry.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import { throwIfAborted } from '../../domain/errors.js';
import type { RuntimeInfo } from '../dto/runtime-info.js';

export class GetServerStatus implements UseCase<Record<string, never>, ResultEnvelope<ServerStatusData>> {
  readonly #clock: Clock;
  readonly #runtime: RuntimeInfo;
  readonly #database: DatabaseMetadataPort;
  readonly #registry: CapabilityRegistry;
  readonly #checks: readonly HealthCheck[];
  readonly #protocol: ProtocolStatePort;

  constructor(input: {
    readonly clock: Clock;
    readonly runtime: RuntimeInfo;
    readonly database: DatabaseMetadataPort;
    readonly registry: CapabilityRegistry;
    readonly checks: readonly HealthCheck[];
    readonly protocol: ProtocolStatePort;
  }) {
    this.#clock = input.clock;
    this.#runtime = input.runtime;
    this.#database = input.database;
    this.#registry = input.registry;
    this.#checks = input.checks;
    this.#protocol = input.protocol;
  }

  async execute(
    _input: Record<string, never>,
    context: RequestContext,
  ): Promise<ResultEnvelope<ServerStatusData>> {
    throwIfAborted(context.signal);
    const checks = await Promise.all(this.#checks.map((check) => check.run(context.signal)));
    throwIfAborted(context.signal);
    const degraded = checks.some((check) => check.state === 'degraded' || check.state === 'unavailable');
    const database = this.#database.inspect(false);
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: {
        name: 'eve-copilot-mcp',
        version: this.#runtime.version,
        status: degraded ? 'degraded' : 'ready',
        transport: 'stdio',
        protocol: {
          sdk_major: 2,
          negotiated_version: this.#protocol.negotiatedVersion(),
        },
        database_schema_version: database.schemaVersion,
        capabilities: this.#registry.counts(),
      },
    });
  }
}
