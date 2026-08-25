---
name: eve-hauling
description: Plan, fit, and support simple EVE Online cargo moves using the selected character's ships, skills, assets, contracts, routes, and destination. Use for personal asset relocation, solo mining or PI deliveries, a specific courier contract, hauler choice, trip splitting, route safety, or live hauling decisions; do not use for cargo-free travel or hauling that is still part of an active mining operation.
---

# EVE hauling copilot

Treat hauling as a cargo-delivery problem, not a reason to maximize hold size or
produce a large logistics report. Prefer a simple plan the pilot can use now
with an owned, affordable ship.

Before other non-urgent queries, call `get_eve_copilot_profile` and apply its
selected voice and boundaries. Persona changes delivery only; never let it
change cargo evidence, fit validation, economics, risk, or the recommendation.
Under immediate threat, give the action first and keep faction flavor minimal.

## Establish the move MCP-first

Retrieve available facts before asking the pilot:

1. Confirm the selected character, current location and ship, fitted items,
   trained skills, skill queue, owned ships, saved fittings, and relevant
   assets.
2. Resolve the origin, destination, cargo types, candidate ships, modules, and
   structures through SDE or ESI-backed capabilities rather than guessing.
3. Retrieve a named or character-visible courier contract, wallet context,
   point-to-point routes, and current public known-space activity only when
   they affect the move.
4. Follow continuations until the relevant candidates are covered. A missing
   asset, ship, contract, or activity row in a bounded result is unknown, not
   proof of absence.

Ask only for unresolved inputs that change the plan: cargo or package, origin,
destination, urgency, acceptable loss, or one live observation. Do not turn an
ordinary personal move into a questionnaire. When exact live cargo volume or
value is unavailable, ask for the in-game estimate or clearly plan from an
estimate.

## Keep the objective compact

Capture only:

- what is moving and whether it is personal cargo, mission cargo, or a courier
  package;
- origin, destination, and any required return;
- cargo class, estimated volume and value, or contract collateral;
- allowed space, deadline or available time, attention, and loss tolerance;
- supplied hull or permission to choose from owned ships;
- confirmed scout, escort, web, cyno, structure, or wormhole dependency.

If the pilot says "choose for me," default to attentive solo movement, an
owned replaceable hull, a conservative load, and a known-space route. Do not
assume support, bookmarks, docking rights, or permission to use a capital.

## Select the operating profile

- For a new move, ship comparison, fitting, route choice, trip split, or a
  specific courier contract, read [Preparation](references/preparation.md).
- For a pilot already hauling who needs the next action, read
  [Active hauling](references/active-hauling.md) and use its terse contract.
- For ship roles, fitting priorities, known-space routing, and simple safety
  procedure, read [Ships, routes, and safety](references/ships-routes-and-safety.md).

Read only the references needed. Do not load advanced capital or special-space
detail for a routine highsec personal move. Refresh current official or
maintained community guidance when a recommendation depends on volatile ship,
module, structure, contract, Pochven, wormhole, cyno, or jump-drive mechanics.

## Validate proposed fittings honestly

Whenever this skill creates, recommends, compares, or materially changes a
fit, use `analyze_fitting_changes` with the selected character before presenting
the final fit. Use the current ship, exact owned ship or saved fitting when one
is named, and EFT or structured input for a proposed hull.

Validate hard requirements, CPU, powergrid, slots, hardpoints, rig calibration,
charge compatibility, and only the capacitor states material to the intended
operation. Iterate until the primary fit is mechanically valid or report the
blocker. A route-only answer does not call fitting analysis as ceremony.

The analyzer does not currently prove effective general or specialized hold
capacity, cargo compatibility, align time, warp speed, EHP, signature, warp
strength, cloak travel, nullifier timing, or jump range and fuel. Label these
as current sourced guidance, estimated, pilot-reported, or requiring in-game
verification rather than calling them mechanically validated.

## Return one usable plan

Choose one primary ship and route. Add at most one alternative when it offers a
clear benefit such as fewer trips, lower cost, or lower exposure. Preserve a
supplied or owned hull when it can credibly do the job; otherwise explain the
mismatch and offer a practical upgrade.

Do not perform exhaustive public-contract searches, large multi-stop
optimization, universal gank calculations, or corporation-scale logistics for
an ordinary request. Advanced jump-freighter, cyno-chain, wormhole-mass, or
strategic-fleet work is best-effort only when explicitly requested.

## Preserve player control and privacy

- Do not control the EVE client or automate travel, docking, contracts, cargo
  movement, scouting, cloaking, or evasion.
- Do not buy, fit, move, contract, accept, or deliver items without a separate
  explicit request and an available guarded action workflow. ESI contract
  reads do not provide contract acceptance or delivery actions.
- Treat cargo, value, contracts, assets, wallet, structures, routes, scouts,
  bookmarks, cynos, fleet, corporation, and wormhole information as private.
- Never claim ESI reveals live Local, D-scan, grid, bubbles, camps, cargo room,
  active modules, docking or tether state, or wormhole condition.
- Never call highsec, a safer route, a cloak, warp strength, fast alignment,
  tank, a scout, or a courier contract a guarantee of delivery.

For recurring personal hauling, use the private guide on a best-effort basis to
remember durable staging preferences, trusted services, fits, value limits, and
lessons. Treat remembered routes and mechanics as advisory and refresh current
facts before relying on them.

Preparation returns a short complete move. Active Hauling leads with the
immediate action and stays brief unless the pilot asks for detail.
