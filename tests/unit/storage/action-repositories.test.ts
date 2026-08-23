import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActionPlan } from '../../../src/domain/action-plan.js';
import { SqliteActionAuditRepository } from '../../../src/storage/sqlite/action-audit-repository.js';
import { SqliteActionPlanRepository } from '../../../src/storage/sqlite/action-plan-repository.js';
import { SqliteCharacterRepository } from '../../../src/storage/sqlite/character-repository.js';
import { openDatabase } from '../../../src/storage/sqlite/open-database.js';
import { FixedClock } from '../../helpers/fakes.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('SQLite action repositories', () => {
  it('atomically prevents replay and removes action data with the character', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eve-copilot-actions-'));
    directories.push(directory);
    const database = openDatabase({
      path: join(directory, 'state.db'),
      busyTimeoutMs: 5_000,
      clock: new FixedClock(),
    });
    const characters = new SqliteCharacterRepository(database);
    characters.connect({
      characterId: 2112625428,
      verifiedName: 'Test Pilot',
      credentialReference: 'credential-ref',
      grantedScopes: ['esi-ui.open_window.v1'],
      verifiedAt: '2026-08-20T10:00:00.000Z',
    });
    const plans = new SqliteActionPlanRepository(database);
    const audit = new SqliteActionAuditRepository(database);
    const plan = actionPlan();
    plans.create(plan);
    audit.append({
      eventId: 'event-1',
      planId: plan.planId,
      capabilityId: plan.capabilityId,
      operationId: plan.operationId,
      characterId: plan.characterId,
      authorizationGeneration: plan.authorizationGeneration,
      state: 'planned',
      targetDigest: 'c'.repeat(64),
      errorCode: null,
      createdAt: plan.createdAt,
    });

    expect(plans.beginExecution(plan.planId, '2026-08-20T10:00:01.000Z')?.state).toBe('executing');
    expect(plans.beginExecution(plan.planId, '2026-08-20T10:00:02.000Z')).toBeNull();
    expect(plans.finish(plan.planId, 'succeeded', '2026-08-20T10:00:03.000Z')).toBe(true);
    expect(plans.finish(plan.planId, 'succeeded', '2026-08-20T10:00:04.000Z')).toBe(false);

    characters.beginRemoval(2112625428, '2026-08-20T10:01:00.000Z');
    expect(characters.completeRemoval(2112625428)).toBe(true);
    expect(plans.find(plan.planId)).toBeNull();
    expect(database.raw.prepare('SELECT COUNT(*) FROM action_audit_events').pluck().get()).toBe(0);
    database.close();
  });
});

function actionPlan(): ActionPlan {
  return Object.freeze({
    planId: 'plan-1',
    capabilityId: 'esi.post_ui_openwindow_information',
    operationId: 'PostUiOpenwindowInformation',
    actionFamily: 'ui_actions',
    characterId: 2112625428,
    authorizationGeneration: 1,
    arguments: Object.freeze({ target_id: '2112625428' }),
    argumentDigest: 'a'.repeat(64),
    confirmationDigest: 'b'.repeat(64),
    summary: Object.freeze({ target_id: '2112625428' }),
    requiredScopes: Object.freeze(['esi-ui.open_window.v1']),
    requiredRoles: Object.freeze([]),
    state: 'planned',
    expiresAt: '2026-08-20T10:05:00.000Z',
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  });
}
