import type { ResultWarning } from './warning.js';
import { RESULT_SCHEMA_VERSION } from './versions.js';

export type SourceKind = 'local' | 'ESI' | 'SDE' | 'computed' | 'community' | 'user_guide';
export type CacheState = 'not_applicable' | 'miss' | 'hit' | 'revalidated' | 'stale';

export interface ResultSource {
  readonly kind: SourceKind;
  readonly name: string;
  readonly operation?: string | undefined;
  readonly version?: string | undefined;
}

export interface CharacterRef {
  readonly id: number;
  readonly name: string;
}

export interface ResultEnvelope<T> {
  readonly schema_version: typeof RESULT_SCHEMA_VERSION;
  readonly request_id: string;
  readonly character: CharacterRef | null;
  readonly data: T;
  readonly source: ResultSource;
  readonly retrieved_at: string;
  readonly expires_at: string | null;
  readonly cache: CacheState;
  readonly estimated: boolean;
  readonly partial: boolean;
  readonly warnings: readonly ResultWarning[];
}

export function localResult<T>(input: {
  readonly requestId: string;
  readonly retrievedAt: Date;
  readonly data: T;
  readonly warnings?: readonly ResultWarning[];
  readonly partial?: boolean;
}): ResultEnvelope<T> {
  return {
    schema_version: RESULT_SCHEMA_VERSION,
    request_id: input.requestId,
    character: null,
    data: input.data,
    source: { kind: 'local', name: 'EVE Copilot MCP' },
    retrieved_at: input.retrievedAt.toISOString(),
    expires_at: null,
    cache: 'not_applicable',
    estimated: false,
    partial: input.partial ?? false,
    warnings: input.warnings ?? [],
  };
}
