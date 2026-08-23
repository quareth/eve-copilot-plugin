import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CanonicalFitSpec } from '../../../src/application/dto/fitting-analysis.js';
import type { SdeFittingSnapshot } from '../../../src/application/ports/sde-repository.js';
import { OneShotDogmaEngine } from '../../../src/infrastructure/fitting/one-shot-dogma-engine.js';

let directory: string;
let databasePath: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'eve-fitting-conformance-'));
  databasePath = join(directory, 'sde-3464040.db');
  const encoded = readFileSync(
    new URL('../../fixtures/fitting/retribution-sde.db.gz.base64', import.meta.url),
    'utf8',
  ).trim();
  const database = gunzipSync(Buffer.from(encoded, 'base64'));
  expect(createHash('sha256').update(database).digest('hex'))
    .toBe('d43776236c99a2c68d51e0c060d10257a7918eda19707af6bea437450d45dc85');
  writeFileSync(databasePath, database, { mode: 0o600 });
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('Retribution Dogma conformance', () => {
  const baseline: CanonicalFitSpec = Object.freeze({
    hullTypeId: 11393,
    ownedItemId: null,
    modules: Object.freeze([
      Object.freeze({ typeId: 439, slotFamily: 'medium', slotIndex: 0, state: 'online', chargeTypeId: null, itemId: null }),
      Object.freeze({ typeId: 523, slotFamily: 'low', slotIndex: 0, state: 'online', chargeTypeId: null, itemId: null }),
    ]),
    drones: Object.freeze([]),
    cargo: Object.freeze([]),
    source: 'structured',
  });
  const cpuInvalid: CanonicalFitSpec = Object.freeze({
    ...baseline,
    modules: Object.freeze([
      ...baseline.modules,
      Object.freeze({ typeId: 54753, slotFamily: 'high', slotIndex: 0, state: 'online', chargeTypeId: null, itemId: null }),
    ]),
    source: 'candidate',
  });
  const snapshot = (): SdeFittingSnapshot => ({
    buildNumber: 3464040,
    releaseDate: '2026-08-11T00:00:00Z',
    databasePath,
    importerVersion: 3 as const,
    fittingDataContractVersion: 1 as const,
  });

  it('uses active skills and returns exact quantitative CPU rejection', async () => {
    const engine = new OneShotDogmaEngine();
    const withoutSkill = await engine.calculate({
      snapshot: snapshot(), fits: [baseline], skills: {}, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[]],
    }, new AbortController().signal);
    const withSkill = await engine.calculate({
      snapshot: snapshot(), fits: [baseline, cpuInvalid], skills: { 3426: 5 }, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[], []],
    }, new AbortController().signal);
    expect(withoutSkill.evaluations[0]?.metrics.cpu_available).toBeCloseTo(140, 8);
    expect(withSkill.evaluations[0]?.metrics.cpu_available).toBeCloseTo(175, 8);
    const invalid = withSkill.evaluations[1];
    expect(invalid?.fit_valid).toBe(false);
    expect(invalid?.violations.find((violation) => violation.code === 'CPU_EXCEEDED')).toMatchObject({
      used: 801,
      available: 175,
      exceeded_by: 626,
    });
  });

  it('uses the active Power Grid Management level for available powergrid', async () => {
    const engine = new OneShotDogmaEngine();
    const withoutSkill = await engine.calculate({
      snapshot: snapshot(), fits: [baseline], skills: {}, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[]],
    }, new AbortController().signal);
    const withSkill = await engine.calculate({
      snapshot: snapshot(), fits: [baseline], skills: { 3413: 5 }, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[]],
    }, new AbortController().signal);

    expect(withoutSkill.evaluations[0]?.metrics.powergrid_available).toBeCloseTo(62, 8);
    expect(withSkill.evaluations[0]?.metrics.powergrid_available).toBeCloseTo(77.5, 8);
  });

  it('separates propulsion-off stability from propulsion-on depletion', async () => {
    const result = await new OneShotDogmaEngine().calculate({
      snapshot: snapshot(),
      fits: [baseline],
      skills: { 3426: 5 },
      profiles: ['sustained_combat_prop_off', 'sustained_combat_prop_on'],
      capacitorPolicy: { mode: 'report_only' },
      missingSkills: [[]],
    }, new AbortController().signal);
    const capacitor = result.evaluations[0]?.capacitor;
    expect(capacitor?.[0]).toMatchObject({
      profile: 'sustained_combat_prop_off',
      available: true,
      stable: true,
      depletes_in_seconds: null,
    });
    expect(capacitor?.[1]).toMatchObject({
      profile: 'sustained_combat_prop_on',
      available: true,
      stable: false,
      depletes_in_seconds: 234,
    });
    expect(capacitor?.[1]?.demand_gj_per_second).toBeCloseTo(8.6666666667, 8);
  });

  it('does not install a browser callback namespace in the MCP process and honors pre-cancellation', async () => {
    expect('window' in globalThis).toBe(false);
    await new OneShotDogmaEngine().calculate({
      snapshot: snapshot(), fits: [baseline], skills: {}, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[]],
    }, new AbortController().signal);
    expect('window' in globalThis).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(new OneShotDogmaEngine().calculate({
      snapshot: snapshot(), fits: [baseline], skills: {}, profiles: ['fitting_only'],
      capacitorPolicy: { mode: 'report_only' }, missingSkills: [[]],
    }, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
