import type { ConnectedCharacter } from '../../domain/character.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import type { JsonValue } from '../../domain/json.js';
import type { CacheState } from '../../domain/result.js';

export interface EsiOperationExecution {
  readonly value: JsonValue;
  readonly operationId: string;
  readonly retrievedAt: string;
  readonly expiresAt: string | null;
  readonly cache: CacheState;
  readonly totalPages: number | null;
}

export interface EsiOperationExecutor {
  execute(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly character: ConnectedCharacter | null;
    readonly authorizationPartition?: string;
    readonly signal: AbortSignal;
  }): Promise<EsiOperationExecution>;
}
