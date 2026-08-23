import type { JsonValue } from '../../domain/json.js';

export interface ExecuteBoundedReadInput {
  readonly capability_id: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly continuation?: string;
  readonly max_items: number;
}

export interface BoundedReadData {
  readonly capability_id: string;
  readonly operation_id: string;
  readonly result: JsonValue;
  readonly page: {
    readonly current: number;
    readonly total: number | null;
  };
  readonly continuation: string | null;
}
