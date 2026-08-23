# Preparation profile

Use this profile before undocking, between sites, when scaling a fleet, or when
the pilot requests a comprehensive mining campaign, ship, fit, or logistics
plan.

## Build the operation in nine passes

1. **Objective:** establish the material or economic outcome, exact resource,
   destination, session length, success condition, and loss policy.
2. **Eligibility:** prove access to the site and hard requirements for the hull,
   resource module, crystal, drones, probes, cloak, command equipment, and
   support roles.
3. **Environment:** identify security band, discovery method, NPC/cloud hazards,
   player exposure, Local behavior, bubbles/cynos, gates or wormholes, and
   current volatile rules.
4. **Bottleneck:** decide whether extraction, hold, hauling, compression,
   discovery, defense, travel, support-pilot opportunity cost, or attention is
   limiting realized value.
5. **Operation branches:** compare no more than three materially different
   plans, such as independent hold, supported yield, defensive exposure, ninja
   extraction, or command-supported fleet.
6. **Exact package:** specify ship fit, rigs, drones, crystals/charges, probes,
   fuel, paste, depots or anchors, replacement consumables, and support hulls.
7. **Mechanical proof:** run requirements and `analyze_fitting_changes` for
   every final ship fit using the selected character. Model only capacitor
   states relevant to the intended use and identify unsupported metrics.
8. **Field procedure:** define arrival checks, positioning, rock allocation,
   cycle/residue policy, core/boost/compression policy, unload cadence, scout
   coverage, and response to NPCs or hostile indicators.
9. **Extraction and disposition:** define cargo/time/value thresholds, exit and
   fallback routes, hauling chain, compression, refining/reaction/sale point,
   and stop conditions.

If current price matters, compare at the intended sale, refining, reaction, or
manufacturing destination. Include taxes, hauling, compression, crystal/fuel
consumption, support-pilot opportunity cost, and plausible losses. Do not
present a universal regional-average ISK/hour figure as a character-specific
result.

## Preparation questions

Query the MCP first, then ask once for only the unresolved decisions that can
change the plan. Typical examples are:

- the target resource or permission to optimize for value;
- allowed security spaces and mandatory return point;
- solo/fleet scale and support that truly exists;
- session duration, attention level, budget, and acceptable loss;
- residue/conservation policy and material destination;
- private access, moon rules, wormhole links, or capital response assumptions
  unavailable to the MCP.

If the pilot delegates the choices, choose conservative defaults from the
retrieved character and location. State those assumptions without delaying the
plan.

## Preparation output

Return:

1. **Objective and assumptions:** resource, site, space, scale, support,
   budget, disposition, loss policy, and session plan.
2. **Primary operation:** one ship/fleet branch and why it best addresses the
   actual bottleneck.
3. **Fit package:** EFT-style fits plus drones, crystals, charges, probes, fuel,
   anchors, and replacement consumables.
4. **Mechanical proof:** requirements, CPU/PG, slots/hardpoints, calibration,
   drones, compatibility, relevant capacitor states, and unsupported metrics.
5. **Field procedure:** discovery, travel, arrival checks, position, cycles,
   survey/residue policy, boosts/core/compression, NPC response, and unload.
6. **Threat and extraction plan:** warnings, align/escape plan, scouts, abort
   triggers, cargo/time thresholds, and primary/fallback exit.
7. **Economics and logistics:** acquisition, hauling, refining/reaction/sale,
   consumables, dependencies, and explicit assumptions.
8. **Alternative:** only a materially useful safer, cheaper, lower-skill,
   independent, mobile, or higher-output branch.
9. **Unknowns:** live or private facts not established by available evidence.

Use precise labels: `mechanically validated`, `eligible under retrieved rules`,
`current sourced guidance`, `pilot-reported`, `estimated`, and `requires
in-game verification`.
