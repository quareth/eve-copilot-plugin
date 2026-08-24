---
name: eve-setup
description: Install, configure, diagnose, and repair the local EVE Copilot plugin and runtime. Use when the user asks to install or set up EVE Copilot, configure ESI or EVE SSO, create the required CCP application, install static data, connect the first character, or fix an incomplete installation; do not use for ordinary gameplay planning after setup is healthy.
---

# EVE Copilot setup

Own the setup outcome. Do not give the user a pile of unexplained URLs, callback
addresses, environment variables, or JSON to edit. Inspect the machine, perform
safe local configuration directly, and guide only the CCP account steps that
cannot be completed without the user's authenticated portal session.

Use the normal neutral host voice throughout installation, configuration,
diagnostics, and repair. The selected faction persona may be displayed or
changed during setup, but do not apply its roleplay voice to setup guidance
unless the user explicitly asks for a preview. Persona must never alter
security, privacy, scope, diagnostic, or installation decisions.

## Establish current state first

1. Determine the operating system and whether Git, Node.js 24–26, npm, Codex,
   and the managed EVE Copilot runtime are available. Do not reinstall a
   healthy component.
2. When a supported Node.js executable is available, resolve the installed
   plugin root from this skill's location, then run:

   ```text
   node <plugin-root>/scripts/install-eve-copilot-mcp.mjs status
   ```

   Treat its JSON as authoritative for prerequisites and runtime health.
3. Run the launcher with `setup` when the runtime exists. Its JSON is the
   authoritative local configuration status, callback URI, developer-portal
   URL, and scope count.
4. Run the launcher with `sde status` and `doctor`. Treat a
   missing User-Agent, client ID, SDE, protected credential store, or runtime as
   a concrete setup step rather than asking the user to interpret diagnostics.

The setup output also reports `configuration.persona`. During first setup, if
its source is `default`, offer one optional presentation choice: `None`
(recommended), `Amarr`, `Caldari`, `Gallente`, or `Minmatar`. Explain that this
changes the AI copilot's voice only and has no effect on character allegiance,
recommendations, fitting math, or game actions. Never infer it from the user's
character. If the user declines or has no preference, keep `none`.

## Install the plugin and managed runtime

For a fresh Codex installation, register the repository marketplace and install
the small plugin directly from GitHub:

```text
codex plugin marketplace add quareth/eve-copilot-plugin --ref main
codex plugin add eve-copilot@eve-copilot
```

If this skill is already running from an installed plugin, do not repeat those
commands. If it is running from a source checkout and the plugin is absent, the
two marketplace writes are within an explicit EVE Copilot installation request.
Do not clone a user-visible checkout merely to install the plugin.

The plugin intentionally does not contain `node_modules`, compiled JavaScript,
or native binaries. The setup installer downloads the matching source into the
private per-user EVE Copilot data directory, installs dependencies for the
current OS and architecture, builds the MCP runtime there, verifies its version,
and activates it atomically. It does not use a global npm installation.

Before making changes:

1. Run the installer `status` command above.
2. If Git, npm, or a supported Node.js version is missing, explain exactly what
   is missing and ask for permission before installing system prerequisites.
   npm normally arrives with Node.js. Use an already available trusted package
   manager appropriate to the platform; do not bootstrap a new package manager
   or use an opaque remote shell script without separate permission.
3. If the runtime is missing or unhealthy, tell the user that the next step
   clones the public EVE Copilot repository, runs `npm ci`, builds native
   dependencies for this computer, and stores the result under the private EVE
   Copilot data directory. Ask for one explicit confirmation.
4. After confirmation, run:

   ```text
   node <plugin-root>/scripts/install-eve-copilot-mcp.mjs install
   ```

5. Run `status` again and require `runtime.healthy: true` with a version equal
   to `expected_version`. Then invoke all runtime commands through:

   ```text
   node <plugin-root>/scripts/launch-eve-copilot-mcp.mjs <arguments>
   ```

If an existing runtime is healthy, preserve it. If installation fails, report
the failing prerequisite or build step and keep the previously active runtime;
do not fall back to broad global package changes.

## Configure what can be automated

When the ESI User-Agent is missing, run through the plugin launcher:

```text
node <plugin-root>/scripts/launch-eve-copilot-mcp.mjs setup --use-default-user-agent
```

This stores a validated identifier containing the public project URL as CCP's
contact. Offer a custom email or URL only when the user prefers one; do not make
them invent HTTP header syntax.

The callback is generated by the runtime and should normally remain
`http://127.0.0.1:17600/oauth/callback`. Do not ask the user to choose an IP,
port, or path. Always copy the exact callback reported by `eve-copilot-mcp
setup` into the CCP application registration.

## Guide the CCP application when private data is wanted

Public ESI and local static data do not require a character connection. If the
user wants character skills, assets, location, fittings, wallet, corporation,
or other private context, read
[CCP application and scopes](references/ccp-application.md).

Open the official developer-application page when browser control is available.
Let the user perform the EVE login themselves. Never ask for, view, store, or
relay an EVE account password or authenticator code. Explain each portal field
in plain language, use the callback from setup status, and obtain the public
Client ID after the application is created. Do not request a client secret; the
runtime uses Authorization Code with PKCE.

Before assigning scopes, ask whether the user wants only the initial
location/ship connection or the recommended full read-only EVE Copilot feature
set. For the exact current read list, run:

```text
node <plugin-root>/scripts/launch-eve-copilot-mcp.mjs setup --show-scopes
```

Use `initial_character_scopes` for minimum access or
`available_read_scopes` for full read-only access. Never assign action scopes
unless the user separately and explicitly opts into the corresponding action
families. If browser control can fill the registration, pause for confirmation
before the final create/save action because it changes the user's CCP account.

Store the Client ID with:

```text
node <plugin-root>/scripts/launch-eve-copilot-mcp.mjs setup --eve-client-id <public-client-id>
```

The setup command validates and writes the correct private per-user config file
on Windows, macOS, or Linux. Prefer it over persistent environment variables or
manual JSON editing.

Store an explicit persona choice with:

```text
node <plugin-root>/scripts/launch-eve-copilot-mcp.mjs setup --persona <none|amarr|caldari|gallente|minmatar>
```

Verify the reported persona afterward. Tell the user they can later ask EVE
Copilot to show, change, or reset its persona; the `eve-persona` skill owns that
workflow. A host restart and new task are required after changing it because
the MCP runtime loads the profile at startup.

## Finish and prove readiness

1. If static data is unavailable, run the plugin launcher with `sde install`.
   Use `sde update` only when an older build is already active.
2. Run the plugin launcher with `doctor` and address every reported next step
   relevant to the user's requested feature level.
3. Directly verify the launcher can run `version`, `setup`, and `doctor` before
   asking for a restart. Restart ChatGPT/Codex after the first runtime install
   or configuration changes and begin a new task so the cached plugin MCP
   process attaches to the now-installed runtime.
4. For character-aware use, call the EVE Copilot character-connection tool,
   open the official authorization URL, and let the user select a character and
   consent. Do not ask for EVE credentials in chat.
5. Verify the character connection and selected character after OAuth returns.

Finish with a compact readiness report covering plugin, runtime, public ESI,
SDE, protected credential storage, CCP application, character connection, and
the selected copilot persona.
Distinguish optional omissions from failures: a user choosing public-only mode
can be ready without a Client ID or connected character.
