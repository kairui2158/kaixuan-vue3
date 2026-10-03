# 2026-10-04 Final Draft Production Regression Repair

## Goal

Repair the 3.74.0 stalled-recovery production regression without reverting the user's 3.72-3.74 work, and require a real stalled-recovery Electron PASS before claiming closure.

## Root Cause

The failed live run had two independent semantic gaps:

1. `chainIntentRouter.ts` treated the constraint "不要改写正文含义" as `prohibition-rollback`, dropping the explicit final-draft instruction to read-only `discuss`.
2. After routing was fixed, `longDocumentExecutionPlanner.ts` still classified the request as `restructure` because `RESTRUCTURE_PATTERN` matched "整理排序 / 统一格式" and the explicit delivery phrase "输出完整终稿" was absent from `REWRITE_PATTERN`.

The first fix was therefore necessary but insufficient: routing only unlocks intent; the execution plan decides whether the final-draft runner is actually created.

## Changes

- `src/services/chainIntentRouter.ts`
  - Added `NON_REWRITE_CONSTRAINT_PATTERN` and `hasWholeDocumentWriteDirective()`.
  - `prohibition-rollback` now distinguishes a non-rewrite constraint from an actual prohibition of writing.
- `src/services/chainIntentRouter.spec.ts`
  - Added the original production instruction and the isolated constraint as regression cases.
- `src/services/longDocumentExecutionPlanner.ts`
  - Added explicit whole-document delivery phrases (`输出完整终稿`, `生成完整终稿`) to `REWRITE_PATTERN`.
- `src/services/longDocumentExecutionPlanner.spec.ts`
  - Added the production instruction as a contract test requiring `rewrite_segments` / `final-draft`.
- `scripts/verify-final-draft-electron.mjs`
  - `waitForSourceProgress()` now fails immediately when a turn is failed and no task exists, saving the evidence JSON instead of hanging until timeout.

## Verification

- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/finalDraftRunner.spec.ts`
  - 3 files / 87 tests passed.
- `npm run build:vue`
  - Passed (two Vite config/chunk warnings remain as known non-blocking warnings).
- `npm run type-check`
  - Passed.
- `npm run test:services`
  - 126 files / 1375 tests passed.
- `SHENYI_FINAL_DRAFT_SCENARIOS='stalled-recovery' SHENYI_FINAL_DRAFT_FAST_STALL_MS='12000' SHENYI_FINAL_DRAFT_STALLED_TIMEOUT_MS='180000' node scripts/verify-final-draft-electron.mjs`
  - Passed.
  - Evidence: `_audit/verification-final-draft-electron/stalled-recovery/record.json`.
  - Key evidence: `stalledTask=generating`, `recoveredTask=completed`, `finalTask=completed`, `finalEditorChars=62`, `totalRequests=6`, and all three `stalledEvent`, `retryEvent`, `providerSwitchEvent` are true.
- Failed-run evidence retained for regression audit:
  - `_audit/verification-final-draft-electron/home-turn-failure-1791060665549.json`

## G0.5 Lookback

- Original goal check: routing and planner are both fixed; the final-draft runner is now reached, stalled, retried, provider-switched, and completed in one visible Electron run.
- Diff check: this pass only touched the router, planner, their specs, the verifier failure path, documentation, and the temporary probe cleanup.
- Production and bypass scan: `rg` found no other planner call sites needing a matching phrase-list change; existing restructure and normalize tests remain green, so ordinary "整理排序 without 输出完整终稿" requests still use EditTask.
- Evidence authenticity: the previous failed run's JSON is retained, not overwritten as success; the new record is from this round.
- Packaging after repair:
  - `npm run build`: passed.
  - `node scripts/verify-packaging-3-74-0.mjs`: passed.
  - Installer: `dist\神意助手-Setup-3.74.0.exe`, 231,491,025 bytes.
  - SHA256: `de4b5a27a5bd48820ebc4c09b00a442fd4b09294abf2bead23fb3f8eb3d7e50d`
  - NSIS remains non-one-click and allows selecting the installation directory.
  - Packaged app launched successfully with 74 renderer files and 75 `electronAPI` methods.
  - Evidence: `_audit/verification-packaging-3-74-0/packaging-evidence.json`.

## Experience Gate Update

Extended G2.9: explicit whole-document delivery phrases must outrank restructure/normalize wording; constraint-only negatives must not revoke an explicit delivery request; after a semantic-layer migration, existing successful acceptance scenarios must be rerun rather than only new cases.

## Cleanup

- Removed `_data/tmp-router-probe.mjs`.
- Kept the failed evidence JSON as a regression record.
