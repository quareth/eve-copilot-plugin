import type { ConnectedCharacter } from '../../domain/character.js';
import type { EsiOperationFact } from '../../domain/esi-operation.js';
import type { JsonValue } from '../../domain/json.js';

export interface EsiActionExecution {
  readonly value: JsonValue;
  readonly operationId: string;
  readonly executedAt: string;
}

export interface EsiActionExecutor {
  validateAction(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
  }): Readonly<Record<string, JsonValue>>;
  executeAction(input: {
    readonly operation: EsiOperationFact;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly character: ConnectedCharacter;
    readonly signal: AbortSignal;
  }): Promise<EsiActionExecution>;
}
