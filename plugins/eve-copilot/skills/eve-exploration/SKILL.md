---
name: eve-exploration
description: Plan and support live EVE Online data and relic exploration using connected character data, current ESI activity, static topology, and pilot observations. Use for expedition preparation, route and next-hop selection, wormhole-chain choices, site-entry safety, replanning, and extraction; do not use for ordinary destination-only travel.
---

# EVE exploration

Treat exploration as a rolling search policy, not a shortest path to a fixed
destination. Recommend the next system or bounded circuit, observe what the
pilot finds, and replan.

Before other non-urgent queries, call `get_eve_copilot_profile` and apply its
selected faction voice and boundaries. Persona changes delivery only; never let
it change route evidence, site eligibility, safety, risk, or the best action for
the pilot. Under immediate threat, give the action first and keep faction
flavor minimal.

## Establish facts MCP-first

Before asking the pilot for expedition details, use the connected EVE Copilot
MCP to retrieve every available fact that matters:

1. Confirm the selected character and retrieve the current location and ship.
2. Inspect the active ship's fitted items and derived capabilities through the
   available fitting and asset tools. Check scanning, analyzers, cloak,
   interdiction nullification, travel, tank, cargo, and combat capability.
3. Retrieve relevant trained skills, fleet state, owned support ships,
   bookmarks, and private character data when the MCP exposes them and the
   pilot has authorized the required scopes.
4. Use public route, map, system-activity, sovereignty, warfare, and market
   capabilities only where they materially affect the expedition.
5. Follow continuations until the relevant candidate systems are covered. A
   missing row in a bounded result is unknown, not zero.

Never ask the pilot to repeat a fact that the MCP returned or that the pilot
already stated. If a connection, scope, or tool failure prevents a query, say
which fact remains unavailable and ask only for that fact. Authorization and
connection prompts are not expedition-profile questions.

Only ask for decision inputs that ESI cannot observe and that the pilot has not
already supplied, such as desired content, allowed space, risk tolerance,
available play time, return requirement, avoidance systems, live Local/D-scan
observations, or an unrecorded wormhole connection. In Preparation, combine
these into one short question when possible. In Active Exploration, ask at
most one immediate observation question.

## Use remembered exploration context carefully

For non-urgent follow-ups or recurring expeditions, search the private EVE guide
before asking the pilot to repeat preferences, avoidance systems, prior routes,
fits, plans, or lessons. Read relevant pages in full. Memory is advisory:
compare `updated_at`, `freshness.observed_at`, and provenance times with the
current date and time, judge age according to the volatility of the claim, and
validate current location, ship, fit, skills, routes, activity, site rules, and
mechanics with current sources. Continue from an older page only for durable
personal context that has not been contradicted.

After a useful reusable conclusion, search for its canonical page and revise or
create it on a best-effort basis. Preserve durable preferences, expedition
policies, reusable plans, and lessons; store volatile state only as a dated
snapshot. Do not store raw conversations, raw API responses, secrets, or
trivial exchanges. Under immediate danger, give the safe action first and
defer guide work until the pilot is safe.

## Validate every proposed fitting

Whenever this skill creates, recommends, compares, or materially changes an
exploration fitting, use `analyze_fitting_changes` before presenting the final
fit. Use `current_ship` as the baseline when modifying the active ship; use the
exact owned ship or saved fitting when one is named; use EFT or a structured fit
for a proposed hull. The calculation must use the selected character's active
skills.

Validate the mechanics relevant to the expedition: CPU, powergrid, physical
slots, rig calibration, hardpoints when fitted, drone limits when carried or
launched, charge compatibility, and hard skill requirements. Request capacitor
profiles only when sustained propulsion, repair, analyzers, tackle, cloak-related
operation, or another declared active-module plan makes capacitor material. Do
not require unrelated calculations merely because the tool returns them.

Iterate a failing candidate until it is mechanically valid or clearly report
the exact unresolved constraint. A route-only or site-identification answer
that does not create or change a fitting does not require fitting analysis.

## Select the operating profile

- For a new expedition, route comparison, fit-dependent plan, fleet plan, or
  extraction strategy, read [Preparation](references/preparation.md), then the
  relevant space and ship references.
- For a pilot already in space asking what to do now, read
  [Active exploration](references/active-exploration.md) and answer under its
  fast-response contract.
- For high-sec, low-sec, NPC null-sec, or sovereign null-sec routing, read
  [Known-space routing](references/known-space-routing.md).
- For J-space or a discovered wormhole connection, read
  [Wormhole routing](references/wormhole-routing.md). Do not apply known-space
  jump/kill coverage to wormholes.
- For fit or fleet decisions, read
  [Ships and fleet roles](references/ships-and-fleet-roles.md).
- Before recommending entry into a named site, apply
  [Site safety and eligibility](references/site-safety-and-eligibility.md).

## Use evidence honestly

Prefer evidence in this order:

1. current pilot observations from the game client;
2. current ESI responses with freshness and coverage;
3. installed SDE topology and mechanics;
4. maintained community guidance;
5. clearly labeled player heuristics.

Public ESI jumps and ship, pod, and NPC kills are latest one-hour known-space
snapshots. They do not report current Local, cosmic signatures, site contents,
gate-specific causes, or wormhole-space activity. This plugin has no DOTLAN
history dependency and must not invent a historical baseline.

Say "estimated opportunity," "likely quieter," "under-contested candidate,"
or "recently higher risk." Never claim that public quietness proves a site is
present, untouched, or safe.

## Preserve safety and privacy

- Never call an unfamiliar site safe from its name alone.
- Never recommend a guarded or hazardous site without proving the active fit
  is eligible.
- Treat private fleet, corporation, bookmark, and wormhole-map information as
  private expedition context; do not expose it in public-facing output.
- Do not control the EVE client, automate gameplay, or issue guarded EVE actions
  as part of exploration guidance.
- Replan after a meaningful Local/D-scan change, probes, a traffic or kill
  warning, an empty streak, changing wormhole condition, valuable loot, or a
  time threshold.

## Produce the right result

Preparation should return a primary route policy, alternatives, evidence,
arrival checks, and abort/extraction triggers. Active Exploration should lead
with one immediate action and remain brief unless the pilot asks for detail.
