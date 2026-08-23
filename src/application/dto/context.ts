export interface Availability<T> {
  readonly status: 'available' | 'unavailable' | 'unresolved';
  readonly value: T | null;
  readonly reason: string | null;
}

export interface LocationData {
  readonly state: 'space' | 'station' | 'structure';
  readonly solar_system: Availability<{ readonly id: number; readonly name: string }>;
  readonly constellation: Availability<{ readonly id: number; readonly name: string }>;
  readonly region: Availability<{ readonly id: number; readonly name: string }>;
  readonly station: Availability<{ readonly id: string; readonly name: string }>;
  readonly structure: Availability<{ readonly id: string; readonly name: string }>;
  readonly sde_build: number;
}

export interface ShipData {
  readonly ship_item_id: string;
  readonly ship_type: Availability<{ readonly id: number; readonly name: string }>;
  readonly player_assigned_name: string;
  readonly sde_build: number;
}

export interface OverviewIdentity {
  readonly character_id: number;
  readonly character_name: string;
  readonly corporation_id: number;
  readonly alliance_id: number | null;
}

export interface OverviewData {
  readonly identity: Availability<OverviewIdentity>;
  readonly location: Availability<LocationData>;
  readonly ship: Availability<ShipData>;
}

export function available<T>(value: T): Availability<T> {
  return Object.freeze({ status: 'available', value, reason: null });
}

export function unavailable<T>(reason: string): Availability<T> {
  return Object.freeze({ status: 'unavailable', value: null, reason });
}

export function unresolved<T>(reason: string): Availability<T> {
  return Object.freeze({ status: 'unresolved', value: null, reason });
}
