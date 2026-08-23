import type { EsiOperationId } from '../../domain/esi.js';

export interface EsiCacheEntry {
  readonly cacheKey: string;
  readonly operationId: EsiOperationId;
  readonly compatibilityDate: string;
  readonly characterId: number | null;
  readonly authorizationGeneration: number | null;
  readonly requestVariantHash: Uint8Array;
  readonly responseStatus: number;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly freshUntil: string;
  readonly staleUntil: string | null;
  readonly validatedPayloadJson: string;
  readonly byteSize: number;
  readonly accessedAt: string;
  readonly createdAt: string;
}

export interface EsiCacheRepository {
  find(cacheKey: string, accessedAt: string): EsiCacheEntry | null;
  put(entry: EsiCacheEntry): void;
  remove(cacheKey: string): boolean;
  invalidateCharacter(characterId: number): number;
  pruneTo(maximumBytes: number): number;
  totalBytes(): number;
}
