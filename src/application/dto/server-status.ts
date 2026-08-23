export interface ServerStatusData {
  readonly name: 'eve-copilot-mcp';
  readonly version: string;
  readonly status: 'ready' | 'degraded';
  readonly transport: 'stdio';
  readonly protocol: {
    readonly sdk_major: 2;
    readonly negotiated_version: string | null;
  };
  readonly database_schema_version: number;
  readonly capabilities: {
    readonly available: number;
    readonly degraded: number;
    readonly disabled: number;
    readonly planned: number;
  };
}
