# Known limitations

- Coverage is pinned to ESI compatibility date `2026-08-18`. Contract drift for
  that date fails CI; adopting a newer compatibility date requires explicit
  review and regeneration.
- Normal responses return at most 200 collection items, 400 KiB of MCP data,
  five upstream pages, 20 upstream requests, and 30 seconds. The server never
  fetches every page by default.
- Semantic results may be partial when a continuation remains, an optional ESI
  source fails, or the bounded SDE-resolution budget is exhausted. Warnings
  identify the affected operation. `check_requirements` is the exception: it
  returns one complete non-paginated proof or a typed error, never a partial
  eligibility result.
- Paginated ESI collections can change while a user follows continuations. The
  server removes exact objects already returned by earlier pages, retains the
  original page-count ceiling when ESI reports a larger count, and warns when
  duplicates or a page-count change are observed. Objects removed upstream
  before their page is read cannot be reconstructed.
- Inventory semantic tools resolve returned asset names and coordinates through
  deduplicated, official-limit POST batches. A failed resolver leaves the asset
  rows and any successful resolver data intact and marks the result partial.
- Wealth is an estimate based on the returned asset slice, available ESI average
  or adjusted prices, and wallet balance. Unpriced records are counted.
- Public market prices and activity intelligence reflect ESI cache windows; they
  are not live order-book or combat guarantees.
- SDE names, categories, requirements, blueprints, and routes use the explicitly
  installed build. Startup never installs or updates static data automatically.
- Player-owned structures remain subject to ESI access controls and may not be
  statically resolvable.
- Actions are disabled by default, are not gameplay automation, and are never
  retried automatically. An uncertain outcome requires read-only verification.
- The server does not include an AI model, planner, chat history, notifications,
  background polling, or community killboard/price services.

## Guide limits

- The MCP server cannot passively observe conversations. Recall and maintenance
  depend on the connected agent choosing to call the guide tools.
- Guide pages are advisory, and stored text is returned as untrusted data. ESI,
  the active SDE, and reviewed deterministic calculations must be refreshed for
  current or exact claims.
- MVP search scans at most 10,000 current Markdown pages and returns at most 20
  results. There is no vector index, hosted synchronization, publishing, or
  cross-device sharing.
- A page is limited to 64 KiB, 100 related type IDs, 100 page links, and 50
  provenance entries. Manually malformed pages are isolated until repaired or
  removed.
- `user` scope means the local operating-system installation. Character pages
  require the matching selected connected character; the server does not infer
  shared EVE accounts or perform cross-character synthesis.

## Fitting-analysis limits

- `analyze_fitting_changes` validates CPU, powergrid, slot families, turret and
  launcher hardpoints, rig size and calibration, charge compatibility, drone
  count/bandwidth/bay, active skills, and explicit capacitor profiles. It is a
  fitting validator, not a combat simulator or exhaustive optimizer.
- Capacitor injection and ancillary mechanics, and subsystem fitting, fail
  closed as unsupported in conformance matrix version 1. Fitting-only hard
  constraints can still be reported, but affected capacitor conclusions are
  unavailable.
- Current-ship, owned-ship, and saved-fitting ESI records do not prove live
  activation state or an exact cargo-charge-to-module mapping. The tool returns
  these assumptions and does not silently load cargo charges.
- The committed golden conformance fixture covers the primary Retribution CPU,
  active-skill, propulsion-off, propulsion-on, stable, and depletion scenarios.
  Broader Pyfa/in-client reference coverage across weapon, tank, rig, drone,
  booster, and subsystem families remains required before claiming those as a
  general cross-tool conformance matrix.
