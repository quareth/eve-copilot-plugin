# Known-space routing

Use known-space public activity as a competition and danger proxy, never as a
cosmic-signature detector.

## Data contract

- `calculate_route` supplies a known-space stargate path between chosen
  endpoints. It does not optimize an open-ended exploration search or include
  random wormholes.
- system jumps and system kills are latest one-hour ESI snapshots.
- kills distinguish ship, pod, and NPC totals, but not whether a loss happened
  on a gate or involved an explorer.
- nonzero rows may be omitted from bounded results until continuations are
  followed. Missing or uncovered systems are unknown, not zero.
- the plugin stores no time series. It cannot distinguish normally quiet from
  temporarily quiet or infer time-of-day patterns.

For each candidate system or route node, separate:

- **opportunity:** eligible site families, useful faction/security structure,
  known sov exploration-upgrade evidence, not yet visited, lower current
  competition;
- **danger:** ship/pod kills, war or insurgency context, choke points, bubbles,
  resident response, and live Local/D-scan;
- **travel cost:** jumps, repeated edges, backtracking, ship exposure, and
  extraction distance;
- **uncertainty:** partial or stale activity, inferred upgrades, and missing
  live observations.

## High security

Prefer off-hub pockets or loops with several adjacent systems and convenient
extraction. Low activity mainly suggests less competition. High Local is often
competition rather than immediate lethal danger, but war and suicide-attack
risk still apply. Do not assume every dead end is uncontested.

## Low security

Prefer quiet pockets with multiple exits and less-obvious high-sec boundaries.
Penalize faction-warfare corridors, insurgencies, choke points, repeated return
gates, and recent pod or ship kills. On arrival, Local and D-scan override the
pre-route estimate. A covert cloak reduces exposure; it does not make a gate
safe.

## NPC null security

Prefer side pockets and off-pipe constellations, while accounting for traffic
around NPC stations and regional gates. Require a credible extraction option.
Score bubble exposure separately from system-wide kills.

## Sovereign null security

When an active Exploration Detector or equivalent upgrade is actually known,
consider a bounded sweep of its surrounding systems rather than visiting only
the hub. Do not infer a universe-wide public upgrade map from corporation-only
hub data. Penalize alliance response routes, pipes, bubbles, and fragile exits.

## Route policy

Return a primary next hop or bounded circuit and at least one alternative.
Replan after every jump when live Local, D-scan, signatures, or threat evidence
contradicts the estimate. As cargo value rises or time falls, increase the
weight of extraction safety.
