import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCapabilityRegistry } from '../../../src/capabilities/registry.js';

describe('ESI coverage documentation', () => {
  it('maps every available registry capability that declares ESI as a source', () => {
    const document = readFileSync('docs/esi-coverage.json', 'utf8');
    const capabilities = buildCapabilityRegistry()
      .filter({})
      .filter((capability) => capability.implementation === 'available'
        && capability.sources.includes('ESI'));
    for (const capability of capabilities) {
      expect(document, `Missing ESI coverage entry for ${capability.id}`).toContain(capability.id);
    }
  });
});
