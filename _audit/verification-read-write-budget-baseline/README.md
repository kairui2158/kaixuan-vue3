# Read/Write Budget Repair Baseline (Phase 0)

This directory is the permanent Phase 0 evidence set for the approved proposal
`_audit/PROPOSAL_2026-10-10_READ_WRITE_BUDGET_CELL_LEVEL_REPAIR.md`.

## Contents

- `replay-summary.json`: machine-readable statistics extracted from the real 205,713-character replay trace.
- `semantic-inventory.md`: classified inventory of every old shared-budget and stale map-semantics producer/consumer.
- `decision-ledger.md`: research-to-decision entries for previously lost findings.
- `fixtures/`: immutable regression fixture references.

## Regeneration

The replay summary can be regenerated without a model request:

```powershell
node scripts/analyze-read-write-budget-trace.mjs (Resolve-Path "_data/outline-lock-override-live-replay-profile/documents-data/run-trace/outline/run-trace-outline-20261010-003831/run-trace.json").Path
```

The analyzer reads the saved trace only. It performs no network request and does not mutate the trace.
