import { describe, expect, it } from 'vitest';
import { analyzeFittingChangesInputSchema } from '../../../src/mcp/schemas/fitting-analysis.js';

describe('analyze_fitting_changes input schema', () => {
  it('accepts one bounded structured comparison with an explicit capacitor policy', () => {
    expect(analyzeFittingChangesInputSchema.parse({
      baseline: {
        source: 'structured',
        fit: { hull_type_id: 11393, modules: [], drones: [] },
      },
      candidates: [{
        candidate_id: 'proposal-1',
        changes: [{ action: 'add', slot: 'MedSlot0', type_id: 439, state: 'active' }],
      }],
      profiles: ['sustained_combat_prop_off', 'sustained_combat_prop_on'],
      capacitor_policy: { mode: 'report_only' },
    }).candidates).toHaveLength(1);
  });

  it('rejects ambiguous candidate forms and duplicate profiles', () => {
    expect(() => analyzeFittingChangesInputSchema.parse({
      baseline: { source: 'current_ship' },
      candidates: [{
        candidate_id: 'bad',
        fit: { hull_type_id: 11393, modules: [], drones: [] },
        changes: [],
      }],
      profiles: ['custom', 'custom'],
      capacitor_policy: { mode: 'report_only' },
    })).toThrow();
  });

  it('rejects more than five candidates before a worker can start', () => {
    const candidates = Array.from({ length: 6 }, (_unused, index) => ({
      candidate_id: `proposal-${String(index)}`,
      changes: [],
    }));
    expect(() => analyzeFittingChangesInputSchema.parse({
      baseline: { source: 'current_ship' },
      candidates,
      profiles: ['fitting_only'],
      capacitor_policy: { mode: 'report_only' },
    })).toThrow();
  });
});
