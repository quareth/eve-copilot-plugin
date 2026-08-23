import type {
  CapabilityDefinition,
  CapabilityDomain,
  ImplementationState,
} from './capability.js';

const IDENTIFIER = /^[A-Za-z0-9_.-]{1,128}$/u;

export interface CapabilityFilter {
  readonly domain?: CapabilityDomain;
  readonly implementation?: ImplementationState;
}

export interface CapabilityCounts {
  readonly available: number;
  readonly degraded: number;
  readonly disabled: number;
  readonly planned: number;
}

export class CapabilityRegistry {
  readonly #definitions: readonly CapabilityDefinition[];

  constructor(definitions: readonly CapabilityDefinition[], availableToolNames: ReadonlySet<string>) {
    validateDefinitions(definitions, availableToolNames);
    this.#definitions = Object.freeze(
      [...definitions]
        .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id))
        .map((definition) => freezeDefinition(definition)),
    );
  }

  all(): readonly CapabilityDefinition[] {
    return this.#definitions;
  }

  filter(filter: CapabilityFilter): readonly CapabilityDefinition[] {
    return this.#definitions.filter((definition) =>
      (filter.domain === undefined || definition.domain === filter.domain)
      && (filter.implementation === undefined || definition.implementation === filter.implementation),
    );
  }

  counts(filter: CapabilityFilter = {}): CapabilityCounts {
    const counts = { available: 0, degraded: 0, disabled: 0, planned: 0 };
    for (const definition of this.filter(filter)) {
      counts[definition.implementation] += 1;
    }
    return counts;
  }
}

function validateDefinitions(
  definitions: readonly CapabilityDefinition[],
  availableToolNames: ReadonlySet<string>,
): void {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (!IDENTIFIER.test(definition.id)) throw new Error(`Invalid capability ID: ${definition.id}`);
    if (ids.has(definition.id)) throw new Error(`Duplicate capability ID: ${definition.id}`);
    ids.add(definition.id);
    for (const tool of definition.semantic_tools) {
      if (!IDENTIFIER.test(tool)) throw new Error(`Invalid semantic tool name: ${tool}`);
    }
    if (definition.access === 'public' && definition.required_scopes.length > 0) {
      throw new Error(`Public capability cannot require ESI scopes: ${definition.id}`);
    }
    if (definition.pagination.mode !== 'none'
      && (definition.pagination.maximum_limit === undefined
        || definition.pagination.maximum_limit <= 0)) {
      throw new Error(`Paginated capability must define a maximum limit: ${definition.id}`);
    }
    if (definition.freshness.mode === 'fixed_ttl'
      && (definition.freshness.ttl_seconds === undefined
        || definition.freshness.ttl_seconds <= 0)) {
      throw new Error(`Fixed-TTL capability must define a positive TTL: ${definition.id}`);
    }
    if (definition.implementation === 'available') {
      for (const tool of definition.semantic_tools) {
        if (!availableToolNames.has(tool)) {
          throw new Error(`Available capability maps to an unregistered tool: ${definition.id} -> ${tool}`);
        }
      }
    }
  }
}

function freezeDefinition(definition: CapabilityDefinition): CapabilityDefinition {
  return Object.freeze({
    ...definition,
    semantic_tools: Object.freeze([...definition.semantic_tools]),
    esi_operations: Object.freeze([...definition.esi_operations]),
    required_scopes: Object.freeze([...definition.required_scopes]),
    required_roles: Object.freeze([...definition.required_roles]),
    sources: Object.freeze([...definition.sources]),
    pagination: Object.freeze({ ...definition.pagination }),
    freshness: Object.freeze({ ...definition.freshness }),
    attribution_refs: Object.freeze([...definition.attribution_refs]),
  });
}
