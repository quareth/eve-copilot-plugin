# Attribution ledger

This ledger records source adaptations from
[`garshany/eveai`](https://github.com/garshany/eveai) at commit
`4f5736f7c8694aa5c01fd2cb2c258e6e039ff264` (2026-07-28). The upstream project
is MIT licensed; its notice is preserved in `NOTICE`.

| Local path | Upstream path | License and copyright | Material changes |
|---|---|---|---|
| `src/config/env.ts` | `src/config-env.ts` | MIT; Copyright (c) 2026 EVE AI Agent contributors | Retained strict integer parsing behavior. Reduced the API to optional bounded values, added an allowlist for project-prefixed variables, and removed upstream application-specific booleans and defaults. |
| `src/storage/sqlite/open-database.ts` | `src/db/sqlite.ts` | Same | Retained the WAL, `synchronous=NORMAL`, foreign-key, and busy-timeout baseline. Added private file permissions, bounded lock retry, migration ownership, typed safe errors, injected clock, and multi-process first-run behavior. |
| `src/observability/redaction.ts` | `src/observability/logger.ts` | Same | Retained recursive key/string redaction concepts and bounded token patterns. Reworked error handling, URL/JWT coverage, circular objects, structured events, child loggers, and mandatory `stderr` output. Removed terminal banners, colors, `console`, and all stdout logging. |
| `src/capabilities/definitions/character.ts` | `src/eve/scopes.ts` | Same | Reused the reviewed ESI scope identifiers as capability metadata for character context. Runtime coverage is generated from the pinned OpenAPI contract. |
| `src/application/services/get-eve-capabilities.ts`, `src/domain/capability.ts`, `src/domain/capability-registry.ts` | `src/eve/capabilities.ts` | Same | Reimplemented capability discovery around a project-owned immutable registry. Removed database, user/chat context, mutable process snapshots, and live ESI catalog access; added deterministic filtering, authorization explanation, bounded pagination, and an opaque filter-bound cursor. |

No other source file contains copied or adapted upstream implementation.

## Dogma engine

The fitting analyzer bundles a stripped WebAssembly-only build of
[`EVEShipFit/dogma-engine`](https://github.com/EVEShipFit/dogma-engine) at
commit `e8e536be341959a8abdc6f02600fe449bc6f4764`. The upstream project is MIT
licensed. Its license is preserved at `vendor/dogma-engine/LICENSE`, and exact
source, toolchain, JavaScript, and WebAssembly hashes are recorded in
`vendor/dogma-engine/PROVENANCE.json`.

| Local path | Upstream path | License and copyright | Material changes |
|---|---|---|---|
| `vendor/dogma-engine/esf_dogma_engine.js`, `vendor/dogma-engine/esf_dogma_engine_bg.wasm` | `src/calculate/**`, `src/wasm/mod.rs` | MIT; EVEShipFit contributors | Precompiled with default features disabled and only the WASM feature enabled. Runtime CLI, native sidecar, Protobuf loader, EFT parser, and upstream data package are excluded. |
| `src/infrastructure/fitting/dogma-derived-data.ts` | Reviewed definitions from `EVEShipFit/data` patches `capacitor.yaml`, `cpuPower.yaml`, `droneActive.yaml`, `onlineEffect.yaml`, and `timing.yaml` | MIT; EVEShipFit contributors | Re-expressed the bounded derived attributes/effects as versioned adapter data with stable negative IDs. Official EVE facts continue to come from the MCP server's one active SDE SQLite snapshot. |
| `src/infrastructure/fitting/dogma-worker.ts` | WASM callback contract in `src/wasm/mod.rs` | Project-owned adapter around the MIT interface | Reimplemented the data callback layer for synchronous indexed, read-only SQLite access; confines the compatibility namespace to one temporary worker and normalizes only reviewed fitting metrics. |
