# Pinned Dogma engine runtime

This directory contains the precompiled, runtime-only WebAssembly build used by
the fitting analyzer. It intentionally contains no native executable, Protobuf
loader, EFT parser, or EVE static-data package.

The artifact was built from the exact source and toolchain recorded in
`PROVENANCE.json` with:

```sh
wasm-pack build --release --target web -- \
  --locked --no-default-features --features wasm
```

The generated module is loaded only inside a temporary Node worker. The worker
provides its synchronous data callbacks from the MCP server's pinned SDE
SQLite snapshot and is terminated after each uncached request.

Upstream is copyright the EVEShipFit contributors and distributed under the
included MIT license.
