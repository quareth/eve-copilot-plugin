# Manual MCP client compatibility

Client compatibility is a release gate. Automated protocol and package
coverage lives in `tests/contract/` and `scripts/package-smoke.mjs`; supported
integration levels are documented in
[`host compatibility`](../../docs/client-setup/compatibility-matrix.md).

Before a release, verify the packed installation with:

- ChatGPT/Codex;
- Claude Desktop;
- MCP Inspector as the independent protocol client.

Verify representative semantic and bounded calls, resource/template reads,
shutdown behavior, and host-specific limitations. The default surface is 65
tools, three static resources, and four templates (capability detail plus three
SDE templates); action tools must be absent.
No compatibility fixture may contain credentials, personal paths, or production
application data.
