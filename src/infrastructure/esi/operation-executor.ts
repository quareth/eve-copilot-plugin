import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CharacterAccessTokenProvider } from '../../application/ports/character-access-token-provider.js';
import type {
  EsiOperationExecution,
  EsiOperationExecutor,
} from '../../application/ports/esi-operation-executor.js';
import type { EsiActionExecution, EsiActionExecutor } from '../../application/ports/esi-action-executor.js';
import type { EsiRateLimitCoordinator } from '../../application/ports/rate-limit-coordinator.js';
import type { Clock } from '../../application/ports/clock.js';
import type { Delay } from '../../application/ports/delay.js';
import type { EsiCacheEntry, EsiCacheRepository } from '../../application/ports/esi-cache-repository.js';
import type { ConnectedCharacter } from '../../domain/character.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import { assertJsonCompatible, type JsonValue } from '../../domain/json.js';

const ESI_ORIGIN = 'https://esi.evetech.net';
const SCHEMA_POLICY_VERSION = 2;
const schemaCache = new Map<string, { readonly input: z.ZodType; readonly output: z.ZodType }>();

export class GeneratedEsiOperationExecutor implements EsiOperationExecutor, EsiActionExecutor {
  readonly #fetch: typeof fetch;
  readonly #origin: string;
  readonly #compatibilityDate: string;
  readonly #userAgent: string | null;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  readonly #cacheMaxBytes: number;
  readonly #clock: Clock;
  readonly #delay: Delay;
  readonly #cache: EsiCacheRepository;
  readonly #tokens: CharacterAccessTokenProvider;
  readonly #rateLimits: EsiRateLimitCoordinator | null;
  #cacheHits = 0;
  #cacheMisses = 0;
  #cacheRevalidations = 0;
  #staleServed = 0;
  #readRetries = 0;

  constructor(input: {
    readonly fetch?: typeof fetch;
    readonly origin?: string;
    readonly compatibilityDate: string;
    readonly userAgent: string | null;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
    readonly cacheMaxBytes: number;
    readonly clock: Clock;
    readonly delay: Delay;
    readonly cache: EsiCacheRepository;
    readonly tokens: CharacterAccessTokenProvider;
    readonly rateLimits?: EsiRateLimitCoordinator;
  }) {
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#origin = input.origin ?? ESI_ORIGIN;
    this.#compatibilityDate = input.compatibilityDate;
    this.#userAgent = input.userAgent;
    this.#timeoutMs = input.timeoutMs;
    this.#maxResponseBytes = Math.min(input.maxResponseBytes, 4_194_304);
    this.#cacheMaxBytes = input.cacheMaxBytes;
    this.#clock = input.clock;
    this.#delay = input.delay;
    this.#cache = input.cache;
    this.#tokens = input.tokens;
    this.#rateLimits = input.rateLimits ?? null;
  }

  async execute(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly character: ConnectedCharacter | null;
    readonly authorizationPartition?: string;
    readonly signal: AbortSignal;
  }): Promise<EsiOperationExecution> {
    throwIfAborted(input.signal);
    if (input.operation.operationClass !== 'read') {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'Action operations cannot be executed through the EVE read executor.',
        details: { capability_id: primaryCapability(input.operation) },
      });
    }
    if (input.operation.compatibilityDate !== this.#compatibilityDate) {
      throw new AppError({
        code: 'INVALID_CONFIGURATION',
        safeMessage: 'The generated ESI operation does not match the configured compatibility date.',
      });
    }
    if (this.#userAgent === null) {
      throw new AppError({
        code: 'INVALID_CONFIGURATION',
        safeMessage: 'An identifiable ESI User-Agent is required for EVE data requests.',
        details: { next_step: 'Configure EVE_COPILOT_ESI_USER_AGENT with an application and contact.' },
      });
    }
    const schemas = compiledSchemas(input.operation);
    const validatedArguments = parseInput(schemas.input, input.arguments, input.operation);
    const character = input.operation.access === 'public' ? null : requireSelectedCharacter(input.character);
    const token = await this.#accessToken(input.operation, character, input.signal);
    const request = buildRequest(input.operation, validatedArguments);
    const generation = character?.authorizationGeneration ?? null;
    const requestVariant = JSON.stringify(validatedArguments);
    const requestVariantHash = digest(requestVariant);
    const cacheKey = hexDigest(JSON.stringify({
      operation: input.operation.operationId,
      compatibility_date: this.#compatibilityDate,
      arguments: validatedArguments,
      character_id: character?.characterId ?? null,
      authorization_generation: generation,
      authorization_partition: input.authorizationPartition ?? null,
      schema_policy_version: SCHEMA_POLICY_VERSION,
    }));
    const now = this.#clock.now();
    const cached = this.#cacheMaxBytes === 0 ? null : this.#cache.find(cacheKey, now.toISOString());
    if (cached !== null && Date.parse(cached.freshUntil) > now.getTime()) {
      this.#cacheHits += 1;
      return cachedResult(input.operation, schemas.output, cached, 'hit');
    }
    try {
      const response = await this.#request(
        input.operation,
        request,
        token,
        cached,
        character?.characterId ?? null,
        input.signal,
      );
      if (response.status === 304 && cached !== null) {
        this.#cacheRevalidations += 1;
        const refreshed = refreshEntry(cached, input.operation, response.headers, this.#clock.now());
        this.#cache.put(refreshed);
        return cachedResult(input.operation, schemas.output, refreshed, 'revalidated');
      }
      assertSuccess(response, character, this.#clock.now());
      const raw = await readJson(response, Math.min(
        this.#maxResponseBytes,
        input.operation.budgets.maximumResponseBytes,
      ));
      const value = parseOutput(schemas.output, raw, input.operation);
      this.#cacheMisses += 1;
      const createdAt = this.#clock.now();
      const payload = JSON.stringify(value);
      const entry = createEntry({
        cacheKey,
        operation: input.operation,
        character,
        generation,
        requestVariantHash,
        response,
        payload,
        createdAt,
      });
      if (this.#cacheMaxBytes > 0) {
        this.#cache.put(entry);
        this.#cache.pruneTo(Math.floor(this.#cacheMaxBytes * 0.9));
      }
      return Object.freeze({
        value,
        operationId: input.operation.operationId,
        retrievedAt: createdAt.toISOString(),
        expiresAt: entry.freshUntil,
        cache: 'miss',
        totalPages: totalPages(response.headers),
      });
    } catch (error) {
      const staleSeconds = input.operation.freshness.staleIfErrorSeconds;
      if (cached !== null && staleSeconds > 0
        && cached.staleUntil !== null
        && Date.parse(cached.staleUntil) > this.#clock.now().getTime()
        && error instanceof AppError
        && (error.code === 'ESI_UNAVAILABLE' || error.code === 'UPSTREAM_SERVICE_FAILED')) {
        this.#staleServed += 1;
        return cachedResult(input.operation, schemas.output, cached, 'stale');
      }
      throw error;
    }
  }

  async executeAction(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly character: ConnectedCharacter;
    readonly signal: AbortSignal;
  }): Promise<EsiActionExecution> {
    throwIfAborted(input.signal);
    if (input.operation.operationClass !== 'action') {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'Read operations cannot be executed through the EVE action executor.',
      });
    }
    if (input.operation.compatibilityDate !== this.#compatibilityDate || this.#userAgent === null) {
      throw new AppError({
        code: 'INVALID_CONFIGURATION',
        safeMessage: 'The ESI action executor is not configured for the generated compatibility contract.',
      });
    }
    const schemas = compiledSchemas(input.operation);
    const validatedArguments = parseInput(schemas.input, input.arguments, input.operation);
    const token = await this.#accessToken(input.operation, input.character, input.signal);
    const request = buildRequest(input.operation, validatedArguments);
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${token ?? ''}`,
      'user-agent': this.#userAgent,
      'x-compatibility-date': this.#compatibilityDate,
    };
    if (request.body !== null) headers['content-type'] = 'application/json';
    const lease = await this.#rateLimits?.acquire({
      operationId: input.operation.operationId,
      policy: input.operation.rateLimit,
      characterId: input.character.characterId,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    let response: Response;
    try {
      response = await this.#fetch(`${this.#origin}${request.path}`, {
        method: input.operation.method,
        headers,
        ...(request.body === null ? {} : { body: request.body }),
        redirect: 'error',
        signal: AbortSignal.any([
          input.signal,
          AbortSignal.timeout(Math.min(this.#timeoutMs, input.operation.budgets.timeoutMs)),
        ]),
      });
      if (lease !== undefined) this.#rateLimits?.observe(lease, response);
    } catch (error) {
      throw new AppError({
        code: 'ACTION_OUTCOME_UNCERTAIN',
        safeMessage: 'The ESI action request was transmitted, but its outcome could not be confirmed.',
        details: { next_step: 'Use a read-only capability to verify the result before trying anything else.' },
        cause: error,
      });
    }
    assertSuccess(response, input.character, this.#clock.now());
    const raw = await readJson(response, Math.min(
      this.#maxResponseBytes,
      input.operation.budgets.maximumResponseBytes,
    ));
    const value = parseOutput(schemas.output, raw, input.operation);
    return Object.freeze({
      value,
      operationId: input.operation.operationId,
      executedAt: this.#clock.now().toISOString(),
    });
  }

  validateAction(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
  }): Readonly<Record<string, JsonValue>> {
    if (input.operation.operationClass !== 'action') {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'The requested operation is not an ESI action.',
      });
    }
    const parsed = parseInput(compiledSchemas(input.operation).input, input.arguments, input.operation);
    assertJsonCompatible(parsed);
    return parsed;
  }

  diagnostics(): Readonly<{
    cacheHits: number;
    cacheMisses: number;
    cacheRevalidations: number;
    staleServed: number;
    readRetries: number;
  }> {
    return Object.freeze({
      cacheHits: this.#cacheHits,
      cacheMisses: this.#cacheMisses,
      cacheRevalidations: this.#cacheRevalidations,
      staleServed: this.#staleServed,
      readRetries: this.#readRetries,
    });
  }

  async #accessToken(
    operation: EsiOperationFact,
    character: ConnectedCharacter | null,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (operation.requiredScopes.length === 0) return null;
    const selected = requireSelectedCharacter(character);
    const missing = operation.requiredScopes.filter((scope) => !selected.grantedScopes.includes(scope));
    if (missing.length > 0) {
      throw new AppError({
        code: 'MISSING_SCOPE',
        safeMessage: 'The selected character did not grant the required EVE scope.',
        details: {
          character_id: selected.characterId,
          capability_id: primaryCapability(operation),
          missing_scopes: missing,
          next_step: 'Reauthorize the character with the indicated capability scope bundle.',
        },
      });
    }
    const scope = operation.requiredScopes[0];
    if (scope === undefined) return null;
    return (await this.#tokens.get({ character: selected, requiredScope: scope, signal })).token;
  }

  async #request(
    operation: EsiOperationFact,
    request: { readonly path: string; readonly body: string | null },
    token: string | null,
    cached: EsiCacheEntry | null,
    characterId: number | null,
    signal: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.#userAgent ?? '',
      'x-compatibility-date': this.#compatibilityDate,
    };
    if (request.body !== null) headers['content-type'] = 'application/json';
    if (token !== null) headers.authorization = `Bearer ${token}`;
    if (cached?.etag !== null && cached?.etag !== undefined) headers['if-none-match'] = cached.etag;
    if (cached?.lastModified !== null && cached?.lastModified !== undefined) {
      headers['if-modified-since'] = cached.lastModified;
    }
    const delays = [250, 750] as const;
    let lastError: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      throwIfAborted(signal);
      const timeout = AbortSignal.timeout(Math.min(this.#timeoutMs, operation.budgets.timeoutMs));
      try {
        const lease = await this.#rateLimits?.acquire({
          operationId: operation.operationId,
          policy: operation.rateLimit,
          characterId,
          signal,
        });
        const response = await this.#fetch(`${this.#origin}${request.path}`, {
          method: operation.method,
          headers,
          ...(request.body === null ? {} : { body: request.body }),
          redirect: 'error',
          signal: AbortSignal.any([signal, timeout]),
        });
        if (lease !== undefined) this.#rateLimits?.observe(lease, response);
        if (response.status < 500 || attempt === delays.length) return response;
        lastError = new Error(`ESI returned ${String(response.status)}.`);
      } catch (error) {
        if (signal.aborted) throwIfAborted(signal);
        lastError = error;
        if (attempt === delays.length) break;
      }
      const delay = delays[attempt];
      if (delay !== undefined) {
        this.#readRetries += 1;
        await this.#delay.wait(delay, signal);
      }
    }
    throw new AppError({
      code: 'ESI_UNAVAILABLE',
      safeMessage: 'EVE ESI is temporarily unavailable.',
      details: { next_step: 'Retry this request shortly.' },
      cause: lastError,
    });
  }
}

function compiledSchemas(operation: EsiOperationFact): { readonly input: z.ZodType; readonly output: z.ZodType } {
  const existing = schemaCache.get(operation.operationId);
  if (existing !== undefined) return existing;
  try {
    const compiled = Object.freeze({
      input: z.fromJSONSchema(operation.inputSchema as Parameters<typeof z.fromJSONSchema>[0]),
      output: z.fromJSONSchema(operation.outputSchema as Parameters<typeof z.fromJSONSchema>[0]),
    });
    schemaCache.set(operation.operationId, compiled);
    return compiled;
  } catch (error) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: `The packaged ESI schema for ${operation.operationId} could not be compiled.`,
      cause: error,
    });
  }
}

function parseInput(
  schema: z.ZodType,
  value: Readonly<Record<string, unknown>>,
  operation: EsiOperationFact,
): Readonly<Record<string, unknown>> {
  const parsed = schema.safeParse(value);
  if (!parsed.success || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
    throw new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: `The arguments for ${operation.summary} are invalid.`,
      details: {
        capability_id: primaryCapability(operation),
        fields: parsed.success ? [] : parsed.error.issues.slice(0, 20).map((issue) => issue.path.join('.')),
        next_step: 'Use find_eve_capabilities to inspect the capability input schema.',
      },
    });
  }
  return parsed.data as Readonly<Record<string, unknown>>;
}

function parseOutput(schema: z.ZodType, value: unknown, operation: EsiOperationFact): JsonValue {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: `EVE ESI returned an unexpected response for ${operation.operationId}.`,
      cause: parsed.error,
    });
  }
  assertJsonCompatible(parsed.data);
  return parsed.data;
}

function primaryCapability(operation: EsiOperationFact): string {
  const capabilityId = operation.capabilityIds[0];
  if (capabilityId === undefined) throw new Error(`ESI operation has no capability: ${operation.operationId}`);
  return capabilityId;
}

function buildRequest(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, unknown>>,
): { readonly path: string; readonly body: string | null } {
  let path = operation.pathTemplate;
  const query = new URLSearchParams();
  for (const parameter of operation.parameters) {
    const value = argumentsValue[parameter.name];
    if (value === undefined) continue;
    if (parameter.location === 'path') {
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(toParameter(value, parameter.name)));
      continue;
    }
    if (Array.isArray(value)) {
      if (parameter.explode) {
        for (const item of value) query.append(parameter.name, toParameter(item, parameter.name));
      } else {
        query.set(parameter.name, value.map((item) => toParameter(item, parameter.name)).join(','));
      }
    } else {
      query.set(parameter.name, toParameter(value, parameter.name));
    }
  }
  if (/\{[^}]+\}/u.test(path)) throw new Error(`Generated ESI path remains unresolved: ${operation.operationId}`);
  const queryString = query.toString();
  return Object.freeze({
    path: queryString.length === 0 ? path : `${path}?${queryString}`,
    body: argumentsValue.body === undefined ? null : JSON.stringify(argumentsValue.body),
  });
}

function toParameter(value: unknown, name: string): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new AppError({
    code: 'AMBIGUOUS_INPUT',
    safeMessage: `The ESI parameter ${name} must be a primitive value.`,
  });
}

function assertSuccess(response: Response, character: ConnectedCharacter | null, now: Date): void {
  if (response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (response.status !== 204 && !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
      throw new AppError({
        code: 'UPSTREAM_CONTRACT_MISMATCH',
        safeMessage: 'EVE ESI returned a non-JSON response.',
      });
    }
    return;
  }
  if (response.status === 401) {
    throw new AppError({
      code: 'REAUTHORIZATION_REQUIRED',
      safeMessage: 'EVE rejected the selected character authorization.',
      details: character === null ? {} : {
        character_id: character.characterId,
        next_step: 'Call reauthorize_character.',
      },
    });
  }
  if (response.status === 403) {
    throw new AppError({
      code: 'INSUFFICIENT_ROLE',
      safeMessage: 'EVE denied the required scope, membership, or in-game role.',
      details: character === null ? {} : { character_id: character.characterId },
    });
  }
  if (response.status === 420 || response.status === 429) {
    throw new AppError({
      code: 'RATE_LIMITED',
      safeMessage: 'EVE ESI rate-limited this request.',
      details: { retry_after_ms: retryAfterMilliseconds(response.headers, now) },
    });
  }
  if (response.status === 404) {
    throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The requested EVE data was not found.' });
  }
  throw new AppError({
    code: response.status >= 500 ? 'ESI_UNAVAILABLE' : 'UPSTREAM_SERVICE_FAILED',
    safeMessage: 'EVE ESI could not complete the request.',
    details: { retry_after_ms: retryAfterMilliseconds(response.headers, now) },
  });
}

async function readJson(response: Response, maximumBytes: number): Promise<unknown> {
  if (response.status === 204) return null;
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw oversized();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw oversized();
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(quoteUnsafeIntegers(text)) as unknown;
  } catch (error) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: 'EVE ESI returned invalid JSON.',
      cause: error,
    });
  }
}

export function quoteUnsafeIntegers(text: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length;) {
    const character = text[index];
    if (character === undefined) break;
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      index += 1;
      continue;
    }
    if (character === '-' || /[0-9]/u.test(character)) {
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(index));
      const token = match?.[0];
      if (token !== undefined) {
        const integer = !/[.eE]/u.test(token);
        output += integer && !Number.isSafeInteger(Number(token)) ? `"${token}"` : token;
        index += token.length;
        continue;
      }
    }
    output += character;
    index += 1;
  }
  return output;
}

function createEntry(input: {
  readonly cacheKey: string;
  readonly operation: EsiOperationFact;
  readonly character: ConnectedCharacter | null;
  readonly generation: number | null;
  readonly requestVariantHash: Uint8Array;
  readonly response: Response;
  readonly payload: string;
  readonly createdAt: Date;
}): EsiCacheEntry {
  const freshUntil = boundedFreshUntil(input.response.headers, input.createdAt, input.operation);
  const staleSeconds = input.operation.freshness.staleIfErrorSeconds;
  return Object.freeze({
    cacheKey: input.cacheKey,
    operationId: input.operation.operationId,
    compatibilityDate: input.operation.compatibilityDate,
    characterId: input.character?.characterId ?? null,
    authorizationGeneration: input.generation,
    requestVariantHash: input.requestVariantHash,
    responseStatus: input.response.status,
    etag: boundedHeader(input.response.headers.get('etag')),
    lastModified: boundedHeader(input.response.headers.get('last-modified')),
    freshUntil,
    staleUntil: staleSeconds === 0 ? null : new Date(Date.parse(freshUntil) + staleSeconds * 1_000).toISOString(),
    validatedPayloadJson: input.payload,
    byteSize: Buffer.byteLength(input.payload),
    accessedAt: input.createdAt.toISOString(),
    createdAt: input.createdAt.toISOString(),
  });
}

function refreshEntry(
  entry: EsiCacheEntry,
  operation: EsiOperationFact,
  headers: Headers,
  now: Date,
): EsiCacheEntry {
  const freshUntil = boundedFreshUntil(headers, now, operation);
  const staleSeconds = operation.freshness.staleIfErrorSeconds;
  return Object.freeze({
    ...entry,
    etag: boundedHeader(headers.get('etag')) ?? entry.etag,
    lastModified: boundedHeader(headers.get('last-modified')) ?? entry.lastModified,
    freshUntil,
    staleUntil: staleSeconds === 0 ? null : new Date(Date.parse(freshUntil) + staleSeconds * 1_000).toISOString(),
    accessedAt: now.toISOString(),
    createdAt: now.toISOString(),
  });
}

function cachedResult(
  operation: EsiOperationFact,
  schema: z.ZodType,
  entry: EsiCacheEntry,
  cache: EsiOperationExecution['cache'],
): EsiOperationExecution {
  let raw: unknown;
  try {
    raw = JSON.parse(entry.validatedPayloadJson) as unknown;
  } catch (error) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: 'A validated ESI cache entry contains invalid JSON.',
      cause: error,
    });
  }
  return Object.freeze({
    value: parseOutput(schema, raw, operation),
    operationId: operation.operationId,
    retrievedAt: entry.createdAt,
    expiresAt: entry.freshUntil,
    cache,
    totalPages: null,
  });
}

function boundedFreshUntil(headers: Headers, now: Date, operation: EsiOperationFact): string {
  const policySeconds = operation.freshness.ttlSeconds ?? 86_400;
  const maximum = now.getTime() + policySeconds * 1_000;
  const expires = Date.parse(headers.get('expires') ?? '');
  const chosen = Number.isFinite(expires) && expires > now.getTime()
    ? Math.min(expires, maximum)
    : maximum;
  return new Date(chosen).toISOString();
}

function totalPages(headers: Headers): number | null {
  const raw = headers.get('x-pages');
  if (raw === null || !/^[1-9][0-9]{0,8}$/u.test(raw)) return null;
  return Number(raw);
}

function boundedHeader(value: string | null): string | null {
  return value !== null && value.length >= 1 && value.length <= 1024 ? value : null;
}

function retryAfterMilliseconds(headers: Headers, now: Date): number {
  const raw = headers.get('retry-after');
  if (raw === null) return 1_000;
  if (/^[0-9]{1,6}$/u.test(raw)) return Math.min(Number(raw) * 1_000, 300_000);
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return 1_000;
  return Math.min(Math.max(date - now.getTime(), 0), 300_000);
}

function digest(value: string): Uint8Array {
  return Uint8Array.from(createHash('sha256').update(value).digest());
}

function hexDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function oversized(): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: 'EVE ESI returned a response larger than the configured safety limit.',
  });
}
