import type {
  AnalyzeFittingChangesData,
  AnalyzeFittingChangesInput,
  AnalyzeFittingChangesResult,
  CanonicalFitSpec,
  CanonicalFittingModule,
  EvaluatedFitting,
  FittingBaselineInput,
  FittingDelta,
  FittingProfile,
  StructuredFittingInput,
} from '../dto/fitting-analysis.js';
import type { FittingCalculationEngine } from '../ports/fitting-calculation-engine.js';
import type { SdeRepository } from '../ports/sde-repository.js';
import type { RequestContext, UseCase } from './use-case.js';
import type { ExecuteBoundedRead } from './execute-bounded-read.js';
import {
  DOGMA_ADAPTER_VERSION,
  DOGMA_CONFORMANCE_MATRIX_VERSION,
  DOGMA_ENGINE_COMMIT,
  DOGMA_ENGINE_REPOSITORY,
  DOGMA_WASM_SHA256,
} from '../../infrastructure/fitting/dogma-version.js';
import {
  MAX_FITTING_CANDIDATES,
  applyCandidate,
  assertUniqueSlots,
  canonicalizeStructuredFit,
  parseFittingSlot,
} from '../../domain/fitting.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { JsonValue } from '../../domain/json.js';

interface ReadMetadata {
  readonly character: { readonly id: number; readonly name: string };
  readonly retrievedAt: string;
  readonly expiresAt: string | null;
  readonly cache: 'not_applicable' | 'miss' | 'hit' | 'revalidated' | 'stale';
}

interface ResolvedBaseline {
  readonly fit: CanonicalFitSpec;
  readonly assumptions: readonly string[];
  readonly metadata: ReadMetadata | null;
}

interface SkillSnapshot {
  readonly levels: Readonly<Record<string, number>>;
  readonly metadata: ReadMetadata;
}

export class AnalyzeFittingChanges implements UseCase<AnalyzeFittingChangesInput, AnalyzeFittingChangesResult> {
  readonly #reads: ExecuteBoundedRead;
  readonly #sde: SdeRepository;
  readonly #engine: FittingCalculationEngine;

  constructor(input: {
    readonly reads: ExecuteBoundedRead;
    readonly sde: SdeRepository;
    readonly engine: FittingCalculationEngine;
  }) {
    this.#reads = input.reads;
    this.#sde = input.sde;
    this.#engine = input.engine;
  }

  async execute(input: AnalyzeFittingChangesInput, context: RequestContext): Promise<AnalyzeFittingChangesResult> {
    throwIfAborted(context.signal);
    if (input.candidates.length > MAX_FITTING_CANDIDATES) throw ambiguous('At most five fitting candidates may be analyzed.');
    assertPolicyProfileIncluded(input);
    if (new Set(input.candidates.map((candidate) => candidate.candidate_id)).size !== input.candidates.length) {
      throw ambiguous('Candidate IDs must be unique within one analysis request.');
    }
    if (this.#sde.fittingSnapshot === undefined) throw new AppError({
      code: 'SDE_INVALID',
      safeMessage: 'The active EVE static data adapter does not support fitting calculation.',
    });
    const snapshot = await this.#sde.fittingSnapshot();
    const baseline = await this.#resolveBaseline(input.baseline, context);
    const candidates = input.candidates.map((candidate) => applyCandidate(baseline.fit, candidate));
    const fits = [baseline.fit, ...candidates];
    await this.#assertResolvedTypes(fits);
    const skills = await this.#skills(context);
    if (baseline.metadata !== null && baseline.metadata.character.id !== skills.metadata.character.id) {
      throw contract('The fitting and active-skill snapshots resolved to different selected characters.');
    }
    const missingSkills = await this.#missingSkills(fits, skills.levels, context.signal);
    const calculated = await this.#engine.calculate({
      snapshot,
      fits,
      skills: skills.levels,
      profiles: input.profiles,
      capacitorPolicy: input.capacitor_policy,
      missingSkills,
    }, context.signal);
    const baselineEvaluation = calculated.evaluations[0];
    if (baselineEvaluation === undefined) throw contract('The fitting engine omitted the baseline result.');
    const candidateEvaluations = input.candidates.map((candidate, index) => {
      const evaluation = calculated.evaluations[index + 1];
      if (evaluation === undefined) throw contract('The fitting engine omitted a candidate result.');
      return Object.freeze({
        ...evaluation,
        candidate_id: candidate.candidate_id,
        delta: fittingDelta(baselineEvaluation, evaluation, input.profiles),
      });
    });
    const unsupported = [...new Set(calculated.evaluations.flatMap((evaluation) => evaluation.unsupported_mechanics))].sort();
    const retrievedAt = latestTimestamp([skills.metadata.retrievedAt, baseline.metadata?.retrievedAt]);
    const character = skills.metadata.character;
    const data: AnalyzeFittingChangesData = Object.freeze({
      baseline: baselineEvaluation,
      candidates: Object.freeze(candidateEvaluations),
      assumptions: Object.freeze([...baseline.assumptions]),
      unsupported_mechanics: Object.freeze(unsupported),
      provenance: Object.freeze({
        sde_build: snapshot.buildNumber,
        sde_release_date: snapshot.releaseDate,
        sde_importer_version: snapshot.importerVersion,
        fitting_data_contract_version: snapshot.fittingDataContractVersion,
        dogma_repository: DOGMA_ENGINE_REPOSITORY,
        dogma_commit: DOGMA_ENGINE_COMMIT,
        dogma_wasm_sha256: DOGMA_WASM_SHA256,
        adapter_version: DOGMA_ADAPTER_VERSION,
        conformance_matrix_version: DOGMA_CONFORMANCE_MATRIX_VERSION,
        calculation_duration_ms: calculated.durationMs,
        skill_retrieved_at: skills.metadata.retrievedAt,
      }),
    });
    return Object.freeze({
      schema_version: 1,
      request_id: context.requestId,
      character,
      data,
      source: {
        kind: 'computed' as const,
        name: 'EVEShipFit dogma-engine fitting analysis',
        operation: 'analyze_fitting_changes',
        version: DOGMA_ENGINE_COMMIT,
      },
      retrieved_at: retrievedAt,
      expires_at: skills.metadata.expiresAt,
      cache: 'not_applicable',
      estimated: false,
      partial: false,
      warnings: baseline.assumptions.map((message) => ({
        code: 'FITTING_ASSUMPTION',
        message,
        affectedFields: ['baseline'],
      })),
    });
  }

  async #resolveBaseline(input: FittingBaselineInput, context: RequestContext): Promise<ResolvedBaseline> {
    switch (input.source) {
      case 'structured': return Object.freeze({
        fit: canonicalizeStructuredFit(input.fit),
        assumptions: Object.freeze([]),
        metadata: null,
      });
      case 'eft': return Object.freeze({
        fit: await this.#parseEft(input.eft),
        assumptions: Object.freeze([]),
        metadata: null,
      });
      case 'current_ship': return this.#currentShip(context);
      case 'owned_ship_item_id': return this.#ownedShip(input.item_id, context);
      case 'fitting_id': return this.#savedFitting(input.fitting_id, context);
    }
  }

  async #currentShip(context: RequestContext): Promise<ResolvedBaseline> {
    const shipEnvelope = await this.#read('GetCharactersCharacterIdShip', 'stage5.current_ship', {}, 1, context);
    const ship = record(shipEnvelope.data.result, 'current ship');
    const hullTypeId = positiveNumber(ship.ship_type_id, 'current ship type');
    const shipItemId = positiveNumber(ship.ship_item_id, 'current ship item');
    const assets = await this.#collectSelected(
      'GetCharactersCharacterIdAssets', 'stage5.current_ship_assets', 'location_id', [String(shipItemId)], context,
    );
    const fit = await fitFromFlaggedItems(hullTypeId, shipItemId, assets, 'current_ship', this.#sde);
    return Object.freeze({
      fit,
      assumptions: Object.freeze([
        'ESI assets do not prove live module activation states; fitted modules default to online.',
        'Cargo charges are not silently mapped to fitted modules.',
      ]),
      metadata: metadata(shipEnvelope),
    });
  }

  async #ownedShip(itemId: number, context: RequestContext): Promise<ResolvedBaseline> {
    const hullRows = await this.#collectSelected(
      'GetCharactersCharacterIdAssets', 'stage5.owned_hull', 'item_id', [String(itemId)], context,
    );
    if (hullRows.length !== 1) throw new AppError({
      code: 'NOT_FOUND',
      safeMessage: 'The selected owned ship item was not found exactly once in character assets.',
    });
    const hull = record(hullRows[0], 'owned ship asset');
    const hullTypeId = positiveNumber(hull.type_id, 'owned ship type');
    const contents = await this.#collectSelected(
      'GetCharactersCharacterIdAssets', 'stage5.owned_ship_assets', 'location_id', [String(itemId)], context,
    );
    const fit = await fitFromFlaggedItems(hullTypeId, itemId, contents, 'owned_ship_item_id', this.#sde);
    return Object.freeze({
      fit,
      assumptions: Object.freeze([
        'ESI assets do not prove live module activation states; fitted modules default to online.',
        'Cargo charges are not silently mapped to fitted modules.',
      ]),
      metadata: null,
    });
  }

  async #savedFitting(fittingId: number, context: RequestContext): Promise<ResolvedBaseline> {
    const envelope = await this.#read('GetCharactersCharacterIdFittings', 'stage5.saved_fitting', {}, 5, context, {
      field: 'fitting_id', values: [String(fittingId)],
    });
    const rows = array(envelope.data.result, 'saved fittings');
    if (rows.length !== 1) throw new AppError({ code: 'NOT_FOUND', safeMessage: 'The saved fitting ID was not found exactly once.' });
    const fitting = record(rows[0], 'saved fitting');
    const hullTypeId = positiveNumber(fitting.ship_type_id, 'saved fitting hull');
    const items = array(fitting.items, 'saved fitting items').map((value) => {
      const item = record(value, 'saved fitting item');
      return {
        type_id: positiveNumber(item.type_id, 'saved fitting item type'),
        quantity: positiveNumber(item.quantity, 'saved fitting quantity'),
        location_flag: stringValue(item.flag, 'saved fitting flag'),
      };
    });
    const fit = await fitFromFlaggedItems(hullTypeId, null, items, 'fitting_id', this.#sde);
    return Object.freeze({
      fit,
      assumptions: Object.freeze([
        'Saved fittings do not prove runtime activation states; fitted modules default to online.',
        'Saved-fitting cargo charges remain unmapped until an explicit candidate charge mapping is supplied.',
      ]),
      metadata: metadata(envelope),
    });
  }

  async #parseEft(text: string): Promise<CanonicalFitSpec> {
    const lines = text.replace(/\r\n?/gu, '\n').split('\n');
    if (lines.length > 256) throw ambiguous('The EFT fitting contains too many lines.');
    const header = /^\[([^,\]]+),[^\]]*\]$/u.exec(lines[0]?.trim() ?? '');
    if (header?.[1] === undefined) throw ambiguous('The EFT fitting header is invalid.');
    const hullTypeId = await this.#exactTypeId(header[1]);
    const body = lines.slice(1);
    const blocks: string[][] = [];
    let current: string[] = [];
    for (const raw of body) {
      const line = raw.trim();
      if (line.length === 0) {
        if (current.length > 0) blocks.push(current);
        current = [];
      } else current.push(line);
    }
    if (current.length > 0) blocks.push(current);
    const families = ['low', 'medium', 'high', 'rig'] as const;
    const modules: Array<StructuredFittingInput['modules'][number]> = [];
    for (const [blockIndex, block] of blocks.slice(0, 4).entries()) {
      const family = families[blockIndex];
      if (family === undefined) break;
      for (const [slotIndex, rawLine] of block.entries()) {
        if (/^\[Empty .+ slot\]$/iu.test(rawLine)) continue;
        const offline = /\s+\/OFFLINE$/iu.test(rawLine);
        const cleaned = rawLine.replace(/\s+\/OFFLINE$/iu, '');
        const [moduleName, chargeName] = cleaned.split(/,\s*/u, 2);
        if (moduleName === undefined || moduleName.length === 0) throw ambiguous('An EFT module name is empty.');
        const typeId = await this.#exactTypeId(moduleName);
        const chargeTypeId = chargeName === undefined ? undefined : await this.#exactTypeId(chargeName);
        const prefix = { low: 'Lo', medium: 'Med', high: 'Hi', rig: 'Rig' }[family];
        modules.push({
          type_id: typeId,
          slot: `${prefix}Slot${String(slotIndex)}`,
          state: offline ? 'passive' : family === 'rig' ? 'passive' : 'online',
          ...(chargeTypeId === undefined ? {} : { charge_type_id: chargeTypeId }),
        });
      }
    }
    const drones: Array<StructuredFittingInput['drones'][number]> = [];
    const cargo: Array<NonNullable<StructuredFittingInput['cargo']>[number]> = [];
    let subsystemBlockSeen = false;
    for (const block of blocks.slice(4)) {
      const quantityEntries = block.map((line) => /^(.+?)\s+x([1-9][0-9]{0,2})$/u.exec(line));
      if (quantityEntries.every((entry) => entry?.[1] !== undefined && entry[2] !== undefined)) {
        for (const entry of quantityEntries) {
          const name = entry?.[1];
          const quantityText = entry?.[2];
          if (name === undefined || quantityText === undefined) throw ambiguous('An EFT quantity entry is invalid.');
          const typeId = await this.#exactTypeId(name);
          const resolved = await this.#sde.resolveType(typeId);
          if (resolved === null) throw ambiguous(`The EFT type name "${name}" is unavailable in the active SDE.`);
          const quantity = Number(quantityText);
          if (resolved.categoryId === 18) drones.push({ type_id: typeId, quantity, active_quantity: 0 });
          else cargo.push({ type_id: typeId, quantity });
        }
        continue;
      }
      if (subsystemBlockSeen) {
        throw ambiguous('The EFT input contains unsupported implant, booster, or extra sections.');
      }
      for (const [slotIndex, rawLine] of block.entries()) {
        if (/^\[Empty .+ slot\]$/iu.test(rawLine)) continue;
        const offline = /\s+\/OFFLINE$/iu.test(rawLine);
        const moduleName = rawLine.replace(/\s+\/OFFLINE$/iu, '');
        const typeId = await this.#exactTypeId(moduleName);
        const resolved = await this.#sde.resolveType(typeId);
        if (resolved?.categoryId !== 32) {
          throw ambiguous('The EFT input contains an unsupported implant, booster, or extra section.');
        }
        modules.push({
          type_id: typeId,
          slot: `SubSystemSlot${String(slotIndex)}`,
          state: offline ? 'passive' : 'online',
        });
      }
      subsystemBlockSeen = true;
    }
    return canonicalizeStructuredFit({ hull_type_id: hullTypeId, modules, drones, cargo }, 'eft');
  }

  async #exactTypeId(name: string): Promise<number> {
    const matches = await this.#sde.searchTypes(name.trim(), 10);
    const normalized = normalizeName(name);
    const exact = matches.filter((match) => normalizeName(match.name) === normalized);
    if (exact.length !== 1) throw ambiguous(`The EFT type name "${name}" is unknown or ambiguous in the active SDE.`);
    const match = exact[0];
    if (match === undefined) throw ambiguous(`The EFT type name "${name}" is unknown or ambiguous in the active SDE.`);
    return match.id;
  }

  async #skills(context: RequestContext): Promise<SkillSnapshot> {
    const envelope = await this.#read('GetCharactersCharacterIdSkills', 'stage5.skills', {}, 1, context);
    const result = record(envelope.data.result, 'character skills');
    const values = array(result.skills, 'character skills list');
    const levels: Record<string, number> = {};
    for (const value of values) {
      const skill = record(value, 'character skill');
      const id = positiveNumber(skill.skill_id, 'skill ID');
      const active = nonnegativeNumber(skill.active_skill_level, 'active skill level');
      levels[String(id)] = Math.min(5, active);
    }
    const readMetadata = metadata(envelope);
    if (readMetadata === null) throw contract('The character skill response omitted character identity.');
    return Object.freeze({ levels: Object.freeze(levels), metadata: readMetadata });
  }

  async #missingSkills(
    fits: readonly CanonicalFitSpec[],
    levels: Readonly<Record<string, number>>,
    signal: AbortSignal,
  ): Promise<ReadonlyArray<ReadonlyArray<{
    readonly skill_type_id: number;
    readonly skill_name: string;
    readonly required_level: number;
    readonly active_level: number;
  }>>> {
    const result = [];
    const closureCache = new Map<number, Awaited<ReturnType<SdeRepository['resolveTypeRequirementClosure']>>>();
    for (const fit of fits) {
      const typeIds = uniqueFitTypeIds(fit);
      const requirements = new Map<number, { name: string; level: number }>();
      for (const typeId of typeIds) {
        throwIfAborted(signal);
        let closure = closureCache.get(typeId);
        if (closure === undefined) {
          closure = await this.#sde.resolveTypeRequirementClosure(typeId);
          closureCache.set(typeId, closure);
        }
        for (const requirement of closure.requirements) {
          const existing = requirements.get(requirement.skillTypeId);
          if (existing === undefined || existing.level < requirement.requiredLevel) {
            requirements.set(requirement.skillTypeId, { name: requirement.skillName, level: requirement.requiredLevel });
          }
        }
      }
      result.push(Object.freeze([...requirements.entries()].flatMap(([skillTypeId, requirement]) => {
        const active = levels[String(skillTypeId)] ?? 0;
        return active >= requirement.level ? [] : [Object.freeze({
          skill_type_id: skillTypeId,
          skill_name: requirement.name,
          required_level: requirement.level,
          active_level: active,
        })];
      }).sort((left, right) => left.skill_type_id - right.skill_type_id)));
    }
    return Object.freeze(result);
  }

  async #assertResolvedTypes(fits: readonly CanonicalFitSpec[]): Promise<void> {
    const ids = [...new Set(fits.flatMap(allFitTypeIds))];
    const resolved = await this.#sde.resolveTypes(ids);
    const missing = ids.filter((id) => !resolved.has(id));
    if (missing.length > 0) throw ambiguous('One or more fitting type IDs do not exist in the active EVE SDE.');
  }

  async #collectSelected(
    operationId: string,
    key: string,
    field: string,
    values: readonly string[],
    context: RequestContext,
  ): Promise<readonly JsonValue[]> {
    const result: JsonValue[] = [];
    let continuation: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const envelope = await this.#read(operationId, key, {}, 128, context, {
        field, values,
      }, continuation);
      result.push(...array(envelope.data.result, operationId));
      if (envelope.data.continuation === null) return Object.freeze(result);
      continuation = envelope.data.continuation;
    }
    throw new AppError({
      code: 'RESULT_LIMIT_EXCEEDED',
      safeMessage: 'The exact fitting source could not be resolved within the bounded ESI page limit.',
    });
  }

  #read(
    operationId: string,
    key: string,
    argumentsValue: Readonly<Record<string, unknown>>,
    maxItems: number,
    context: RequestContext,
    selector?: { readonly field: string; readonly values: readonly string[] },
    continuation?: string,
  ): ReturnType<ExecuteBoundedRead['executeRegisteredOperation']> {
    return this.#reads.executeRegisteredOperation({
      operation_id: operationId,
      continuation_key: key,
      arguments: argumentsValue,
      max_items: maxItems,
      maximum_result_bytes: 512 * 1024,
      ...(selector === undefined ? {} : { result_selector: selector }),
      ...(continuation === undefined ? {} : { continuation }),
    }, context);
  }
}

interface FlaggedItem {
  readonly typeId: number;
  readonly quantity: number;
  readonly flag: string;
  readonly itemId: number | null;
}

async function fitFromFlaggedItems(
  hullTypeId: number,
  ownedItemId: number | null,
  values: readonly unknown[],
  source: CanonicalFitSpec['source'],
  sde: SdeRepository,
): Promise<CanonicalFitSpec> {
  const modules: CanonicalFittingModule[] = [];
  const droneMap = new Map<number, number>();
  const cargoMap = new Map<number, number>();
  const slotted = new Map<string, FlaggedItem[]>();
  const normalized: FlaggedItem[] = values.map((value) => {
    const item = record(value, 'fitting item');
    return Object.freeze({
      typeId: positiveNumber(item.type_id, 'fitting item type'),
      quantity: positiveNumber(item.quantity ?? 1, 'fitting item quantity'),
      flag: stringValue(item.location_flag ?? item.flag, 'fitting item flag'),
      itemId: optionalPositiveNumber(item.item_id),
    });
  });
  const resolvedTypes = await sde.resolveTypes([...new Set(normalized.map((item) => item.typeId))]);
  for (const item of normalized) {
    if (/^(?:Hi|Med|Lo|Rig|SubSystem|Service)Slot[0-7]$/u.test(item.flag)) {
      const entries = slotted.get(item.flag) ?? [];
      entries.push(item);
      slotted.set(item.flag, entries);
    } else if (item.flag === 'DroneBay') {
      droneMap.set(item.typeId, (droneMap.get(item.typeId) ?? 0) + item.quantity);
    } else if (item.flag === 'Cargo') {
      cargoMap.set(item.typeId, (cargoMap.get(item.typeId) ?? 0) + item.quantity);
    }
  }
  for (const [flag, entries] of slotted) {
    const moduleEntries = entries.filter((item) => {
      const categoryId = resolvedTypes.get(item.typeId)?.categoryId;
      return categoryId === 7 || categoryId === 32 || categoryId === 66;
    });
    const chargeEntries = entries.filter((item) => resolvedTypes.get(item.typeId)?.categoryId === 8);
    if (moduleEntries.length !== 1 || chargeEntries.length > 1
      || moduleEntries.length + chargeEntries.length !== entries.length) {
      throw ambiguous(`The ESI fitting records for ${flag} cannot be mapped to exactly one module and optional charge.`);
    }
    const moduleEntry = moduleEntries[0];
    if (moduleEntry?.quantity !== 1) {
      throw ambiguous('A fitted slot contains an ambiguous stacked module quantity.');
    }
    const chargeEntry = chargeEntries[0];
    const slot = parseFittingSlot(flag);
    modules.push(Object.freeze({
      typeId: moduleEntry.typeId,
      slotFamily: slot.family,
      slotIndex: slot.index,
      state: slot.family === 'rig' || slot.family === 'subsystem' ? 'passive' : 'online',
      chargeTypeId: chargeEntry?.typeId ?? null,
      itemId: moduleEntry.itemId,
    }));
  }
  assertUniqueSlots(modules);
  const normalizedEntryCount = modules.length
    + [...droneMap.values()].reduce((sum, quantity) => sum + quantity, 0)
    + cargoMap.size;
  if (normalizedEntryCount > 128) throw ambiguous('The resolved fitting contains more than 128 bounded entries.');
  return Object.freeze({
    hullTypeId,
    ownedItemId,
    modules: Object.freeze(modules),
    drones: Object.freeze([...droneMap].map(([typeId, quantity]) => Object.freeze({ typeId, quantity, activeQuantity: 0 }))),
    cargo: Object.freeze([...cargoMap].map(([typeId, quantity]) => Object.freeze({ typeId, quantity }))),
    source,
  });
}

function fittingDelta(
  baseline: EvaluatedFitting,
  candidate: EvaluatedFitting,
  profiles: readonly FittingProfile[],
): FittingDelta {
  return Object.freeze({
    cpu_used: candidate.metrics.cpu_used - baseline.metrics.cpu_used,
    cpu_available: candidate.metrics.cpu_available - baseline.metrics.cpu_available,
    powergrid_used: candidate.metrics.powergrid_used - baseline.metrics.powergrid_used,
    powergrid_available: candidate.metrics.powergrid_available - baseline.metrics.powergrid_available,
    capacitor_transitions: Object.freeze(profiles.map((profile) => {
      const before = baseline.capacitor.find((entry) => entry.profile === profile);
      const after = candidate.capacitor.find((entry) => entry.profile === profile);
      return Object.freeze({
        profile,
        baseline_state: capacitorState(before),
        candidate_state: capacitorState(after),
        depletion_seconds_delta: before?.available === true
          && after?.available === true
          && before.stable === false
          && after.stable === false
          && before.depletes_in_seconds !== null
          && after.depletes_in_seconds !== null
          ? after.depletes_in_seconds - before.depletes_in_seconds
          : null,
      });
    })),
  });
}

function capacitorState(value: EvaluatedFitting['capacitor'][number] | undefined): 'stable' | 'unstable' | 'unavailable' {
  if (value?.available !== true || value.stable === null) return 'unavailable';
  return value.stable ? 'stable' : 'unstable';
}

function uniqueFitTypeIds(fit: CanonicalFitSpec): number[] {
  return [...new Set([
    fit.hullTypeId,
    ...fit.modules.flatMap((module) => module.chargeTypeId === null ? [module.typeId] : [module.typeId, module.chargeTypeId]),
    ...fit.drones.map((drone) => drone.typeId),
  ])];
}

function allFitTypeIds(fit: CanonicalFitSpec): number[] {
  return [...new Set([...uniqueFitTypeIds(fit), ...fit.cargo.map((item) => item.typeId)])];
}

function metadata(envelope: Awaited<ReturnType<ExecuteBoundedRead['executeRegisteredOperation']>>): ReadMetadata | null {
  if (envelope.character === null) return null;
  return Object.freeze({
    character: envelope.character,
    retrievedAt: envelope.retrieved_at,
    expiresAt: envelope.expires_at,
    cache: envelope.cache,
  });
}

function assertPolicyProfileIncluded(input: AnalyzeFittingChangesInput): void {
  if (input.capacitor_policy.mode !== 'report_only'
    && !input.profiles.includes(input.capacitor_policy.profile)) {
    throw ambiguous('The capacitor policy profile must be included in the requested operating profiles.');
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw contract(`The ${label} response is invalid.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): JsonValue[] {
  if (!Array.isArray(value)) throw contract(`The ${label} response is not a collection.`);
  return value as JsonValue[];
}

function positiveNumber(value: unknown, label: string): number {
  const numeric = typeof value === 'string' && /^[1-9][0-9]*$/u.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric <= 0) throw contract(`The ${label} is invalid.`);
  return numeric;
}

function nonnegativeNumber(value: unknown, label: string): number {
  const numeric = typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 0) throw contract(`The ${label} is invalid.`);
  return numeric;
}

function optionalPositiveNumber(value: unknown): number | null {
  if (value === undefined) return null;
  return positiveNumber(value, 'fitting item ID');
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw contract(`The ${label} is invalid.`);
  return value;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

function latestTimestamp(values: ReadonlyArray<string | null | undefined>): string {
  const timestamps = values.filter((value): value is string => value !== null && value !== undefined);
  if (timestamps.length === 0) return new Date(0).toISOString();
  const latest = timestamps.sort().at(-1);
  return latest ?? new Date(0).toISOString();
}

function ambiguous(message: string): AppError {
  return new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: message });
}

function contract(message: string): AppError {
  return new AppError({ code: 'UPSTREAM_CONTRACT_MISMATCH', safeMessage: message });
}
