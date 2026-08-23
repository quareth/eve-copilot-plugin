import type { ResultWarning } from '../../domain/warning.js';

export type ComponentState = 'ok' | 'degraded' | 'unavailable' | 'not_configured' | 'planned';
export type DiagnosticGroup = 'runtime' | 'storage' | 'registry' | 'transport' | 'planned_adapters';

export interface ComponentCheck {
  readonly id: string;
  readonly state: ComponentState;
  readonly message: string;
  readonly checked_at: string;
  readonly version?: string;
  readonly warnings: readonly ResultWarning[];
}

export interface HealthCheck {
  readonly id: string;
  readonly group: DiagnosticGroup;
  readonly mandatory: boolean;
  run(signal: AbortSignal): Promise<ComponentCheck>;
}

export interface DatabaseMetadata {
  readonly schemaVersion: number;
  readonly mode: string;
}

export interface DatabaseMetadataPort {
  inspect(full: boolean): DatabaseMetadata;
}

export interface ProtocolStatePort {
  negotiatedVersion(): string | null;
}
