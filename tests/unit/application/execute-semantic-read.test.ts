import { describe, expect, it } from 'vitest';
import type { BoundedReadData } from '../../../src/application/dto/bounded-read.js';
import type { Clock } from '../../../src/application/ports/clock.js';
import type { ExecuteBoundedRead } from '../../../src/application/services/execute-bounded-read.js';
import { ExecuteSemanticRead } from '../../../src/application/services/execute-semantic-read.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import { AppError } from '../../../src/domain/errors.js';
import type { ResultEnvelope } from '../../../src/domain/result.js';
import { FixedClock } from '../../helpers/fakes.js';
import type {
  ResolvedType,
  SdeRepository,
  SdeTypeRequirementClosure,
} from '../../../src/application/ports/sde-repository.js';
import { checkRequirementsOutputSchema } from '../../../src/mcp/schemas/semantic-read.js';

const context = {
  requestId: '00000000-0000-4000-8000-000000000001',
  signal: new AbortController().signal,
};

describe('ExecuteSemanticRead', () => {
  it('executes the reviewed operation set without accepting operation IDs from the caller', async () => {
    const bounded = new CapturingBounded();
    const service = semanticService(bounded);
    const result = await service.execute({
      tool_name: 'get_server_activity',
      arguments: {},
      continuations: {},
      max_items: 100,
    }, context);
    expect(bounded.calls.map((call) => call.operation_id)).toEqual([
      'GetStatus',
      'GetUniverseSystemJumps',
      'GetUniverseSystemKills',
    ]);
    expect(result.data.tool).toBe('get_server_activity');
    expect(result.data.components).toHaveLength(3);
    expect(result.source.kind).toBe('computed');
  });

  it('rejects unknown arguments before any operation executes', async () => {
    const bounded = new CapturingBounded();
    const service = semanticService(bounded);
    await expect(service.execute({
      tool_name: 'get_server_activity',
      arguments: { url: 'https://attacker.invalid' },
      continuations: {},
      max_items: 100,
    }, context)).rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT', details: { fields: ['url'] } });
    expect(bounded.calls).toEqual([]);
  });

  it('resumes only the named component with a stable server-bound continuation key', async () => {
    const bounded = new CapturingBounded();
    const service = semanticService(bounded);
    await service.execute({
      tool_name: 'get_server_activity',
      arguments: {},
      continuations: { GetUniverseSystemKills: 'opaque-token' },
      max_items: 100,
    }, context);
    expect(bounded.calls).toEqual([expect.objectContaining({
      operation_id: 'GetUniverseSystemKills',
      continuation_key: 'semantic.get_server_activity.2',
      continuation: 'opaque-token',
      arguments: {},
    })]);
  });

  it('returns the semantic tool name as the reauthorization target', async () => {
    const bounded = new CapturingBounded(new AppError({
      code: 'MISSING_SCOPE',
      safeMessage: 'Missing scope.',
      details: { missing_scopes: ['esi-clones.read_clones.v1'] },
    }));
    const service = semanticService(bounded);
    await expect(service.execute({
      tool_name: 'get_clones_and_implants',
      arguments: {},
      continuations: {},
      max_items: 100,
    }, context)).rejects.toMatchObject({
      code: 'MISSING_SCOPE',
      details: {
        capability_id: 'get_clones_and_implants',
        next_step: expect.stringContaining('get_clones_and_implants') as string,
      },
    });
  });

  it('preserves successful components when an optional semantic source fails', async () => {
    const bounded = new SelectiveFailureBounded('GetUniverseSystemJumps');
    const result = await semanticService(bounded).execute({
      tool_name: 'get_server_activity',
      arguments: {},
      continuations: {},
      max_items: 100,
    }, context);
    expect(result.partial).toBe(true);
    expect(result.data.components.map((component) => component.operation_id)).toEqual([
      'GetStatus',
      'GetUniverseSystemKills',
    ]);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'OPTIONAL_SOURCE_FAILED',
      affectedFields: ['GetUniverseSystemJumps'],
    }));
  });

  it('returns a compact complete requirement proof with installed-SDE names', async () => {
    const result = await semanticService(new SkillBounded(), resolvedSde()).execute({
      tool_name: 'check_requirements',
      arguments: { type_id: '587' },
      continuations: {},
      max_items: 100,
    }, context);
    expect(result.data.components[0]).toMatchObject({
      operation_id: 'GetCharactersCharacterIdSkills',
      sde_build: 42,
      result: { skills: [{ skill_id: 33092, trained_skill_level: 5, active_skill_level: 5 }] },
    });
    expect(result.data.summary).toMatchObject({
      target: { type_id: 587, name: 'Rifter' },
      requirements: [{
        skill_type_id: 33092,
        required_level: 5,
        trained_level: 5,
        active_level: 5,
        status: 'satisfied',
      }],
      requirements_satisfied: true,
      closure: { complete: true },
      provenance: { sde: { build_number: 42 } },
    });
    expect(() => checkRequirementsOutputSchema.parse(result)).not.toThrow();
    expect(result.partial).toBe(false);
  });

  it('classifies active, inactive, partial, missing, and level-zero requirements with exact gaps', async () => {
    const closure = closureFixture([
      [200, 'Active Skill', 3],
      [201, 'Inactive Skill', 4],
      [202, 'Partial Skill', 3],
      [203, 'Missing Skill', 2],
      [204, 'Zero Skill', 0],
    ]);
    const bounded = new RequirementBounded({ skills: [
      { skill_id: 200, trained_skill_level: 5, active_skill_level: 3, skillpoints_in_skill: 1_000 },
      { skill_id: 201, trained_skill_level: 4, active_skill_level: 2, skillpoints_in_skill: 1_000 },
      { skill_id: 202, trained_skill_level: 1, active_skill_level: 1, skillpoints_in_skill: 100 },
      { skill_id: 999, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 999_999 },
    ] });
    const result = await semanticService(bounded, sdeWithClosure(closure)).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 100,
    }, context);
    const summary = result.data.summary as { readonly requirements: readonly unknown[]; readonly requirements_satisfied: boolean };
    expect(summary.requirements).toEqual([
      expect.objectContaining({ skill_type_id: 200, training_level_gap: 0, active_level_gap: 0, status: 'satisfied' }),
      expect.objectContaining({ skill_type_id: 201, training_level_gap: 0, active_level_gap: 2, status: 'trained_inactive' }),
      expect.objectContaining({ skill_type_id: 202, training_level_gap: 2, active_level_gap: 2, status: 'partially_trained' }),
      expect.objectContaining({ skill_type_id: 203, training_level_gap: 2, active_level_gap: 2, status: 'missing' }),
      expect.objectContaining({ skill_type_id: 204, training_level_gap: 0, active_level_gap: 0, status: 'satisfied' }),
    ]);
    expect(summary.requirements_satisfied).toBe(false);
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('skillpoints_in_skill');
    expect(serialized).not.toContain('dogma_attributes');
    expect(serialized).not.toContain('999999');
    expect(bounded.calls.map((call) => call.operation_id)).toEqual([
      'GetCharactersCharacterIdSkills',
      'GetUniverseTypesTypeId',
    ]);
    expect(bounded.calls[0]?.result_selector).toEqual({
      field: 'skill_id',
      values: ['200', '201', '202', '203', '204'],
    });
  });

  it('fails closed when either requirement source is unavailable or incomplete', async () => {
    const sde = sdeWithClosure(closureFixture([[200, 'Skill', 1]]));
    await expect(semanticService(new SelectiveFailureBounded('GetUniverseTypesTypeId'), sde).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 100,
    }, context)).rejects.toMatchObject({ code: 'ESI_UNAVAILABLE' });

    await expect(semanticService(new RequirementBounded({ total_sp: 10 }), sde).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 100,
    }, context)).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });

    await expect(semanticService(new RequirementBounded({
      skills: [{ skill_id: 200, trained_skill_level: 1, active_skill_level: 7 }],
    }), sde).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 100,
    }, context)).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });
  });

  it('rejects requirement continuations because successful closure results are never paginated', async () => {
    const bounded = new RequirementBounded({ skills: [] });
    await expect(semanticService(bounded, sdeWithClosure(closureFixture([]))).execute({
      tool_name: 'check_requirements',
      arguments: {},
      continuations: { GetCharactersCharacterIdSkills: 'opaque' },
      max_items: 100,
    }, context)).rejects.toMatchObject({ code: 'INVALID_CONTINUATION' });
    expect(bounded.calls).toEqual([]);
  });

  it('treats a verified empty closure as satisfied', async () => {
    const result = await semanticService(
      new RequirementBounded({ skills: [] }),
      sdeWithClosure(closureFixture([])),
    ).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 100,
    }, context);
    expect(result.data.summary).toMatchObject({
      requirements: [],
      requirements_satisfied: true,
      closure: { complete: true, node_count: 0, edge_count: 0 },
    });
  });

  it('returns a typed error instead of a truncated success when the complete proof exceeds the MCP limit', async () => {
    const requirements = Array.from({ length: 4_096 }, (_, index) =>
      [10_000 + index, `Requirement Skill ${String(index)}`, 5] as const);
    await expect(semanticService(
      new RequirementBounded({ skills: [] }),
      sdeWithClosure(closureFixture(requirements)),
    ).execute({
      tool_name: 'check_requirements', arguments: { type_id: '100' }, continuations: {}, max_items: 200,
    }, context)).rejects.toMatchObject({ code: 'RESULT_LIMIT_EXCEEDED' });
  });

  it('selects only the requested type from the global market-price collection', async () => {
    const bounded = new CapturingBounded();
    await semanticService(bounded).execute({
      tool_name: 'get_market_price',
      arguments: { type_id: '587' },
      continuations: {},
      max_items: 100,
    }, context);
    expect(bounded.calls.find((call) => call.operation_id === 'GetMarketsPrices')).toMatchObject({
      result_selector: { field: 'type_id', values: ['587'] },
    });
  });

  it('classifies owned ships through the installed SDE before bounding assets', async () => {
    const bounded = new CapturingBounded();
    await semanticService(bounded, resolvedSde()).execute({
      tool_name: 'list_owned_ships',
      arguments: {},
      continuations: {},
      max_items: 100,
    }, context);
    expect(bounded.calls).toEqual([expect.objectContaining({
      operation_id: 'GetCharactersCharacterIdAssets',
      result_selector: { field: 'type_id', values: ['587'] },
    })]);
  });

  it('keeps enrichment metadata separate when one record contains multiple type IDs', async () => {
    const blueprint = typeFixture(100, 'Blueprint', 'Blueprints', 'Blueprint');
    const product = typeFixture(200, 'Product', 'Ships', 'Ship');
    const sde: SdeRepository = {
      ...resolvedSde(),
      resolveTypes: (ids) => Promise.resolve(new Map(ids.flatMap((id) => {
        if (id === blueprint.id) return [[id, blueprint] as const];
        if (id === product.id) return [[id, product] as const];
        return [];
      }))),
    };
    const result = await semanticService(new IndustryBounded(), sde).execute({
      tool_name: 'list_industry_jobs',
      arguments: {},
      continuations: {},
      max_items: 100,
    }, context);
    expect(result.data.components[0]?.result).toEqual([expect.objectContaining({
      blueprint_type_id: 100,
      blueprint_type_name: 'Blueprint',
      blueprint_type_group: 'Blueprints',
      blueprint_type_category: 'Blueprint',
      product_type_id: 200,
      product_type_name: 'Product',
      product_type_group: 'Ships',
      product_type_category: 'Ship',
    })]);
  });

  it('deduplicates asset IDs for dependent resolvers and merges successful batches', async () => {
    const bounded = new AssetResolverBounded();
    const result = await semanticService(bounded, resolvedSde()).execute({
      tool_name: 'search_assets',
      arguments: { type_id: '587' },
      continuations: {},
      max_items: 100,
    }, context);
    expect(bounded.calls.map((call) => call.operation_id)).toEqual([
      'GetCharactersCharacterIdAssets',
      'PostCharactersCharacterIdAssetsNames',
      'PostCharactersCharacterIdAssetsLocations',
    ]);
    expect(bounded.calls.slice(1).map((call) => call.arguments)).toEqual([
      { body: ['9007199254740993', '2'] },
      { body: ['9007199254740993', '2'] },
    ]);
    expect(result.data.summary).toMatchObject({
      count: 3,
      assets: [
        { item_id: '9007199254740993', custom_name: 'My Rifter', position: { x: 1, y: 2, z: 3 } },
        { item_id: '9007199254740993', custom_name: 'My Rifter', position: { x: 1, y: 2, z: 3 } },
        { item_id: '2' },
      ],
    });
  });

  it('keeps resolved asset names when the location batch fails', async () => {
    const bounded = new AssetResolverBounded('PostCharactersCharacterIdAssetsLocations');
    const result = await semanticService(bounded, resolvedSde()).execute({
      tool_name: 'search_assets',
      arguments: { type_id: '587' },
      continuations: {},
      max_items: 100,
    }, context);
    expect(result.partial).toBe(true);
    const summary = result.data.summary as { readonly assets: readonly unknown[] };
    expect(summary.assets[0]).toMatchObject({ custom_name: 'My Rifter' });
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'OPTIONAL_SOURCE_FAILED',
      affectedFields: ['PostCharactersCharacterIdAssetsLocations'],
    }));
  });

  it('shares the 200-item result budget across semantic components', async () => {
    const bounded = new BudgetBounded();
    const result = await semanticService(bounded).execute({
      tool_name: 'get_server_activity',
      arguments: {},
      continuations: {},
      max_items: 200,
    }, context);
    expect(bounded.maximums).toEqual([198, 1, 1]);
    expect(result.data.components.reduce((total, component) =>
      total + (Array.isArray(component.result) ? component.result.length : 1), 0)).toBe(200);
    expect(bounded.byteMaximums).toHaveLength(3);
    expect(bounded.byteMaximums.every((maximum) => maximum <= 160 * 1024)).toBe(true);
  });
});

function semanticService(
  bounded: Pick<ExecuteBoundedRead, 'executeRegisteredOperation'>,
  sde?: SdeRepository,
): ExecuteSemanticRead {
  const clock: Clock = new FixedClock();
  return new ExecuteSemanticRead({ bounded, catalog: buildEsiOperationCatalog(), clock, ...(sde === undefined ? {} : { sde }) });
}

type RegisteredInput = Parameters<ExecuteBoundedRead['executeRegisteredOperation']>[0];

class CapturingBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  readonly calls: RegisteredInput[] = [];
  readonly #error: AppError | null;
  constructor(error: AppError | null = null) { this.#error = error; }
  executeRegisteredOperation(
    input: RegisteredInput,
  ): Promise<ResultEnvelope<BoundedReadData>> {
    this.calls.push(input);
    if (this.#error !== null) return Promise.reject(this.#error);
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: null,
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result: [],
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class SelectiveFailureBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  readonly #operationId: string;
  constructor(operationId: string) { this.#operationId = operationId; }
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    if (input.operation_id === this.#operationId) {
      return Promise.reject(new AppError({
        code: 'ESI_UNAVAILABLE',
        safeMessage: 'The optional ESI source is unavailable.',
      }));
    }
    return new CapturingBounded().executeRegisteredOperation(input);
  }
}

class BudgetBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  readonly maximums: number[] = [];
  readonly byteMaximums: number[] = [];
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    this.maximums.push(input.max_items);
    this.byteMaximums.push(input.maximum_result_bytes ?? Number.POSITIVE_INFINITY);
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: null,
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result: Array.from({ length: input.max_items }, (_, index) => index),
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class SkillBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    const result = input.operation_id === 'GetCharactersCharacterIdSkills'
      ? { skills: [{ skill_id: '33092', trained_skill_level: 5, active_skill_level: 5 }] }
      : { type_id: '587', name: 'Rifter' };
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: { id: 2112625428, name: 'Test Pilot' },
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result,
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class RequirementBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  readonly calls: RegisteredInput[] = [];
  readonly #skills: BoundedReadData['result'];
  constructor(skills: BoundedReadData['result']) { this.#skills = skills; }
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    this.calls.push(input);
    const result = input.operation_id === 'GetCharactersCharacterIdSkills'
      ? this.#skills
      : { type_id: 100, name: 'Target', group_id: 10, published: true, dogma_attributes: [{ attribute_id: 182 }] };
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: { id: 2112625428, name: 'Stage Four Pilot' },
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result,
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class AssetResolverBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  readonly calls: RegisteredInput[] = [];
  readonly #failure: string | null;
  constructor(failure: string | null = null) { this.#failure = failure; }
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    this.calls.push(input);
    if (input.operation_id === this.#failure) {
      return Promise.reject(new AppError({ code: 'ESI_UNAVAILABLE', safeMessage: 'Resolver unavailable.' }));
    }
    const values: Record<string, unknown> = {
      GetCharactersCharacterIdAssets: [
        { item_id: '9007199254740993', type_id: '587', quantity: 1 },
        { item_id: '9007199254740993', type_id: '587', quantity: 1 },
        { item_id: '2', type_id: '587', quantity: 1 },
      ],
      PostCharactersCharacterIdAssetsNames: [
        { item_id: '9007199254740993', name: 'My Rifter' },
      ],
      PostCharactersCharacterIdAssetsLocations: [
        { item_id: '9007199254740993', position: { x: 1, y: 2, z: 3 } },
      ],
    };
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: { id: 2112625428, name: 'Test Pilot' },
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result: values[input.operation_id] as never,
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

class IndustryBounded implements Pick<ExecuteBoundedRead, 'executeRegisteredOperation'> {
  executeRegisteredOperation(input: RegisteredInput): Promise<ResultEnvelope<BoundedReadData>> {
    return Promise.resolve({
      schema_version: 1,
      request_id: context.requestId,
      character: { id: 2112625428, name: 'Industry Pilot' },
      data: {
        capability_id: input.continuation_key,
        operation_id: input.operation_id,
        result: [{ blueprint_type_id: 100, product_type_id: 200 }],
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI', name: 'test', operation: input.operation_id },
      retrieved_at: '2026-08-20T10:00:00.000Z',
      expires_at: '2026-08-20T10:05:00.000Z',
      cache: 'miss',
      estimated: false,
      partial: false,
      warnings: [],
    });
  }
}

function typeFixture(
  id: number,
  name: string,
  groupName: string,
  categoryName: string,
): ResolvedType {
  return {
    id,
    name,
    groupId: id + 1,
    groupName,
    categoryId: id + 2,
    categoryName,
    marketGroupId: null,
    marketGroupName: null,
    published: true,
    buildNumber: 42,
  };
}

function resolvedSde(): SdeRepository {
  const type = (id: number, name: string): ResolvedType => ({
    id,
    name,
    groupId: 1,
    groupName: 'Skills',
    categoryId: 16,
    categoryName: 'Skill',
    marketGroupId: null,
    marketGroupName: null,
    published: true,
    buildNumber: 42,
  });
  return {
    status: () => Promise.resolve({ state: 'available', buildNumber: 42, releaseDate: '2026-08-20T11:08:35Z' }),
    resolveType: (id) => Promise.resolve(id === 33092 ? type(id, 'Caldari Destroyer') : null),
    resolveTypes: (ids) => Promise.resolve(new Map(ids.flatMap((id) => id === 33092 ? [[id, type(id, 'Caldari Destroyer')]] : []))),
    typeIdsByCategory: () => Promise.resolve([587]),
    searchTypes: () => Promise.resolve([]),
    resolveGroup: () => Promise.resolve(null),
    resolveCategory: () => Promise.resolve(null),
    resolveMarketGroup: () => Promise.resolve(null),
    resolveTypeRequirements: () => Promise.resolve([]),
    resolveTypeRequirementClosure: (targetId) => Promise.resolve({
      target: type(targetId, targetId === 587 ? 'Rifter' : 'Unknown'),
      directRequirements: [{
        sourceTypeId: targetId,
        sourceTypeName: targetId === 587 ? 'Rifter' : 'Unknown',
        requirementIndex: 1,
        skillTypeId: 33092,
        skillName: 'Caldari Destroyer',
        requiredLevel: 5,
        depth: 1,
        direct: true,
      }],
      dependencyEdges: [{
        sourceTypeId: targetId,
        sourceTypeName: targetId === 587 ? 'Rifter' : 'Unknown',
        requirementIndex: 1,
        skillTypeId: 33092,
        skillName: 'Caldari Destroyer',
        requiredLevel: 5,
        depth: 1,
        direct: true,
      }],
      requirements: [{
        order: 1,
        skillTypeId: 33092,
        skillName: 'Caldari Destroyer',
        requiredLevel: 5,
        direct: true,
        requiredByTypeIds: [targetId],
      }],
      complete: true,
      nodeCount: 1,
      edgeCount: 1,
      maximumDepth: 1,
      buildNumber: 42,
    }),
    resolveBlueprint: () => Promise.resolve(null),
    resolveSolarSystem: () => Promise.resolve(null),
    resolveSolarSystems: () => Promise.resolve(new Map()),
    searchSolarSystems: () => Promise.resolve([]),
    resolveStation: () => Promise.resolve(null),
    resolveStargatesFromSystem: () => Promise.resolve([]),
    resolveNpcCorporation: () => Promise.resolve(null),
    resolveFaction: () => Promise.resolve(null),
  };
}

function closureFixture(
  requirements: ReadonlyArray<readonly [number, string, number]>,
): SdeTypeRequirementClosure {
  const target: ResolvedType = {
    id: 100,
    name: 'Target',
    groupId: 10,
    groupName: 'Ship Group',
    categoryId: 6,
    categoryName: 'Ship',
    marketGroupId: null,
    marketGroupName: null,
    published: true,
    buildNumber: 42,
  };
  const edges = requirements.map(([skillTypeId, skillName, requiredLevel], index) => Object.freeze({
    sourceTypeId: target.id,
    sourceTypeName: target.name,
    requirementIndex: index + 1,
    skillTypeId,
    skillName,
    requiredLevel,
    depth: 1,
    direct: true,
  }));
  return Object.freeze({
    target,
    directRequirements: Object.freeze(edges),
    dependencyEdges: Object.freeze(edges),
    requirements: Object.freeze(requirements.map(([skillTypeId, skillName, requiredLevel], index) => Object.freeze({
      order: index + 1,
      skillTypeId,
      skillName,
      requiredLevel,
      direct: true,
      requiredByTypeIds: Object.freeze([target.id]),
    }))),
    complete: true,
    nodeCount: requirements.length,
    edgeCount: edges.length,
    maximumDepth: requirements.length === 0 ? 0 : 1,
    buildNumber: 42,
  });
}

function sdeWithClosure(closure: SdeTypeRequirementClosure): SdeRepository {
  return { ...resolvedSde(), resolveTypeRequirementClosure: () => Promise.resolve(closure) };
}
