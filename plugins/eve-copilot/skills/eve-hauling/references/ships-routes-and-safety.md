# Ships, routes, and safety

## Choose by cargo and exposure

Use the smallest practical branch that carries the load without creating an
unreasonable number of trips:

- a fast small ship for tiny, valuable cargo that does not need a hauler;
- a fast or general T1 hauler for affordable personal moves and distribution;
- a specialized hauler when the exact cargo belongs in its special hold;
- a Blockade Runner for smaller valuable loads where covert movement is the
  useful tradeoff;
- a Deep Space Transport for medium loads where fleet hangar, tank, warp
  strength, or the cloak-and-propulsion travel option is material;
- a freighter or specialized large transport only for loads that justify its
  cost, slow movement, support, and exposure;
- a jump freighter only when the pilot explicitly requests advanced logistics
  and has a confirmed cyno, fuel, access, and extraction plan.

Refresh current hull bonuses and hold restrictions rather than freezing exact
capacity tables. A specialized hold is useful only after proving that the
exact cargo type is eligible. A courier package normally needs compatible
general or fleet-hangar space; do not assume the contents make the wrapped
package eligible for a specialized hold.

## Fit for the route, not maximum cargo

Keep the fit understandable for the pilot. Compare cargo modules against
alignment, tank, signature, propulsion, cloak, nullification, warp speed, and
replacement cost. Do not fill every low slot with cargo expansion by default.

Use `analyze_fitting_changes` to prove fit legality and skills. Source or label
the hauling-performance metrics it cannot validate. For a cloak-and-propulsion
travel fit, prove CPU and powergrid but treat execution timing and escape as
pilot skill and in-game verification. Do not require a fictional sustained
capacitor profile for a single travel cycle; model active hardeners or repair
only when their intended duration matters.

For a beginner highsec move, a simple buffer or travel fit with manual piloting
is usually easier to execute than an advanced trick-dependent fit. Outside
highsec, avoidance and live intelligence usually matter more than paper tank.

## Build a bounded route

Use `calculate_route` for the endpoints and compare `Shorter` with `Safer` only
when the difference is useful. Respect pilot avoidance systems. If a known
private jump bridge is supplied and the route tool accepts additional
connections, label that edge private and access-dependent.

Annotate route nodes with security band and relevant latest-hour jump or kill
evidence. System kills do not identify a gate, hauler loss, camp, attacker, or
current condition. Missing bounded data is unknown. Replan when pilot-reported
Local, D-scan, a scout, or the grid contradicts the snapshot.

Wormhole connections are live reported edges, not SDE gates. Confirm mass,
lifetime, polarization, ship-size eligibility, and both-side bookmarks before
depending on one. Pochven, cyno, jump-drive, tether, structure, and sovereignty
rules are volatile enough to refresh when they are material.

## Simple operating procedure

- Repackage or split personal cargo only when the items and objective allow it.
- Confirm the correct hold, route, destination, and live cargo value before
  undocking.
- Use manual travel for a loaded move; treat autopilot as an explicit exposure
  tradeoff rather than the default.
- Use pilot-confirmed insta-undock, insta-dock, perch, or safe bookmarks when
  available; do not invent them from ESI.
- At each risk checkpoint, let current Local, D-scan, scouts, and grid state
  override the preflight estimate.
- Define one clear abort rule, such as an unscouted warning system, new camp,
  missing structure access, lost return connection, excessive cargo value, or
  insufficient time.

Highsec CONCORD response, gate cloak, a covert cloak, interdiction
nullification, warp strength, tank, fast alignment, web support, and scouts all
reduce particular exposures; none guarantees delivery.
