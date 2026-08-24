# Claude Code plugin and Claude Desktop setup

EVE Copilot supports two Claude integration levels:

- **Claude Code plugin:** installs the topic-gated EVE gateway plus setup,
  persona, exploration, combat, and mining skills, four preparation/live
  subagents, and the local MCP server as one package.
- **Classic Claude Desktop MCP:** exposes the same MCP tools and resources, but
  does not load Claude Code's plugin skills or subagents.

Both paths use EVE Copilot's local `eve-copilot-mcp` capability runtime.
No Anthropic API key or EVE client secret is required by that runtime. EVE
authorization uses the locally configured application ID and PKCE.

## Install the complete Claude Code plugin

Claude Code must be installed and authenticated. Add a clone of this repository
as the marketplace source; the setup skill installs the runtime afterward:

macOS, Linux, or WSL2:

```sh
git clone https://github.com/quareth/eve-copilot-plugin.git
cd eve-copilot-mcp
claude plugin marketplace add "$PWD"
claude plugin install eve-copilot@eve-copilot
```

Native Windows PowerShell:

```powershell
git clone https://github.com/quareth/eve-copilot-plugin.git
Set-Location eve-copilot-mcp
claude plugin marketplace add (Get-Location).Path
claude plugin install eve-copilot@eve-copilot
```

Restart Claude Code or run `/reload-plugins` after installation. The installed
plugin provides:

- `/eve-copilot:eve-copilot`;
- `/eve-copilot:eve-setup`;
- `/eve-copilot:eve-persona`;
- `/eve-copilot:eve-exploration`;
- `/eve-copilot:eve-combat`;
- `/eve-copilot:eve-mining`;
- `eve-copilot:eve-exploration-preparation` and
  `eve-copilot:eve-active-exploration` subagents;
- `eve-copilot:eve-mining-preparation` and `eve-copilot:eve-active-mining`
  subagents;
- the `eve-copilot` MCP server and its tools and resources.

The Claude subagents inherit the model selected by the user. Preparation agents
use medium effort; active-operation agents use low effort. The equivalent Codex
profiles remain separate and continue to use their configured Codex model.

Useful verification commands:

```sh
claude plugin validate .
claude plugin list
claude mcp list
```

## Configure character access

After reloading the plugin, ask Claude Code to **set up EVE Copilot** or invoke
`/eve-copilot:eve-setup`. The skill checks Git, Node.js, npm, and runtime health,
asks before installing anything missing, then builds the runtime under EVE
Copilot's private per-user data directory. It configures the public ESI
User-Agent, supplies the exact callback, guides the official CCP application
form and scope choice, offers the optional faction persona, stores the public
Client ID, installs static data, and runs diagnostics. It never asks for EVE
credentials or a client secret.

Manual command fallback after a manual MCP-only runtime installation:

```sh
eve-copilot-mcp setup --use-default-user-agent
eve-copilot-mcp setup --persona caldari
eve-copilot-mcp setup
eve-copilot-mcp sde install
eve-copilot-mcp doctor
```

The persona choices are `none` (neutral default), `amarr`, `caldari`,
`gallente`, and `minmatar`. Invoke `/eve-copilot:eve-persona` or ask Claude to
change it later, then reload the plugin or start a new session. Persona changes
voice only; it never changes facts, fitting results, risk, or recommendations.

## Classic Claude Desktop: MCP only

If you use classic Claude Desktop rather than Claude Code's plugin surface, add
the server directly to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eve-copilot": {
      "command": "eve-copilot-mcp",
      "args": ["serve"]
    }
  }
}
```

Run the setup commands above before connecting a character. The runtime reads
the same private per-user configuration file in Claude Desktop and Claude Code.

Common configuration locations are:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`

Restart Claude Desktop after changing the file. Organization policy or
client-version changes may restrict developer-configured local servers.

## Current smoke checklist

- Confirm the plugin exposes the five namespaced skills and four subagents in
  Claude Code. Skip this item for classic Claude Desktop.
- Confirm the server connects and exposes 65 tools with EVE actions disabled,
  including the three user-specific EVE Guide tools.
- Call `get_eve_copilot_profile`, `get_server_status`,
  `get_eve_capabilities`, one public semantic tool, and one authorized character
  semantic tool.
- Search the guide and verify a test page round trip retains explicit advisory
  and untrusted-data labels.
- Use `find_eve_capabilities` and `execute_eve_read` to reach a reviewed
  long-tail read without supplying a URL or HTTP method.
- Read the static resources and list the capability-detail, type, system, and
  ship templates if the client exposes MCP resources.
- Submit an unknown input property and confirm schema validation rejects it.
- Confirm action tools are absent by default. If actions are deliberately
  enabled, confirm preparation and exact confirmation are two distinct calls.
- Restart the client and confirm the child process terminates cleanly.
