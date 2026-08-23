import { describe, expect, it } from 'vitest';
import {
  applyCandidate,
  canonicalFitForHash,
  canonicalizeStructuredFit,
  parseFittingSlot,
} from '../../../src/domain/fitting.js';

describe('canonical fitting domain', () => {
  it('normalizes exact slots and applies candidate changes immutably', () => {
    const baseline = canonicalizeStructuredFit({
      hull_type_id: 11393,
      modules: [{ type_id: 439, slot: 'MedSlot0', state: 'active' }],
      drones: [],
    });
    const candidate = applyCandidate(baseline, {
      candidate_id: 'prop-off',
      changes: [{ action: 'set_state', slot: 'MedSlot0', state: 'online' }],
    });
    expect(baseline.modules[0]?.state).toBe('active');
    expect(candidate.modules[0]?.state).toBe('online');
    expect(candidate.source).toBe('candidate');
    expect(canonicalFitForHash(candidate)).toMatchObject({
      hull_type_id: 11393,
      modules: [{ slot: 'MedSlot0', state: 'online' }],
    });
  });

  it('rejects duplicate and ambiguous physical slots before calculation', () => {
    expect(() => canonicalizeStructuredFit({
      hull_type_id: 11393,
      modules: [
        { type_id: 439, slot: 'MedSlot0', state: 'online' },
        { type_id: 438, slot: 'MedSlot0', state: 'online' },
      ],
      drones: [],
    })).toThrow(/more than once/u);
    expect(() => parseFittingSlot('a mid slot')).toThrow(/exact EVE slot/u);
  });

  it('enforces the 128-entry bound and exact drone active quantity', () => {
    expect(() => canonicalizeStructuredFit({
      hull_type_id: 11393,
      modules: [],
      drones: [{ type_id: 2203, quantity: 128, active_quantity: 129 }],
    })).toThrow(/Active drone quantity/u);
    expect(() => canonicalizeStructuredFit({
      hull_type_id: 11393,
      modules: [{ type_id: 439, slot: 'MedSlot0', state: 'online' }],
      drones: [{ type_id: 2203, quantity: 128, active_quantity: 0 }],
    })).toThrow(/more than 128/u);
  });
});
