import { describe, expect, it } from 'vitest';
import { buildCapabilityRegistry, IMPLEMENTED_TOOL_NAMES } from '../../../src/capabilities/registry.js';
import type { CapabilityDefinition } from '../../../src/domain/capability.js';
import { CapabilityRegistry } from '../../../src/domain/capability-registry.js';

describe('CapabilityRegistry', () => {
  it('builds a deterministic closed capability map', () => {
    const registry = buildCapabilityRegistry();
    const definitions = registry.all();
    expect(registry.counts().available).toBe(66);
    expect(registry.counts().planned).toBe(0);
    expect(definitions.map((entry) => `${entry.domain}:${entry.id}`)).toEqual(
      [...definitions]
        .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id))
        .map((entry) => `${entry.domain}:${entry.id}`),
    );
    expect(definitions.filter((entry) => entry.implementation === 'available')
      .flatMap((entry) => entry.semantic_tools).sort()).toEqual([...IMPLEMENTED_TOOL_NAMES].sort());
  });

  it('filters without mutating registry order', () => {
    const registry = buildCapabilityRegistry();
    expect(registry.filter({ domain: 'skills' })).toHaveLength(3);
    expect(registry.filter({ implementation: 'available' })).toHaveLength(66);
    expect(registry.filter({ domain: 'guide' })).toHaveLength(3);
    expect(registry.all()).toBe(registry.all());
  });

  it('describes check_requirements as one complete recursive SDE proof', () => {
    const capability = buildCapabilityRegistry().all().find((entry) => entry.id === 'check_requirements');
    expect(capability).toMatchObject({
      implementation: 'available',
      sources: ['ESI', 'SDE', 'computed'],
      pagination: { mode: 'none' },
    });
    expect(capability?.description).toContain('every validated recursive hard-skill requirement');
  });

  it('reports action capabilities disabled when the local master switch is off', () => {
    const registry = buildCapabilityRegistry({ actionsEnabled: false });
    expect(registry.counts()).toMatchObject({ available: 64, disabled: 2, planned: 0 });
    expect(registry.filter({ implementation: 'disabled' }).map((capability) => capability.id).sort())
      .toEqual(['foundation.action_execution', 'foundation.action_planning']);
  });

  it.each([
    { name: 'duplicate ID', mutate: (item: CapabilityDefinition) => [item, item] },
    { name: 'invalid ID', mutate: (item: CapabilityDefinition) => [{ ...item, id: 'bad id' }] },
    { name: 'public scopes', mutate: (item: CapabilityDefinition) => [{ ...item, access: 'public' as const, required_scopes: ['scope'] }] },
    { name: 'unbounded pagination', mutate: (item: CapabilityDefinition) => [{ ...item, pagination: { mode: 'cursor' as const } }] },
    { name: 'bad fixed TTL', mutate: (item: CapabilityDefinition) => [{ ...item, freshness: { mode: 'fixed_ttl' as const, ttl_seconds: 0 } }] },
  ])('rejects $name', ({ mutate }) => {
    const item = buildCapabilityRegistry().filter({ implementation: 'available' })[0];
    if (item === undefined) throw new Error('Expected an available foundation capability.');
    expect(() => new CapabilityRegistry(mutate(item), IMPLEMENTED_TOOL_NAMES)).toThrow();
  });
});
