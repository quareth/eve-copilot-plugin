import type { BoundedReadData, ExecuteBoundedReadInput } from '../dto/bounded-read.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { EsiGateway } from '../ports/esi-gateway.js';
import type { EsiOperationExecutor } from '../ports/esi-operation-executor.js';
import type { ContinuationRepository, ContinuationState } from '../ports/continuation-repository.js';
import type { ContinuationTokenCodec } from '../ports/continuation-token-codec.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Digest } from '../ports/digest.js';
import type { RequestContext, UseCase } from './use-case.js';
import {
  assertOperationScopes,
  bindSelectedCharacterArgument,
  requireSelectedCharacter,
} from '../../domain/authorization.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import { assertJsonCompatible, type JsonValue } from '../../domain/json.js';
import type { ResultEnvelope } from '../../domain/result.js';

const ROLE_OPERATION = 'GetCharactersCharacterIdRoles';
const FLEET_OPERATION = 'GetCharactersCharacterIdFleet';
const CONTINUATION_TTL_MS = 15 * 60 * 1_000;
const MAX_RESULT_BYTES = 400 * 1024;
const CONTINUATION_SEEN_KEY = '__eve_seen_fingerprints';
const CONTINUATION_TOTAL_KEY = '__eve_initial_total_pages';

export class ExecuteBoundedRead implements UseCase<ExecuteBoundedReadInput, ResultEnvelope<BoundedReadData>> {
  readonly #catalog: EsiOperationCatalog;
  readonly #characters: CharacterRepository;
  readonly #identity: EsiGateway;
  readonly #executor: EsiOperationExecutor;
  readonly #continuations: ContinuationRepository;
  readonly #continuationTokens: ContinuationTokenCodec;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #digest: Digest;

  constructor(input: {
    readonly catalog: EsiOperationCatalog;
    readonly characters: CharacterRepository;
    readonly identity: EsiGateway;
    readonly executor: EsiOperationExecutor;
    readonly continuations: ContinuationRepository;
    readonly continuationTokens: ContinuationTokenCodec;
    readonly clock: Clock;
    readonly idGenerator: IdGenerator;
    readonly digest: Digest;
  }) {
    this.#catalog = input.catalog;
    this.#characters = input.characters;
    this.#identity = input.identity;
    this.#executor = input.executor;
    this.#continuations = input.continuations;
    this.#continuationTokens = input.continuationTokens;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#digest = input.digest;
  }

  execute(
    input: ExecuteBoundedReadInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<BoundedReadData>> {
    throwIfAborted(context.signal);
    const operation = this.#catalog.findCapability(input.capability_id);
    if (operation === null) {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'The requested EVE capability is not registered.',
        details: {
          capability_id: input.capability_id,
          next_step: 'Call find_eve_capabilities to locate a supported capability.',
        },
      });
    }
    if (operation.operationClass !== 'read') {
      throw new AppError({
        code: 'ACTION_REQUIRES_CONFIRMATION',
        safeMessage: 'This EVE capability changes state and requires an action plan.',
        details: {
          capability_id: input.capability_id,
          next_step: 'Use prepare_eve_action after enabling the relevant action family.',
        },
      });
    }
    return this.#executeOperation(input, operation, input.capability_id, context);
  }

  executeRegisteredOperation(
    input: {
      readonly operation_id: string;
      readonly continuation_key: string;
      readonly arguments: Readonly<Record<string, unknown>>;
      readonly continuation?: string;
      readonly max_items: number;
      /** Internal semantic-composition budget; callers cannot set this through MCP. */
      readonly maximum_result_bytes?: number;
      readonly result_selector?: { readonly field: string; readonly values: readonly string[] };
    },
    context: RequestContext,
  ): Promise<ResultEnvelope<BoundedReadData>> {
    const operation = this.#catalog.findOperation(input.operation_id);
    if (operation?.operationClass !== 'read') {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'The registered semantic EVE operation is unavailable.',
      });
    }
    return this.#executeOperation({
      capability_id: input.continuation_key,
      arguments: input.arguments,
      max_items: input.max_items,
      ...(input.continuation === undefined ? {} : { continuation: input.continuation }),
    }, operation, input.continuation_key, context, input.result_selector, input.maximum_result_bytes);
  }

  async #executeOperation(
    input: ExecuteBoundedReadInput,
    operation: EsiOperationFact,
    effectiveCapabilityId: string,
    context: RequestContext,
    resultSelector?: { readonly field: string; readonly values: readonly string[] },
    maximumResultBytes = MAX_RESULT_BYTES,
  ): Promise<ResultEnvelope<BoundedReadData>> {
    throwIfAborted(context.signal);
    const character = operation.access === 'public'
      ? null
      : requireSelectedCharacter(this.#characters.selected());
    const now = this.#clock.now();
    this.#continuations.removeExpired(now.toISOString());
    const resumed = this.#resume(input, operation, effectiveCapabilityId, character, now);
    let argumentsValue: Readonly<Record<string, unknown>> = resumed.arguments;
    let authorizationPartition: string | null = null;
    if (character !== null) {
      argumentsValue = bindSelectedCharacterArgument(operation, argumentsValue, character.characterId);
      assertOperationScopes({
        operation,
        character,
        capabilityId: effectiveCapabilityId,
        nextStep: `Call reauthorize_character with capability_id ${primaryCapability(operation)}.`,
      });
      authorizationPartition = await this.#assertTargetAccess(
        operation,
        argumentsValue,
        character,
        context.signal,
      );
    }
    const result = await this.#executor.execute({
      operation,
      arguments: argumentsValue,
      character,
      ...(authorizationPartition === null ? {} : { authorizationPartition }),
      signal: context.signal,
    });
    const selectedResult = selectResult(result.value, resultSelector);
    const deduplicated = deduplicateResult(selectedResult, resumed.seenFingerprints, this.#digest);
    const bounded = boundResult(
      deduplicated.value,
      resumed.itemOffset,
      input.max_items,
      operation.pagination.mode,
      maximumResultBytes,
    );
    const currentPage = resumed.pageNumber;
    const pageCountChanged = resumed.initialTotalPages !== null
      && result.totalPages !== null
      && resumed.initialTotalPages !== result.totalPages;
    const effectiveTotalPages = resumed.initialTotalPages === null
      ? result.totalPages
      : result.totalPages === null ? resumed.initialTotalPages : Math.min(resumed.initialTotalPages, result.totalPages);
    const next = nextContinuation({
      bounded,
      operation,
      argumentsValue,
      currentPage,
      totalPages: effectiveTotalPages,
      cursorAfter: bounded.cursorAfter,
    });
    // Continuation writes are the response's commit point. Do not invalidate a
    // caller's existing token unless this request is still able to return its
    // replacement.
    throwIfAborted(context.signal);
    let continuation: string | null = null;
    if (next !== null) {
      const advancesPage = next.pageNumber > currentPage;
      const seenFingerprints = advancesPage
        ? [...new Set([...resumed.seenFingerprints, ...fingerprints(deduplicated.value, this.#digest)])].slice(-1_000)
        : resumed.seenFingerprints;
      const continuationArguments: Record<string, unknown> = {
        ...next.arguments,
        [CONTINUATION_SEEN_KEY]: seenFingerprints,
        ...(effectiveTotalPages === null ? {} : { [CONTINUATION_TOTAL_KEY]: effectiveTotalPages }),
      };
      const continuationId = this.#idGenerator.next();
      const state: ContinuationState = Object.freeze({
        continuationId,
        capabilityId: effectiveCapabilityId,
        arguments: asJsonObject(continuationArguments),
        itemOffset: next.itemOffset,
        pageNumber: next.pageNumber,
        characterId: character?.characterId ?? null,
        authorizationGeneration: character?.authorizationGeneration ?? null,
        expiresAt: new Date(now.getTime() + CONTINUATION_TTL_MS).toISOString(),
        createdAt: now.toISOString(),
      });
      this.#continuations.put(state);
      continuation = this.#continuationTokens.encode(continuationId);
    }
    if (resumed.continuationId !== null) this.#continuations.remove(resumed.continuationId);
    const envelope: ResultEnvelope<BoundedReadData> = {
      schema_version: 1,
      request_id: context.requestId,
      character: character === null ? null : { id: character.characterId, name: character.verifiedName },
      data: Object.freeze({
        capability_id: effectiveCapabilityId,
        operation_id: operation.operationId,
        result: bounded.value,
        page: Object.freeze({
          current: currentPage,
          total: effectiveTotalPages,
        }),
        continuation,
      }),
      source: {
        kind: 'ESI',
        name: 'EVE Swagger Interface',
        operation: operation.operationId,
        version: operation.compatibilityDate,
      },
      retrieved_at: result.retrievedAt,
      expires_at: result.expiresAt,
      cache: result.cache,
      estimated: false,
      partial: continuation !== null,
      warnings: [
        ...(continuation === null ? [] : [{
          code: 'COLLECTION_CONTINUES',
          message: 'The result is bounded; use the returned continuation token for the next items.',
        }]),
        ...(deduplicated.removed === 0 ? [] : [{
          code: 'PAGINATION_DUPLICATES_REMOVED',
          message: 'Duplicate objects already returned by an earlier page were omitted.',
        }]),
        ...(pageCountChanged ? [{
          code: 'PAGINATION_SOURCE_CHANGED',
          message: 'The upstream page count changed during traversal; the original upper bound was retained.',
        }] : []),
      ],
    };
    return Object.freeze(envelope);
  }

  #resume(
    input: ExecuteBoundedReadInput,
    operation: EsiOperationFact,
    effectiveCapabilityId: string,
    character: ReturnType<CharacterRepository['selected']>,
    now: Date,
  ): {
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly itemOffset: number;
    readonly continuationId: string | null;
    readonly pageNumber: number;
    readonly seenFingerprints: readonly string[];
    readonly initialTotalPages: number | null;
  } {
    if (input.continuation === undefined) {
      if (Object.keys(input.arguments).some((name) => name.startsWith('__eve_'))) {
        throw new AppError({
          code: 'AMBIGUOUS_INPUT',
          safeMessage: 'Reserved continuation fields cannot be supplied by a caller.',
        });
      }
      if (operation.pagination.mode === 'cursor'
        && (input.arguments.after !== undefined || input.arguments.before !== undefined)) {
        throw new AppError({
          code: 'AMBIGUOUS_INPUT',
          safeMessage: 'Upstream cursor fields are server-managed; use the opaque continuation returned by this capability.',
          details: { fields: ['after', 'before'].filter((field) => input.arguments[field] !== undefined) },
        });
      }
      return {
        arguments: input.arguments,
        itemOffset: 0,
        continuationId: null,
        pageNumber: requestedPage(input.arguments),
        seenFingerprints: [],
        initialTotalPages: null,
      };
    }
    if (Object.keys(input.arguments).length > 0) throw invalidContinuation('Arguments cannot be changed during continuation.');
    const continuationId = this.#continuationTokens.decode(input.continuation);
    const state = this.#continuations.find(continuationId);
    if (state === null || Date.parse(state.expiresAt) <= now.getTime()) {
      throw invalidContinuation('The continuation no longer exists or has expired.');
    }
    if (state.capabilityId !== effectiveCapabilityId
      || state.characterId !== (character?.characterId ?? null)
      || state.authorizationGeneration !== (character?.authorizationGeneration ?? null)) {
      throw invalidContinuation('The continuation does not belong to this capability or selected character.');
    }
    const seenValue = state.arguments[CONTINUATION_SEEN_KEY];
    const totalValue = state.arguments[CONTINUATION_TOTAL_KEY];
    const storedArguments = Object.fromEntries(Object.entries(state.arguments)
      .filter(([key]) => key !== CONTINUATION_SEEN_KEY && key !== CONTINUATION_TOTAL_KEY));
    if (seenValue !== undefined
      && (!Array.isArray(seenValue) || seenValue.length > 1_000
        || seenValue.some((entry) => typeof entry !== 'string' || !/^[a-f0-9]{64}$/u.test(entry)))) {
      throw invalidContinuation('The continuation pagination state is invalid.');
    }
    if (totalValue !== undefined && (!Number.isSafeInteger(totalValue) || Number(totalValue) < 1)) {
      throw invalidContinuation('The continuation page-count state is invalid.');
    }
    return {
      arguments: storedArguments,
      itemOffset: state.itemOffset,
      continuationId,
      pageNumber: state.pageNumber,
      seenFingerprints: seenValue === undefined ? [] : seenValue as readonly string[],
      initialTotalPages: totalValue === undefined ? null : Number(totalValue),
    };
  }

  async #assertTargetAccess(
    operation: EsiOperationFact,
    argumentsValue: Readonly<Record<string, unknown>>,
    character: NonNullable<ReturnType<CharacterRepository['selected']>>,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (operation.access === 'character') return null;
    let organizationPartition: string | null = null;
    if (operation.access === 'corporation' || operation.access === 'alliance') {
      const identity = await this.#identity.getCharacterIdentity(character.characterId, signal);
      if (operation.access === 'corporation') {
        assertMatchingTarget('corporation_id', argumentsValue, String(identity.value.corporationId));
        organizationPartition = `corporation:${String(identity.value.corporationId)}`;
      } else if (identity.value.allianceId === null) {
        throw insufficientMembership('alliance');
      } else {
        assertMatchingTarget('alliance_id', argumentsValue, String(identity.value.allianceId));
        organizationPartition = `alliance:${String(identity.value.allianceId)}`;
      }
    }
    if (operation.access === 'fleet') {
      const fleetOperation = requiredOperation(this.#catalog, FLEET_OPERATION);
      const fleet = await this.#executor.execute({
        operation: fleetOperation,
        arguments: { character_id: String(character.characterId) },
        character,
        signal,
      });
      assertMatchingTarget('fleet_id', argumentsValue, objectString(fleet.value, 'fleet_id'));
      organizationPartition = `fleet:${objectString(fleet.value, 'fleet_id')}`;
    }
    if (operation.requiredRoles.length > 0) {
      const rolesOperation = requiredOperation(this.#catalog, ROLE_OPERATION);
      const rolesResult = await this.#executor.execute({
        operation: rolesOperation,
        arguments: { character_id: String(character.characterId) },
        character,
        signal,
      });
      const roles = collectRoles(rolesResult.value);
      if (!operation.requiredRoles.some((role) => roles.has(role))) {
        throw new AppError({
          code: 'INSUFFICIENT_ROLE',
          safeMessage: 'The selected character lacks an in-game role required for this corporation capability.',
          details: {
            character_id: character.characterId,
            capability_id: primaryCapability(operation),
            next_step: `One of these EVE corporation roles is required: ${operation.requiredRoles.join(', ')}.`,
          },
        });
      }
      organizationPartition = `${organizationPartition ?? operation.access}:roles:${[...roles].sort().join(',')}`;
    }
    return `${organizationPartition ?? operation.access}:role-policy:v1`;
  }
}

function deduplicateResult(
  value: JsonValue,
  seenFingerprints: readonly string[],
  digest: Digest,
): { readonly value: JsonValue; readonly removed: number } {
  if (seenFingerprints.length === 0) return { value, removed: 0 };
  const seen = new Set(seenFingerprints);
  if (Array.isArray(value)) {
    const filtered = (value as readonly JsonValue[]).filter((entry) => !seen.has(digest.hex(stableJson(entry))));
    return { value: Object.freeze(filtered), removed: value.length - filtered.length };
  }
  if (isJsonObject(value)) {
    const collection = Object.entries(value).find(([key, entry]) => key !== 'cursor' && Array.isArray(entry));
    if (collection !== undefined) {
      const [key, entry] = collection;
      const items = entry as readonly JsonValue[];
      const filtered = items.filter((item) => !seen.has(digest.hex(stableJson(item))));
      return {
        value: Object.freeze({ ...value, [key]: Object.freeze(filtered) }),
        removed: items.length - filtered.length,
      };
    }
  }
  return { value, removed: 0 };
}

function fingerprints(value: JsonValue, digest: Digest): readonly string[] {
  if (Array.isArray(value)) return (value as readonly JsonValue[]).map((entry) => digest.hex(stableJson(entry)));
  if (isJsonObject(value)) {
    const collection = Object.entries(value).find(([key, entry]) => key !== 'cursor' && Array.isArray(entry));
    if (collection !== undefined) {
      return (collection[1] as readonly JsonValue[]).map((entry) => digest.hex(stableJson(entry)));
    }
  }
  return [];
}

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${(value as readonly JsonValue[]).map(stableJson).join(',')}]`;
  if (isJsonObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key] ?? null)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function selectResult(
  value: JsonValue,
  selector: { readonly field: string; readonly values: readonly string[] } | undefined,
): JsonValue {
  if (selector === undefined) return value;
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(selector.field)
    || selector.values.length > 10_000
    || selector.values.some((entry) => !/^(0|[1-9][0-9]{0,19})$/u.test(entry))) {
    throw new Error('The internal semantic result selector is invalid.');
  }
  const values = new Set(selector.values);
  const filter = (entries: readonly JsonValue[]): readonly JsonValue[] => Object.freeze(entries.filter((entry) => {
    if (!isJsonObject(entry)) return false;
    const selected = entry[selector.field];
    return (typeof selected === 'string' || typeof selected === 'number') && values.has(String(selected));
  }));
  if (Array.isArray(value)) return filter(value as readonly JsonValue[]);
  if (isJsonObject(value)) {
    const collection = Object.entries(value).find(([, entry]) => Array.isArray(entry)
      && (entry.length === 0 || (entry as readonly JsonValue[])
        .some((item) => isJsonObject(item) && selector.field in item)));
    if (collection !== undefined) {
      const [name, entries] = collection as [string, JsonValue[]];
      return Object.freeze({ ...value, [name]: filter(entries) });
    }
  }
  throw new Error('The internal semantic result selector requires a collection response.');
}

function requiredOperation(catalog: EsiOperationCatalog, operationId: string): EsiOperationFact {
  const operation = catalog.findOperation(operationId);
  if (operation === null) throw new Error(`Required ESI authorization operation is absent: ${operationId}`);
  return operation;
}

function assertMatchingTarget(
  field: string,
  argumentsValue: Readonly<Record<string, unknown>>,
  expected: string,
): void {
  const actual = argumentsValue[field];
  if (typeof actual !== 'string' || actual !== expected) throw insufficientMembership(field.replace('_id', ''));
}

function insufficientMembership(kind: string): AppError {
  return new AppError({
    code: 'INSUFFICIENT_ROLE',
    safeMessage: `The selected character is not authorized for the requested ${kind}.`,
  });
}

function objectString(value: JsonValue, field: string): string {
  if (!isJsonObject(value)) throw invalidAuthorizationResponse();
  const entry = value[field];
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' && Number.isSafeInteger(entry)) return String(entry);
  throw invalidAuthorizationResponse();
}

function collectRoles(value: JsonValue): ReadonlySet<string> {
  if (!isJsonObject(value)) throw invalidAuthorizationResponse();
  const roles = new Set<string>();
  for (const field of ['roles', 'roles_at_base', 'roles_at_hq', 'roles_at_other']) {
    const entries = value[field];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
      throw invalidAuthorizationResponse();
    }
    for (const role of entries) if (typeof role === 'string') roles.add(role);
  }
  return roles;
}

function invalidAuthorizationResponse(): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: 'EVE returned an invalid authorization context response.',
  });
}

function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function primaryCapability(operation: EsiOperationFact): string {
  const capabilityId = operation.capabilityIds[0];
  if (capabilityId === undefined) throw new Error(`ESI operation has no capability: ${operation.operationId}`);
  return capabilityId;
}

function requestedPage(argumentsValue: Readonly<Record<string, unknown>>): number {
  const page = argumentsValue.page;
  return typeof page === 'number' && Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function boundResult(
  value: JsonValue,
  offset: number,
  maximumItems: number,
  paginationMode: EsiOperationFact['pagination']['mode'],
  maximumBytes = MAX_RESULT_BYTES,
): { readonly value: JsonValue; readonly nextOffset: number | null; readonly cursorAfter: string | null } {
  if (paginationMode === 'cursor' && isJsonObject(value)) {
    const collection = Object.entries(value).find(([key, entry]) => key !== 'cursor' && Array.isArray(entry));
    if (collection !== undefined) {
      const [collectionKey, itemsValue] = collection;
      const items = itemsValue as JsonValue[];
      const project = (boundedItems: readonly JsonValue[]): JsonValue => Object.freeze(Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'cursor')
          .map(([key, entry]) => [key, key === collectionKey ? boundedItems : entry]),
      ));
      const bounded = boundArray(items, offset, maximumItems, maximumBytes, project);
      const cursor = value.cursor;
      const cursorAfter = cursor !== undefined
        && isJsonObject(cursor)
        && typeof cursor.after === 'string'
        && cursor.after.length > 0
        ? cursor.after
        : null;
      const returned = project(bounded.value);
      return { value: returned, nextOffset: bounded.nextOffset, cursorAfter };
    }
  }
  if (!Array.isArray(value)) {
    if (jsonBytes(value) > maximumBytes) throw resultLimitExceeded();
    return { value, nextOffset: null, cursorAfter: null };
  }
  const bounded = boundArray(value, offset, maximumItems, maximumBytes);
  return { ...bounded, cursorAfter: null };
}

function boundArray(
  value: readonly JsonValue[],
  offset: number,
  maximumItems: number,
  maximumBytes = MAX_RESULT_BYTES,
  project: (items: readonly JsonValue[]) => JsonValue = (items) => items,
): { readonly value: readonly JsonValue[]; readonly nextOffset: number | null } {
  let items = value.slice(offset, offset + maximumItems);
  while (items.length > 1 && jsonBytes(project(items)) > maximumBytes) {
    items = items.slice(0, Math.max(1, Math.floor(items.length / 2)));
  }
  if (jsonBytes(project(items)) > maximumBytes) throw resultLimitExceeded();
  const nextOffset = offset + items.length < value.length ? offset + items.length : null;
  return { value: items, nextOffset };
}

function jsonBytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function nextContinuation(input: {
  readonly bounded: ReturnType<typeof boundResult>;
  readonly operation: EsiOperationFact;
  readonly argumentsValue: Readonly<Record<string, unknown>>;
  readonly currentPage: number;
  readonly totalPages: number | null;
  readonly cursorAfter: string | null;
}): { readonly arguments: Readonly<Record<string, unknown>>; readonly itemOffset: number; readonly pageNumber: number } | null {
  if (input.bounded.nextOffset !== null) {
    return {
      arguments: input.argumentsValue,
      itemOffset: input.bounded.nextOffset,
      pageNumber: input.currentPage,
    };
  }
  if (input.operation.pagination.mode === 'page'
    && input.totalPages !== null
    && input.currentPage < input.totalPages
    && input.currentPage < input.operation.pagination.maximumPages) {
    return {
      arguments: { ...input.argumentsValue, page: input.currentPage + 1 },
      itemOffset: 0,
      pageNumber: input.currentPage + 1,
    };
  }
  if (input.operation.pagination.mode === 'cursor'
    && input.cursorAfter !== null
    && input.currentPage < input.operation.pagination.maximumPages) {
    const argumentsValue = Object.fromEntries(Object.entries(input.argumentsValue)
      .filter(([key]) => key !== 'before' && key !== 'after'));
    return {
      arguments: { ...argumentsValue, after: input.cursorAfter },
      itemOffset: 0,
      pageNumber: input.currentPage + 1,
    };
  }
  return null;
}

function asJsonObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, JsonValue>> {
  assertJsonCompatible(value);
  return value;
}

function invalidContinuation(reason: string): AppError {
  return new AppError({
    code: 'INVALID_CONTINUATION',
    safeMessage: reason,
    details: { next_step: 'Start the capability call again without a continuation token.' },
  });
}

function resultLimitExceeded(): AppError {
  return new AppError({
    code: 'RESULT_LIMIT_EXCEEDED',
    safeMessage: 'A single ESI result item exceeds the safe MCP result budget.',
    details: { next_step: 'Use a narrower ESI capability or more specific filters.' },
  });
}
