# Legacy System Map (patched366 snapshot)

This repo includes a *frozen* snapshot map of the legacy reference system (`patched366`).

**Why this exists:** translation must remain mechanically trackable, even across context windows. We must not “forget” pages or APIs.

## Source of truth

- `docs/LEGACY_SYSTEM_MAP__patched366.v1.json` — machine baseline
- `docs/LEGACY_PARITY_LEDGER.v1.json` — translation progress ledger

## Gates

- `npm run legacy:map:validate` — verifies ledger coverage exactly matches the legacy snapshot
- `npm run legacy:parity` — prints progress and writes `dist/legacy_parity.report.v1.json`
- `npm run legacy:parity:strict` — fails unless translation is 100% complete

## Completion definition

Translation is 100% complete only when:

1. `npm run legacy:map:validate` passes (no missing/extra items)
2. `npm run legacy:parity:strict` passes (done == total)

