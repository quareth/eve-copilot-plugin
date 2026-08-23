import type { JsonValue } from '../../domain/json.js';

export interface ContinuationState {
  readonly continuationId: string;
  readonly capabilityId: string;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly itemOffset: number;
  readonly pageNumber: number;
  readonly characterId: number | null;
  readonly authorizationGeneration: number | null;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface ContinuationRepository {
  find(continuationId: string): ContinuationState | null;
  put(state: ContinuationState): void;
  remove(continuationId: string): boolean;
  removeExpired(now: string): number;
  invalidateCharacter(characterId: number): number;
}
