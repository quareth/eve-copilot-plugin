import type { CapabilityDefinition, CapabilityDomain, DataSourceKind } from '../../domain/capability.js';

export function defineCapability(input: {
  readonly id: string;
  readonly domain: CapabilityDomain;
  readonly title: string;
  readonly description: string;
  readonly tool: string;
  readonly access?: 'public' | 'character' | 'corporation';
  readonly sources: readonly DataSourceKind[];
  readonly scopes?: readonly string[];
  readonly roles?: readonly string[];
  readonly paginated?: boolean;
  readonly implementation?: 'available' | 'planned';
  readonly esiOperations?: readonly string[];
  readonly operationClass?: 'read' | 'action';
}): CapabilityDefinition {
  return {
    id: input.id,
    domain: input.domain,
    title: input.title,
    description: input.description,
    semantic_tools: [input.tool],
    esi_operations: input.esiOperations ?? [],
    required_scopes: input.scopes ?? [],
    required_roles: input.roles ?? [],
    access: input.access ?? 'character',
    operation_class: input.operationClass ?? 'read',
    sources: input.sources,
    pagination: input.paginated === true
      ? { mode: 'cursor', default_limit: 50, maximum_limit: 200 }
      : { mode: 'none' },
    freshness: input.sources.includes('ESI')
      ? { mode: 'source_headers' }
      : { mode: 'static' },
    implementation: input.implementation ?? 'available',
    attribution_refs: (input.scopes?.length ?? 0) > 0
      ? ['docs/attribution.md#attribution-ledger']
      : [],
  };
}
