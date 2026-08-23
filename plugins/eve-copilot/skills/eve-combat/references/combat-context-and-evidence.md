# Combat context and evidence

Use this reference to establish the pilot-specific facts, objective, and
confidence boundary before choosing a hull or fitting.

## Combat-context record

Record only the dimensions that can change the decision:

| Dimension | Examples | Why it changes the fit |
|---|---|---|
| Objective | kill, survive, hold tackle, defend, capture, reinforce, farm, extract | Defines success and what can be sacrificed |
| Activity | FW complex, roam, ESS, Skyhook, structure timer, mission, Abyss | Imposes encounter and eligibility rules |
| Environment | highsec, lowsec, nullsec, J-space, Pochven, deadspace | Changes legality, bubbles, travel, escape, weather, effects |
| Scale | solo, duo, small gang, fleet, capital wing | Determines role compression and support assumptions |
| Role | scout, tackle, damage, logistics, EWAR, links, bait, objective | Determines required modules and operating position |
| Opposition | NPC faction/wave, target archetype, doctrine, unknown roamers | Drives damage, application, tank, control, counters |
| Envelope | brawl, scram kite, web kite, long point, projection, sniper | Drives weapons, propulsion, tackle, tank, lock range |
| Deployment | local staging, travel fit, filament, bridge, wormhole, deployment | Drives mobility, cargo, refits, fatigue, replacement |
| Loss policy | disposable, insured, standard doctrine, expensive specialist | Drives module tier, implants, boosters, resupply |
| Pilot constraint | skills, experience, attention, multiboxing, accessibility | Drives hull access and execution complexity |

The context may contain uncertainty. Preserve it rather than inventing a precise
enemy fit or site state.

## MCP fact map

Use tool discovery if a named semantic tool is unavailable. The relevant
capabilities normally include:

- `get_character_overview`, `get_current_location`, and `get_current_ship` for
  identity, position, and the active hull;
- `get_skills` and `get_skill_queue` for trained and planned skill levels;
- `list_owned_ships`, `search_assets`, `list_fittings`, and
  `analyze_fitting_access` for existing hulls, modules, ammunition, drones, and
  saved-fit access;
- `get_clones_and_implants` when implant loss, pod movement, or clone bonuses
  affect the recommendation;
- `get_wallet_summary`, `get_market_price`, `compare_market_orders`, and market
  history when affordability, availability, or replacement is material;
- `get_fleet_overview` for actual fleet membership and visible composition;
- corporation, contract, structure, and asset reads when an authorized
  corporation deployment or doctrine stock matters;
- `get_warfare_overview` for factional warfare and war context;
- `get_sovereignty_overview` for nullsec control and objective context;
- `get_public_activity_intelligence`, `get_recent_killmails`, and server activity
  for bounded risk evidence, never live-grid certainty;
- `calculate_route` for deployment and extraction feasibility;
- `search_eve_universe` and `resolve_eve_entities` for SDE-backed name and ID
  resolution;
- `check_requirements` for recursive hard skill requirements;
- `analyze_fitting_changes` for supported deterministic fit validation;
- private EVE guide search when the repository guide contains relevant material.

Request only data relevant to the bounded hulls, locations, or objective. Avoid
dumping a character's entire private state into the answer.

## Facts ESI does not prove

Ask the pilot only when these facts materially affect the decision:

- live Local, D-scan, combat probes, grid positions, bubbles, cynos, or visible
  fleet composition;
- hostile fit, skills, heat, ammunition, capacitor, implants, boosters, links,
  or hidden support;
- current wormhole connections, remaining mass/life, polarization, or rolling
  plan unless authorized private data exposes them;
- FC intent, doctrine exceptions, anchor, engagement range, target priority, or
  escalation plan;
- exact site/campaign state not exposed through ESI;
- budget, loss tolerance, time, attention, preferred style, and mandatory
  return or extraction constraints.

Do not turn a connection or missing-scope prompt into a preference question.
Explain which fact is unavailable, continue with public/static evidence where
possible, and ask only for the missing decision if needed.

## Evidence hierarchy

Prefer evidence in this order:

1. current pilot or FC observations from the game client;
2. current, authorized ESI results with freshness and coverage;
3. installed SDE identity, topology, attributes, and requirements;
4. deterministic fitting analysis for the exact character and fit;
5. current CCP support articles, patch notes, and event rules;
6. recent context-matched meta or loss evidence;
7. maintained community guidance;
8. clearly labeled operating heuristics.

Higher evidence is not always more complete. Pilot-reported D-scan is current
but partial; SDE attributes are authoritative but do not prove how the current
opponents will fly. State the boundary that matters.

## Freshness and coverage

- Note retrieval time or source date when recency changes the conclusion.
- Public activity is a bounded recent snapshot, not current Local or proof of a
  gate camp.
- Killmail evidence is selection-biased: destroyed fits omit surviving fits and
  do not reveal all skills, links, decisions, or hidden support.
- Market price is not proof that required quantity is available at staging.
- A saved fit is not proof that the hull is currently assembled or every charge
  is loaded.
- A missing bounded row is unknown, not zero. Follow continuations when the
  relevant answer may be on another page.
- Current campaign, seasonal, event, and recently rebalanced mechanics require
  a current official-source check.

## What fitting analysis currently proves

`analyze_fitting_changes` can mechanically validate the exact character's:

- CPU and powergrid;
- turret and launcher hardpoints;
- rig calibration;
- drone bay, bandwidth, and active-drone constraints;
- hard skill gaps;
- selected capacitor operating profiles;
- mechanics explicitly reported as supported or unsupported by the engine.

It does not currently return the complete combat envelope: weapon DPS, volley,
range and application; EHP, resists and repair; speed, agility, align and
signature; sensors, tackle and EWAR; logistics, links, fighters, bombs,
smartbombs, siege, triage, bastion, or objective-module performance. Do not
label these values mechanically validated unless another current tool actually
returns them. Ask for in-game simulation where exact values decide the choice.

## Confidence language

Use one of these labels for important claims:

- **Mechanically validated:** returned by exact fitting/requirement analysis.
- **Eligible under retrieved rules:** exact current restriction was checked.
- **Current sourced guidance:** supported by a dated current source.
- **Pilot-reported:** current observation supplied by the pilot or FC.
- **Estimated:** reasoned from ship mechanics and bounded context.
- **Requires in-game verification:** decisive value is outside current tools.

Never use `optimal`, `best`, `wins`, or `safe` without naming the objective,
comparison set, assumptions, and evidence. Prefer “recommended for this
objective under these assumptions.”
