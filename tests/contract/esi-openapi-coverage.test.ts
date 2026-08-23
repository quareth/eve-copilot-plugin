import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const dispositionSchema = z.enum([
  'implemented_semantic',
  'implemented_bounded_low_level',
  'planned',
  'excluded_policy',
  'unavailable_from_esi',
]);

describe('pinned ESI OpenAPI coverage', () => {
  it('matches the frozen snapshot and assigns exactly one disposition per operation', () => {
    const snapshot = readFileSync('docs/snapshots/esi-openapi-2026-08-18.json');
    expect(snapshot.byteLength).toBe(614466);
    expect(createHash('sha256').update(snapshot).digest('hex')).toBe(
      '1d7bf362256bff980f72e4dd0aa7917da9431383b0b29f6fbc44f30b1d1d0b02',
    );
    const ledger = z.object({
      snapshot: z.object({
        compatibility_date: z.literal('2026-08-18'),
        operation_count: z.literal(233),
      }).loose(),
      summary: z.object({
        accounted: z.object({ percent: z.literal(100) }).loose(),
        allowed_execution: z.object({ percent: z.literal(100) }).loose(),
        dispositions: z.object({ planned: z.literal(0) }).loose(),
      }).loose(),
      operations: z.array(z.object({
        operation_id: z.string().min(1),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
        path: z.string().startsWith('/'),
        disposition: dispositionSchema,
        capability_ids: z.array(z.string()),
      }).loose()).length(233),
    }).parse(JSON.parse(readFileSync('docs/esi-coverage.json', 'utf8')) as unknown);
    expect(new Set(ledger.operations.map((entry) => entry.operation_id)).size).toBe(233);
    const semantic = ledger.operations.filter((entry) => entry.disposition === 'implemented_semantic');
    expect(semantic).toHaveLength(67);
    expect(semantic.map((entry) => entry.operation_id)).toEqual(expect.arrayContaining([
      'GetCharactersDetail',
      'GetMarketsPrices',
      'GetCorporationsCorporationIdAssets',
      'GetSovereigntyCampaigns',
      'PostRoute',
    ]));
    expect(ledger.operations.filter((entry) => entry.disposition === 'planned')).toEqual([]);
  });
});
