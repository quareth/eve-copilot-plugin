import type { JsonValue } from '../../domain/json.js';

export interface PrepareEveActionInput {
  readonly capability_id: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface PreparedActionData {
  readonly plan_id: string;
  readonly confirmation: string;
  readonly capability_id: string;
  readonly operation_id: string;
  readonly character: { readonly id: number; readonly name: string };
  readonly effect: Readonly<Record<string, JsonValue>>;
  readonly required_scopes: readonly string[];
  readonly expires_at: string;
  readonly irreversible: boolean;
}

export interface ExecuteEveActionInput {
  readonly plan_id: string;
  readonly confirmation: string;
}

export interface ExecutedActionData {
  readonly plan_id: string;
  readonly capability_id: string;
  readonly operation_id: string;
  readonly state: 'succeeded';
  readonly result: JsonValue;
}
