import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/config-schema.js';
import { RequestTracker } from '../../src/bootstrap/request-tracker.js';
import { getRuntimeInfo } from '../../src/bootstrap/runtime-info.js';
import { AppError } from '../../src/domain/errors.js';
import { createMcpServer } from '../../src/mcp/create-server.js';
import type { AppServices } from '../../src/mcp/register-tools.js';
import { createLogger } from '../../src/observability/logger.js';
import { MutableProtocolState } from '../../src/observability/diagnostic-checks.js';
import { FixedIdGenerator } from '../helpers/fakes.js';

describe('MCP request cancellation', () => {
  it('propagates host cancellation into a diagnostic request within a bounded time', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const requestStarted = deferred();
    const cancellationObserved = deferred();
    const logLines: string[] = [];
    const services = {
      getEveCapabilities: unreachableService(),
      getServerStatus: unreachableService(),
      getServerDiagnostics: {
        execute: (_input: unknown, context: { readonly signal: AbortSignal }) => {
          requestStarted.resolve();
          return new Promise((_resolve, reject) => {
            const cancel = (): void => {
              cancellationObserved.resolve();
              reject(new AppError({
                code: 'CANCELLED',
                safeMessage: 'The request was cancelled.',
              }));
            };
            if (context.signal.aborted) cancel();
            else context.signal.addEventListener('abort', cancel, { once: true });
          });
        },
      },
    } as unknown as AppServices;
    const rootController = new AbortController();
    const server = createMcpServer({
      runtime: getRuntimeInfo(),
      services,
      execution: {
        config: testConfig(),
        idGenerator: new FixedIdGenerator(),
        logger: createLogger({
          level: 'error',
          format: 'json',
          write: (line) => { logLines.push(line); },
        }),
        requestTracker: new RequestTracker(),
        rootSignal: rootController.signal,
        protocolState: new MutableProtocolState(),
      },
      idGenerator: new FixedIdGenerator(),
    });
    const client = new Client({ name: 'cancellation-contract', version: '1.0.0' });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const controller = new AbortController();
      const call = client.callTool({
        name: 'get_server_diagnostics',
        arguments: {},
      }, { signal: controller.signal, timeout: 5_000 });
      await requestStarted.promise;
      controller.abort();
      await expect(call).rejects.toBeDefined();
      await expect(withTimeout(cancellationObserved.promise, 1_000)).resolves.toBeUndefined();
    } finally {
      rootController.abort();
      await client.close();
      await server.close();
    }
  });

  it('exposes guarded action tools only when the local master switch is enabled', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const unreachable = unreachableService();
    const services = new Proxy({}, { get: () => unreachable }) as AppServices;
    const rootController = new AbortController();
    const server = createMcpServer({
      runtime: getRuntimeInfo(),
      services,
      execution: {
        config: Object.freeze({ ...testConfig(), actionsEnabled: true, actionFamilies: ['ui_actions'] as const }),
        idGenerator: new FixedIdGenerator(),
        logger: createLogger({ level: 'error', format: 'json', write: () => undefined }),
        requestTracker: new RequestTracker(),
        rootSignal: rootController.signal,
        protocolState: new MutableProtocolState(),
      },
      idGenerator: new FixedIdGenerator(),
    });
    const client = new Client({ name: 'action-surface-contract', version: '1.0.0' });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tools = (await client.listTools()).tools;
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('prepare_eve_action');
      expect(names).toContain('execute_eve_action');
      expect(names).toContain('set_autopilot_waypoint');
      const prepare = tools.find((tool) => tool.name === 'prepare_eve_action');
      const execute = tools.find((tool) => tool.name === 'execute_eve_action');
      const waypoint = tools.find((tool) => tool.name === 'set_autopilot_waypoint');
      expect(prepare?.description).toContain('Do not call execute_eve_action in the same turn');
      expect(waypoint?.description).toContain('Do not call execute_eve_action in the same turn');
      expect(execute?.description).toContain('user has replied in a new message explicitly approving that exact action');
      expect(waypoint?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: ['destination_id'],
      });
      expect((waypoint?.inputSchema.properties as Readonly<Record<string, unknown>> | undefined)?.character_id)
        .toBeUndefined();
    } finally {
      rootController.abort();
      await client.close();
      await server.close();
    }
  });
});

function unreachableService(): { readonly execute: () => Promise<never> } {
  return {
    execute: () => Promise.reject(new Error('Unexpected service call.')),
  };
}

function testConfig(): Readonly<AppConfig> {
  return Object.freeze({
    command: 'serve',
    sdeCommand: null,
    dataDir: '/unused',
    configFile: null,
    databasePath: '/unused/state.db',
    logLevel: 'error',
    logFormat: 'json',
    requestTimeoutMs: 5_000,
    databaseBusyTimeoutMs: 1_000,
    dataDirectoryKind: 'custom',
    eveClientId: null,
    ssoRedirectUri: 'http://127.0.0.1:17600/oauth/callback',
    esiCompatibilityDate: '2026-08-18',
    esiUserAgent: null,
    personaFaction: 'none',
    credentialBackend: 'disabled',
    oauthSessionTtlMs: 600_000,
    ssoTimeoutMs: 15_000,
    esiTimeoutMs: 15_000,
    httpMaxResponseBytes: 4_194_304,
    esiCacheMaxBytes: 268_435_456,
    actionsEnabled: false,
    actionFamilies: [],
    sdeDir: '/unused/sde',
    liveTests: false,
  });
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve: () => { resolvePromise?.(); },
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => { reject(new Error('Cancellation was not observed in time.')); }, timeoutMs);
    }),
  ]);
}
