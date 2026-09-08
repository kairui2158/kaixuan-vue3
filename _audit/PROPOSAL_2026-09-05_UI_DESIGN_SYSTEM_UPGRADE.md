# UI Design System Equivalent Implementation Upgrade Plan V2

> Date: 2026-09-05
> Status: Pending review, no execution
> Reference: Vuetify 3 source (MIT), WriterHelper comparison report
> Experience: S1, S3, S5
> Principle: Equivalent implementation via pure CSS. No third-party packages. No template/script/layout changes.
> V2 Note: V1 only covered consistency layer (fallback/shadow/radius/transition). V2 adds 7 more equivalent implementation layers from Vuetify Material 3 design system.

## 1. Problem Summary (5 confirmed + 7 missing layers)

### 5 Base Problems (from V1)

1. Hardcoded fallback conflicts: 28 components, 200+ occurrences of var(--xxx, #fallback) with inconsistent fallback values
2. box-shadow inconsistent: 15 components, some hardcoded, some reference undefined tokens
3. border-radius scattered: PipelinePanel alone has 47 declarations, fallback conflicts (var(--radius-md, 12px) vs token 8px)
4. transition no standard: 7 different durations, 3 ease variants, no unified animation curve tokens
5. No color palette derivation: --accent-dim/--danger-dim/--success-dim referenced but not properly defined via color-mix()

### 7 Missing Equivalent Implementation Layers (V2 additions)

6. Surface color overlay (Material 3 elevation): Higher elevation surfaces should get progressively lighter via color-mix overlay. Currently only box-shadow represents elevation, no surface tint change.
7. State Layer (Material 3 interaction): Interactive elements should use ::before pseudo-element + color-mix(in srgb, currentColor 8%, transparent) + opacity transition instead of direct background-color changes. Currently 0 components use this pattern.
8. Micro-interaction animations: Button press scale(0.97), card hover lift translateY(-1px), modal spring entrance, list item FLIP animation. Currently only 3 files have partial scale/press, no systematic approach.
9. Glassmorphism: --bg-glass is defined as rgba(20,20,28,0.85) but only 1 component (AiNamingModal:345) uses backdrop-filter. All overlay/loading elements should use backdrop-filter: blur() for frosted glass effect.
10. Skeleton shimmer: AiNamingModal has rough skeleton class but no shimmer shine animation. Need @keyframes shimmer + linear-gradient sweep.
11. Gradient system: --accent-gradient is defined but only 1 component (DeAiProgress) uses it. Should be systematically applied to primary buttons, titles, active states, progress bars.
12. Modal animation orchestration: Modals should use scale+fade composite transition with spring easing, staggered children. Currently modal-enter uses simple opacity 0.2s ease.

## 2. Vuetify Design Standards (Equivalent Implementation Basis)

### 2.1 Color Derivation (colorUtils.ts)
Vuetify: CIELAB L channel adjustment for lighten/darken, WCAG/APCA for text color.
Equivalent: CSS color-mix(in srgb, ...) - slightly less precise but visually sufficient, pure CSS.

### 2.2 Shadow/Elevation (_elevations.scss)
Vuetify: Dual-layer (key + ambient), 6 levels (0-5), plus surface color overlay (color-mix overlay-color z*2%).
Equivalent: 4 levels (0-3) dual box-shadow + color-mix() surface overlay.

### 2.3 State Layer (Material 3)
Vuetify: Interactive surfaces use state-layer overlay: ::before pseudo-element with color-mix(in srgb, currentColor 8-12%, transparent), opacity transition on hover/focus/active.
Equivalent: CSS ::before + color-mix + opacity. Zero JS, zero template change.

### 2.4 Animation Curves (_variables.scss)
Vuetify: standard= cubic-bezier(0.4,0,0.2,1), decelerated= cubic-bezier(0,0,0.2,1), accelerated= cubic-bezier(0.4,0,1,1). Duration 0.3s standard, 0.5s list move.
Equivalent: CSS --ease-standard/decelerated/accelerated vars. Already partially in tokens.css. Need to unify.

### 2.5 Glassmorphism
Vuetify: Uses backdrop-filter with blur on overlays and sheets.
Equivalent: --bg-glass + backdrop-filter: blur(var(--blur-md)) on overlays.

### 2.6 Typography Scale
Vuetify: 15-level M3 scale with size/weight/line-height/letter-spacing.
Equivalent: 7 levels (novel tool does not need display level). Already partially defined.

### 2.7 Spacing/Radius
Vuetify: spacer 4px base, 16 steps. border-radius: sm=2px, default=4px, md=4px, lg=8px.
Equivalent: Already have --space-1~10 and --radius-xs/sm/md/lg. Add --radius-pill and --radius-xl.

## 3. Implementation Plan (P0-P12)

### P0: tokens.css Core Foundation Completion

Scope: Only src/styles/tokens.css (dark theme :root block)

1. Color derivation tokens (via color-mix):
   --accent-dim, --accent-light, --accent-lighten, --accent-darken, --accent-container, --accent-glow
   --danger-dim, --danger-light, --danger-lighten, --danger-darken
   --success-dim, --success-light, --success-lighten
   --warning-dim, --warning-light, --info-dim, --info-light
   All via color-mix(in srgb, var(--xxx) N%, transparent/white/black)

2. Shadow system (dual-layer equivalent):
   --shadow-sm/md/lg/xl with key+ambient dual values
   --shadow-panel-sm, --shadow-border-accent, --shadow-accent-sm/md
   --shadow-focus-ring (replaces hardcoded focus rings)

3. Animation tokens (unified):
   --ease-standard, --ease-decelerated, --ease-accelerated, --ease-spring
   --duration-instant/fast/normal/slow
   --transition-fast/normal/color/shadow/transform/opacity
   Replace existing --transition-fast, --transition, --transition-slow
   Replace existing --ease-out, --ease-in-out with unified set
   Replace existing --transition-button/card/panel/input/tab

4. Typography scale (7 levels): --text-display/title-lg/title/body/small/label/caption

5. Missing tokens: --radius-pill, --radius-xl (16px)

6. NEW: Surface elevation color overlay tokens:
   --surface-overlay-1/2/3, --bg-elevated-1/2/3

7. NEW: State layer tokens:
   --state-layer-hover/focus/pressed/drag

8. NEW: Glassmorphism tokens:
   --glass-blur, --glass-saturate, --glass-bg, --glass-border

9. NEW: Shimmer skeleton tokens:
   --shimmer-bg, --shimmer-duration, --skeleton-bg

10. NEW: Micro-interaction tokens:
   --press-scale, --lift-hover, --modal-scale-in

11. NEW: Gradient system tokens:
   --grad-accent, --grad-accent-subtle, --grad-card-hover

12. Light theme: all new tokens get light-theme overrides.

Verify: npm run build:vue + token reference audit.

### P1: Hardcoded Fallback Removal

Scope: All .vue files with var(--xxx, #fallback). ~200+ occurrences across 28 components.
Rule: var(--accent, #4a9) -> var(--accent).
Do NOT touch: template, script, layout properties.
Verify: rg fallback pattern returns 0. build:vue success.

### P2: box-shadow Normalization

Scope: 15 components with hardcoded/undefined box-shadow.
Rules: hardcoded -> var(--shadow-*), focus rings -> var(--shadow-focus-ring).
Do NOT touch: MemoryPanel inset shadow (special interaction).

### P3: border-radius Normalization

Scope: All .vue with hardcoded border-radius (PipelinePanel 47 alone).
Rules: 4px->var(--radius-xs), 6px->var(--radius-sm), 8px->var(--radius-md), 12px->var(--radius-lg), 50%->var(--radius-pill), 16px->var(--radius-xl).
Fix: var(--radius-md, 12px) -> var(--radius-md) (resolves 12px vs 8px conflict).
Do NOT touch: SidebarNav.vue (special shape).

### P4: transition Normalization

Scope: All .vue with hardcoded transition duration/ease.
Rules: 0.12-0.2s ease -> var(--duration-fast) var(--ease-standard), 0.25-0.3s -> var(--duration-normal).
opacity -> var(--ease-decelerated), transform -> var(--ease-accelerated).
Do NOT touch: animation keyframe durations.

### P5: Surface Color Overlay (NEW V2)

Scope: base-components.css + selected .vue CSS
Principle: Apply --bg-elevated-1/2/3 based on elevation context.
.modal/.confirm-dialog -> var(--bg-elevated-2), .card/.panel -> var(--bg-elevated-1), .custom-context-menu -> var(--bg-elevated-3).
Component CSS: PipelineCard/AiNamingModal/SettingsModal/ProjectModal/DashboardModal backgrounds.
Do NOT touch: layout properties. Only background color.

### P6: State Layer Implementation (NEW V2)

Scope: base-components.css only
Principle: ::before pseudo-element + color-mix(currentColor) + opacity transition.
Target classes: .btn-secondary, .btn-ghost, .modal-tab, .list-item, .item-row, .card-item, .menu-item, .ctx-menu-item.
Add: position:relative + overflow:hidden on targets, ::before with state-layer vars.
Remove: direct background-color hover where state layer handles it.
Note: .btn-primary, .btn-danger keep direct bg changes.
Note: position:relative + overflow:hidden required for ::before - CSS-only, no DOM change.

### P7: Micro-interaction Animations (NEW V2)

Scope: base-components.css + global.css keyframes
1. Button press: .btn:active transform var(--press-scale)
2. Card hover lift: .card-item:hover transform var(--lift-hover)
3. Modal spring: @keyframes modalEnter/modalLeave in global.css
4. List stagger: @keyframes staggerIn in global.css
5. Progress sweep: @keyframes indeterminateSweep in global.css
Do NOT touch: existing animation keyframe durations in components.

### P8: Glassmorphism Enhancement (NEW V2)

Scope: base-components.css + global.css + AiNamingModal.vue CSS
1. .panel-overlay/.loading-overlay -> var(--glass-bg) + backdrop-filter var(--glass-blur)
2. .confirm-backdrop -> backdrop-filter var(--glass-blur)
3. AiNamingModal: replace blur(4px) with var(--glass-blur)
4. Sticky headers -> glass bg + backdrop-filter
Do NOT touch: template, script, layout.

### P9: Skeleton Shimmer (NEW V2)

Scope: global.css + base-components.css + AiNamingModal.vue CSS
1. @keyframes shimmer in global.css
2. .skeleton class with ::after shimmer sweep in base-components.css
3. .skeleton-text/.skeleton-block variants
4. Replace AiNamingModal rough skeleton with .skeleton class
Do NOT touch: template, script.

### P10: Gradient System Application (NEW V2)

Scope: base-components.css + selected .vue CSS
1. .btn-primary -> background var(--grad-accent)
2. .card-item:hover -> background var(--grad-card-hover)
3. .modal-tab.active -> background var(--grad-accent-subtle)
4. PipelinePanel progress bar -> var(--grad-accent)
5. .section-title -> gradient text clip
Do NOT touch: template, script.

### P11: Modal Animation Orchestration (NEW V2)

Scope: global.css + base-components.css
1. .modal-enter-active: composite opacity+transform with spring easing
2. Staggered children with transition-delay
3. .slide-enter/leave: unified easing
4. .fade-enter/leave: unified easing
Do NOT touch: template, script, Vue transition names.

### P12: Build Verification + Visual Check

No file changes. Pure verification:
1. npm run build:vue success
2. type-check success
3. All patterns verified (rg returns 0)
4. Source Electron launch + visual check
5. Check: settings, pipeline, editor+chat, outline workspace, naming modal, memory, diag log, plugin market
6. Light theme toggle
7-13. Verify: surface elevation, state layer, press scale, glass blur, shimmer, gradient, modal spring

## 4. Strict Behavior Constraints

### 4.1 Files allowed to change
- tokens.css (P0): New token definitions
- global.css (P5,P7,P8,P9,P11): Keyframes, transitions, glass, shimmer
- base-components.css (P5,P6,P7,P8,P9,P10): State layer, micro-interactions, glass, skeleton, gradient
- components/**/*.vue CSS only (P1-P4): Fallback/shadow/radius/transition normalization

### 4.2 Files NOT to touch
- src/services/**/*.ts: AI service logic
- src/stores/**/*.ts: Pinia store state
- electron/**/*.js: Electron main process
- components/**/*.vue template: DOM structure
- components/**/*.vue script: Component logic
- composables/**/*.ts: Composition functions
- vite.config.*: Build config
- package.json: No new dependencies
- test/spec files: Test scripts

### 4.3 Allowed CSS property changes
- P1: var(--xxx, #fallback) -> var(--xxx)
- P2: box-shadow -> var(--shadow-*)
- P3: border-radius -> var(--radius-*)
- P4: transition -> var(--duration-*) var(--ease-*)
- P5: background -> var(--bg-elevated-N)
- P6: position:relative + overflow:hidden + ::before pseudo-element
- P7: transform on :active/:hover + @keyframes
- P8: backdrop-filter + background + border
- P9: @keyframes + .skeleton classes
- P10: background gradient -> var(--grad-*)
- P11: transition properties on Vue transition classes

FORBIDDEN across all phases: display, flex, flex-direction, padding, margin, gap, width, height, position (except P6), z-index, overflow (except P6), grid, align, justify.

### 4.4 Per-step verification (from S3, S5)
1. npm run build:vue success
2. git diff --stat only expected files
3. git diff line-by-line (M3)
4. No template/script changes
5. Light theme works

## 5. Equivalent Implementation Declaration

No Vuetify install. No package.json changes. No SCSS/Sass. All within existing CSS variable system.

### Equivalence table
- CIELAB lighten/darken -> CSS color-mix (slightly less precise, sufficient)
- SCSS dual shadow -> CSS multi-value box-shadow (fully equivalent)
- SCSS easing vars -> CSS --ease-* vars (fully equivalent)
- SCSS typography map -> CSS --text-* vars (fully equivalent)
- elevation overlay -> CSS color-mix() surface (fully equivalent)
- Material 3 state layer -> CSS ::before + color-mix(currentColor) (fully equivalent)
- Flutter shader -> CSS @keyframes + opacity (different technique, similar feel)

### Known gaps (accepted)
1. No WCAG/APCA auto contrast correction
2. No runtime theme derivation
3. No component ripple micro-interaction
4. No Flutter custom shaders

## 6. Risk Analysis (from S1, S3, S5)

### Highest: Token resolution failure
- P0 must complete ALL tokens before P1 removes fallbacks (M1 + S5 rule 1)

### High: State Layer ::before breaking layouts
- P6 only targets base classes, not scoped styles (M3, S5 rule 2)

### Medium: color-mix compatibility
- Chromium 130+ in Electron 33. Fully supported.

### Medium: Surface overlay regression
- P5 only base-components.css. P12 visual check. (S3 rule 1)

### Low: Normalization regression
- P12 visual check. (S3 rule 1)

## 7. Execution Order

P0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8 -> P9 -> P10 -> P11 -> P12

Each step: change -> build:vue -> diff self-review -> next.

## 8. Experience File References

### S1 (改码纪律)
- M1: rg references before change. M2: apply_patch line-by-line. M3: git diff self-audit.

### S3 (验证纪律)
- Rule 1: Build != feature complete. Rule 3: No evidence = not done. Rule 17: build:vue before UI. Rule 37: CDP fallback.

### S5 (UI 纪律)
- Rule 1: tokens.css is sole variable source. Rule 8: flex title min-width:0. Rule 12: progress overlay binds active layer.
