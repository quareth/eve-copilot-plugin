# Ship choice and fit design

Use this reference whenever selecting a hull, evaluating a pilot-supplied hull,
creating an exact fit, or comparing fitting candidates.

## Define the objective function

Translate “optimized” into the success condition for this request. Examples:

- secure initial tackle and survive until the gang lands;
- choose and disengage from solo fights while roaming through bubbles;
- hold a capture point against likely hulls under its entry restrictions;
- apply damage at the fleet's anchor range and survive expected alpha;
- complete a named PvE encounter inside its timer with a survivable margin;
- repair a doctrine under expected incoming damage and capacitor pressure;
- link or defend an objective long enough for the timer or reinforcement plan;
- complete repeated sites at an acceptable loss-adjusted cost.

Do not maximize paper DPS, EHP, speed, capacitor stability, or ISK efficiency in
isolation. Identify required thresholds, then compare tradeoffs among feasible
fits. If no hard threshold is known, state the practical proxy being used.

## Hull-selection funnel

When the model may suggest the ship:

1. Enumerate role archetypes that can achieve the objective, not every hull.
2. Apply activity and environment eligibility: hull class, mass, acceleration
   gate, objective link, bubble/nullification, security, or fleet restrictions.
3. Filter by the selected character's hard skills, plausible training time,
   existing assets, budget, staging, and replacement policy.
4. Compare normally two or three hulls across role fit, range/control,
   application, survival, mobility, execution burden, logistics, and cost.
5. Research current context-matched balance/meta evidence only for the bounded
   candidates.
6. Choose the primary hull and one meaningful alternative before constructing
   exact fits.

Do not rank hulls globally. A hull can be superior for a specific role and poor
for the broader activity.

## Supplied-hull policy

Respect a supplied hull as a user constraint unless it cannot meet a hard rule
or credible success condition.

- If suitable, optimize it for the objective.
- If usable with a meaningful weakness, provide the fit and name the weakness.
- If structurally mismatched, explain the limiting mechanic and give the best
  credible narrower use for that hull plus a better alternative.
- If prohibited by the site or objective, do not force a fit.
- Do not silently replace an FC doctrine hull with a preferred hull.

## Personalize around actual skills

Separate skill effects into three categories:

1. **Hard access:** requirements for hulls, modules, rigs, drones, and charges.
   Resolve recursively with `check_requirements`.
2. **Fit feasibility:** character skills that change CPU, powergrid, capacitor,
   drone limits, or another supported fitting constraint. Validate with
   `analyze_fitting_changes`.
3. **Performance support:** skills that change damage, range, application,
   repair, resistance, speed, agility, heat, sensors, EWAR, logistics, fighters,
   or command effects. Account for them when comparing hulls, but do not invent
   exact values the analyzer did not return.

Prefer a ship the pilot can fly effectively now over a nominally stronger hull
with weak core support skills, unless the request is explicitly a training
target. Use the skill queue to distinguish a short planned unlock from an
uncommitted long train.

If a compact training plan materially improves the fit, prioritize:

- hard blockers first;
- high-impact fitting or role skills next;
- support skills that improve the actual objective;
- specialization levels and expensive marginal gains last.

State what changes after training rather than listing unrelated skills.

## Build the fit as interacting layers

### Role and role compression

Reserve slots and fitting resources for mandatory role functions before
optimizing damage or tank. Solo ships compress propulsion, tackle, damage,
tank, application, capacitor, and escape. Fleet ships should specialize because
other roles cover missing functions.

### Engagement envelope and control

Choose weapons, ammunition, propulsion, tackle, webs, tracking/guidance,
sensor range, and mobility as one package. Define:

- preferred and fallback range;
- how the fit enters, holds, or leaves that range;
- what scram, web, MJD, tracking disruption, damping, bubbles, or terrain do to
  the plan;
- ammunition or script states for common range bands;
- lock time and range needed to perform the role.

Do not describe weapon range without the control plan that makes it usable.

### Damage and application

Consider damage type or lock, reload, spool, volley, selectable ammunition,
tracking, signature, transverse velocity, missile explosion behavior, drone
travel/control/replacement, target painting, webs, and objective damage rules.
Paper DPS is secondary to applied damage inside the planned envelope.

### Tank and repair

Choose deliberately among buffer, active, ancillary burst, passive recharge,
speed/signature tank, logistics buffer, spider tank, or capital mode. Match it
to expected damage profile, alpha, sustained pressure, neut/EWAR, logistics
arrival and lock time, cap boosters, reload windows, and heat.

PvE survival against a known encounter and PvP survival against an adaptive
opponent require different evidence. Do not transfer a mission tank directly
to PvP or vice versa.

### Propulsion, travel, and extraction

Evaluate AB, MWD, dual prop, MJD, overprop, cloak, nullification, warp speed,
align, mass, signature bloom, scram shutdown, bubbles, deadspace restrictions,
wormhole mass/polarization, filaments, bridges, jump range/fatigue, fuel, and
the return route. Travel and extraction modules may be core combat functions.

### Capacitor and operating states

Cap stability is not universally desirable. Define which modules must operate
together and for how long:

- weapons, tackle, EWAR, neuts, or transfers;
- propulsion on and off;
- local or remote repair;
- cap injection and reload windows;
- siege, triage, bastion, links, or objective modules;
- expected hostile neut pressure.

Choose analyzer profiles that match these states. Report stable, timed, burst,
injected, or unsupported—not simply “cap stable” or “not stable.”

### Heat and execution burden

Consider rack layout, likely overheated modules, heat damage, nanite paste,
ammunition/script switching, active-repair timing, cap injection, drones,
manual piloting, probes, D-scan, and multiboxing. Prefer a robust simpler fit
when theoretical gains demand more attention than the pilot or activity allows.

### Logistics and loss economics

Account for fitted replacement cost, insurance, market quantity at staging,
spare hulls, ammunition, cap charges, paste, scripts, drones, probes, filaments,
keys, fuel, boosters, implants, refit access, hauling, and extraction. Optimize
loss-adjusted objective completion when repeated losses are expected.

## Exact-fit construction

The final fit must include:

- exact hull and module names;
- rig sizes and exact variants;
- subsystem choices where applicable;
- drones/fighters with quantities;
- charges, ammunition, scripts, cap boosters, probes, paste, fuel, filaments,
  keys, depots, and mobile equipment needed for the operating plan;
- optional implants and boosters only when requested or material;
- named module states or alternate ammunition when they change validation.

Prefer EFT-style output so the pilot can import it. Do not include mutually
exclusive alternatives in one import block. Put substitutions outside the
primary block and revalidate any substitution that changes fitting resources,
capacitor, or hard requirements.

## Candidate-validation loop

For one baseline and up to five bounded candidates per analyzer call:

1. Resolve every type name before analysis.
2. Use the selected character's active skills, not an all-V assumption.
3. Run recursive requirements for the hull and material fit components.
4. Run `analyze_fitting_changes` with profiles matching actual module states.
5. Inspect violations, missing skills, unsupported mechanics, assumptions, and
   provenance—not just `fit_valid`.
6. Repair hard failures by changing the least mission-critical choice first.
7. Re-run analysis after each material change.
8. Compare validated candidates against the objective function, including
   unproven metrics as labeled estimates.
9. Ask for in-game simulation when a decisive combat metric is not exposed.

Do not use fitting modules, implants, or drugs to conceal an impossible base
plan. If the fit relies on an implant, booster, abyssal roll, command burst, or
projected effect, state the exact dependency and a fallback.

## Alternative policy

Useful alternatives change a real decision dimension:

- lower skill or immediately usable;
- cheaper and easier to replace;
- safer extraction or more forgiving execution;
- higher application against a different target class;
- doctrine-compatible instead of solo-capable;
- more damage or control at the cost of tank;
- owned-now versus superior-but-needs-acquisition.

Avoid cosmetic variants and long shopping lists. Make the primary choice clear.
