import type { EsiOperationFact, EsiOperationPack } from './esi-operation.js';

const CAPABILITY_ID = /^[a-z0-9_.-]{1,128}$/u;

export interface EsiOperationFilter {
  readonly query?: string;
  readonly pack?: EsiOperationPack;
  readonly access?: EsiOperationFact['access'];
  readonly operationClass?: EsiOperationFact['operationClass'];
}

export class EsiOperationCatalog {
  readonly #facts: readonly EsiOperationFact[];
  readonly #byOperation = new Map<string, EsiOperationFact>();
  readonly #byCapability = new Map<string, EsiOperationFact>();

  constructor(facts: readonly EsiOperationFact[]) {
    if (facts.length !== 233) throw new Error(`Expected 233 ESI operations, received ${String(facts.length)}.`);
    for (const fact of facts) {
      if (this.#byOperation.has(fact.operationId)) throw new Error(`Duplicate ESI operation: ${fact.operationId}`);
      if (fact.compatibilityDate !== '2026-08-18') throw new Error(`Unexpected ESI compatibility date: ${fact.operationId}`);
      if (!fact.pathTemplate.startsWith('/')) throw new Error(`Invalid ESI path: ${fact.operationId}`);
      if (fact.capabilityIds.length === 0) throw new Error(`ESI operation has no capability: ${fact.operationId}`);
      this.#byOperation.set(fact.operationId, fact);
      for (const capabilityId of fact.capabilityIds) {
        if (!CAPABILITY_ID.test(capabilityId)) throw new Error(`Invalid ESI capability ID: ${capabilityId}`);
        if (fact.exposure === 'bounded') {
          if (this.#byCapability.has(capabilityId)) throw new Error(`Duplicate bounded capability: ${capabilityId}`);
          this.#byCapability.set(capabilityId, fact);
        }
      }
    }
    const actions = facts.filter((fact) => fact.operationClass === 'action');
    if (actions.length !== 26) throw new Error(`Expected 26 reviewed actions, received ${String(actions.length)}.`);
    this.#facts = Object.freeze([...facts].sort((left, right) => left.operationId.localeCompare(right.operationId)));
  }

  all(): readonly EsiOperationFact[] {
    return this.#facts;
  }

  findOperation(operationId: string): EsiOperationFact | null {
    return this.#byOperation.get(operationId) ?? null;
  }

  findCapability(capabilityId: string): EsiOperationFact | null {
    return this.#byCapability.get(capabilityId) ?? null;
  }

  search(filter: EsiOperationFilter): readonly EsiOperationFact[] {
    const query = filter.query?.trim().toLocaleLowerCase('en-US') ?? '';
    return this.#facts.filter((fact) =>
      (filter.pack === undefined || fact.pack === filter.pack)
      && (filter.access === undefined || fact.access === filter.access)
      && (filter.operationClass === undefined || fact.operationClass === filter.operationClass)
      && (query.length === 0 || [fact.operationId, fact.summary, fact.tag, ...fact.capabilityIds]
        .some((value) => value.toLocaleLowerCase('en-US').includes(query))));
  }
}
