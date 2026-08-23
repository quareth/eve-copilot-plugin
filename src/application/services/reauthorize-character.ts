import type { ConnectionSessionData } from '../dto/identity.js';
import type { ResultEnvelope } from '../../domain/result.js';
import type { RequestContext } from './use-case.js';
import type { ConnectCharacter } from './connect-character.js';
import type { CharacterRepository } from '../ports/character-repository.js';
import type { EsiOperationCatalog } from '../../domain/esi-operation-catalog.js';
import { AppError } from '../../domain/errors.js';
import { CORE_CHARACTER_SCOPES } from '../dto/identity.js';
import { ESI_SEMANTIC_TOOLS } from '../../capabilities/generated/semantic-tools.js';

export class ReauthorizeCharacter {
  readonly #connect: Pick<ConnectCharacter, 'execute'>;
  readonly #characters: CharacterRepository;
  readonly #catalog: EsiOperationCatalog;

  constructor(input: {
    readonly connect: Pick<ConnectCharacter, 'execute'>;
    readonly characters: CharacterRepository;
    readonly catalog: EsiOperationCatalog;
  }) {
    this.#connect = input.connect;
    this.#characters = input.characters;
    this.#catalog = input.catalog;
  }

  execute(
    input: {
      readonly character_id: number;
      readonly open_browser: boolean;
      readonly capability_id?: string;
      readonly scope_mode?: 'minimum' | 'all_reads';
    },
    context: RequestContext,
  ): Promise<ResultEnvelope<ConnectionSessionData>> {
    const character = this.#characters.find(input.character_id);
    if (character === null) {
      throw new AppError({ code: 'NOT_CONNECTED', safeMessage: 'The character is not connected.' });
    }
    const scopeMode = input.scope_mode ?? 'minimum';
    if (scopeMode === 'all_reads' && input.capability_id !== undefined) {
      throw new AppError({
        code: 'AMBIGUOUS_INPUT',
        safeMessage: 'Choose either one capability or all read capabilities, not both.',
        details: { next_step: 'Remove capability_id when scope_mode is all_reads.' },
      });
    }
    const operation = input.capability_id === undefined
      ? null
      : this.#catalog.findCapability(input.capability_id);
    const semantic = input.capability_id === undefined
      ? undefined
      : ESI_SEMANTIC_TOOLS.find((definition) => definition.name === input.capability_id);
    if (input.capability_id !== undefined && operation === null && semantic === undefined) {
      throw new AppError({
        code: 'CAPABILITY_UNAVAILABLE',
        safeMessage: 'The requested EVE capability is not registered.',
        details: { capability_id: input.capability_id, next_step: 'Call find_eve_capabilities first.' },
      });
    }
    const semanticScopes = semantic === undefined ? [] : semantic.operationIds.flatMap((operationId) => {
      const semanticOperation = this.#catalog.findOperation(operationId);
      if (semanticOperation === null) throw new Error(`Generated semantic operation is missing: ${operationId}`);
      return semanticOperation.authorizationScopes;
    });
    const allReadScopes = scopeMode === 'all_reads'
      ? this.#catalog.all()
        .filter((candidate) => candidate.operationClass === 'read')
        .flatMap((candidate) => candidate.authorizationScopes)
      : [];
    const requestedScopes = [...new Set([
      ...CORE_CHARACTER_SCOPES,
      ...character.grantedScopes,
      ...(operation?.authorizationScopes ?? []),
      ...semanticScopes,
      ...allReadScopes,
    ])].sort();
    return this.#connect.execute({
      open_browser: input.open_browser,
      reauthorize_character_id: input.character_id,
      requested_scopes: requestedScopes,
    }, context);
  }
}
