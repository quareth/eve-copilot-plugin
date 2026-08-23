import type { EsiActionFamily } from './esi-operation.js';
import type { JsonValue } from './json.js';

export type ActionPlanState = 'planned' | 'executing' | 'succeeded' | 'failed' | 'uncertain' | 'expired';

export interface ActionPlan {
  readonly planId: string;
  readonly capabilityId: string;
  readonly operationId: string;
  readonly actionFamily: EsiActionFamily;
  readonly characterId: number;
  readonly authorizationGeneration: number;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly argumentDigest: string;
  readonly confirmationDigest: string;
  readonly summary: Readonly<Record<string, JsonValue>>;
  readonly requiredScopes: readonly string[];
  readonly requiredRoles: readonly string[];
  readonly state: ActionPlanState;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ActionAuditEvent {
  readonly eventId: string;
  readonly planId: string;
  readonly capabilityId: string;
  readonly operationId: string;
  readonly characterId: number;
  readonly authorizationGeneration: number;
  readonly state: ActionPlanState;
  readonly targetDigest: string;
  readonly errorCode: string | null;
  readonly createdAt: string;
}
