# ChatGPT/Codex desktop setup

EVE Copilot is installed as a local ChatGPT/Codex plugin. The plugin includes
a topic-gated EVE gateway, guided setup, a shared optional faction persona,
exploration, wormhole-expedition, combat, mining, and hauling skills, plus a
launcher for the agent-managed local MCP capability server used for EVE data
and deterministic checks.

## Install the complete plugin from GitHub

Add the GitHub repository as a Codex marketplace and install the plugin:

```sh
codex plugin marketplace add quareth/eve-copilot-plugin --ref main
codex plugin add eve-copilot@eve-copilot
```

The downloaded plugin contains skills, manifests, assets, and a cross-platform
launcher. It does not contain compiled JavaScript, `node_modules`, or native
binaries.

Restart the ChatGPT desktop app, use a new task, and say **“Set up EVE
Copilot.”** The automatically selected `eve-setup` skill checks Git, Node.js
24–26, npm, and runtime health. It asks before installing missing prerequisites
or downloading and building the runtime. The runtime and its platform-specific
dependencies are installed under EVE Copilot's private per-user data directory,
without a global npm package or administrator-level npm writes.

The same skill configures public ESI, guides the authenticated CCP application
step, installs the SDE, offers a neutral or empire-faction copilot voice, and
verifies readiness. Restart Codex once more when prompted so the plugin's MCP
process attaches to the newly installed runtime.

## Guided configuration

The setup skill invokes these operations through the plugin's cached launcher
rather than asking the user to edit configuration manually:

```sh
eve-copilot-mcp setup --use-default-user-agent
eve-copilot-mcp setup --persona minmatar
eve-copilot-mcp setup
eve-copilot-mcp sde status
eve-copilot-mcp doctor
```

The first command stores a CCP-compliant User-Agent containing the public
project URL. Character-aware features additionally need a public Client ID
from an application the user creates while signed into the official EVE
Developers Portal. The skill supplies the callback and current scope list,
guides the form, and stores that ID with the setup command. It never requests
the user's EVE password, authenticator code, tokens, or a client secret.

The persona choices are `none` (the neutral default), `amarr`, `caldari`,
`gallente`, and `minmatar`. Ask **“Change EVE Copilot's persona to Gallente”**
at any time, or use `eve-copilot-mcp setup --persona gallente`, then restart
ChatGPT/Codex or begin a new task. The choice changes style only, not evidence,
calculations, risk, or recommendations.

The `eve-copilot` gateway is considered for in-game EVE Online requests,
including gameplay and lore questions that do not belong to combat,
exploration, mining, or hauling. It loads the selected persona before answering
and keeps that identity confined to gameplay and pilot advice. Plugin setup,
configuration, diagnostics, persona management, development, documentation,
repository work, and unrelated ChatGPT requests retain the normal host voice.

## MCP-only compatibility setup

Use this section only when the host cannot install the complete plugin. It
registers the capability server directly and therefore does not load EVE
Copilot's skills or agent profiles.

1. Clone the repository, run `npm ci` and `npm run build`, then run
   `npm install --global .`. This manual global install is only for MCP-only
   clients; the complete Codex plugin uses its setup skill instead.
2. Open the client's MCP server settings.
3. Add a local STDIO server named `eve-copilot`.
4. Run `eve-copilot-mcp setup --use-default-user-agent`, then set the command
   to `eve-copilot-mcp` and the argument to `serve`. In the EVE Developers Portal,
   assign every read scope you intend this client ID to request; EVE SSO rejects
   unassigned scopes as `invalid_scope` before returning to the local callback.
5. Save the configuration and restart the client.

The default authorization flow adds scopes only when a capability needs them.
If the EVE developer application already has all documented read scopes
assigned, call `reauthorize_character` once with `scope_mode: "all_reads"` to
approve all 64 reviewed read scopes in a single EVE consent flow. This does not
request or enable action permissions.

Codex CLI equivalent:

```sh
codex mcp add eve-copilot -- eve-copilot-mcp serve
codex mcp list
```

Manual `~/.codex/config.toml` equivalent:

```toml
[mcp_servers.eve-copilot]
command = "eve-copilot-mcp"
args = ["serve"]
required = true
startup_timeout_sec = 10
tool_timeout_sec = 60
```

## Current smoke checklist

- With EVE actions disabled, confirm exactly 65 tools are visible, including
  `get_eve_copilot_profile`, `search_eve_guide`, `read_eve_guide_page`, and
  `maintain_eve_guide`. Enabling at
  least one action family adds `prepare_eve_action`, `execute_eve_action`, and
  the fixed-purpose preparation wrappers belonging to the selected families.
- Call `get_eve_copilot_profile`, `get_server_status`,
  `get_server_diagnostics`, and `get_eve_capabilities`.
- Search the empty guide, create one non-sensitive advisory test page, read it
  back, confirm the `user_guide` and `advisory` labels, then remove it.
- Confirm common goals expose named tools such as `get_market_price`,
  `get_skill_plan`, and `search_assets`.
- Search the long tail with `find_eve_capabilities`, then call an allowed read
  through `execute_eve_read`.
- Read `eve://capabilities`, `eve://server/info`, and `eve://coverage`.
- List the capability-detail template plus the three SDE resource templates
  for types, systems, and ships. Install
  the SDE explicitly with `eve-copilot-mcp sde install` before reading them.
- Use `eve-copilot-mcp setup` to configure the EVE Client ID, connect a
  character, and verify that
  missing scopes lead to the explicit reauthorization flow rather than a
  generic failure. The selected scope must also be assigned to that client ID's
  EVE developer application registration.
- Confirm action tools are absent by default. If testing actions, use a test
  character, enable only one action family, and follow
  [action safety](../action-safety.md).
- Restart the client and confirm the server exits and reconnects cleanly.

No OpenAI API key or EVE client secret is required. EVE authorization uses PKCE,
and refresh credentials are protected by the operating-system credential store.
