# 2026-09-23 Sidebar Tooltip Overflow Fix

## Goal

Fix the reported homepage sidebar symptom where clicking/hovering a left-rail image showed only partial tooltip text. Extend the fix to hover-state pseudo-element overflow at all four viewport edges, remove the verifier's false-green geometry, and close the responsive/zoom blind spots from the previous design-fusion reviews.

## Root Causes

1. **Clipped tooltip geometry.** The old global CSS tooltip was positioned on the left side of the collapsed rail while `.app-container` retained `overflow: hidden`. The pseudo-element escaped its host box but was clipped by the ancestor, so users saw incomplete characters.
2. **False-green verifier.** The old responsive overflow script did not measure the rendered `::after` tooltip. It constructed its own assumed rectangle from CSS constants, so it passed even when the real pseudo-element was clipped or collapsed. In addition, `::after` could contribute to default-state `scrollWidth`, which is not the same measurement as real text overflow.
3. **Reversed available-space algebra.** The first controller revision computed the right-side available width with the wrong combination of viewport and host-rect values. Right-edge hosts fell back to the 32px minimum width, recreating the incomplete-text symptom at narrow widths.
4. **No fallback when neither side fits.** The initial flip rule only flipped when the entire tooltip fit on the left. At 320px with a right-edge host and a 280px tooltip, neither side fit, the flip was skipped, and the tooltip was squeezed to a 32px-wide column. The final rule picks the side with more available space and shrinks the tooltip to that side's width.

## Changes

1. `src/styles/global.css`
   - Tooltip defaults to the right side with `left: calc(100% + var(--space-2))`.
   - Added `.tooltip-flipped` to place the tooltip on the left when the right side is too narrow.
   - Added `--tooltip-max-width` and `--tooltip-clamp-y` inline clamps for edge placement.
2. `src/services/tooltipController.ts`
   - Rewrote the controller as stateless hover/focus placement logic.
   - Reads real used `::after` geometry through `getComputedStyle`; when Chrome returns `auto` during the synchronous mouseenter segment, it falls back to a 280px estimate.
   - Computes left and right safe spaces independently with an 8px viewport margin on each side.
   - Applies four placement states: right default, left flip, larger-side fallback with width shrink, and vertical clamp.
   - Uses a rAF second pass to verify computed geometry, and clears classes plus inline variables on exit.
3. `src/main.ts`
   - Initialized the tooltip controller after diagnostics startup.
4. `scripts/verify-design-fusion-responsive-overflow.mjs`
   - Added `measureTooltip()` and `tooltipRect()` helpers that read actual pseudo-element geometry, placement class, and clamping variables.
   - Replaced assumed tooltip rectangles with measured geometry.
   - Added `verifyTooltipEdgePlacement()`: four synthetic fixed hosts at the left, right, top, and bottom viewport edges assert that every tooltip edge is inside the viewport, width is at least 64px, and right-edge hosts select the wider side.
   - Expanded the tooltip contract to 22 cases per main width (18 real sidebar hosts plus 4 synthetic edge hosts), yielding 396 tooltip assertions across 18 main-view runs.

## Review Findings

| Round | Focus | Finding |
|---:|---|---|
| 1 | User-visible symptom | Tooltip was clipped by `.app-container overflow: hidden`, not by missing text content |
| 2 | Default-state overflow scan | `::after` can pollute `scrollWidth`; hover geometry must be measured separately from default-state text width |
| 3 | Edge algebra | Initial right-space formula was reversed, causing right-edge 32px fallback |
| 4 | Neither-side-fits | 320px right-edge host with 280px tooltip required larger-side selection and width shrink |
| 5 | Verifier truth source | Replaced script-constructed expected rectangles with measured used geometry |
| 6 | Zoom regression | 12-width responsive matrix rerun after the final controller and CSS changes |
| 7 | New/old coexistence | Old WeakMap-based controller implementation deleted; no old and new placement implementations coexist |
| 8 | Cleanup gate | Temporary probe script deleted and verified absent before finalization |

## Verification Evidence

All commands were run from the repository root after the final source changes.

```text
node --check scripts/verify-design-fusion-responsive-overflow.mjs
  exit: 0

npm run type-check
  exit: 0

npm run build:vue
  exit: 0
  final renderer bundle: dist-renderer/assets/index-BRw4fu5J.js

node scripts/verify-design-fusion-responsive-overflow.mjs
  PASS: 341 responsive overflow cases verified across 12 widths and 24 views; sidebar tooltip cases=396

node scripts/verify-design-fusion-visual-matrix.mjs
  PASS: 19 visual matrix screenshots are non-blank and distinct; density, layout, and responsive contracts verified

node scripts/verify-design-fusion-legacy.mjs
  PASS: 0 non-whitelisted legacy findings
  scanned files: 340

node scripts/verify-app-confirm-layering.mjs
  [PASS] confirm dialog above workspace overlay
  [PASS] Escape closes only the confirm layer
  [PASS] outline reset clears selected context
  [PASS] all clears clear scoped context
  app confirm layering regression complete
  profile cleanup retained after retries: EPERM; profile removed=true

npx vitest run src/services/editTaskService.spec.ts src/services/editTaskExecutor.spec.ts --no-cache
  Test Files  2 passed (2)
       Tests  12 passed (12)
```

The visual matrix run is long-running and was monitored to completion; its final PASS line is quoted above. The `EPERM` line in the confirm-layering output is a normal Windows profile-cleanup retry result, and the profile was removed successfully.
