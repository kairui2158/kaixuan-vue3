# 2026-11-13 scripts lifecycle V2 settlement

## Contract

- Settle the remaining 76 live scripts from P1 dispositions: 20 decision-required and 56 quarantine-only.
- Preserve every script with a real external entry or consumer. Archive only internally closed or obsolete verification chains.
- Keep quarantine-only content byte-identical and archive it under a separate V2 root.

## Evidence and adjudication

- External-reference scan covered `package.json`, `src`, `electron`, and `docs` for all 94 surviving scripts.
- 18 P1-keep scripts remained external-live. Two decrypt helpers stayed because `verify-deai-stage-guidance-live.mjs`, `verify-pipeline-provider-channel-electron.mjs`, and the retired parallelism verifier invoked them.
- 17 deai calibration-chain scripts and their tests/libs had zero external references and one internally closed consumer graph; archived as V2-B01.
- The obsolete direct-write V2 E2E had zero external/internal references; archived as V2-B05.
- The remaining 53 quarantine-only scripts were moved without mutation in three batches.

## Batches

| batch | action | files | tag | commit |
| --- | --- | --- | --- | --- |
| V2-B01 | archive-deai-calibration | 18 | `scripts-lifecycle-v2-01-archive-deai` | `5cde8e87` |
| V2-B02 | archive-quarantine-a | 20 | `scripts-lifecycle-v2-02-archive-quarantine-a` | `0876dcc5` |
| V2-B03 | archive-quarantine-b | 20 | `scripts-lifecycle-v2-03-archive-quarantine-b` | `4498c51b` |
| V2-B04 | archive-quarantine-c | 15 | `scripts-lifecycle-v2-04-archive-quarantine-c` | `7181f60a` |
| V2-B05 | archive-obsolete-e2e | 1 | `scripts-lifecycle-v2-05-archive-obsolete-e2e` | `c42959be` |

## Verification

- Pre-remove and post-remove external-reference assertions ran for all 74 archived leaf names; every `rg` result was exit 1.
- SHA-256 source/archive equality asserted for all 74 files in `_audit/scripts-lifecycle/archive/v2/MANIFEST.tsv`.
- Every batch created a pre-tag, ledger, staged-path allowlist check, commit, and unstaged-residue check.
- `npm run type-check` exit 0.
- `npm run test:services` passed 250 test files and 2734 tests.
- `npm run build` exit 0.
- `npm run verify:packaging` exit 0 with `PACKAGING 3.127.3 VERIFICATION PASSED`; `rendererFiles=87`, `electronAPI methods=94`.
- Release evidence: `_audit/verification-packaging-3.127.3/packaging-evidence.json`.

## Boundary

- No product source, dependency, folder SKILL, or user untracked material changed.
- Local master remains unmerged; its 11,735-file independent diff still requires a separate audit.
- Temporary planning/execution instruments are confined to `scripts/tmp/` and are not release assets.
- Released as 3.127.3: `dist/神意助手-Setup-3.127.3.exe`, 231,669,408 bytes, SHA-256 `F44B71979A7B71893B5C693AA606F7E0C660348636318E6B3FC639BDB9FD15C4`.
