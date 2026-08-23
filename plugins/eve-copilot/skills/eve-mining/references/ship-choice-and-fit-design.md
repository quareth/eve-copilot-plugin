# Ship choice and fit design

## Choose the operating branch first

Apply these hard gates before optimizing output:

1. the hull can enter and operate in the site and security band;
2. the pilot meets hull, module, rig, crystal, drone, core, compressor, burst,
   cloak, probe, propulsion, and tank requirements actually used;
3. the mining module and crystal accept the exact resource;
4. CPU, powergrid, slots, turret hardpoints, calibration, drones, and charges
   are valid for the selected character;
5. discovery, NPC/cloud survival, player-threat response, and extraction are
   credible;
6. fleet-only benefits such as boosts, shared survey, compression, or phase
   energy are truly available;
7. current rules have been refreshed for volatile content.

Then identify the limiting factor: extraction, hold, hauling, compression,
range/travel, defense, escape, scanning, support-pilot cost, or attention.

## Hull-selection map

- **Venture:** low-cost ore/gas entry, built-in warp-strength utility, small
  signature, and expendable hostile-space baseline.
- **Prospect:** covert, mobile ore/gas expedition choice when probes, cloak,
  access, and extraction matter more than hold or maximum yield.
- **Endurance:** mobile ice/ore expedition hull with cloak and hold advantages.
- **Pioneer / advanced destroyer branches:** compare their exact current role
  bonuses, hold, range, critical yield, mobility, and price against frigates and
  barges; refresh rules before relying on recent hull behavior.
- **Covetor / Hulk:** supported maximum extraction where hauling, compression,
  survey allocation, and defense remove their weaknesses.
- **Retriever / Mackinaw:** independent hold branch when unloading or pilot
  attention is the bottleneck.
- **Procurer / Skiff:** defense and drone-utility branch for sustained exposure;
  neither is invulnerable.
- **Outrider:** mobile small-fleet command and repositioning when bursts or MJFG
  utility matter but compression does not.
- **Porpoise:** lower-cost command support and asteroid/gas compression when
  core commitment and fleet scale justify it.
- **Orca:** subcapital fleet support, storage, ship bay, and broad compression;
  evaluate exposure and core policy instead of treating it as a solo yield
  upgrade.
- **Rorqual:** capital operation platform for a defended, supplied, extractable
  fleet. Never recommend it merely because the pilot can board it.
- **Odysseus:** covert expedition/scanning and gas-support branch; do not treat
  it as a replacement for industrial-command compression.

For newly introduced or recently rebalanced hulls, resolve the active SDE
bonuses and current official rules instead of trusting a remembered fit.

## Common fit branches

### Supported ore yield

Use Covetor/Hulk, compatible modulated strip miners and policy-approved
crystals, mining upgrades subject to CPU/tank, survey capability where it adds
value, and drones chosen against the real security need. Specify boosts,
compression, hauling, and replacement crystals rather than assuming them.

### Independent hold

Use Retriever/Mackinaw or an appropriate frigate/destroyer branch. Compare
unload travel and attention saved against lost extraction. Fit survival and
propulsion before spending remaining fitting margin on upgrades.

### Defensive exposed mining

Use Procurer/Skiff, a tanked low-cost hull, or a mobile expedition hull. Match
tank to actual NPC/cloud damage and escape time; include combat drones,
propulsion/alignment/cloak policy, and a concrete exit. A larger buffer does not
replace scouting.

### Ninja gas or ore

Compare Venture price/warp strength against Prospect covert mobility. Fit the
correct harvesters, probes or an explicit scanner dependency, propulsion,
hazard-specific tank, and rapid extraction. Do not install ore-yield modules
that do not improve gas harvesting.

### Ice

Compare Endurance/mobile specialist, hold-focused hull, defensive hull, and
supported yield barge. Ice gives output only on completed cycles, so cycle time,
hold room for a full block, accelerator rigs, CPU pressure, and no-short-cycle
operation matter.

### Mercoxit

Require a compatible deep-core module, Mercoxit crystal, and Deep Core Mining.
Account for cloud risk, working range, tank, crystal supply, and compression.

### Command support

Specify exact burst charges, compressor, core, fuel, tank, propulsion, remote
support, storage, and replacement consumables. Model core-on and core-off
states when commitment changes capacitor or escape assumptions.

## Character-aware validation

For each final fit:

1. use recursive requirement checks for hull and every material item;
2. run `analyze_fitting_changes` with the correct current/owned/saved/proposed
   baseline and the selected character's active skills;
3. inspect CPU, powergrid, slot/hardpoint use, calibration, drones, crystal or
   charge compatibility, missing skills, unsupported mechanics, and only the
   relevant capacitor profiles;
4. revise an invalid fit rather than explaining around the failure;
5. separate **usable now**, **improved by support skills**, and
   **operationally recommended training**.

CPU/PG and physical fitting constraints are material to every exact fit. Drone
constraints matter only when drones are included. Capacitor profiles matter
when the declared active states—harvesters, propulsion, repair, bursts,
compressor, or core—make capacitor an operational constraint.

Do not call yield, cycle time, crit, residue, range, hold, compression, burst,
tank, agility, warp strength, cloak behavior, MJFG behavior, phase energy, or
mutated rolls Dogma-validated unless a current tool explicitly returned that
metric. Use current sources or in-game simulation for those properties.

## Fit handoff

Give an EFT-style fit plus cargo plan. Include the exact resource crystal or
charge families, mining and combat drones, probes, scripts, fuel, nanite paste,
mobile depot/anchor, and replacements used by the operation. Explain intended
module states, range, cycles, drone policy, overload/repair if relevant, and the
escape sequence.
