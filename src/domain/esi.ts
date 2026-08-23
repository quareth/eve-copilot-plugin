import { AppError } from './errors.js';

export type EsiOperationId = string;

export interface EsiCharacterIdentity {
  readonly characterId: number;
  readonly name: string;
  readonly corporationId: number;
  readonly allianceId: number | null;
}

export interface EsiCharacterLocation {
  readonly solarSystemId: number;
  readonly stationId: string | null;
  readonly structureId: string | null;
}

export interface EsiCharacterShip {
  readonly shipItemId: string;
  readonly shipTypeId: number;
  readonly shipName: string;
}

export interface EsiValue<T> {
  readonly value: T;
  readonly operationId: EsiOperationId;
  readonly retrievedAt: string;
  readonly expiresAt: string;
  readonly cache: 'miss' | 'hit' | 'revalidated' | 'stale';
}

export function canonicalUnsignedId(value: unknown, field: string): string {
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: `EVE ESI returned an invalid ${field}.`,
  });
}
