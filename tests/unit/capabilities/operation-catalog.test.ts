import { describe, expect, it } from 'vitest';
import { buildEsiOperationCatalog } from '../../../src/capabilities/operation-catalog.js';

describe('ESI operation catalog', () => {
  it('contains the exact reviewed coverage baseline', () => {
    const catalog = buildEsiOperationCatalog();
    expect(catalog.all()).toHaveLength(233);
    expect(catalog.all().filter((fact) => fact.operationClass === 'read')).toHaveLength(207);
    expect(catalog.all().filter((fact) => fact.operationClass === 'action')).toHaveLength(26);
    expect(new Set(catalog.all().map((fact) => fact.pack))).toEqual(new Set([
      'character_communication',
      'inventory_economy',
      'organizations_operations',
      'universe_static',
      'warfare_intelligence',
      'eve_client_ui',
    ]));
  });

  it('maps each bounded capability to exactly one reviewed operation', () => {
    const catalog = buildEsiOperationCatalog();
    const bounded = catalog.all().filter((fact) => fact.exposure === 'bounded');
    for (const fact of bounded) {
      expect(fact.capabilityIds).toHaveLength(1);
      expect(catalog.findCapability(fact.capabilityIds[0] ?? '')).toBe(fact);
    }
    expect(catalog.findCapability('esi.get_markets_groups')?.operationId).toBe('GetMarketsGroups');
    expect(catalog.findCapability('esi.post_ui_autopilot_waypoint')?.operationClass).toBe('action');
  });

  it('retains strict generated request and response contracts', () => {
    const catalog = buildEsiOperationCatalog();
    const assets = catalog.findOperation('GetCharactersCharacterIdAssets');
    expect(assets?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'character_id', location: 'path', required: true }),
      expect.objectContaining({ name: 'page', location: 'query', required: false }),
    ]));
    expect(assets?.requiredScopes).toEqual(['esi-assets.read_assets.v1']);
    expect(assets?.pagination.mode).toBe('page');
  });
});
