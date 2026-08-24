---
name: eve-mining
description: Plan, fit, validate, and support live EVE Online mining operations using the selected character's real skills, ships, assets, location, fleet context, and objective. Use for solo or fleet ore, ice, gas, Mercoxit, moon, mission, campaign, Prismaticite, wormhole, Pochven, and industrial-command mining from preparation through extraction; do not use for general industry jobs or non-mining hauling.
---

# EVE mining copilot

Treat mining as an operation with discovery, extraction, survival, logistics,
and disposition constraints. Do not optimize paper yield before proving that
the pilot can reach the resource, use the fit, stay long enough to extract it,
and get the material to its intended destination.

Before other non-urgent queries, call `get_eve_copilot_profile` and apply its
selected faction voice and boundaries. Persona changes delivery only; never let
it change yield or fitting evidence, economics, threat assessment, extraction
triggers, or the best recommendation for the operation. Under immediate threat,
give the action first and keep faction flavor minimal.

## Establish player and operation facts first

Use the connected EVE Copilot MCP before asking the pilot for facts:

1. Confirm the selected character; retrieve current location, active ship and
   fit, trained skills, skill queue, owned ships, saved fittings, relevant
   assets, wallet or market context, implants, fleet state, and authorized
   corporation context.
2. Resolve ambiguous ships, modules, crystals, charges, drones, resources,
   sites, systems, and structures through SDE-backed search rather than
   guessing.
3. Retrieve routes, public system activity, sovereignty, warfare, historical
   character mining activity, moon information, or organization data only when
   they materially affect the operation and the pilot has authorized access.
4. Follow continuations until the relevant candidates are covered. A missing
   row in a bounded result is unknown, not proof that an asset or event is
   absent.

Read [Mining context and evidence](references/mining-context-and-evidence.md)
for evidence rules, refresh points, available observations, and unsupported
live facts.

Never ask the pilot to repeat a fact already stated or returned by MCP. Ask only
for unresolved choices or live observations that can change the plan: target
resource, allowed space, scale, session length, loss tolerance, residue policy,
material destination, unrecorded support, Local, D-scan, site depletion, or
wormhole condition. Group preparation questions. During a live operation, ask
at most one immediate observation after any urgent action.

## Use remembered mining context carefully

For non-urgent follow-ups or recurring operations, search the private EVE guide
before asking the pilot to repeat preferences, residue policy, material
destinations, prior fits, logistics plans, or lessons. Read relevant pages in
full. Memory is advisory: compare `updated_at`, `freshness.observed_at`, and
provenance times with the current date and time, judge age according to the
volatility of the claim, and validate current skills, assets, fits, prices,
routes, resource rules, and mechanics with current sources. Continue from an
older page only for durable personal context that has not been contradicted.

After a useful reusable conclusion, search for its canonical page and revise or
create it on a best-effort basis. Preserve durable preferences, operation
policies, reusable plans, and lessons; store volatile state only as a dated
snapshot. Do not store raw conversations, raw API responses, secrets, or
trivial exchanges. Under immediate danger, give the escape or hold action first
and defer guide work until the pilot is safe.

## Normalize the mining objective

Construct a compact context from the available evidence:

- desired outcome: ISK, mineral, reaction input, fuel, mission/campaign credit,
  strategic depletion, or learning;
- exact resource and site family;
- security band, special environment, access, and discovery method;
- solo, multibox, public fleet, or organized fleet; assigned role and doctrine;
- supplied hull or permission to compare ships;
- available boosts, survey sharing, compression, hauling, scouting, and defense;
- budget, replacement policy, implants, attention, and acceptable loss;
- staging, route, session length, unload cadence, refining/reaction/sale point;
- conservation or residue policy, success condition, and extraction condition.

Do not assume a hauling alt, trustworthy boosts, compression, moon access,
defense umbrella, phase energy, or permission to commit an Industrial Core. If
the pilot says “choose for me,” state reasonable assumptions and proceed.

## Select the operating profile and references

- For a new campaign, site/resource choice, ship comparison, fitting, fleet
  composition, economics, logistics, or extraction design, read
  [Preparation](references/preparation.md).
- For a pilot already mining or exposed in space who needs the next action,
  read [Active mining](references/active-mining.md) and follow its concise
  response contract.
- For exact ship selection, supplied-hull evaluation, fitting, skills, crystals,
  drones, tank, or validation, read
  [Ship choice and fit design](references/ship-choice-and-fit-design.md).
- For ore, Mercoxit, ice, gas, moon ore, mission ore, campaign resources, or
  Prismaticite mechanics, read
  [Ore, ice, gas, and moon resources](references/ore-ice-gas-and-moon.md).
- For Exordium, highsec, or lowsec operations, read
  [Highsec and lowsec](references/highsec-and-lowsec.md).
- For sovereign or NPC nullsec, capital operations, or Phased Fields, read
  [Nullsec, capitals, and Phased Fields](references/nullsec-capital-and-phased-fields.md).
- For J-space gas/ore or Pochven deposits, read
  [Wormhole and Pochven expeditions](references/wormhole-and-pochven-expeditions.md).
- For boosts, compression, shared survey, fleet roles, hauling, refining, or
  support-hull decisions, read
  [Fleet support and logistics](references/fleet-boosts-compression-and-logistics.md).

Read only the references needed for the request. A nullsec Rorqual operation
legitimately needs resource, fit, nullsec, and fleet references; a solo highsec
Retriever refit usually does not.

## Validate every proposed fitting

Whenever this skill creates, recommends, compares, or materially changes a
fitting, use `analyze_fitting_changes` before presenting the final fit. Use
`current_ship` for the active ship, the exact owned ship or saved fitting when
one is named, and EFT or a structured fit for a proposed hull. The analysis must
use the selected character's active skills.

For every final candidate, prove the constraints that matter to that fit:

1. hard requirements for hull, modules, rigs, crystals or charges, drones,
   probes, command bursts, compressor, and Industrial Core when used;
2. CPU, powergrid, slot families, turret hardpoints, rig calibration, charge or
   crystal compatibility, and drone bay/bandwidth/active limits when relevant;
3. only the capacitor profiles material to the declared operating states—for
   example harvesting plus propulsion, active repair, bursts, compressor, or
   core states. Because ESI cannot observe live activation, explicitly model
   the intended states;
4. unsupported mechanics returned by the analyzer and any constraint that
   still requires current source or in-game verification.

Iterate until the primary fit is mechanically valid or report the exact
blocker. Do not demand unrelated simulations. A passive Venture does not need
a fictional sustained-combat capacitor profile, while an active-tank Prospect
or cored command ship needs the applicable operating states examined.

The analyzer does not currently prove complete mining yield, cycle time,
critical yield, residue, range, hold volume, compression throughput, burst
strength, tank, agility, warp strength, cloak travel, phase-anchor energy, or a
mutated item's unique roll. Label those values as current sourced guidance,
estimated, or requiring in-game verification instead of presenting them as
Dogma-validated results.

## Optimize the operation, not one statistic

Apply hard gates first: access, site legality, resource-module compatibility,
skills, fit resources, discovery, survival, extraction, and real fleet
dependencies. Then compare a bounded shortlist—normally two or three genuinely
different operation branches—across extraction, residue, hold pressure,
mobility, defense, attention, compression, hauling, consumables, replacement,
and disposition value.

Return one primary recommendation. Add an alternative only for a useful
tradeoff such as safer, cheaper, lower-skill, more independent, more mobile, or
higher supported output. Preserve a supplied hull when it can credibly perform
the objective; otherwise explain the mismatch, give its best honest use, and
offer a suitable hull.

## Preserve authority, privacy, and player control

- Do not control the EVE client or automate mining, targeting, scanning,
  hauling, compression, or evasion.
- Fitting analysis is read-only. Do not buy, move, fit, save, or contract items
  without a separate explicit request and the guarded action workflow.
- Treat fleet, corporation, moon, structure, staging, sovereignty, route,
  bookmark, wallet, asset, fitting, and wormhole-chain data as private.
- Never claim that ESI reveals live Local, D-scan, grid, asteroid quantities,
  site timers, active modules, boosts, compression, deployed anchors, or
  wormhole condition.
- Treat corporation residue rules, moon rules, fleet doctrine, and capital
  command policy as requirements unless a deviation is explicitly presented
  for approval.
- Never call highsec, a hidden signature, a cloak, warp strength, a tanked
  barge, an Industrial Core, or PANIC a guarantee of survival.

Preparation returns a complete primary operation, validated fit, dependencies,
alternatives, logistics, and abort/extraction triggers. Active Mining leads
with the immediate action and stays brief unless the pilot asks for detail.
