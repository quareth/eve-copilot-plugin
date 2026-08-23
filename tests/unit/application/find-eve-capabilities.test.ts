import { describe, expect, it } from 'vitest';
import type { CharacterRepository } from '../../../src/application/ports/character-repository.js';
import { FindEveCapabilities } from '../../../src/application/services/find-eve-capabilities.js';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';
import { FixedClock } from '../../helpers/fakes.js';

const context = {
  requestId: '00000000-0000-4000-8000-000000000001',
  signal: new AbortController().signal,
};

describe('FindEveCapabilities', () => {
  it('filters by official domain and implementation state', async () => {
    const service = new FindEveCapabilities({
      catalog: buildEsiOperationCatalog(),
      characters: disconnectedCharacters(),
      clock: new FixedClock(),
    });
    const available = await service.execute({
      domain: 'military_campaigns',
      implementation: 'available',
      limit: 50,
    }, context);
    expect(available.data.capabilities.length).toBeGreaterThan(0);
    expect(available.data.capabilities.every((entry) => entry.domain === 'Military Campaigns')).toBe(true);

    const planned = await service.execute({ implementation: 'planned', limit: 50 }, context);
    expect(planned.data).toMatchObject({ total_matches: 0, returned: 0, capabilities: [] });
  });

  it('filters by availability for the selected character', async () => {
    const service = new FindEveCapabilities({
      catalog: buildEsiOperationCatalog(),
      characters: disconnectedCharacters(),
      clock: new FixedClock(),
    });
    const result = await service.execute({
      access: 'character',
      operation_class: 'read',
      availability: 'unavailable',
      limit: 50,
    }, context);
    expect(result.data.capabilities.length).toBeGreaterThan(0);
    expect(result.data.capabilities.every((entry) => !entry.available)).toBe(true);
    expect(result.data.capabilities.every((entry) => entry.unavailable_reason !== null)).toBe(true);
  });
});

function disconnectedCharacters(): CharacterRepository {
  return {
    list: () => [],
    find: () => null,
    selected: () => null,
    connect: () => { throw new Error('unused'); },
    replaceGrant: () => { throw new Error('unused'); },
    recordRefresh: () => { throw new Error('unused'); },
    select: () => { throw new Error('unused'); },
    markReauthorizationRequired: () => { throw new Error('unused'); },
    beginRemoval: () => { throw new Error('unused'); },
    completeRemoval: () => false,
  };
}
