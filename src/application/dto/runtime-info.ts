export interface RuntimeInfo {
  readonly name: 'eve-copilot-mcp';
  readonly title: 'EVE Copilot MCP';
  readonly version: string;
  readonly node: string;
  readonly platform: 'darwin' | 'win32' | 'linux' | 'other';
  readonly architecture: string;
  readonly mcpSdkMajor: 2;
}
