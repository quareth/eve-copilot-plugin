import type {
  FindEveCapabilitiesInput,
  OperationCapabilityView,
  OperationDiscoveryData,
} from '../dto/operation-discovery.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { RequestContext, UseCase } from './use-case.js';
import { throwIfAborted } from '../../domain/errors.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import type { Clock } from '../ports/clock.js';

export class FindEveCapabilities implements UseCase<FindEveCapabilitiesInput, ResultEnvelope<OperationDiscoveryData>> {
  readonly #catalog: EsiOperationCatalog;
  readonly #characters: CharacterRepository;
  readonly #clock: Clock;

  constructor(input: {
    readonly catalog: EsiOperationCatalog;
    readonly characters: CharacterRepository;
    readonly clock: Clock;
  }) {
    this.#catalog = input.catalog;
    this.#characters = input.characters;
    this.#clock = input.clock;
  }

  execute(
    input: FindEveCapabilitiesInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<OperationDiscoveryData>> {
    return Promise.resolve().then(() => {
      throwIfAborted(context.signal);
      const operations = this.#catalog.search({
        ...(input.query === undefined ? {} : { query: input.query }),
        ...(input.pack === undefined ? {} : { pack: input.pack }),
        ...(input.access === undefined ? {} : { access: input.access }),
        ...(input.operation_class === undefined ? {} : { operationClass: input.operation_class }),
      }).filter((operation) => operation.exposure === 'bounded'
        && (input.domain === undefined || normalizeDomain(operation.tag) === normalizeDomain(input.domain)));
      const selected = this.#characters.selected();
      const matches = operations.map((operation) => view(
        operation,
        selected?.status === 'connected' ? selected.grantedScopes : [],
        selected?.status === 'connected',
      )).filter((capability) =>
        (input.implementation === undefined || capability.implementation === input.implementation)
        && (input.availability === undefined
          || capability.available === (input.availability === 'available')));
      const capabilities = matches.slice(0, input.limit);
      return localResult({
        requestId: context.requestId,
        retrievedAt: this.#clock.now(),
        data: Object.freeze({
          total_matches: matches.length,
          returned: capabilities.length,
          capabilities: Object.freeze(capabilities),
        }),
      });
    });
  }
}

function view(
  operation: EsiOperationFact,
  grantedScopes: readonly string[],
  connected: boolean,
): OperationCapabilityView {
  const capabilityId = operation.capabilityIds[0];
  if (capabilityId === undefined) throw new Error(`Bounded operation has no capability: ${operation.operationId}`);
  const missingScopes = operation.authorizationScopes.filter((scope) => !grantedScopes.includes(scope));
  const publicOperation = operation.access === 'public';
  const available = operation.operationClass === 'read'
    && (publicOperation || connected && missingScopes.length === 0);
  const unavailableReason = operation.operationClass === 'action'
    ? 'Requires prepare_eve_action and locally enabled actions.'
    : publicOperation
      ? null
      : !connected
        ? 'No usable character is selected.'
        : missingScopes.length > 0
          ? 'The selected character is missing required scopes.'
          : null;
  return Object.freeze({
    capability_id: capabilityId,
    operation_id: operation.operationId,
    title: operation.summary,
    domain: operation.tag,
    pack: operation.pack,
    access: operation.access,
    operation_class: operation.operationClass,
    exposure: 'bounded',
    implementation: 'available',
    required_scopes: operation.authorizationScopes,
    missing_scopes: publicOperation ? [] : missingScopes,
    required_roles_any_of: operation.requiredRoles,
    action_family: operation.actionFamily,
    scope_bundle: operation.scopeBundle,
    available,
    unavailable_reason: unavailableReason,
    input_schema: operation.inputSchema,
  });
}

function normalizeDomain(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ');
}
