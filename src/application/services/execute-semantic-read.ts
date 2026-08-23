import type { ExecuteSemanticReadInput, SemanticReadComponent, SemanticReadData } from '../dto/semantic-read.js';
import type { Clock } from '../ports/clock.js';
import type { RequestContext, UseCase } from './use-case.js';
import type { ExecuteBoundedRead } from './execute-bounded-read.js';
import { ESI_SEMANTIC_TOOLS } from '../../capabilities/generated/semantic-tools.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import type { JsonValue } from '../../domain/json.js';
import type { ResultEnvelope } from '../../domain/result.js';
import type { ResultWarning } from '../../domain/warning.js';
import type { ResolvedType, SdeRepository, SdeTypeRequirementClosure } from '../ports/sde-repository.js';
import {
  compactRequirementComponents,
  requiredRequirementClosure,
  requirementsSummary,
} from './semantic-read-requirements.js';
import {
  arrayResult,
  canonicalValue,
  collectFieldValues,
  isJsonObject,
  numericId,
  objectNumber,
  objectResult,
  resultItemCount,
  scalarResult,
} from './semantic-read-values.js';

const TYPE_ID_FIELDS = new Set(['type_id', 'skill_id', 'ship_type_id', 'blueprint_type_id', 'product_type_id']);
const SYSTEM_ID_FIELDS = new Set(['solar_system_id', 'system_id', 'origin_system_id', 'destination_system_id']);
const MAX_SEMANTIC_RESULT_ITEMS = 200;
// Component payloads may also be repeated in summaries. Keeping their combined
// source data below 160 KiB leaves ample room under the 512 KiB MCP envelope.
const MAX_SEMANTIC_COMPONENT_BYTES = 160 * 1024;
const MIN_SEMANTIC_COMPONENT_BYTES = 4 * 1024;
const MAX_REQUIREMENT_RESULT_BYTES = 512 * 1024;

const definitions = new Map<string, (typeof ESI_SEMANTIC_TOOLS)[number]>(
  ESI_SEMANTIC_TOOLS.map((definition) => [definition.name, definition]),
);
type SemanticBehavior = (typeof ESI_SEMANTIC_TOOLS)[number]['behavior'];

export class ExecuteSemanticRead implements UseCase<ExecuteSemanticReadInput, ResultEnvelope<SemanticReadData>> {
  readonly #bounded: Pick<ExecuteBoundedRead, 'executeRegisteredOperation'>;
  readonly #catalog: EsiOperationCatalog;
  readonly #clock: Clock;
  readonly #sde: SdeRepository | null;

  constructor(input: {
    readonly bounded: Pick<ExecuteBoundedRead, 'executeRegisteredOperation'>;
    readonly catalog: EsiOperationCatalog;
    readonly clock: Clock;
    readonly sde?: SdeRepository;
  }) {
    this.#bounded = input.bounded;
    this.#catalog = input.catalog;
    this.#clock = input.clock;
    this.#sde = input.sde ?? null;
  }

  async execute(
    input: ExecuteSemanticReadInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<SemanticReadData>> {
    throwIfAborted(context.signal);
    const definition = definitions.get(input.tool_name);
    if (definition === undefined) {
      throw new AppError({ code: 'CAPABILITY_UNAVAILABLE', safeMessage: 'The semantic EVE tool is not registered.' });
    }
    const operations = definition.operationIds.map((operationId) => requiredRead(this.#catalog, operationId));
    assertSemanticArguments(definition.behavior, operations, input.arguments, input.continuations);
    const requirementClosure = definition.behavior === 'requirements'
      ? await requiredRequirementClosure(input.arguments, this.#sde)
      : null;
    const preparedSelectors = await prepareSemanticSelectors(
      definition.behavior,
      input.arguments,
      this.#sde,
      requirementClosure,
    );
    const requestedOperations = operationsForRequest(
      definition.behavior,
      operations,
      input.continuations,
    );
    const components: SemanticReadComponent[] = [];
    const continuations: Record<string, string> = {};
    const warnings: ResultWarning[] = [];
    let firstOptionalFailure: AppError | null = null;
    let character: ResultEnvelope<unknown>['character'] = null;
    let remainingResultItems = MAX_SEMANTIC_RESULT_ITEMS;
    let remainingResultBytes = MAX_SEMANTIC_COMPONENT_BYTES;
    for (const [requestedIndex, operation] of requestedOperations.entries()) {
      throwIfAborted(context.signal);
      const operationIndex = (definition.operationIds as readonly string[]).indexOf(operation.operationId);
      if (operationIndex < 0) throw new Error(`Semantic operation index is missing: ${operation.operationId}`);
      const continuation = input.continuations[operation.operationId];
      let result;
      try {
        const argumentsForOperation = continuation === undefined
          ? semanticArguments(operation, input.arguments, components)
          : {};
        if (argumentsForOperation === null) continue;
        const selector = semanticSelector(
          definition.behavior,
          operation.operationId,
          input.arguments,
          components,
          preparedSelectors,
        );
        result = await this.#bounded.executeRegisteredOperation({
          operation_id: operation.operationId,
          continuation_key: `semantic.${input.tool_name}.${String(operationIndex)}`,
          arguments: argumentsForOperation,
          max_items: Math.min(
            input.max_items,
            Math.max(1, remainingResultItems - (requestedOperations.length - requestedIndex - 1)),
          ),
          maximum_result_bytes: Math.max(
            MIN_SEMANTIC_COMPONENT_BYTES,
            remainingResultBytes
              - (requestedOperations.length - requestedIndex - 1) * MIN_SEMANTIC_COMPONENT_BYTES,
          ),
          ...(selector === undefined ? {} : { result_selector: selector }),
          ...(continuation === undefined ? {} : { continuation }),
        }, context);
      } catch (error) {
        if (error instanceof AppError && (error.code === 'MISSING_SCOPE' || error.code === 'INSUFFICIENT_ROLE')) {
          throw new AppError({
            code: error.code,
            safeMessage: error.safeMessage,
            details: {
              ...error.details,
              capability_id: input.tool_name,
              ...(error.code === 'MISSING_SCOPE'
                ? { next_step: `Call reauthorize_character with capability_id ${input.tool_name}.` }
                : error.details.next_step === undefined ? {} : { next_step: error.details.next_step }),
            },
            cause: error,
          });
        }
        if (definition.behavior !== 'requirements'
          && error instanceof AppError
          && requestedOperations.length > 1
          && isOptionalSourceFailure(error)) {
          firstOptionalFailure ??= error;
          warnings.push(Object.freeze({
            code: 'OPTIONAL_SOURCE_FAILED',
            message: `${operation.summary} was unavailable, so the semantic result is incomplete.`,
            affectedFields: [operation.operationId],
          }));
          continue;
        }
        throw error;
      }
      character ??= result.character;
      if (definition.behavior === 'requirements'
        && (result.partial || result.data.continuation !== null)) {
        throw new AppError({
          code: 'RESULT_LIMIT_EXCEEDED',
          safeMessage: 'The complete character requirement proof did not fit in one result.',
        });
      }
      remainingResultItems = Math.max(
        0,
        remainingResultItems - resultItemCount(result.data.result),
      );
      remainingResultBytes = Math.max(
        0,
        remainingResultBytes - Buffer.byteLength(JSON.stringify(result.data.result), 'utf8'),
      );
      components.push(Object.freeze({
        operation_id: operation.operationId,
        purpose: operation.summary,
        result: result.data.result,
        page: result.data.page,
        continuation: result.data.continuation,
        cache: result.cache,
        retrieved_at: result.retrieved_at,
        expires_at: result.expires_at,
        sde_build: null,
      }));
      if (result.data.continuation !== null) continuations[operation.operationId] = result.data.continuation;
      warnings.push(...result.warnings.map((warning) => Object.freeze({
        ...warning,
        affectedFields: [operation.operationId],
      })));
    }
    if (components.length === 0 && firstOptionalFailure !== null) throw firstOptionalFailure;
    let enrichedComponents: readonly SemanticReadComponent[];
    if (definition.behavior === 'requirements') {
      if (requirementClosure === null) throw new Error('The requirement closure was not prepared.');
      enrichedComponents = compactRequirementComponents(components, requirementClosure);
    } else {
      enrichedComponents = await enrichComponents(components, this.#sde, warnings);
    }
    const summary = buildSemanticSummary(
      definition.behavior,
      components,
      input.arguments,
      requirementClosure,
    );
    const now = this.#clock.now().toISOString();
    const output = Object.freeze({
      schema_version: 1,
      request_id: context.requestId,
      character,
      data: Object.freeze({
        tool: input.tool_name,
        summary,
        components: Object.freeze(enrichedComponents),
        continuations: Object.freeze(continuations),
      }),
      source: { kind: 'computed' as const, name: 'EVE Copilot semantic operation registry', version: '3' },
      retrieved_at: now,
      expires_at: earliestExpiry(enrichedComponents),
      cache: 'not_applicable',
      estimated: definition.behavior === 'wealth',
      partial: Object.keys(continuations).length > 0 || warnings.some((warning) =>
        warning.code === 'OPTIONAL_SOURCE_FAILED'
        || warning.code === 'SDE_RESOLUTION_UNAVAILABLE'
        || warning.code === 'SDE_RESOLUTION_LIMIT'),
      warnings: Object.freeze(warnings),
    });
    if (definition.behavior === 'requirements'
      && Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_REQUIREMENT_RESULT_BYTES) {
      throw new AppError({
        code: 'RESULT_LIMIT_EXCEEDED',
        safeMessage: 'The complete character requirement proof exceeds the MCP result limit.',
      });
    }
    return output;
  }
}

function semanticSelector(
  behavior: SemanticBehavior,
  operationId: string,
  argumentsValue: Readonly<Record<string, unknown>>,
  components: readonly SemanticReadComponent[],
  prepared: ReadonlyMap<string, { readonly field: string; readonly values: readonly string[] }>,
): { readonly field: string; readonly values: readonly string[] } | undefined {
  const preparedSelector = prepared.get(operationId);
  if (preparedSelector !== undefined) return preparedSelector;
  if (operationId !== 'GetMarketsPrices') return undefined;
  if (behavior === 'market_price') {
    const typeId = argumentsValue.type_id;
    return typeof typeId === 'string' ? { field: 'type_id', values: [typeId] } : undefined;
  }
  if (behavior === 'wealth') {
    const assets = components.find((component) => component.operation_id === 'GetCharactersCharacterIdAssets');
    if (assets === undefined) return undefined;
    const ids = new Set<string>();
    collectFieldValues(assets.result, 'type_id', ids);
    return ids.size === 0 ? undefined : { field: 'type_id', values: [...ids].slice(0, 200) };
  }
  return undefined;
}

async function prepareSemanticSelectors(
  behavior: SemanticBehavior,
  argumentsValue: Readonly<Record<string, unknown>>,
  sde: SdeRepository | null,
  requirementClosure: SdeTypeRequirementClosure | null,
): Promise<ReadonlyMap<string, { readonly field: string; readonly values: readonly string[] }>> {
  if (behavior === 'requirements') {
    if (requirementClosure === null) throw new Error('The requirement closure was not prepared.');
    return new Map([['GetCharactersCharacterIdSkills', Object.freeze({
      field: 'skill_id',
      values: Object.freeze(requirementClosure.requirements.map((requirement) => String(requirement.skillTypeId))),
    })]]);
  }
  if (behavior !== 'asset_search' && behavior !== 'owned_ships') return new Map();
  if (sde === null || (await sde.status()).state !== 'available') {
    throw new AppError({
      code: 'SDE_UNAVAILABLE',
      safeMessage: 'This semantic inventory tool requires an installed SDE build for safe type classification.',
      details: { next_step: 'Run eve-copilot-mcp sde install.' },
    });
  }
  let ids: readonly number[];
  if (behavior === 'owned_ships') {
    ids = await sde.typeIdsByCategory(6, 10_000);
  } else if (typeof argumentsValue.type_id === 'string' && /^(0|[1-9][0-9]{0,9})$/u.test(argumentsValue.type_id)) {
    ids = [Number(argumentsValue.type_id)];
  } else if (typeof argumentsValue.query === 'string' && argumentsValue.query.trim().length > 0) {
    ids = (await sde.searchTypes(argumentsValue.query, 200)).map((type) => type.id);
  } else {
    throw new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: 'search_assets requires a query or canonical type_id.',
      details: { fields: ['query', 'type_id'] },
    });
  }
  if (behavior === 'owned_ships'
    && typeof argumentsValue.query === 'string'
    && argumentsValue.query.trim().length > 0) {
    const matches = new Set((await sde.searchTypes(argumentsValue.query, 200)).map((type) => type.id));
    ids = ids.filter((id) => matches.has(id));
  }
  return new Map([['GetCharactersCharacterIdAssets', Object.freeze({
    field: 'type_id',
    values: Object.freeze(ids.map(String)),
  })]]);
}

function buildSemanticSummary(
  behavior: SemanticBehavior,
  components: readonly SemanticReadComponent[],
  argumentsValue: Readonly<Record<string, unknown>>,
  requirementClosure: SdeTypeRequirementClosure | null,
): JsonValue {
  if (behavior === 'market_price') {
    const priceValue = arrayResult(components, 'GetMarketsPrices')[0];
    const price = priceValue !== undefined && isJsonObject(priceValue) ? priceValue : undefined;
    const details = objectResult(components, 'GetUniverseTypesTypeId');
    return Object.freeze({
      type_id: canonicalValue(details?.type_id ?? argumentsValue.type_id),
      type_name: typeof details?.name === 'string' ? details.name : null,
      average_price: objectNumber(price, 'average_price'),
      adjusted_price: objectNumber(price, 'adjusted_price'),
    });
  }
  if (behavior === 'market_orders') {
    const orders = arrayResult(components, 'GetMarketsRegionIdOrders').filter(isJsonObject);
    const buys = orders.filter((order) => order.is_buy_order === true);
    const sells = orders.filter((order) => order.is_buy_order !== true);
    const bestBuy = extremum(buys.map((order) => objectNumber(order, 'price')), 'max');
    const bestSell = extremum(sells.map((order) => objectNumber(order, 'price')), 'min');
    return Object.freeze({
      buy_orders: buys.length,
      sell_orders: sells.length,
      best_buy: bestBuy,
      best_sell: bestSell,
      spread: bestBuy === null || bestSell === null ? null : bestSell - bestBuy,
    });
  }
  if (behavior === 'wealth') return wealthSummary(components);
  if (behavior === 'owned_ships' || behavior === 'asset_search') {
    const assets = mergeAssetResolvers(components);
    return Object.freeze({ count: assets.length, assets });
  }
  if (behavior === 'requirements') {
    if (requirementClosure === null) throw new Error('The requirement closure was not prepared.');
    return requirementsSummary(components, requirementClosure);
  }
  if (behavior === 'route') {
    const route = arrayResult(components, 'PostRoute');
    return Object.freeze({ systems: route, jumps: Math.max(route.length - 1, 0) });
  }
  if (behavior === 'wallet_summary') {
    const balance = scalarResult(components, 'GetCharactersCharacterIdWallet');
    return Object.freeze({ balance_isk: typeof balance === 'number' ? balance : null });
  }
  if (behavior === 'market_history') {
    const history = arrayResult(components, 'GetMarketsRegionIdHistory').filter(isJsonObject);
    const latest = [...history].sort((left, right) => dateValue(right).localeCompare(dateValue(left)))[0];
    return Object.freeze({ days: history.length, latest: latest ?? null });
  }
  if (behavior === 'server_activity') {
    return Object.freeze({
      server: objectResult(components, 'GetStatus'),
      active_jump_systems: arrayResult(components, 'GetUniverseSystemJumps').length,
      active_kill_systems: arrayResult(components, 'GetUniverseSystemKills').length,
    });
  }
  return Object.freeze({
    component_count: components.length,
    operation_ids: components.map((component) => component.operation_id),
    returned_items: components.reduce((sum, component) => sum + resultItemCount(component.result), 0),
  });
}

function wealthSummary(components: readonly SemanticReadComponent[]): JsonValue {
  const assets = arrayResult(components, 'GetCharactersCharacterIdAssets').filter(isJsonObject);
  const prices = new Map(arrayResult(components, 'GetMarketsPrices').filter(isJsonObject).flatMap((price) => {
    const typeId = canonicalValue(price.type_id);
    const average = objectNumber(price, 'average_price') ?? objectNumber(price, 'adjusted_price');
    return typeId === null || average === null ? [] : [[typeId, average] as const];
  }));
  let assetValue = 0;
  let pricedAssets = 0;
  for (const asset of assets) {
    const typeId = canonicalValue(asset.type_id);
    const quantity = objectNumber(asset, 'quantity');
    const price = typeId === null ? undefined : prices.get(typeId);
    if (quantity !== null && price !== undefined) {
      assetValue += quantity * price;
      pricedAssets += 1;
    }
  }
  const wallet = scalarResult(components, 'GetCharactersCharacterIdWallet');
  const walletValue = typeof wallet === 'number' ? wallet : 0;
  return Object.freeze({
    wallet_isk: typeof wallet === 'number' ? wallet : null,
    priced_asset_value_isk: assetValue,
    estimated_total_isk: walletValue + assetValue,
    priced_asset_records: pricedAssets,
    unpriced_asset_records: assets.length - pricedAssets,
  });
}

function extremum(values: ReadonlyArray<number | null>, mode: 'min' | 'max'): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  return mode === 'min' ? Math.min(...numbers) : Math.max(...numbers);
}

function dateValue(value: Readonly<Record<string, JsonValue>>): string {
  return typeof value.date === 'string' ? value.date : '';
}

function operationsForRequest(
  behavior: SemanticBehavior,
  operations: readonly EsiOperationFact[],
  continuations: Readonly<Record<string, string>>,
): readonly EsiOperationFact[] {
  if (Object.keys(continuations).length === 0) return operations;
  const continued = new Set(Object.keys(continuations));
  if ((behavior === 'asset_search' || behavior === 'owned_ships')
    && continued.has('GetCharactersCharacterIdAssets')) {
    continued.add('PostCharactersCharacterIdAssetsNames');
    continued.add('PostCharactersCharacterIdAssetsLocations');
  }
  return operations.filter((operation) => continued.has(operation.operationId));
}

function semanticArguments(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, unknown>>,
  components: readonly SemanticReadComponent[],
): Readonly<Record<string, unknown>> | null {
  if (operation.operationId === 'PostCharactersCharacterIdAssetsNames'
    || operation.operationId === 'PostCharactersCharacterIdAssetsLocations') {
    const itemIds = new Set<string>();
    collectFieldValues(
      components.find((component) => component.operation_id === 'GetCharactersCharacterIdAssets')?.result ?? [],
      'item_id',
      itemIds,
    );
    if (itemIds.size === 0) return null;
    return Object.freeze({ body: Object.freeze([...itemIds].slice(0, 1_000)) });
  }
  return selectArguments(operation, argumentsValue);
}

function mergeAssetResolvers(components: readonly SemanticReadComponent[]): readonly JsonValue[] {
  const names = new Map<string, string>();
  for (const entry of arrayResult(components, 'PostCharactersCharacterIdAssetsNames').filter(isJsonObject)) {
    const itemId = canonicalValue(entry.item_id);
    if (itemId !== null && typeof entry.name === 'string') names.set(itemId, entry.name);
  }
  const locations = new Map<string, JsonValue>();
  for (const entry of arrayResult(components, 'PostCharactersCharacterIdAssetsLocations').filter(isJsonObject)) {
    const itemId = canonicalValue(entry.item_id);
    if (itemId !== null && entry.position !== undefined) locations.set(itemId, entry.position);
  }
  return Object.freeze(arrayResult(components, 'GetCharactersCharacterIdAssets').map((entry) => {
    if (!isJsonObject(entry)) return entry;
    const itemId = canonicalValue(entry.item_id);
    if (itemId === null) return entry;
    const customName = names.get(itemId);
    const position = locations.get(itemId);
    if (customName === undefined && position === undefined) return entry;
    return Object.freeze({
      ...entry,
      ...(customName === undefined ? {} : { custom_name: customName }),
      ...(position === undefined ? {} : { position }),
    });
  }));
}

async function enrichComponents(
  components: readonly SemanticReadComponent[],
  sde: SdeRepository | null,
  warnings: ResultWarning[],
): Promise<readonly SemanticReadComponent[]> {
  if (sde === null) return components;
  const typeIds = new Set<number>();
  const systemIds = new Set<number>();
  for (const component of components) {
    collectResolutionIds(component.result, null, typeIds, systemIds);
    if (component.operation_id === 'GetCharactersCharacterIdImplants' && Array.isArray(component.result)) {
      for (const entry of component.result as readonly JsonValue[]) {
        const id = numericId(entry);
        if (id !== null) typeIds.add(id);
      }
    }
  }
  if (typeIds.size === 0 && systemIds.size === 0) return components;
  const boundedTypeIds = [...typeIds].slice(0, 500);
  const boundedSystemIds = [...systemIds].slice(0, 500);
  if (boundedTypeIds.length < typeIds.size || boundedSystemIds.length < systemIds.size) {
    warnings.push(Object.freeze({
      code: 'SDE_RESOLUTION_LIMIT',
      message: 'Some static names were omitted after reaching the bounded SDE resolution budget.',
      affectedFields: components.map((component) => component.operation_id),
    }));
  }
  const status = await sde.status();
  if (status.state !== 'available' || status.buildNumber === null) {
    warnings.push(Object.freeze({
      code: 'SDE_RESOLUTION_UNAVAILABLE',
      message: 'Static EVE names could not be resolved because no valid SDE build is installed.',
      affectedFields: components.map((component) => component.operation_id),
    }));
    return components;
  }
  const [types, systems] = await Promise.all([
    sde.resolveTypes(boundedTypeIds),
    sde.resolveSolarSystems(boundedSystemIds),
  ]);
  return Object.freeze(components.map((component) => {
    const result = component.operation_id === 'GetCharactersCharacterIdImplants' && Array.isArray(component.result)
      ? (component.result as readonly JsonValue[]).map((entry): JsonValue => {
        const id = numericId(entry);
        const type = id === null ? undefined : types.get(id);
        return type === undefined ? entry : Object.freeze({ type_id: id, type_name: type.name });
      })
      : enrichValue(component.result, types, systems);
    return Object.freeze({ ...component, result, sde_build: status.buildNumber });
  }));
}

function collectResolutionIds(
  value: JsonValue,
  field: string | null,
  typeIds: Set<number>,
  systemIds: Set<number>,
): void {
  if (field !== null && TYPE_ID_FIELDS.has(field)) {
    const id = numericId(value);
    if (id !== null) typeIds.add(id);
  }
  if (field !== null && SYSTEM_ID_FIELDS.has(field)) {
    const id = numericId(value);
    if (id !== null) systemIds.add(id);
  }
  if (Array.isArray(value)) {
    for (const entry of value as readonly JsonValue[]) collectResolutionIds(entry, field, typeIds, systemIds);
  } else if (isJsonObject(value)) {
    for (const [key, entry] of Object.entries(value)) collectResolutionIds(entry, key, typeIds, systemIds);
  }
}

function enrichValue(
  value: JsonValue,
  types: ReadonlyMap<number, ResolvedType>,
  systems: ReadonlyMap<number, { readonly name: string }>,
): JsonValue {
  if (Array.isArray(value)) return (value as readonly JsonValue[]).map((entry) => enrichValue(entry, types, systems));
  if (!isJsonObject(value)) return value;
  const output: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = enrichValue(entry, types, systems);
    const id = numericId(entry);
    if (id !== null && TYPE_ID_FIELDS.has(key)) {
      const resolved = types.get(id);
      if (resolved !== undefined) {
        const prefix = key.replace(/_id$/u, '');
        output[key === 'skill_id' ? 'skill_name' : `${prefix}_name`] = resolved.name;
        output[`${prefix}_group`] = resolved.groupName;
        output[`${prefix}_category`] = resolved.categoryName;
      }
    }
    if (id !== null && SYSTEM_ID_FIELDS.has(key)) {
      const resolved = systems.get(id);
      if (resolved !== undefined) output[key.replace(/_id$/u, '_name')] = resolved.name;
    }
  }
  return Object.freeze(output);
}

function isOptionalSourceFailure(error: AppError): boolean {
  return error.code === 'ESI_UNAVAILABLE'
    || error.code === 'UPSTREAM_SERVICE_FAILED'
    || error.code === 'UPSTREAM_CONTRACT_MISMATCH'
    || error.code === 'RESULT_LIMIT_EXCEEDED';
}

function requiredRead(catalog: EsiOperationCatalog, operationId: string): EsiOperationFact {
  const operation = catalog.findOperation(operationId);
  if (operation?.operationClass !== 'read') {
    throw new Error(`Generated semantic read references an unavailable operation: ${operationId}`);
  }
  return operation;
}

function assertSemanticArguments(
  behavior: SemanticBehavior,
  operations: readonly EsiOperationFact[],
  argumentsValue: Readonly<Record<string, unknown>>,
  continuations: Readonly<Record<string, string>>,
): void {
  if (behavior === 'requirements' && Object.keys(continuations).length > 0) {
    throw new AppError({
      code: 'INVALID_CONTINUATION',
      safeMessage: 'check_requirements returns one complete proof and does not accept continuations.',
    });
  }
  const operationIds = new Set(operations.map((operation) => operation.operationId));
  const invalidContinuations = Object.keys(continuations).filter((operationId) => !operationIds.has(operationId));
  if (invalidContinuations.length > 0 || Object.keys(continuations).length > 0 && Object.keys(argumentsValue).length > 0) {
    throw new AppError({
      code: 'INVALID_CONTINUATION',
      safeMessage: 'Semantic continuations must belong to this tool and cannot be combined with changed arguments.',
      details: { fields: invalidContinuations },
    });
  }
  const allowed = new Set(operations.flatMap((operation) => propertyNames(operation.inputSchema))
    .filter((name) => name !== 'character_id'));
  for (const name of semanticArgumentExtensions(behavior)) allowed.add(name);
  const unknown = Object.keys(argumentsValue).filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new AppError({
      code: 'AMBIGUOUS_INPUT',
      safeMessage: 'The semantic EVE tool received arguments it does not accept.',
      details: { fields: unknown },
    });
  }
}

function semanticArgumentExtensions(behavior: SemanticBehavior): readonly string[] {
  if (behavior === 'asset_search') return ['query', 'type_id'];
  if (behavior === 'owned_ships') return ['query'];
  return [];
}

function selectArguments(
  operation: EsiOperationFact,
  argumentsValue: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const names = new Set(propertyNames(operation.inputSchema).filter((name) => name !== 'character_id'));
  return Object.freeze(Object.fromEntries(Object.entries(argumentsValue).filter(([name]) => names.has(name))));
}

function propertyNames(schema: JsonValue): readonly string[] {
  if (!isJsonObject(schema) || !isJsonObject(schema.properties ?? null)) return [];
  return Object.keys(schema.properties as Readonly<Record<string, JsonValue>>);
}

function earliestExpiry(components: readonly SemanticReadComponent[]): string | null {
  const values = components.map((component) => component.expires_at).filter((value) => value !== null).sort();
  return values[0] ?? null;
}
