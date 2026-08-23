export interface CoordinationLease {
  readonly key: string;
  readonly ownerId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly attempt: number;
}

export interface CoordinationLeaseRepository {
  acquire(key: string, ownerId: string, now: string, expiresAt: string): CoordinationLease | null;
  renew(key: string, ownerId: string, expiresAt: string): boolean;
  release(key: string, ownerId: string): boolean;
  removeExpired(now: string): number;
}
