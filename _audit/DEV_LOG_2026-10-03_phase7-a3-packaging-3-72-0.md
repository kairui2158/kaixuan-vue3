# DEV LOG 2026-10-03 - Phase 7-A3 Packaging 3.72.0

## Objective

Close Phase 7-A3 by updating the engineering gate file, removing obsolete runtime debris, and packaging the unified compose runtime work as version 3.72.0.

## Experience File Update

- Preserved the existing `G0.11` real-interaction ban.
- Extended `G0.10` so migrated execution paths must retain defensive assertions in the old engine, specifically preventing compose mode from silently falling back to the legacy chain engine.
- Extended `G1.14` so verification evidence is attributed to the actual execution path, and prohibited using injected "SKILL loaded" state as evidence of real UI selection.
- Added `G2.13 SKILL execution neutrality`: SKILL guidance may alter prompts and domain capability only; it must not alter execution protocol, permission semantics, or runtime routing. Compose, chain, and final-draft paths must remain separately wired according to their own semantics.

## Cleanup

- Archived the two Phase 7 historical runtime logs to `_audit/verification-phase7-maturity/phase-e-runtime-logs/`.
- Removed the obsolete `.phase7-runtime/` temporary directory after confirming the proposal text was its only reference.
- Removed the obsolete root-level `test-path.bat` after confirming no production, test, or script references.
- Removed the previous `3.71.0` NSIS installer and its blockmap after successful verification of `3.72.0`.

## Packaging

- Version upgraded from `3.71.0` to `3.72.0`.
- Added `scripts/verify-packaging-3-72-0.mjs`.
- Built the NSIS installer at `dist/神意助手-Setup-3.72.0.exe`.

## Verification

- `node --check electron/preload.js`: passed.
- `node --check scripts/verify-packaging-3-72-0.mjs`: passed.
- `npm run type-check`: passed.
- `npm run test:services`: 126 files, 1357 tests passed.
- `npm run verify:production-wiring`: 385 modules, 1285 dependencies, no violations.
- `npm run build`: renderer build and NSIS packaging completed.
- `node scripts/verify-packaging-3-72-0.mjs`: passed with real packaged app startup.
- Evidence: `_audit/verification-packaging-3-72-0/packaging-evidence.json`.
- Installer SHA256: `d5d83a1db18ba0d52c001edd5e55690f697c260fc5ff8bde0e23be51b751320e`.

## G0.5 Lookback

- The archived Phase E logs remain historical evidence and are not current runtime failures.
- The repository now has one current installer version, `3.72.0`.
- The experience file update does not alter application code.
- No unresolved references to `.phase7-runtime` or `test-path.bat` remain.

## Not Claimed

- This packaging pass verifies application launch and packaging integrity, not Phase E live API or real user-workflow behavior. Those validations remain scoped to Phase E.
