import type { CapabilitiesData, CapabilitiesInput, CapabilityView } from '../dto/capabilities.js';
import type { CharacterContextPort } from '../ports/character-context.js';
import type { Clock } from '../ports/clock.js';
import type { CursorCodec } from '../ports/cursor-codec.js';
import type { RequestContext, UseCase } from './use-case.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { CapabilityDefinition } from '../../domain/capability.js';
import type { CapabilityRegistry } from '../../domain/capability-registry.js';
import { localResult, type ResultEnvelope } from '../../domain/result.js';
import { CAPABILITY_SCHEMA_VERSION } from '../../domain/versions.js';

export class GetEveCapabilities implements UseCase<CapabilitiesInput, ResultEnvelope<CapabilitiesData>> {
  readonly #clock: Clock;
  readonly #registry: CapabilityRegistry;
  readonly #characterContext: CharacterContextPort;
  readonly #cursorCodec: CursorCodec;

  constructor(input: {
    readonly clock: Clock;
    readonly registry: CapabilityRegistry;
    readonly characterContext: CharacterContextPort;
    readonly cursorCodec: CursorCodec;
  }) {
    this.#clock = input.clock;
    this.#registry = input.registry;
    this.#characterContext = input.characterContext;
    this.#cursorCodec = input.cursorCodec;
  }

  execute(input: CapabilitiesInput, context: RequestContext): Promise<ResultEnvelope<CapabilitiesData>> {
    return Promise.resolve().then(() => this.executeSync(input, context));
  }

  private executeSync(input: CapabilitiesInput, context: RequestContext): ResultEnvelope<CapabilitiesData> {
    throwIfAborted(context.signal);
    const filter = {
      ...(input.domain === undefined ? {} : { domain: input.domain }),
      ...(input.implementation === undefined ? {} : { implementation: input.implementation }),
    };
    const definitions = this.#registry.filter(filter);
    const offset = decodeCursor(input.cursor, input, definitions, this.#cursorCodec);
    const page = definitions.slice(offset, offset + input.limit);
    const nextOffset = offset + page.length;
    const character = this.#characterContext.get();
    const capabilities = page.map((definition) => capabilityView(
      definition,
      input.include_operations,
      character.scopes,
      character.roles,
    ));
    throwIfAborted(context.signal);
    return localResult({
      requestId: context.requestId,
      retrievedAt: this.#clock.now(),
      data: {
        registry_version: CAPABILITY_SCHEMA_VERSION,
        connection: {
          status: character.status,
          active_character: character.activeCharacter,
          pending_connections: character.pendingConnections,
        },
        summary: this.#registry.counts(filter),
        capabilities,
        next_cursor: nextOffset < definitions.length
          ? encodeCursor(page.at(-1), input, this.#cursorCodec)
          : null,
      },
    });
  }
}

function capabilityView(
  definition: CapabilityDefinition,
  includeOperations: boolean,
  scopes: ReadonlySet<string>,
  roles: ReadonlySet<string>,
): CapabilityView {
  const missingScopes = definition.required_scopes.filter((scope) => !scopes.has(scope));
  const missingRoles = definition.required_roles.filter((role) => !roles.has(role));
  const authorizationStatus = definition.access === 'public'
    ? 'not_required'
    : missingScopes.length > 0
      ? 'not_connected'
      : missingRoles.length > 0
        ? 'insufficient_role'
        : 'authorized';
  return {
    id: definition.id,
    domain: definition.domain,
    title: definition.title,
    description: definition.description,
    implementation: definition.implementation,
    access: definition.access,
    operation_class: definition.operation_class,
    sources: definition.sources,
    semantic_tools: includeOperations ? definition.semantic_tools : [],
    authorization: {
      status: authorizationStatus,
      required_scopes: includeOperations ? definition.required_scopes : [],
      missing_scopes: includeOperations ? missingScopes : [],
      required_roles: includeOperations ? definition.required_roles : [],
      missing_roles: includeOperations ? missingRoles : [],
    },
    unavailable_reason: definition.implementation === 'available'
      ? null
      : definition.implementation === 'planned'
        ? 'Not implemented in this release'
        : 'Capability is not currently available',
  };
}

function encodeCursor(
  last: CapabilityDefinition | undefined,
  input: CapabilitiesInput,
  codec: CursorCodec,
): string {
  if (last === undefined) throw invalidCursor();
  return codec.encode(JSON.stringify({
    v: 1,
    d: last.domain,
    i: last.id,
    f: filterFingerprint(input),
  }));
}

function decodeCursor(
  cursor: string | undefined,
  input: CapabilitiesInput,
  definitions: readonly CapabilityDefinition[],
  codec: CursorCodec,
): number {
  if (cursor === undefined) return 0;
  if (!/^[A-Za-z0-9_-]{1,256}$/u.test(cursor)) throw invalidCursor();
  try {
    const decoded = codec.decode(cursor);
    if (codec.encode(decoded) !== cursor) throw invalidCursor();
    const payload = JSON.parse(decoded) as unknown;
    if (!isCursorPayload(payload) || payload.f !== filterFingerprint(input)) throw invalidCursor();
    const position = definitions.findIndex((definition) =>
      definition.domain === payload.d && definition.id === payload.i);
    if (position < 0) throw invalidCursor();
    return position + 1;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidCursor();
  }
}

function filterFingerprint(input: CapabilitiesInput): string {
  return `${input.domain ?? '*'}|${input.implementation ?? '*'}|${input.include_operations ? '1' : '0'}`;
}

function isCursorPayload(value: unknown): value is {
  readonly v: 1;
  readonly d: CapabilityDefinition['domain'];
  readonly i: string;
  readonly f: string;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Readonly<Record<string, unknown>>;
  return Object.keys(payload).length === 4
    && payload.v === 1
    && typeof payload.d === 'string'
    && typeof payload.i === 'string'
    && typeof payload.f === 'string';
}

function invalidCursor(): AppError {
  return new AppError({
    code: 'AMBIGUOUS_INPUT',
    safeMessage: 'The capability cursor is invalid for these filters.',
    details: { next_step: 'Call get_eve_capabilities again without a cursor.' },
  });
}
