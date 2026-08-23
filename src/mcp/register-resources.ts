import { ResourceTemplate, type McpServer, type ReadResourceResult } from '@modelcontextprotocol/server';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { GetEveCapabilities } from '../application/services/get-eve-capabilities.js';
import type { FindEveCapabilities } from '../application/services/find-eve-capabilities.js';
import type { RuntimeInfo } from '../bootstrap/runtime-info.js';
import { assertJsonCompatible } from '../domain/json.js';
import type { SdeRepository } from '../application/ports/sde-repository.js';
import { ESI_COVERAGE_SNAPSHOT, ESI_COVERAGE_SUMMARY } from '../capabilities/generated/coverage-summary.js';
import { AppError } from '../domain/errors.js';

const CAPABILITIES_URI = 'eve://capabilities';
const SERVER_INFO_URI = 'eve://server/info';
const COVERAGE_URI = 'eve://coverage';

export function registerResources(server: McpServer, input: {
  readonly capabilities: GetEveCapabilities;
  readonly discovery: FindEveCapabilities;
  readonly idGenerator: IdGenerator;
  readonly rootSignal: AbortSignal;
  readonly runtime: RuntimeInfo;
  readonly sde?: SdeRepository;
}): void {
  server.registerResource('capabilities', CAPABILITIES_URI, {
    title: 'EVE Copilot MCP capabilities',
    description: 'Unfiltered EVE Copilot capability registry with availability and authorization requirements.',
    mimeType: 'application/json',
  }, async (uri): Promise<ReadResourceResult> => {
    const envelope = await input.capabilities.execute({
      include_operations: true,
      limit: 100,
    }, {
      requestId: input.idGenerator.next(),
      signal: input.rootSignal,
    });
    return jsonResource(uri.href, envelope.data);
  });

  server.registerResource('server-info', SERVER_INFO_URI, {
    title: 'EVE Copilot MCP server information',
    description: 'Static package identity and runtime boundary information.',
    mimeType: 'application/json',
  }, (uri): ReadResourceResult => jsonResource(uri.href, {
    name: input.runtime.name,
    title: input.runtime.title,
    version: input.runtime.version,
    purpose: 'Provider-neutral local EVE Online capability server',
    transport: 'stdio',
    model_runtime_included: false,
    model_api_key_required: false,
    contract_version: 1,
  }));

  server.registerResource('coverage', COVERAGE_URI, {
    title: 'EVE API coverage',
    description: 'Safe generated coverage totals for the pinned official ESI contract.',
    mimeType: 'application/json',
  }, (uri): ReadResourceResult => jsonResource(uri.href, {
    snapshot: ESI_COVERAGE_SNAPSHOT,
    summary: ESI_COVERAGE_SUMMARY,
  }));

  server.registerResource(
    'capability-detail',
    new ResourceTemplate('eve://capabilities/{capability_id}', { list: undefined }),
    {
      title: 'EVE capability detail',
      description: 'Read one reviewed long-tail capability, including its exact input schema and current authorization availability.',
      mimeType: 'application/json',
    },
    async (uri, variables): Promise<ReadResourceResult> => {
      const capabilityId = capabilityVariable(variables.capability_id);
      const envelope = await input.discovery.execute({ query: capabilityId, limit: 50 }, {
        requestId: input.idGenerator.next(),
        signal: input.rootSignal,
      });
      const capability = envelope.data.capabilities.find((entry) => entry.capability_id === capabilityId);
      if (capability === undefined) throw resourceNotFound('EVE capability');
      return jsonResource(uri.href, capability);
    },
  );

  const sde = input.sde;
  if (sde === undefined) return;
  server.registerResource('sde-type', new ResourceTemplate('eve://sde/type/{type_id}', { list: undefined }), {
    title: 'EVE SDE type',
    description: 'Resolve an installed SDE type with group, category, market group, and build provenance.',
    mimeType: 'application/json',
  }, async (uri, variables): Promise<ReadResourceResult> => {
    const typeId = safeIntegerVariable(variables.type_id, 'type_id');
    const value = await sde.resolveType(typeId);
    if (value === null) throw resourceNotFound('SDE type');
    return jsonResource(uri.href, value);
  });

  server.registerResource('sde-system', new ResourceTemplate('eve://sde/system/{system_id}', { list: undefined }), {
    title: 'EVE SDE solar system',
    description: 'Resolve an installed SDE solar system and its static stargate connections.',
    mimeType: 'application/json',
  }, async (uri, variables): Promise<ReadResourceResult> => {
    const systemId = safeIntegerVariable(variables.system_id, 'system_id');
    const system = await sde.resolveSolarSystem(systemId);
    if (system === null) throw resourceNotFound('SDE solar system');
    const stargates = await sde.resolveStargatesFromSystem(systemId);
    return jsonResource(uri.href, { system, stargates });
  });

  server.registerResource('sde-ship', new ResourceTemplate('eve://sde/ship/{type_id}', { list: undefined }), {
    title: 'EVE SDE ship',
    description: 'Resolve an installed SDE type only when it belongs to the Ship category.',
    mimeType: 'application/json',
  }, async (uri, variables): Promise<ReadResourceResult> => {
    const typeId = safeIntegerVariable(variables.type_id, 'type_id');
    const value = await sde.resolveType(typeId);
    if (value?.categoryName !== 'Ship') throw resourceNotFound('SDE ship');
    return jsonResource(uri.href, value);
  });
}

function jsonResource(uri: string, value: unknown): ReadResourceResult {
  assertJsonCompatible(value);
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(value),
    }],
  };
}

function safeIntegerVariable(value: string | string[] | undefined, field: string): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value)) {
    throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: `The resource ${field} is invalid.` });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw resourceNotFound('SDE record');
  return parsed;
}

function capabilityVariable(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !/^esi\.[a-z0-9_.-]{1,124}$/u.test(value)) {
    throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'The resource capability_id is invalid.' });
  }
  return value;
}

function resourceNotFound(kind: string): AppError {
  return new AppError({ code: 'NOT_FOUND', safeMessage: `The requested ${kind} was not found.` });
}
