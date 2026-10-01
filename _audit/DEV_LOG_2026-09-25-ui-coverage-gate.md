# 2026-09-25 UI Coverage Gate Closure

## Goal

Close the remaining UI risks from the full-UI review: cover every E2E-openable view in the responsive overflow gate, fix the newly found overflow defects, remove the invalid verification-bridge setter, and rerun the complete verification chain on the final build.

## Changes

1. `scripts/verify-design-fusion-responsive-overflow.mjs`
   - Extended coverage from 24 to 42 views and from 341 to 605 responsive overflow cases across the same 320-2560px matrix.
   - Allowed `settings-modal` to be shared by `settings` and `skill-settings`, because they are two tabs of the same physical dialog.
   - Tightened the source-coverage scanner so dynamically bound `:modal-id` values are not misread as missing hardcoded identifiers.
   - Added the `memory` view open path, with `chapter-tree-context` waiting for `state: 'attached'`.
   - Replaced detached-state mutation with `globalThis.__skillEditState`, keeping stress injection and rendering in the same browser context.
   - Opened `pl-chapter-detail` through the state bridge instead of simulating an unlocated button click.
2. `src/components/common/MemoryPanel.vue`
   - Added `max-height` and `overflow: auto` to `.mem-blacklist-box`, `.mem-merge-box`, and `.mem-conflict-box`.
3. `src/components/pipeline/PipelineFlow.vue`
   - Converted `.pf-dialog` to a fixed-height flex column (`max-height`, `overflow: hidden`) and made `.pf-dialog-body` the scrollable region, matching the modal three-section rule from the UI experience file.
4. `src/components/pipeline/PipelinePanel.vue`
   - Changed `.pl-mode-label` from forced single-line to `white-space: normal` plus `overflow-wrap: anywhere`.
   - Added the `pipelineStore` getter to the existing verification bridge.
   - Removed the invalid `editingSettingItem` setter found by `vue-tsc`: the property is a readonly computed. The E2E writes `editingSettingId`, from which this computed is derived, so no test semantics changed.

## Verification Evidence

All commands were run from the repository root after the final source change.

```text
npm run type-check
  exit: 0
  (first run found PipelinePanel.vue:1292 TS2540; after removing the invalid computed setter, rerun exited 0)

npm run test:services
  Test Files  106 passed (106)
  Tests       1070 passed (1070)
  Duration    47.28s

npm run build:vue
  exit: 0
  renderer built in 8.89s
  provider protocols built in 163ms

node scripts/verify-design-fusion-responsive-overflow.mjs
  PASS: 605 responsive overflow cases verified across 12 widths and 42 views; sidebar tooltip cases=396

node scripts/verify-design-fusion-legacy.mjs
  design fusion legacy scan | phase=P0 | files=407
  PASS: 0 non-whitelisted legacy findings

node scripts/verify-design-fusion-visual-matrix.mjs
  PASS: 19 visual matrix screenshots are non-blank and distinct; density, layout, and responsive contracts verified

node scripts/probe-chapter-tree-overflow.mjs
  PASS: 300 chapter-tree stress cases verified
```

## Risk Result

Known actionable UI risks in the current verification scope are closed: no type errors, no service regressions, no responsive overflow findings across 605 cases, no non-whitelisted legacy-style coexistence, no blank/duplicated visual matrix entries, and no chapter-tree overflow in 300 stress cases. The full run intentionally rebuilds and verifies the final bundle, so these results reflect the delivered source rather than stale build output.
