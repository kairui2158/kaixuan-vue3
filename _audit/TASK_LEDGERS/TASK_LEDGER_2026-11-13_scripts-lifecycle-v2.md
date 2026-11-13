# scripts lifecycle V2 ledger

- Scope: 76 live P1-remaining scripts (20 decision-required + 56 quarantine-only).
- External-reference evidence: `_audit/scripts-lifecycle/INVENTORY_V2_2026-11-13.csv`.
- Plan: `_audit/scripts-lifecycle/BATCH_PLAN_V2_2026-11-13.md`.
- Summary: `_audit/scripts-lifecycle/P2_SUMMARY_V2_2026-11-13.tsv`.
- Archive manifest: `_audit/scripts-lifecycle/archive/v2/MANIFEST.tsv`.
- Result: keep 20; archive 74 across five independent tags and commits.
- Regression gate: type-check exit 0; 250 test files / 2734 tests passed.
- Packaging gate: full build exit 0; `verify:packaging` passed with rendererFiles=87 and electronAPI methods=94.
- Release: version 3.127.3; installer SHA-256 `F44B71979A7B71893B5C693AA606F7E0C660348636318E6B3FC639BDB9FD15C4`.
