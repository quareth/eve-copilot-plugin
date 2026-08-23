import { describe, expect, it } from 'vitest';
import type { ActionAuditRepository } from '../../../src/application/ports/action-audit-repository.js';
import type { ActionPlanRepository } from '../../../src/application/ports/action-plan-repository.js';
import type { CharacterRepository } from '../../../src/application/ports/character-repository.js';
import type { Clock } from '../../../src/application/ports/clock.js';
import type { EsiActionExecution, EsiActionExecutor } from '../../../src/application/ports/esi-action-executor.js';
import type { EsiOperationExecutor } from '../../../src/application/ports/esi-operation-executor.js';
import type { IdGenerator } from '../../../src/application/ports/id-generator.js';
import { ExecuteEveAction } from '../../../src/application/services/execute-eve-action.js';
import { PrepareEveAction } from '../../../src/application/services/prepare-eve-action.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import type { ActionAuditEvent, ActionPlan, ActionPlanState } from '../../../src/domain/action-plan.js';
import type { ConnectedCharacter, VerifiedCharacterInput } from '../../../src/domain/character.js';
import { AppError } from '../../../src/domain/errors.js';
import type { EsiOperationFact } from '../../../src/domain/esi-operation.js';
import type { EsiActionFamily } from '../../../src/domain/esi-operation.js';
import type { JsonValue } from '../../../src/domain/json.js';
import { Sha256Digest } from '../../../src/platform/sha256-digest.js';

const CAPABILITY_ID = 'esi.post_ui_openwindow_information';
const signal = new AbortController().signal;

describe('action services', () => {
  it('keeps every action disabled unless both the master switch and family are enabled', async () => {
    const fixture = makeFixture({ enabled: false, families: [] });
    await expect(fixture.prepare.execute({
      capability_id: CAPABILITY_ID,
      arguments: { target_id: '2112625428' },
    }, context())).rejects.toMatchObject({ code: 'ACTION_DISABLED' });
    expect(fixture.actions.executions).toBe(0);
    expect(fixture.audit.events).toEqual([]);
  });

  it('requires the exact short-lived confirmation and executes a plan only once', async () => {
    const fixture = makeFixture({ enabled: true, families: ['ui_actions'] });
    const prepared = await fixture.prepare.execute({
      capability_id: CAPABILITY_ID,
      arguments: { target_id: '2112625428' },
    }, context());

    expect(prepared.data).toMatchObject({
      plan_id: 'id-1',
      confirmation: 'id-2',
      capability_id: CAPABILITY_ID,
      effect: { targets: { target_id: '2112625428' } },
      irreversible: false,
    });
    const storedPlan = fixture.plans.find('id-1');
    expect(storedPlan?.state).toBe('planned');
    expect(storedPlan?.confirmationDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(storedPlan?.confirmationDigest).not.toContain('id-2');
    await expect(fixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'wrong',
    }, context('request-wrong'))).rejects.toMatchObject({ code: 'ACTION_REQUIRES_CONFIRMATION' });

    const executed = await fixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'id-2',
    }, context('request-execute'));
    expect(executed.data).toMatchObject({ state: 'succeeded', result: null });
    expect(fixture.actions.executions).toBe(1);
    expect(fixture.plans.find('id-1')?.state).toBe('succeeded');
    expect(fixture.audit.events.map((event) => event.state)).toEqual([
      'planned',
      'executing',
      'succeeded',
    ]);

    await expect(fixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'id-2',
    }, context('request-replay'))).rejects.toMatchObject({ code: 'ACTION_ALREADY_EXECUTED' });
    expect(fixture.actions.executions).toBe(1);
  });

  it('expires plans and detects stored-argument changes before sending anything', async () => {
    const fixture = makeFixture({ enabled: true, families: ['ui_actions'] });
    await fixture.prepare.execute({
      capability_id: CAPABILITY_ID,
      arguments: { target_id: '2112625428' },
    }, context());
    fixture.plans.replace('id-1', (plan) => Object.freeze({
      ...plan,
      arguments: Object.freeze({ target_id: '2112625429' }),
    }));
    await expect(fixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'id-2',
    }, context())).rejects.toMatchObject({ code: 'ACTION_PLAN_NOT_FOUND' });
    expect(fixture.actions.executions).toBe(0);

    const expiryFixture = makeFixture({ enabled: true, families: ['ui_actions'] });
    await expiryFixture.prepare.execute({
      capability_id: CAPABILITY_ID,
      arguments: { target_id: '2112625428' },
    }, context());
    expiryFixture.clock.set('2026-08-20T10:05:00.001Z');
    await expect(expiryFixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'id-2',
    }, context())).rejects.toMatchObject({ code: 'ACTION_PLAN_EXPIRED' });
    expect(expiryFixture.actions.executions).toBe(0);
  });

  it('records an uncertain terminal state and never retries an ambiguous network result', async () => {
    const fixture = makeFixture({ enabled: true, families: ['ui_actions'], uncertain: true });
    await fixture.prepare.execute({
      capability_id: CAPABILITY_ID,
      arguments: { target_id: '2112625428' },
    }, context());
    await expect(fixture.execute.execute({
      plan_id: 'id-1',
      confirmation: 'id-2',
    }, context())).rejects.toMatchObject({ code: 'ACTION_OUTCOME_UNCERTAIN' });
    expect(fixture.actions.executions).toBe(1);
    expect(fixture.plans.find('id-1')?.state).toBe('uncertain');
    expect(fixture.audit.events.at(-1)).toMatchObject({
      state: 'uncertain',
      errorCode: 'ACTION_OUTCOME_UNCERTAIN',
    });
  });

  it('revalidates the fleet target and command role immediately before execution', async () => {
    const authorization = { fleetId: '9001', role: 'fleet_commander', fleetBossId: '2112625428' };
    const fixture = makeFleetFixture(authorization);
    const prepared = await fixture.prepare.execute({
      capability_id: 'esi.put_fleets_fleet_id',
      arguments: { fleet_id: '9001', body: { is_free_move: true } },
    }, context());

    authorization.role = 'squad_member';
    authorization.fleetBossId = '2112625429';
    await expect(fixture.execute.execute({
      plan_id: prepared.data.plan_id,
      confirmation: prepared.data.confirmation,
    }, context('request-role-revoked'))).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    expect(fixture.actions.executions).toBe(0);

    const changedTarget = makeFleetFixture(authorization);
    authorization.role = 'fleet_commander';
    authorization.fleetBossId = '2112625428';
    authorization.fleetId = '9001';
    const second = await changedTarget.prepare.execute({
      capability_id: 'esi.put_fleets_fleet_id',
      arguments: { fleet_id: '9001', body: { is_free_move: false } },
    }, context());
    authorization.fleetId = '9002';
    await expect(changedTarget.execute.execute({
      plan_id: second.data.plan_id,
      confirmation: second.data.confirmation,
    }, context('request-target-changed'))).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    expect(changedTarget.actions.executions).toBe(0);
  });
});

function makeFixture(input: {
  readonly enabled: boolean;
  readonly families: readonly EsiActionFamily[];
  readonly uncertain?: boolean;
}): {
  readonly prepare: PrepareEveAction;
  readonly execute: ExecuteEveAction;
  readonly plans: MemoryActionPlans;
  readonly audit: MemoryActionAudit;
  readonly actions: FakeActions;
  readonly clock: MutableClock;
} {
  const catalog = buildEsiOperationCatalog();
  const character = connectedCharacter();
  const characters = new SelectedCharacterRepository(character);
  const actions = new FakeActions(input.uncertain ?? false);
  const reads: EsiOperationExecutor = {
    execute: () => Promise.reject(new Error('UI actions must not perform an authorization read.')),
  };
  const plans = new MemoryActionPlans();
  const audit = new MemoryActionAudit();
  const clock = new MutableClock();
  const idGenerator = new SequenceIds();
  const dependencies = {
    catalog,
    characters,
    actions,
    reads,
    plans,
    audit,
    clock,
    idGenerator,
    digest: new Sha256Digest(),
    enabled: input.enabled,
    families: input.families,
  } as const;
  return {
    prepare: new PrepareEveAction(dependencies),
    execute: new ExecuteEveAction(dependencies),
    plans,
    audit,
    actions,
    clock,
  };
}

function makeFleetFixture(authorization: {
  fleetId: string;
  role: string;
  fleetBossId: string;
}): ReturnType<typeof makeFixture> {
  const catalog = buildEsiOperationCatalog();
  const character = connectedCharacter([
    'esi-fleets.read_fleet.v1',
    'esi-fleets.write_fleet.v1',
  ]);
  const characters = new SelectedCharacterRepository(character);
  const actions = new FakeActions(false);
  const reads: EsiOperationExecutor = {
    execute: () => Promise.resolve({
      value: {
        fleet_id: authorization.fleetId,
        role: authorization.role,
        fleet_boss_id: authorization.fleetBossId,
        squad_id: '-1',
        wing_id: '-1',
      },
      operationId: 'GetCharactersCharacterIdFleet',
      retrievedAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-20T10:01:00.000Z',
      cache: 'miss',
      totalPages: null,
    }),
  };
  const plans = new MemoryActionPlans();
  const audit = new MemoryActionAudit();
  const clock = new MutableClock();
  const idGenerator = new SequenceIds();
  const dependencies = {
    catalog,
    characters,
    actions,
    reads,
    plans,
    audit,
    clock,
    idGenerator,
    digest: new Sha256Digest(),
    enabled: true,
    families: ['fleet_write'] as const,
  };
  return {
    prepare: new PrepareEveAction(dependencies),
    execute: new ExecuteEveAction(dependencies),
    plans,
    audit,
    actions,
    clock,
  };
}

function context(requestId = 'request-1'): { readonly requestId: string; readonly signal: AbortSignal } {
  return { requestId, signal };
}

function connectedCharacter(scopes: readonly string[] = ['esi-ui.open_window.v1']): ConnectedCharacter {
  return Object.freeze({
    characterId: 2112625428,
    verifiedName: 'Test Pilot',
    status: 'connected',
    credentialReference: 'credential-ref',
    authorizationGeneration: 1,
    grantedScopes: Object.freeze([...scopes]),
    selected: true,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    lastVerifiedAt: '2026-08-20T10:00:00.000Z',
  });
}

class SelectedCharacterRepository implements CharacterRepository {
  readonly #character: ConnectedCharacter;
  constructor(character: ConnectedCharacter) { this.#character = character; }
  list(): readonly ConnectedCharacter[] { return [this.#character]; }
  find(characterId: number): ConnectedCharacter | null {
    return characterId === this.#character.characterId ? this.#character : null;
  }
  selected(): ConnectedCharacter { return this.#character; }
  connect(_input: VerifiedCharacterInput): ConnectedCharacter { throw new Error('Not used.'); }
  replaceGrant(_input: VerifiedCharacterInput): { readonly character: ConnectedCharacter; readonly previousCredentialReference: string } {
    throw new Error('Not used.');
  }
  recordRefresh(_input: { readonly characterId: number; readonly verifiedName: string; readonly grantedScopes: readonly string[]; readonly verifiedAt: string }): ConnectedCharacter {
    throw new Error('Not used.');
  }
  select(_characterId: number, _selectedAt: string): ConnectedCharacter { throw new Error('Not used.'); }
  markReauthorizationRequired(_characterId: number, _updatedAt: string): ConnectedCharacter { throw new Error('Not used.'); }
  beginRemoval(_characterId: number, _updatedAt: string): { readonly character: ConnectedCharacter; readonly selectionCleared: boolean } {
    throw new Error('Not used.');
  }
  completeRemoval(_characterId: number): boolean { throw new Error('Not used.'); }
}

class FakeActions implements EsiActionExecutor {
  executions = 0;
  readonly #uncertain: boolean;
  constructor(uncertain: boolean) { this.#uncertain = uncertain; }
  validateAction(input: { readonly operation: EsiOperationFact; readonly arguments: Readonly<Record<string, unknown>> }): Readonly<Record<string, JsonValue>> {
    if (input.operation.operationId === 'PutFleetsFleetId') {
      const fleetId = input.arguments.fleet_id;
      const body = input.arguments.body;
      if (typeof fleetId !== 'string' || typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'Invalid fleet action.' });
      }
      return Object.freeze({ fleet_id: fleetId, body: body as Readonly<Record<string, JsonValue>> });
    }
    const target = input.arguments.target_id;
    if (typeof target !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(target)) {
      throw new AppError({ code: 'AMBIGUOUS_INPUT', safeMessage: 'Invalid target.' });
    }
    return Object.freeze({ target_id: target });
  }
  executeAction(_input: { readonly operation: EsiOperationFact; readonly arguments: Readonly<Record<string, unknown>>; readonly character: ConnectedCharacter; readonly signal: AbortSignal }): Promise<EsiActionExecution> {
    this.executions += 1;
    if (this.#uncertain) {
      return Promise.reject(new AppError({
        code: 'ACTION_OUTCOME_UNCERTAIN',
        safeMessage: 'Outcome uncertain.',
      }));
    }
    return Promise.resolve({
      value: null,
      operationId: 'PostUiOpenwindowInformation',
      executedAt: '2026-08-20T10:00:01.000Z',
    });
  }
}

class MemoryActionPlans implements ActionPlanRepository {
  readonly #plans = new Map<string, ActionPlan>();
  create(plan: ActionPlan): void { this.#plans.set(plan.planId, plan); }
  find(planId: string): ActionPlan | null { return this.#plans.get(planId) ?? null; }
  beginExecution(planId: string, now: string): ActionPlan | null {
    const plan = this.find(planId);
    if (plan?.state !== 'planned' || plan.expiresAt <= now) return null;
    const next = Object.freeze({ ...plan, state: 'executing' as const, updatedAt: now });
    this.#plans.set(planId, next);
    return next;
  }
  finish(planId: string, state: Extract<ActionPlanState, 'succeeded' | 'failed' | 'uncertain'>, now: string): boolean {
    const plan = this.find(planId);
    if (plan?.state !== 'executing') return false;
    this.#plans.set(planId, Object.freeze({ ...plan, state, updatedAt: now }));
    return true;
  }
  expire(now: string): number {
    let count = 0;
    for (const [id, plan] of this.#plans) {
      if (plan.state === 'planned' && plan.expiresAt <= now) {
        this.#plans.set(id, Object.freeze({ ...plan, state: 'expired', updatedAt: now }));
        count += 1;
      }
    }
    return count;
  }
  prune(_before: string, _maximumCount: number): number { return 0; }
  counts(): Readonly<Record<ActionPlanState, number>> {
    const counts: Record<ActionPlanState, number> = {
      planned: 0, executing: 0, succeeded: 0, failed: 0, uncertain: 0, expired: 0,
    };
    for (const plan of this.#plans.values()) counts[plan.state] += 1;
    return counts;
  }
  invalidateCharacter(characterId: number): number {
    let count = 0;
    for (const [id, plan] of this.#plans) {
      if (plan.characterId === characterId) {
        this.#plans.delete(id);
        count += 1;
      }
    }
    return count;
  }
  replace(planId: string, update: (plan: ActionPlan) => ActionPlan): void {
    const plan = this.find(planId);
    if (plan === null) throw new Error('Missing test plan.');
    this.#plans.set(planId, update(plan));
  }
}

class MemoryActionAudit implements ActionAuditRepository {
  readonly events: ActionAuditEvent[] = [];
  append(event: ActionAuditEvent): void { this.events.push(event); }
  prune(_before: string, maximumCount: number): number {
    const removed = Math.max(this.events.length - maximumCount, 0);
    if (removed > 0) this.events.splice(0, removed);
    return removed;
  }
}

class MutableClock implements Clock {
  #date = new Date('2026-08-20T10:00:00.000Z');
  now(): Date { return new Date(this.#date); }
  set(value: string): void { this.#date = new Date(value); }
}

class SequenceIds implements IdGenerator {
  #next = 1;
  next(): string {
    const value = `id-${String(this.#next)}`;
    this.#next += 1;
    return value;
  }
}
