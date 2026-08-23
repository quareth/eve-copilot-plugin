import type { JsonValue } from '../../domain/json.js';

export interface EsiRateLimitLease {
  readonly id: number;
  readonly operationId: string;
  readonly identityKey: string;
  readonly bucketKey: string | null;
}

export interface EsiRateLimitSnapshot {
  readonly delayedRequests: number;
  readonly totalDelayMs: number;
  readonly activeBuckets: number;
  readonly globallyBlockedUntil: string | null;
  readonly groups: readonly EsiRateLimitGroupSnapshot[];
}

export interface EsiRateLimitGroupSnapshot {
  readonly group: string;
  readonly activeBuckets: number;
  readonly reservedTokens: number;
  readonly delayedRequests: number;
  readonly totalDelayMs: number;
  readonly blockedUntil: string | null;
}

export interface EsiRateLimitCoordinator {
  acquire(input: {
    readonly operationId: string;
    readonly policy: JsonValue;
    readonly characterId: number | null;
    readonly signal: AbortSignal;
  }): Promise<EsiRateLimitLease>;
  observe(lease: EsiRateLimitLease, response: Response): void;
  snapshot(): EsiRateLimitSnapshot;
}
