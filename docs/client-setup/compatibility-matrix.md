# Host compatibility

EVE Copilot supports two integration levels. Plugin hosts receive the complete
assistant experience; other MCP-compatible hosts receive the local capability
server only.

| Host | Integration | Supported experience |
|---|---|---|
| ChatGPT/Codex desktop and CLI | Native Codex plugin | Setup, persona, gameplay skills, preparation/live agent profiles, MCP tools, and resources |
| Claude Code | Native Claude plugin | Setup, persona, gameplay skills, preparation/live subagents, MCP tools, and resources |
| Claude Desktop | Local MCP over stdio | MCP tools and resources only |
| Cursor and other MCP-compatible clients | Local MCP over stdio | MCP tools and resources only; exact resource and template support depends on the host |
| MCP Inspector | Local MCP over stdio | Protocol inspection and manual interoperability checks |

All supported paths require Node.js 24, 25, or 26 and the built
`eve-copilot-mcp` runtime. The native plugin setup skill checks and installs
these requirements after permission. Native plugin installation is documented in the
[ChatGPT/Codex guide](./chatgpt-codex.md) and [Claude guide](./claude-desktop.md).
The provider-neutral path is documented in the
[MCP Inspector guide](./third-client.md).

Automated contract tests cover protocol negotiation, tool and resource
discovery, strict input validation, representative reads, package installation,
plugin-cache launching, and clean shutdown. Tool counts and schema versions are
implementation details verified by the current test suite rather than stable
host-support promises.
