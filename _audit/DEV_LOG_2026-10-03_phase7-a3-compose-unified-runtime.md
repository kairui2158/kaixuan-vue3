# DEV LOG 2026-10-03 - Phase 7-A3 Compose Unified Runtime

## Objective

Connect outline workbench and home compose paths to the unified Agent runtime so selected SKILL content is injected as guidance without changing the application execution protocol.

## Implementation

- Outline compose now builds `composeSkillGuidance` via `buildWorkspaceSkillGuidance` and calls `askPlainAi` with `skillGuidance`, `skillIds`, `promptSource`, and `resumedApiBudget`.
- `askPlainAi` forwards those fields to `createAgentDialogueRuntime`; its physical request budget preserves a resumed budget limit when present.
- Home compose builds the same guidance and passes it through `callApi` into `createAgentDialogueRuntime`.
- Both legacy chain entry points now throw when invoked with compose mode, preventing silent regression to the old engine.
- Chain and final-draft paths remain intentionally unchanged.

## Verification

- Focused runtime tests: 3 files, 64 tests passed.
- `npm run type-check`: passed.
- `npm run test:services`: 126 files, 1357 tests passed.
- Evidence: `_audit/verification-phase7-maturity/phase-a3/`.

## G0.5 Lookback

- Compose is no longer routed through `runWorkspaceSkills`.
- Chain still uses `runWorkspaceSkills` by design; the new guards make accidental compose reuse fail loudly.
- Final-draft guidance functions remain the current final-draft wiring and are not duplicate compose paths.
- No old compose execution path was found.

## Not Claimed

- Real Electron UI validation and live API validation are Phase E scope. This phase verifies type-level and service-level wiring only.
