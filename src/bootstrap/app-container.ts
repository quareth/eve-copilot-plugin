import type { McpServer } from '@modelcontextprotocol/server';
import type { AppServices } from '../application/services/app-services.js';
import type { AppConfig } from '../config/config-schema.js';
import { AppError } from '../domain/errors.js';
import { inspectDatabase } from '../storage/sqlite/integrity-check.js';
import type { DatabaseHandle } from '../storage/sqlite/database-handle.js';
import type { SystemStateRepository } from '../application/ports/system-state-repository.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../observability/logger.js';
import { createMcpServer } from '../mcp/create-server.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { MutableProtocolState } from '../observability/diagnostic-checks.js';
import type { RuntimeInfo } from './runtime-info.js';
import type { RequestTracker } from './request-tracker.js';
import type { AuthorizationCallbackListener } from '../application/ports/authorization-callback-listener.js';
import type { SdeRepository } from '../application/ports/sde-repository.js';
import type { ErrorMetrics } from '../observability/error-metrics.js';

export type TransportState = 'constructed' | 'connected' | 'closed';

export class AppContainer {
  readonly config: Readonly<AppConfig>;
  readonly logger: Logger;
  readonly runtime: RuntimeInfo;
  readonly services: AppServices;
  readonly rootController: AbortController;
  readonly requestTracker: RequestTracker;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #database: DatabaseHandle;
  readonly #systemState: SystemStateRepository;
  readonly #protocolState: MutableProtocolState;
  readonly #callbackListener: AuthorizationCallbackListener;
  readonly #sde: SdeRepository;
  readonly #errorMetrics: ErrorMetrics;
  #transportState: TransportState = 'constructed';
  #shutdownPromise: Promise<void> | null = null;

  constructor(input: {
    readonly config: Readonly<AppConfig>;
    readonly logger: Logger;
    readonly runtime: RuntimeInfo;
    readonly services: AppServices;
    readonly rootController: AbortController;
    readonly requestTracker: RequestTracker;
    readonly clock: Clock;
    readonly idGenerator: IdGenerator;
    readonly database: DatabaseHandle;
    readonly systemState: SystemStateRepository;
    readonly protocolState: MutableProtocolState;
    readonly callbackListener: AuthorizationCallbackListener;
    readonly sde: SdeRepository;
    readonly errorMetrics: ErrorMetrics;
  }) {
    this.config = input.config;
    this.logger = input.logger;
    this.runtime = input.runtime;
    this.services = input.services;
    this.rootController = input.rootController;
    this.requestTracker = input.requestTracker;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#database = input.database;
    this.#systemState = input.systemState;
    this.#protocolState = input.protocolState;
    this.#callbackListener = input.callbackListener;
    this.#sde = input.sde;
    this.#errorMetrics = input.errorMetrics;
  }

  createServer(): McpServer {
    return createMcpServer({
      runtime: this.runtime,
      services: this.services,
      execution: {
        config: this.config,
        idGenerator: this.#idGenerator,
        logger: this.logger,
        requestTracker: this.requestTracker,
        rootSignal: this.rootController.signal,
        protocolState: this.#protocolState,
        errorMetrics: this.#errorMetrics,
      },
      idGenerator: this.#idGenerator,
      sde: this.#sde,
    });
  }

  transportState(): TransportState {
    return this.#transportState;
  }

  markTransportConnected(): void {
    if (this.#transportState === 'closed') {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        safeMessage: 'The MCP transport cannot be restarted after shutdown.',
      });
    }
    this.#transportState = 'connected';
  }

  async assertFoundationReady(): Promise<void> {
    const result = await this.services.getServerDiagnostics.execute({}, {
      requestId: this.#idGenerator.next(),
      signal: this.rootController.signal,
    });
    if (result.data.overall === 'unavailable') {
      throw new AppError({
        code: 'DATABASE_UNAVAILABLE',
        safeMessage: 'A mandatory local readiness check failed.',
      });
    }
  }

  shutdown(closeProtocol?: () => Promise<void>): Promise<void> {
    this.#shutdownPromise ??= this.#shutdown(closeProtocol);
    return this.#shutdownPromise;
  }

  async #shutdown(closeProtocol?: () => Promise<void>): Promise<void> {
    this.logger.info('shutdown_started', { active_requests: this.requestTracker.active });
    this.rootController.abort();
    await this.requestTracker.waitForIdle(5_000);
    try {
      await this.#callbackListener.close();
      await closeProtocol?.();
    } catch (error) {
      this.logger.error('protocol_close_failed', { error });
    }
    this.#transportState = 'closed';
    try {
      const inspection = inspectDatabase(this.#database, false);
      if (inspection.quickCheck === 'ok') {
        this.#systemState.setLastCleanShutdown({
          at: this.#clock.now().toISOString(),
          version: this.runtime.version,
        });
      }
    } catch (error) {
      this.logger.error('clean_shutdown_state_failed', { error });
    } finally {
      this.#database.close();
    }
    this.logger.info('shutdown_completed');
  }
}
