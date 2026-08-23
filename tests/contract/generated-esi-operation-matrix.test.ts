import { describe, expect, it } from 'vitest';
import type { CharacterAccessTokenProvider } from '../../src/application/ports/character-access-token-provider.js';
import type { Delay } from '../../src/application/ports/delay.js';
import type { EsiCacheEntry, EsiCacheRepository } from '../../src/application/ports/esi-cache-repository.js';
import { ESI_OPERATION_FACTS } from '../../src/capabilities/generated/esi-operation-facts.js';
import type { ConnectedCharacter } from '../../src/domain/character.js';
import type { EsiOperationFact } from '../../src/domain/esi-operation.js';
import type { JsonValue } from '../../src/domain/json.js';
import { GeneratedEsiOperationExecutor } from '../../src/infrastructure/esi/operation-executor.js';
import { FixedClock } from '../helpers/fakes.js';

const signal = new AbortController().signal;

describe('generated ESI operation contract matrix', () => {
  it('constructs and validates one synthetic fixture for every pinned operation', async () => {
    expect(ESI_OPERATION_FACTS).toHaveLength(233);
    const exercised: string[] = [];
    for (const operation of ESI_OPERATION_FACTS) {
      assertGeneratedPolicy(operation);
      const argumentsValue = syntheticValue(operation.inputSchema) as Readonly<Record<string, unknown>>;
      const output = syntheticValue(operation.outputSchema);
      let captured: { readonly request: Request; readonly init: RequestInit | undefined } | null = null;
      const executor = new GeneratedEsiOperationExecutor({
        fetch: (request, init) => {
          captured = { request: request instanceof Request ? request : new Request(request, init), init };
          return Promise.resolve(output === null
            ? new Response(null, { status: 204 })
            : new Response(JSON.stringify(output), {
              status: 200,
              headers: {
                'content-type': 'application/json',
                expires: '2026-08-20T10:05:00.000Z',
                ...(operation.pagination.mode === 'page' ? { 'x-pages': '1' } : {}),
              },
            }));
        },
        compatibilityDate: '2026-08-18',
        userAgent: 'eve-copilot-contract-matrix test@example.invalid',
        timeoutMs: 5_000,
        maxResponseBytes: 4_194_304,
        cacheMaxBytes: 1_000_000,
        clock: new FixedClock(),
        delay: noDelay(),
        cache: new MemoryCache(),
        tokens: tokenProvider(),
      });
      const character = operation.requiredScopes.length === 0 ? null : connectedCharacter(operation);
      if (operation.operationClass === 'action') {
        const validated = executor.validateAction({ operation, arguments: argumentsValue });
        expect(validated).toMatchObject(argumentsValue);
        await executor.executeAction({ operation, arguments: argumentsValue, character: character ?? connectedCharacter(operation), signal });
      } else {
        const result = await executor.execute({ operation, arguments: argumentsValue, character, signal });
        expect(result.value).toEqual(output);
      }
      expect(captured).not.toBeNull();
      assertRequest(operation, argumentsValue, requiredCapture(captured));
      exercised.push(operation.operationId);
    }
    expect(new Set(exercised).size).toBe(233);
  });
});

function assertGeneratedPolicy(operation: EsiOperationFact): void {
  expect(operation.operationId.length).toBeGreaterThan(0);
  expect(operation.pathTemplate).toMatch(/^\//u);
  expect(operation.compatibilityDate).toBe('2026-08-18');
  expect(operation.capabilityIds.length).toBeGreaterThan(0);
  expect(operation.authorizationScopes).toEqual(expect.arrayContaining([...operation.requiredScopes]));
  expect(Number.isFinite(operation.budgets.defaultItems)).toBe(true);
  expect(Number.isFinite(operation.budgets.maximumItems)).toBe(true);
  expect(Number.isFinite(operation.budgets.maximumPages)).toBe(true);
  expect(Number.isFinite(operation.budgets.maximumRequests)).toBe(true);
  expect(Number.isFinite(operation.budgets.maximumConcurrency)).toBe(true);
  expect(Number.isFinite(operation.budgets.maximumResponseBytes)).toBe(true);
  expect(Number.isFinite(operation.budgets.timeoutMs)).toBe(true);
  expect(operation.budgets.maximumItems).toBeGreaterThan(0);
  expect(operation.budgets.maximumPages).toBeGreaterThan(0);
  expect(operation.budgets.maximumRequests).toBeGreaterThan(0);
  expect(operation.budgets.maximumConcurrency).toBeGreaterThan(0);
  expect(operation.budgets.maximumResponseBytes).toBeGreaterThan(0);
  expect(operation.budgets.timeoutMs).toBeGreaterThan(0);
  expect(operation.freshness.staleIfErrorSeconds).toBeGreaterThanOrEqual(0);
  expect(['none', 'page', 'cursor']).toContain(operation.pagination.mode);
  expect(operation.rateLimit === null || typeof operation.rateLimit === 'object').toBe(true);
  if (operation.operationClass === 'action') {
    expect(operation.actionFamily).not.toBeNull();
    expect(operation.scopeBundle).toMatch(/^action\./u);
  }
}

function assertRequest(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, unknown>>,
  captured: { readonly request: Request; readonly init: RequestInit | undefined },
): void {
  const url = new URL(captured.request.url);
  let expectedPath = operation.pathTemplate;
  for (const parameter of operation.parameters) {
    const value = argumentsValue[parameter.name];
    if (value === undefined) continue;
    if (parameter.location === 'path') {
      expectedPath = expectedPath.replace(`{${parameter.name}}`, encodeURIComponent(parameterString(value)));
    } else {
      const expectedValues = Array.isArray(value)
        ? (value as readonly unknown[]).map((entry) => parameterString(entry))
        : [parameterString(value)];
      expect(url.searchParams.getAll(parameter.name)).toEqual(parameter.explode
        ? expectedValues
        : [expectedValues.join(',')]);
    }
  }
  expect(expectedPath).not.toMatch(/\{[^}]+\}/u);
  expect(url.pathname).toBe(expectedPath);
  expect(captured.request.method).toBe(operation.method);
  expect(captured.request.headers.get('x-compatibility-date')).toBe('2026-08-18');
  expect(captured.request.headers.get('user-agent')).toBe('eve-copilot-contract-matrix test@example.invalid');
  expect(captured.request.headers.has('authorization')).toBe(operation.requiredScopes.length > 0);
  if (argumentsValue.body === undefined) {
    expect(captured.init?.body).toBeUndefined();
  } else {
    const capturedBody = captured.init?.body;
    expect(typeof capturedBody).toBe('string');
    if (typeof capturedBody !== 'string') throw new Error('Synthetic request body is not JSON text.');
    const actualBody = JSON.parse(capturedBody) as unknown;
    if (typeof argumentsValue.body === 'object' && argumentsValue.body !== null) {
      expect(actualBody).toMatchObject(argumentsValue.body);
    } else {
      expect(actualBody).toEqual(argumentsValue.body);
    }
  }
}

function syntheticValue(schemaValue: JsonValue): JsonValue {
  if (!isObject(schemaValue)) throw new Error('Generated schema node is not an object.');
  if (schemaValue.const !== undefined) return schemaValue.const;
  const enumValues = schemaValue.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return (enumValues as readonly JsonValue[])[0] ?? null;
  }
  if (Array.isArray(schemaValue.anyOf)) {
    const first = (schemaValue.anyOf as readonly JsonValue[])[0];
    if (first === undefined) throw new Error('Generated schema has no alternatives.');
    return syntheticValue(first);
  }
  if (Array.isArray(schemaValue.oneOf)) {
    const first = (schemaValue.oneOf as readonly JsonValue[])[0];
    if (first === undefined) throw new Error('Generated schema has no alternatives.');
    return syntheticExclusiveAlternative(first);
  }
  switch (schemaValue.type) {
    case 'null': return null;
    case 'boolean': return false;
    case 'integer': return syntheticNumber(schemaValue, true);
    case 'number': return syntheticNumber(schemaValue, false);
    case 'string': return syntheticString(schemaValue);
    case 'array': {
      const count = typeof schemaValue.minItems === 'number' ? schemaValue.minItems : 0;
      if (count === 0) return [];
      if (schemaValue.items === undefined) throw new Error('Generated array schema has no item schema.');
      return Array.from({ length: count }, () => syntheticValue(schemaValue.items ?? {}));
    }
    case 'object': {
      const properties = isObject(schemaValue.properties) ? schemaValue.properties : {};
      const required = Array.isArray(schemaValue.required)
        ? schemaValue.required.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return Object.fromEntries(required.map((name) => {
        const property = properties[name];
        if (property === undefined) throw new Error(`Required generated property has no schema: ${name}`);
        return [name, syntheticValue(property)];
      }));
    }
    default: throw new Error(`Unsupported generated schema node: ${JSON.stringify(schemaValue)}`);
  }
}

function syntheticExclusiveAlternative(schema: JsonValue): JsonValue {
  const value = syntheticValue(schema);
  if (!isObject(schema) || !isObject(value) || Object.keys(value).length > 0 || !isObject(schema.properties)) {
    return value;
  }
  const first = Object.entries(schema.properties)[0];
  if (first === undefined) return value;
  return { [first[0]]: syntheticValue(first[1]) };
}

function parameterString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error('Synthetic operation parameter is not primitive.');
}

function syntheticString(schema: Readonly<Record<string, JsonValue>>): string {
  if (schema.pattern === '^(0|[1-9][0-9]*)$' || schema.pattern === '^-?(0|[1-9][0-9]*)$') return '1';
  if (schema.format === 'date-time') return '2026-08-20T10:00:00Z';
  if (schema.format === 'date') return '2026-08-20';
  if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
  const minimum = typeof schema.minLength === 'number' ? schema.minLength : 1;
  return 'x'.repeat(Math.max(1, minimum));
}

function syntheticNumber(schema: Readonly<Record<string, JsonValue>>, integer: boolean): number {
  const minimum = typeof schema.minimum === 'number' ? schema.minimum : 0;
  const exclusive = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : null;
  let value = exclusive === null ? minimum : Math.max(minimum, exclusive + (integer ? 1 : 0.5));
  if (integer) value = Math.ceil(value);
  if (typeof schema.maximum === 'number') value = Math.min(value, schema.maximum);
  return value;
}

function isObject(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function connectedCharacter(operation: EsiOperationFact): ConnectedCharacter {
  return Object.freeze({
    characterId: 1,
    verifiedName: 'Synthetic Contract Pilot',
    status: 'connected',
    credentialReference: 'synthetic-contract-reference',
    authorizationGeneration: 1,
    grantedScopes: operation.authorizationScopes,
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
}

function tokenProvider(): CharacterAccessTokenProvider {
  return {
    get: () => Promise.resolve({
      token: 'synthetic-access-token',
      expiresAt: '2026-08-20T11:00:00.000Z',
      authorizationGeneration: 1,
    }),
  };
}

function noDelay(): Delay {
  return { wait: () => Promise.reject(new Error('Synthetic contract requests must not retry.')) };
}

function requiredCapture(
  captured: { readonly request: Request; readonly init: RequestInit | undefined } | null,
): { readonly request: Request; readonly init: RequestInit | undefined } {
  if (captured === null) throw new Error('Synthetic ESI request was not captured.');
  return captured;
}

class MemoryCache implements EsiCacheRepository {
  readonly #entries = new Map<string, EsiCacheEntry>();
  find(cacheKey: string, _accessedAt: string): EsiCacheEntry | null { return this.#entries.get(cacheKey) ?? null; }
  put(entry: EsiCacheEntry): void { this.#entries.set(entry.cacheKey, entry); }
  remove(cacheKey: string): boolean { return this.#entries.delete(cacheKey); }
  invalidateCharacter(_characterId: number): number { return 0; }
  pruneTo(_maximumBytes: number): number { return 0; }
  totalBytes(): number { return [...this.#entries.values()].reduce((sum, entry) => sum + entry.byteSize, 0); }
}
