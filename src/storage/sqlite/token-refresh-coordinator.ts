import type {
  RefreshLease,
  TokenRefreshCoordinator,
} from '../../application/ports/token-refresh-coordinator.js';
import type { CoordinationLeaseRepository } from '../../application/ports/coordination-lease-repository.js';
import { assertCharacterId } from '../../domain/character.js';
import type { DatabaseHandle } from './database-handle.js';
import { SqliteCoordinationLeaseRepository } from './coordination-lease-repository.js';

export class SqliteTokenRefreshCoordinator implements TokenRefreshCoordinator {
  readonly #leases: CoordinationLeaseRepository;

  constructor(input: DatabaseHandle | CoordinationLeaseRepository) {
    this.#leases = 'raw' in input ? new SqliteCoordinationLeaseRepository(input) : input;
  }

  acquire(characterId: number, ownerId: string, now: string, expiresAt: string): RefreshLease | null {
    assertCharacterId(characterId);
    return this.#leases.acquire(leaseKey(characterId), ownerId, now, expiresAt);
  }

  renew(characterId: number, ownerId: string, expiresAt: string): boolean {
    assertCharacterId(characterId);
    return this.#leases.renew(leaseKey(characterId), ownerId, expiresAt);
  }

  release(characterId: number, ownerId: string): boolean {
    assertCharacterId(characterId);
    return this.#leases.release(leaseKey(characterId), ownerId);
  }

  removeExpired(now: string): number {
    return this.#leases.removeExpired(now);
  }
}

function leaseKey(characterId: number): string {
  return `refresh:${String(characterId)}`;
}
