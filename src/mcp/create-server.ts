import { McpServer } from '@modelcontextprotocol/server';
import type { AppServices } from '../application/services/app-services.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { RuntimeInfo } from '../bootstrap/runtime-info.js';
import type { ToolExecutionDependencies } from './tool-executor.js';
import { registerResources } from './register-resources.js';
import { registerTools } from './register-tools.js';
import type { SdeRepository } from '../application/ports/sde-repository.js';

export function createMcpServer(input: {
  readonly runtime: RuntimeInfo;
  readonly services: AppServices;
  readonly execution: Omit<ToolExecutionDependencies, 'negotiatedProtocolVersion'>;
  readonly idGenerator: IdGenerator;
  readonly sde?: SdeRepository;
}): McpServer {
  const server = new McpServer({
    name: input.runtime.name,
    title: input.runtime.title,
    version: input.runtime.version,
  });
  registerTools(server, input.services, {
    ...input.execution,
    // The SDK accessor remains the required fallback for 2025-era clients.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    negotiatedProtocolVersion: () => server.server.getNegotiatedProtocolVersion(),
  });
  registerResources(server, {
    capabilities: input.services.getEveCapabilities,
    discovery: input.services.findEveCapabilities,
    idGenerator: input.idGenerator,
    rootSignal: input.execution.rootSignal,
    runtime: input.runtime,
    ...(input.sde === undefined ? {} : { sde: input.sde }),
  });
  return server;
}
