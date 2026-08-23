# Output and live guidance

Use this reference to turn the analysis into an actionable fitting report or a
short live-combat answer.

## Preparation output

Lead with the recommendation and why it matches the objective. Use the smallest
structure that preserves these elements:

1. **Objective and assumptions**
   - exact activity, environment, scale, role, likely opposition, deployment,
     budget/loss policy, and the unresolved assumption that matters most;
2. **Primary ship and exact fit**
   - one importable EFT block;
   - required ammunition, charges, scripts, drones/fighters, paste, probes,
     fuel, keys/filaments, and other operating cargo;
   - implants or boosters only when requested or material;
3. **Why this ship and fit**
   - intended engagement/encounter envelope;
   - control, application, survival, mobility, capacitor, role integration, and
     execution tradeoffs tied to the objective;
4. **Player readiness**
   - usable now, exact hard skill blockers, relevant weak support skills, and a
     short prioritized training path when useful;
5. **Validation**
   - CPU/PG, slots/hardpoints, calibration, drones, missing skills, capacitor
     states, analyzer provenance, assumptions, and unsupported mechanics;
   - separate exact mechanical proof from estimated combat performance;
6. **How to fly it**
   - opening action, preferred/fallback range, target or wave priority,
     ammunition/script/drone states, heat/cap management, and positioning;
7. **Engage, avoid, and abort conditions**
   - favorable conditions, dangerous counters/spawns, disengage threshold,
     reinforcement or extraction trigger;
8. **Alternative**
   - only a meaningful cheaper, safer, lower-skill, doctrine-compatible, or
     strategically different option;
9. **Logistics and unknowns**
   - approximate cost/availability and replacement needs when checked;
   - only material unavailable facts, with the precise client check needed.

Do not bury the chosen hull beneath the methodology. Do not return a large list
of fits and make the pilot perform the comparison.

## EFT output discipline

- Use exact current type names.
- Put one valid fit in each EFT block.
- Keep substitutions and optional bling outside the import block.
- Include offline/alternate module states only when the import format and
  analyzer interpretation are clear.
- State any required implant, booster, abyssal roll, fleet boost, projected
  effect, or special charge immediately above the block.
- Revalidate a substitution if it changes CPU, PG, calibration, hardpoints,
  drones, capacitor, or skills.

If the model cannot resolve an exact type or produce a mechanically valid fit,
do not fabricate an import block. Return the best bounded design, identify the
unresolved type/constraint, and continue validation.

## Validation table

When several evidence kinds matter, a compact table is useful:

| Claim | Status | Evidence |
|---|---|---|
| Hull/module access | usable or missing skill | `check_requirements` |
| CPU/PG/slots/rigs/drones | pass or exact violation | fitting analyzer |
| Capacitor operating state | stable, timed, burst, injected, unsupported | fitting analyzer plus assumptions |
| Site/objective eligibility | eligible, ineligible, unresolved | current rule source |
| Damage/application/tank/mobility | estimated or client check | current evidence/in-game simulator |
| Price and staging stock | retrieved, partial, unknown | market/assets with coverage |

Do not use a green overall label when one decisive metric remains unverified.

## Confidence and language

Use:

- “recommended for this objective under these assumptions”;
- “mechanically validated with this character's current skills”;
- “eligible under the current rule checked on DATE”;
- “estimated engagement envelope”;
- “verify this exact value in the in-game simulator”;
- “current pilot/FC observation.”

Avoid:

- “best fit” without a bounded comparison and objective;
- “cap stable” without naming the operating profile;
- “counters” without start range and fit/support assumptions;
- “safe,” “unkillable,” “guaranteed,” or “always wins”;
- unexplained all-V, implant, booster, link, heat, or abyssal assumptions.

## Immediate in-space guidance

When the pilot is already exposed, use this order:

1. **Action now:** one clear command-like recommendation the pilot can perform
   manually, such as align, overheat prop, stop aggression, pull range, switch
   ammunition, clear tackle, broadcast, warp, or hold outside the gate.
2. **Decisive reason:** one sentence tied to the known state.
3. **Next trigger:** what observation causes commit, continue, or escape.
4. **One question at most:** ask only the most valuable missing observation.

Do not run a full fitting interview while the pilot is tackled or on a hostile
grid. Preserve options under uncertainty. If the pilot reports immediate danger,
give the safe action before querying MCP.

Examples of decision-changing live observations include:

- current range, transversal, velocity, tackle/web/neut state;
- Local change and D-scan hulls/probes;
- hostile logistics, links, EWAR, cyno, bubble, or new arrivals;
- capacitor, heat, ancillary/cap-booster reload, drone loss, ammunition;
- site wave/trigger, Abyss timer/boundary, objective timer;
- gate/session/weapons timer, polarization, or available exit.

Replan when one of these changes rather than repeating the original fit theory.

## Saving a fit

Analysis and recommendation are read-only. If the pilot separately asks to save
the final fitting:

1. show the exact final fitting and name that will be saved;
2. ensure all substitutions are resolved;
3. use the MCP's guarded action preparation flow for `save_fitting`;
4. present the action summary, stop, and request explicit confirmation;
5. do not execute in the same assistant turn as preparation;
6. execute only after a new user message explicitly approves that exact
   prepared action, and before it expires.

Never treat “prepare a fitting,” “make me a fit,” or approval of the written
recommendation as permission to save, buy, move, assemble, or fit items.

## Privacy

Keep private fleet composition, doctrines, staging, assets, wallet, fits,
contacts, bookmarks, war plans, and wormhole-chain intelligence out of content
intended for public posting. When the pilot asks for a shareable fit, include
only information needed to use it and remove private operational context.
