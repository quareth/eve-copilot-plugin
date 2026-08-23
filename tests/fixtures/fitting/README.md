# Fitting conformance fixture

`retribution-sde.db.gz.base64` is a minimized, compressed SQLite subset of the
official EVE SDE build `3464040`, released 2026-08-11. It contains only the
types, attributes, effects, modifiers, groups, and categories needed by the
Retribution fitting acceptance tests:

- Retribution (`11393`);
- 1MN Afterburner I (`439`);
- Small Armor Repairer I (`523`);
- Large Vorton Projector II (`54753`), used to prove quantitative rejection;
- Character (`1373`);
- CPU Management (`3426`), used to prove active-skill adjustment.
- Power Grid Management (`3413`), used to prove character-adjusted powergrid.

The Power Grid Management rows are a controlled current-SDE skill fixture
copied from official SDE build `3475087`. They are isolated from hull balance
data and exist only to verify the Dogma engine's character-skill application.

The decompressed database SHA-256 is
`d43776236c99a2c68d51e0c060d10257a7918eda19707af6bea437450d45dc85`.
The test verifies this digest before opening the fixture.

This is test data only. Runtime calculations never use this fixture; they open
the adapter-resolved active SDE snapshot read-only.
