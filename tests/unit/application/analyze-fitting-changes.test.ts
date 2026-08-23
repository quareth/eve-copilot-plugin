import { describe, expect, it, vi } from 'vitest';
import { AnalyzeFittingChanges } from '../../../src/application/services/analyze-fitting-changes.js';
import type { ExecuteBoundedRead } from '../../../src/application/services/execute-bounded-read.js';
import type { FittingCalculationEngine } from '../../../src/application/ports/fitting-calculation-engine.js';
import type {
  ResolvedType,
  SdeRepository,
  SdeTypeRequirementClosure,
} from '../../../src/application/ports/sde-repository.js';
import type { EvaluatedFitting, FittingMetrics } from '../../../src/application/dto/fitting-analysis.js';

const signal = new AbortController().signal;

describe('AnalyzeFittingChanges', () => {
  it('pairs an ESI fitted charge with its module when both share one slot flag', async () => {
    const calculate = vi.fn<FittingCalculationEngine['calculate']>((input) => Promise.resolve({
      evaluations: input.fits.map(() => evaluation(0, [])),
      durationMs: 1,
    }));
    const service = new AnalyzeFittingChanges({
      reads: currentShipReads(),
      sde: fittingSde(),
      engine: { calculate },
    });

    await service.execute({
      baseline: { source: 'current_ship' },
      candidates: [],
      profiles: ['fitting_only'],
      capacitor_policy: { mode: 'report_only' },
    }, { requestId: '00000000-0000-4000-8000-000000000001', signal });

    const fit = calculate.mock.calls[0]?.[0].fits[0];
    expect(fit?.modules).toEqual([expect.objectContaining({
      typeId: 439,
      slotFamily: 'medium',
      slotIndex: 0,
      chargeTypeId: 434,
    })]);
  });

  it('classifies a quantity block after rigs as EFT cargo instead of subsystems', async () => {
    const calculate = vi.fn<FittingCalculationEngine['calculate']>((input) => Promise.resolve({
      evaluations: input.fits.map(() => evaluation(0, [])),
      durationMs: 1,
    }));
    const service = new AnalyzeFittingChanges({
      reads: skillReads(),
      sde: fittingSde(),
      engine: { calculate },
    });

    await service.execute({
      baseline: {
        source: 'eft',
        eft: [
          '[Retribution, EFT cargo parser]',
          '',
          '1MN Afterburner I',
          '',
          '1MN Afterburner I',
          '',
          '1MN Afterburner I',
          '',
          '1MN Afterburner I',
          '',
          'Antimatter Charge S x8',
        ].join('\n'),
      },
      candidates: [],
      profiles: ['fitting_only'],
      capacitor_policy: { mode: 'report_only' },
    }, { requestId: '00000000-0000-4000-8000-000000000001', signal });

    const fit = calculate.mock.calls[0]?.[0].fits[0];
    expect(fit?.modules).toHaveLength(4);
    expect(fit?.cargo).toEqual([{ typeId: 434, quantity: 8 }]);
  });

  it('uses one active-skill/SDE snapshot and computes candidate deltas from one worker response', async () => {
    const calculate = vi.fn<FittingCalculationEngine['calculate']>((input) => Promise.resolve({
      evaluations: input.fits.map((_fit, index) => evaluation(
        index * 10,
        input.missingSkills[index] ?? [],
      )),
      durationMs: 12,
    }));
    const service = new AnalyzeFittingChanges({
      reads: skillReads(),
      sde: fittingSde(),
      engine: { calculate },
    });
    const result = await service.execute({
      baseline: {
        source: 'structured',
        fit: { hull_type_id: 11393, modules: [], drones: [] },
      },
      candidates: [{
        candidate_id: 'add-prop',
        changes: [{ action: 'add', slot: 'MedSlot0', type_id: 439, state: 'active' }],
      }],
      profiles: ['sustained_combat_prop_on'],
      capacitor_policy: { mode: 'report_only' },
    }, { requestId: '00000000-0000-4000-8000-000000000001', signal });

    expect(calculate).toHaveBeenCalledTimes(1);
    const engineInput = calculate.mock.calls[0]?.[0];
    expect(engineInput?.fits).toHaveLength(2);
    expect(engineInput?.skills).toEqual({ 3413: 5, 3426: 0 });
    expect(engineInput?.missingSkills[0]).toEqual([]);
    expect(engineInput?.missingSkills[1]).toEqual([{
      skill_type_id: 3426,
      skill_name: 'CPU Management',
      required_level: 1,
      active_level: 0,
    }]);
    expect(result.data.candidates[0]).toMatchObject({
      candidate_id: 'add-prop',
      delta: { cpu_used: 10, powergrid_used: 10 },
    });
    expect(result.data.provenance).toMatchObject({
      sde_build: 3464040,
      sde_importer_version: 3,
      adapter_version: 1,
    });
  });

  it('requires the policy profile to be explicitly calculated', async () => {
    const service = new AnalyzeFittingChanges({
      reads: skillReads(),
      sde: fittingSde(),
      engine: { calculate: vi.fn() },
    });
    await expect(service.execute({
      baseline: { source: 'structured', fit: { hull_type_id: 11393, modules: [], drones: [] } },
      candidates: [],
      profiles: ['fitting_only'],
      capacitor_policy: { mode: 'require_stable', profile: 'sustained_combat_prop_on' },
    }, { requestId: '00000000-0000-4000-8000-000000000001', signal }))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_INPUT' });
  });
});

function skillReads(): ExecuteBoundedRead {
  return {
    executeRegisteredOperation: () => Promise.resolve({
      schema_version: 1 as const,
      request_id: '00000000-0000-4000-8000-000000000001',
      character: { id: 90000001, name: 'Pilot' },
      data: {
        capability_id: 'stage5.skills',
        operation_id: 'GetCharactersCharacterIdSkills',
        result: { skills: [
          { skill_id: 3413, active_skill_level: 5, trained_skill_level: 5, skillpoints_in_skill: 256000 },
          { skill_id: 3426, active_skill_level: 0, trained_skill_level: 5, skillpoints_in_skill: 256000 },
        ] },
        page: { current: 1, total: 1 },
        continuation: null,
      },
      source: { kind: 'ESI' as const, name: 'EVE Swagger Interface', operation: 'GetCharactersCharacterIdSkills' },
      retrieved_at: '2026-08-21T00:00:00Z',
      expires_at: '2026-08-21T00:05:00Z',
      cache: 'miss' as const,
      estimated: false,
      partial: false,
      warnings: [],
    }),
  } as unknown as ExecuteBoundedRead;
}

function currentShipReads(): ExecuteBoundedRead {
  return {
    executeRegisteredOperation: (input: { readonly operation_id: string }) => {
      const result = input.operation_id === 'GetCharactersCharacterIdShip'
        ? { ship_type_id: 11393, ship_item_id: 9001, ship_name: 'Test ship' }
        : input.operation_id === 'GetCharactersCharacterIdAssets'
          ? [
              { type_id: 439, item_id: 9002, quantity: 1, location_flag: 'MedSlot0' },
              { type_id: 434, item_id: 9003, quantity: 100, location_flag: 'MedSlot0' },
            ]
          : { skills: [{ skill_id: 3426, active_skill_level: 5, trained_skill_level: 5, skillpoints_in_skill: 256000 }] };
      return Promise.resolve({
        schema_version: 1 as const,
        request_id: '00000000-0000-4000-8000-000000000001',
        character: { id: 90000001, name: 'Pilot' },
        data: {
          capability_id: 'stage5.test',
          operation_id: input.operation_id,
          result,
          page: { current: 1, total: 1 },
          continuation: null,
        },
        source: { kind: 'ESI' as const, name: 'EVE Swagger Interface', operation: input.operation_id },
        retrieved_at: '2026-08-21T00:00:00Z',
        expires_at: '2026-08-21T00:05:00Z',
        cache: 'miss' as const,
        estimated: false,
        partial: false,
        warnings: [],
      });
    },
  } as unknown as ExecuteBoundedRead;
}

function fittingSde(): SdeRepository {
  const type = (id: number): ResolvedType => ({
    id,
    name: id === 11393 ? 'Retribution' : id === 434 ? 'Antimatter Charge S' : '1MN Afterburner I',
    groupId: id === 11393 ? 324 : id === 434 ? 85 : 46,
    groupName: id === 11393 ? 'Assault Frigate' : id === 434 ? 'Hybrid Charge' : 'Propulsion Module',
    categoryId: id === 11393 ? 6 : id === 434 ? 8 : 7,
    categoryName: id === 11393 ? 'Ship' : id === 434 ? 'Charge' : 'Module',
    marketGroupId: null,
    marketGroupName: null,
    published: true,
    buildNumber: 3464040,
  });
  const closure = (typeId: number): SdeTypeRequirementClosure => ({
    target: type(typeId),
    directRequirements: [],
    dependencyEdges: [],
    requirements: typeId === 439 ? [{
      order: 1,
      skillTypeId: 3426,
      skillName: 'CPU Management',
      requiredLevel: 1,
      direct: true,
      requiredByTypeIds: [439],
    }] : [],
    complete: true,
    nodeCount: typeId === 439 ? 2 : 1,
    edgeCount: typeId === 439 ? 1 : 0,
    maximumDepth: typeId === 439 ? 1 : 0,
    buildNumber: 3464040,
  });
  return {
    fittingSnapshot: () => Promise.resolve({
      buildNumber: 3464040,
      releaseDate: '2026-08-11T00:00:00Z',
      databasePath: '/private/sde-3464040.db',
      importerVersion: 3,
      fittingDataContractVersion: 1,
    }),
    resolveType: (id: number) => Promise.resolve(type(id)),
    resolveTypes: (ids: readonly number[]) => Promise.resolve(new Map(ids.map((id) => [id, type(id)]))),
    searchTypes: (name: string) => {
      const match = [11393, 439, 434].map(type).find((candidate) => candidate.name === name);
      return Promise.resolve(match === undefined ? [] : [match]);
    },
    resolveTypeRequirementClosure: (id: number) => Promise.resolve(closure(id)),
  } as unknown as SdeRepository;
}

function evaluation(
  value: number,
  missingSkills: EvaluatedFitting['missing_skills'],
): EvaluatedFitting {
  const metrics: FittingMetrics = {
    cpu_used: value,
    cpu_available: 140,
    powergrid_used: value,
    powergrid_available: 62,
    turret_hardpoints_used: 0,
    turret_hardpoints_available: 4,
    launcher_hardpoints_used: 0,
    launcher_hardpoints_available: 0,
    calibration_used: 0,
    calibration_available: 400,
    active_drones: 0,
    drone_bandwidth_used: 0,
    drone_bandwidth_available: 0,
    drone_bay_used: 0,
    drone_bay_available: 0,
  };
  return {
    fit_hash: String(value).padStart(64, '0'),
    fit_valid: missingSkills.length === 0,
    policy_satisfied: true,
    metrics,
    capacitor: [{
      profile: 'sustained_combat_prop_on',
      available: true,
      stable: true,
      depletes_in_seconds: null,
      capacity_gj: 500,
      peak_recharge_gj_per_second: 10,
      demand_gj_per_second: 5,
      peak_delta_gj_per_second: 5,
      module_demands: [],
      assumptions: [],
      unsupported_mechanics: [],
    }],
    violations: [],
    missing_skills: missingSkills,
    unsupported_mechanics: [],
  };
}
