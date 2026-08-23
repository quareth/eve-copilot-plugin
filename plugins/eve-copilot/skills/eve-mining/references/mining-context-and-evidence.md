# Mining context and evidence

## MCP-first fact map

Retrieve facts through the connected EVE Copilot MCP before asking the pilot:

- selected character, current location, active ship, and current fitted items;
- active skill levels and queue;
- owned ships, assets, saved fittings, clones, implants, wallet, and relevant
  market context;
- fleet membership and authorized corporation, moon, structure, sovereignty, or
  campaign context;
- routes, current public known-space activity, and system/type resolution;
- recursive item requirements and character-aware fitting analysis;
- historical character mining ledger where useful.

The mining ledger is historical. It can establish date, system, resource type,
and quantity previously mined; it cannot reveal the current field, hold,
module, or cycle. Corporation moon timers and mining observers require the
appropriate corporation scopes and roles and are not ordinary character facts.

Follow result continuations until the relevant candidate set is covered. A
bounded result that omits a ship, asset, order, system, or event makes it
unknown; it does not prove absence.

## Context record

Capture only fields that affect the choice:

| Dimension | Decision effect |
|---|---|
| Outcome and destination | Changes resource valuation and whether refining, reaction, manufacturing, or sale matters |
| Resource and exact site | Determines legal modules, crystals, hazards, access, and depletion behavior |
| Space and route | Changes NPCs, player threats, Local, bubbles, cynos, scanning, and extraction |
| Scale and assigned role | Determines specialization, boosts, survey, compression, hauling, scouting, and defense |
| Existing hulls and skills | Determines usable-now candidates and mechanical fit margin |
| Budget and loss policy | Changes hull/module grade, replacement stock, and acceptable commitment |
| Session and attention | Changes hold value, cycle management, scouting burden, and return plan |
| Residue policy | Changes crystal, module, burst, and rock-allocation choices |
| Logistics | Changes whether extraction or transport is the real bottleneck |

## Evidence hierarchy

Prefer evidence in this order:

1. pilot objective and current in-game observations;
2. current ESI character, fleet, corporation, market, and activity results;
3. active SDE and deterministic fitting analysis;
4. current official CCP rules, patch notes, campaign notices, and site pages;
5. recently maintained community mechanics references;
6. clearly labeled inference or operating heuristic.

Use current official sources whenever a recommendation depends on a volatile
site, campaign, event, resource distribution, hull balance, module behavior,
compression rule, sovereignty upgrade, Pochven rule, Phased Field stage, or
capital restriction. Do not freeze exact “best ore,” price, spawn, or doctrine
tables into the answer.

## Facts requiring pilot observation

The server cannot observe:

- Local, D-scan, combat probes, grid positions, bubbles, cynos, or tackle;
- current asteroid/cloud quantity, depletion, survey overlay, site timer, NPC
  wave, or player ownership rule;
- live module, crystal, drone, burst, compressor, core, or phase-anchor state;
- public-fleet trust, active boost coverage, compression access, or response
  time;
- unrecorded wormhole links, mass, lifetime, polarization, or rolling plan;
- pilot attention, experience, loss tolerance, session length, or mandatory
  return.

Ask for these only when material. Treat highsec “quiet,” a hidden signature, or
missing activity rows as uncertainty rather than safety.

## Evidence labels

Use:

- `mechanically validated` only for constraints returned by the fitting tools;
- `eligible under retrieved rules` for current site or activity restrictions;
- `current sourced guidance` for refreshed official/community mechanics;
- `pilot-reported` for live client observations;
- `estimated` for comparative output, survival, or economics;
- `requires in-game verification` for unsupported simulation or live state.
