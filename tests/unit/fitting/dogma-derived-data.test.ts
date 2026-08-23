import { describe, expect, it } from 'vitest';
import {
  DERIVED_ATTRIBUTES,
  DERIVED_ATTRIBUTE_IDS,
  DERIVED_EFFECTS,
  DERIVED_EFFECT_IDS,
} from '../../../src/infrastructure/fitting/dogma-derived-data.js';

describe('Dogma adapter derived data', () => {
  it('keeps reviewed CPU, powergrid, capacitor, timing, and drone IDs stable', () => {
    expect([...DERIVED_ATTRIBUTES.keys()]).toHaveLength(11);
    expect([...DERIVED_EFFECTS.keys()]).toHaveLength(10);
    expect(DERIVED_ATTRIBUTES.get(DERIVED_ATTRIBUTE_IDS.thousand)?.defaultValue).toBe(1000);
    expect(DERIVED_ATTRIBUTES.get(DERIVED_ATTRIBUTE_IDS.capacitorPeakRecharge)?.defaultValue).toBe(2.5);
    expect(DERIVED_EFFECTS.get(DERIVED_EFFECT_IDS.cpuPowerLoad)?.effectCategory).toBe(4);
    expect(DERIVED_EFFECTS.get(DERIVED_EFFECT_IDS.capacitorPeakLoad)?.effectCategory).toBe(1);
  });

  it('uses only reserved negative IDs so official SDE IDs cannot collide', () => {
    expect([...DERIVED_ATTRIBUTES.keys(), ...DERIVED_EFFECTS.keys()].every((id) => id < 0)).toBe(true);
  });
});
