import type { JsonValue } from './json.js';

export type EsiAccessClass = 'public' | 'character' | 'corporation' | 'alliance' | 'fleet';
export type EsiOperationClass = 'read' | 'action';
export type EsiActionFamily =
  | 'calendar_respond'
  | 'contacts_write'
  | 'fittings_write'
  | 'mail_send'
  | 'mail_organize'
  | 'fleet_write'
  | 'ui_actions';
export type EsiOperationPack =
  | 'character_communication'
  | 'inventory_economy'
  | 'organizations_operations'
  | 'universe_static'
  | 'warfare_intelligence'
  | 'eve_client_ui';
export type EsiScopeBundle =
  | 'core_context'
  | 'character_profile'
  | 'inventory'
  | 'economy'
  | 'communication'
  | 'fleet_read'
  | 'corporation_read'
  | `action.${EsiActionFamily}`;

export interface EsiOperationBudgets {
  readonly defaultItems: number;
  readonly maximumItems: number;
  readonly maximumPages: number;
  readonly maximumRequests: number;
  readonly maximumConcurrency: number;
  readonly maximumResponseBytes: number;
  readonly timeoutMs: number;
}

export interface EsiOperationFact {
  readonly operationId: string;
  readonly compatibilityDate: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  readonly pathTemplate: string;
  readonly tag: string;
  readonly summary: string;
  readonly access: EsiAccessClass;
  readonly operationClass: EsiOperationClass;
  readonly requiredScopes: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly authorizationScopes: readonly string[];
  readonly parameters: ReadonlyArray<{
    readonly name: string;
    readonly location: 'path' | 'query';
    readonly required: boolean;
    readonly style: string;
    readonly explode: boolean;
  }>;
  readonly inputSchema: JsonValue;
  readonly outputSchema: JsonValue;
  readonly pagination: {
    readonly mode: 'none' | 'page' | 'cursor';
    readonly defaultPages: number;
    readonly maximumPages: number;
    readonly metadata: JsonValue;
  };
  readonly freshness: {
    readonly mode: 'source_headers' | 'fixed_ttl';
    readonly ttlSeconds: number | null;
    readonly staleIfErrorSeconds: number;
  };
  readonly rateLimit: JsonValue;
  readonly budgets: EsiOperationBudgets;
  readonly pack: EsiOperationPack;
  readonly capabilityIds: readonly string[];
  readonly exposure: 'semantic' | 'bounded';
  readonly actionFamily: EsiActionFamily | null;
  readonly scopeBundle: EsiScopeBundle | null;
}
