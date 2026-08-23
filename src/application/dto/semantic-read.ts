import type { JsonValue } from '../../domain/json.js';
import type { CacheState } from '../../domain/result.js';

export interface ExecuteSemanticReadInput {
  readonly tool_name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly continuations: Readonly<Record<string, string>>;
  readonly max_items: number;
}

export interface SemanticReadComponent {
  readonly operation_id: string;
  readonly purpose: string;
  readonly result: JsonValue;
  readonly page: { readonly current: number; readonly total: number | null };
  readonly continuation: string | null;
  readonly cache: CacheState;
  readonly retrieved_at: string;
  readonly expires_at: string | null;
  readonly sde_build: number | null;
}

export interface SemanticReadData {
  readonly tool: string;
  readonly summary: JsonValue;
  readonly components: readonly SemanticReadComponent[];
  readonly continuations: Readonly<Record<string, string>>;
}
