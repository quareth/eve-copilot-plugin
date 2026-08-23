import type { CoordinationLease } from './coordination-lease-repository.js';

export type RefreshLease = CoordinationLease;

export interface TokenRefreshCoordinator {
  acquire(characterId: number, ownerId: string, now: string, expiresAt: string): RefreshLease | null;
  renew(characterId: number, ownerId: string, expiresAt: string): boolean;
  release(characterId: number, ownerId: string): boolean;
  removeExpired(now: string): number;
}
