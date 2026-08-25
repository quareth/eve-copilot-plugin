# Plugin, skill, and agent-profile system

## Architecture

EVE Copilot is the installable plugin. Its native client packages share one set
of EVE skills and include a local MCP capability layer:

```text
ChatGPT/Codex or Claude Code
        |
plugins/eve-copilot                 shared installable EVE Copilot plugin
        |-- .codex-plugin           Codex manifest
        |-- .claude-plugin          Claude Code manifest
        |-- .mcp.json               Codex MCP configuration
        |-- .claude-mcp.json        Claude Code MCP configuration
        |-- skills/eve-copilot      topic-gated identity and EVE routing
        |-- skills/eve-setup        installation and CCP application guidance
        |-- skills/eve-uninstall    ordered plugin and private-data removal
        |-- skills/eve-persona      shared faction voice selection and rules
        |-- skills/eve-exploration  exploration workflow and knowledge
        |-- skills/eve-wormhole-expedition  temporary guide-backed wormhole graph
        |-- skills/eve-combat       combat ship, fit, and operating guidance
        |-- skills/eve-mining       mining campaign, fit, and live guidance
        |-- skills/eve-hauling      compact personal cargo movement guidance
        |-- agents                  Claude Code preparation/live agents
        |
.codex/agents                       Codex-only spawned agent profiles
        |
EVE Copilot MCP server              agent-managed local data and action capability
        |
EVE client, ESI, SDE, and protected local storage
```

The plugin is the product boundary. Within it, the MCP capability server is the
source of tools, schemas, authorization, and structured results. It does not
host a model, hold a conversation, or run a persistent agent. The shared plugin
directory combines that runtime with one canonical copy of the reusable model
instructions. Codex and Claude Code read their own manifests and MCP
configurations from that directory. Their custom agents are optional
client-native profiles for bounded sessions; they are not MCP-hosted services
and do not stay alive as permanent peers.

The native package files are:

- plugin manifest: `plugins/eve-copilot/.codex-plugin/plugin.json`;
- MCP launcher configuration: `plugins/eve-copilot/.mcp.json`;
- Claude plugin manifest: `plugins/eve-copilot/.claude-plugin/plugin.json`;
- Claude MCP configuration: `plugins/eve-copilot/.claude-mcp.json`;
- distributable skills: `plugins/eve-copilot/skills/<skill-name>/SKILL.md`;
- Claude plugin agents: `plugins/eve-copilot/agents/<agent-name>.md`;
- repository skill discovery: `.agents/skills/<skill-name>`;
- project-scoped Codex custom agents: `.codex/agents/<agent-name>.toml`;
- Codex marketplace: `.agents/plugins/marketplace.json`;
- Claude marketplace: `.claude-plugin/marketplace.json`.

The `eve-setup` skill owns installation readiness across hosts. It detects the
runtime and platform, writes validated per-user configuration through
`eve-copilot-mcp setup`, guides the authenticated CCP application and scope
steps without collecting credentials, installs static data, and proves the
result with doctor and connection checks. It also offers the optional faction
persona during first setup without inferring a choice from character data.

The separate `eve-uninstall` skill owns removal. It inventories every installed
layer, removes character credentials before deleting their SQLite references,
cleans application-managed data before uninstalling the runtime, and removes
host plugin and marketplace registrations last. The Git checkout remains a
separately confirmed user-owned path rather than being treated as cache.

The source standards are OpenAI's current
[plugin architecture](https://developers.openai.com/plugins/concepts/plugins),
[skill authoring](https://learn.chatgpt.com/docs/build-skills), and
[custom subagent](https://learn.chatgpt.com/docs/agent-configuration/subagents)
documentation, plus Claude Code's current
[plugin reference](https://code.claude.com/docs/en/plugins-reference) and
[marketplace format](https://code.claude.com/docs/en/plugin-marketplaces).

Each repository discovery entry is a symlink to its canonical plugin skill, so
local authoring and plugin distribution cannot silently diverge.

## Shared faction persona

`eve-copilot` is the topic-gated gateway for in-game EVE Online requests. Its
description covers gameplay, lore, pilot advice, and specialized workflows,
while explicitly excluding plugin setup, configuration, diagnostics, persona
management, development, testing, documentation, repository work, and unrelated
topics. When selected, it reads the runtime profile, establishes the in-universe
copilot identity for that gameplay task, and routes specialized work to the
appropriate domain skill. Software-management skills retain the host's neutral
voice.

`eve-persona` owns the persisted profile and its configuration workflow. It
supports `none`, `amarr`, `caldari`, `gallente`, and `minmatar`; `none` is the
default.
The selection is stored as `persona_faction` in per-user runtime configuration
and exposed to every EVE workflow by the read-only
`get_eve_copilot_profile` tool. The gateway, specialized gameplay skills, and
native agent wrappers load that profile before non-urgent advisory work. Live
agents still put the immediate action before any flavor.

The persona changes wording and identity only. Facts, calculations, fitting
validation, evidence standards, risk, safety boundaries, and ship or module
recommendations remain faction-neutral. The system never treats the selected
persona as the character's race, bloodline, corporation, or faction-warfare
allegiance.

Setup can store the initial choice, and the same command changes or resets it:

```sh
eve-copilot-mcp setup --persona <none|amarr|caldari|gallente|minmatar>
```

The MCP runtime loads configuration at startup, so the host must be restarted
or a new task opened after a change. Topic-gated skill activation keeps the
identity scoped to in-game EVE assistance without writing a global
`~/.codex/AGENTS.md`, which would also change software work and unrelated Codex
tasks.

## EVE exploration

`eve-exploration` contains the provider-portable workflow. It always retrieves
available character, ship, fit, fleet, route, and activity facts from MCP before
asking the pilot. It asks only for preferences or live game observations the
MCP cannot see.

Codex and Claude Code each expose two native agents selecting the same operating
profiles:

- `eve_exploration_preparation`: medium-reasoning comprehensive expedition design;
- `eve_active_exploration`: low-effort, action-first live guidance.

These are profiles, not application "modes." A parent session invokes the
appropriate native profile for a bounded task and receives its result. Codex
profiles use the configured GPT-5.6 Sol reasoning level. Claude profiles inherit
the user's selected Claude model and map preparation to medium effort and live
guidance to low effort.

## EVE wormhole expeditions

`eve-wormhole-expedition` records an explicitly reported temporary wormhole
chain in the existing character-scoped EVE Guide. It grounds start and arrival
systems with `get_current_location`, lets the model dynamically manage the
guide page and graph representation, and stores both the departure signature
and destination-side return bookmark for each completed jump. Route-home
requests traverse those labeled observations back to the starting system.

This skill is orchestration only. It adds no mapper provider, fixed guide page
identity, database schema, MCP tool, polling process, or native agent profile.

## EVE mining

`eve-mining` plans and supports complete mining operations across ore,
Mercoxit, ice, gas, moon resources, missions, campaigns, Prismaticite,
wormholes, Pochven, and industrial-command fleets. It retrieves the selected
character's actual skills, ship, fittings, assets, location, fleet context, and
available logistics before selecting a resource, hull, fit, or fleet branch.

The Codex and Claude Code agents expose the same preparation/live split used by
exploration:

- `eve_mining_preparation`: medium-reasoning operation, fitting, fleet,
  logistics, economics, and extraction design;
- `eve_active_mining`: low-effort, action-first guidance while the pilot is
  mining or exposed in space.

Every final mining fit uses character-aware fitting analysis for the mechanics
material to that operation. CPU, powergrid, physical fitting constraints,
requirements, and charge/crystal compatibility are checked when used; drone
and capacitor states are requested only when the fit and operating plan make
them relevant. Unsupported yield, cycle, residue, range, hold, compression,
tank, agility, burst, and live-state claims remain explicitly sourced,
estimated, or marked for in-game verification.

## EVE hauling

`eve-hauling` plans compact personal cargo moves, asset relocation, solo
mining or PI deliveries, and specific courier contracts. It starts from the
selected character's current location, skills, owned ships, relevant assets,
origin, destination, and cargo rather than producing a generic hauling guide.

The provider-native agents use the same preparation/live split without turning
routine hauling into a large optimization task:

- `eve_hauling_preparation`: medium-reasoning ship, fit, trip, route, and
  delivery planning before undocking;
- `eve_active_hauling`: low-effort, action-first hold, jump, dock, reroute,
  turn-back, and delivery guidance while cargo is moving.

The skill uses the shared fitting analyzer for fit legality and labels current
unsupported hauling metrics—including effective hold capacity, align, warp,
tank, signature, warp strength, cloak travel, and jump performance—as sourced,
estimated, pilot-reported, or requiring in-game verification. Advanced public
contract discovery, capital logistics, cyno networks, and large multi-stop
optimization remain conditional rather than part of ordinary personal moves.

## Local development and installation

Build the capability runtime before testing the plugin:

```sh
npm ci
npm run build
npm run check:plugin
```

The plugin uses a cross-platform Node.js launcher. In the source tree it resolves
the repository's `dist/cli/main.js`; from a client's plugin cache it resolves
the runtime installed by `scripts/install-eve-copilot-mcp.mjs` under the private
per-user EVE Copilot data directory. The installer clones the canonical source,
runs `npm ci`, builds native dependencies for the current OS and architecture,
verifies the runtime version, and atomically activates it. It does not require a
global npm installation. `npm ci` enforces the committed lockfile and package
integrity metadata; dependency license files remain with the private local
installation. This works on native Windows, macOS, Linux, and WSL2.

The plugin does not embed credentials. Its MCP configuration passes only
approved EVE Copilot environment overrides into the local process. Refresh
credentials remain in the operating-system credential store.

### Repository-local marketplace

The Codex marketplace catalog is `.agents/plugins/marketplace.json`; the Claude
Code catalog is `.claude-plugin/marketplace.json`. Both `eve-copilot` entries
point to the same canonical `plugins/eve-copilot` directory and keep the MCP
server local over stdio.

Register this non-default marketplace once, then install the plugin:

```sh
codex plugin marketplace add quareth/eve-copilot-plugin --ref main
codex plugin add eve-copilot@eve-copilot
```

For repository-local development, replace the GitHub owner/repository argument
with `"$REPO_ROOT"`. After installation, start a new task and ask Codex to set
up EVE Copilot. The setup skill owns prerequisite checks, runtime installation,
configuration, SDE installation, and verification.

Claude Code repository-local development equivalent:

```sh
claude plugin marketplace add "$REPO_ROOT"
claude plugin install eve-copilot@eve-copilot
```

In native Windows PowerShell, replace `$REPO_ROOT` with
`(Get-Location).Path` when the current directory is the repository root.

After changing the plugin, increment the shared product version and reinstall or
update it in each host. Then start a new session or reload plugins so each client
loads the updated skills, agents, and MCP definition.

## Adding another skill

Every skill that creates, recommends, compares, or materially changes a ship
fitting must use `analyze_fitting_changes` before presenting the final fit. It
must select the fitting baseline that matches the task and calculate with the
selected character's active skills. The skill should validate only the
mechanics relevant to that fitting and activity—for example CPU and powergrid
for every fitted module set, drones only when used, and capacitor profiles only
for material operating states. Unrelated returned metrics must not become
artificial acceptance criteria.

This contract applies equally to combat, exploration, mining, and future
industry, hauling, logistics, or other fitting-producing skills. Skills that do
not create or change a fitting do not call the capability merely as ceremony.

Every EVE advisory skill must also read `get_eve_copilot_profile` once near the
start of a non-urgent workflow and apply only its voice rules. This keeps future
skills consistent with the user's selected identity without duplicating the
profiles or allowing flavor to influence the answer.

1. Create `plugins/eve-copilot/skills/<skill-name>/SKILL.md` with a
   discriminating `name` and `description`.
2. Put detailed mechanics in `references/` and keep `SKILL.md` focused on
   routing, invariants, and outputs.
3. Add `agents/openai.yaml` when the skill needs display metadata or invocation
   policy.
4. Add a repository symlink under `.agents/skills/` so the canonical plugin
   skill is available while working in this checkout.
5. Run the skill validator, `npm run check:plugin`, and
   `claude plugin validate .`.

Both clients discover the shared `skills/` directory, so adding a skill does not
require a second copy or another manifest field.

## Adding another Codex agent profile

Create one TOML file under `.codex/agents/`. Every profile must define `name`,
`description`, and `developer_instructions`. Keep it narrow, reference the
canonical skill that owns domain knowledge, and set model/reasoning only when
the profile has a real latency or depth requirement. Omitted MCP and skill
settings inherit from the parent session.

Do not copy the skill's domain instructions into the agent profile. The skill
is the reusable workflow; the profile should contain only role, response style,
reasoning, and boundaries. Every EVE agent profile must also load
`$eve-persona` and the runtime profile before advisory work.

## Adding the equivalent Claude Code agent

Create a Markdown agent under `plugins/eve-copilot/agents/` with YAML
frontmatter containing `name`, `description`, `model`, `effort`, `skills`, and
appropriate tool restrictions. Use `model: inherit` so installation does not
override the user's Claude model choice. Preload the same canonical skill named
by the Codex profile and map preparation/live latency requirements to Claude's
supported effort levels. Preload `eve-persona` alongside the domain skill so
both native agent formats share the selected voice and presentation boundary.

Codex TOML and Claude Markdown are separate native wrappers. Keep their role,
response style, and safety boundary aligned without copying domain knowledge out
of the shared skill.

## Exploration data boundary

Known-space routing can use current ESI routes plus latest one-hour jumps and
kills. It has no stored history, current Local, cosmic-signature list, or
wormhole activity. Wormhole chains, D-scan, Local, signature results, and
connection condition therefore come from authorized bookmarks/private mappers
or concise pilot observations. Missing bounded activity data remains unknown,
not zero.

DOTLAN scraping and an activity-history database remain out of scope.

## EVE combat

`eve-combat` is the provider-portable PvP and PvE combat copilot. It starts with
the selected character's actual location, ship, trained skills, skill queue,
owned hulls, assets, saved fittings, fleet context, and relevant public ESI
evidence. It asks the pilot only for decisions and live observations that the
server cannot retrieve.

The skill treats fitting as a constrained multi-objective problem. It selects
or evaluates a ship against the exact activity, space, fleet role, opposition,
budget, loss policy, deployment, and desired engagement envelope. It proves
recursive hard skill requirements and the fitting metrics currently supported
by `analyze_fitting_changes`, while labeling complete damage, tank, application,
mobility, EWAR, logistics, and capital-mode performance as estimates or
in-game-verification requirements until the MCP exposes those metrics.

Its entrypoint routes to focused references for ship and fit design, solo and
small-gang PvP, fleets and strategic objectives, PvE encounters, environmental
rules, and live output. Volatile campaign, seasonal, site, balance, sovereignty,
Pochven, and objective rules require a current official-source check rather
than being frozen into static fit tables.
