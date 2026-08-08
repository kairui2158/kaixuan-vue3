const fs = require("fs");
const css = `/* === Design Token System (Unified) ===
 * Single source of truth for all design tokens.
 * Replaces 3 duplicate :root blocks in style.css (lines 3, 2894, 3792).
 * Generated: 2026-07-18
 */

:root {
  /* --- Color: Background --- */
  --bg-primary: #0a0a0c;
  --bg-secondary: #121215;
  --bg-tertiary: #1a1a1f;
  --bg-elevated: #212129;
  --bg-input: #15151c;
  --bg-glass: rgba(20, 20, 28, 0.85);
  --bg-hover: rgba(124, 140, 248, 0.06);

  /* --- Color: Text --- */
  --text-primary: #e8e8ec;
  --text-secondary: #a0a2ac;
  --text-muted: #585866;
  --text-on-accent: #ffffff;

  /* --- Color: Accent --- */
  --accent: #7c8cf8;
  --accent-hover: #9da9fa;
  --accent-active: #6b7af0;
  --accent-light: #9da9fa;
  --accent-lighter: #b8c2fc;
  --accent-dim: rgba(124, 140, 248, 0.12);
  --accent-glow: rgba(124, 140, 248, 0.25);
  --accent-gradient: linear-gradient(135deg, #7c8cf8 0%, #9b6cf8 100%);
  --accent-gradient-hover: linear-gradient(135deg, #9da9fa 0%, #b07cf8 100%);

  /* --- Color: Status --- */
  --danger: #e0556a;
  --danger-hover: #c44558;
  --danger-light: #ee8a9a;
  --danger-dim: rgba(224, 85, 106, 0.12);
  --success: #4caf88;
  --success-light: #6ddab0;
  --success-dim: rgba(76, 175, 136, 0.12);
  --warning: #f0a050;
  --warning-bright: #ffa726;
  --warning-dim: rgba(240, 160, 80, 0.12);
  --info: #5b9cf5;
  --info-dim: rgba(91, 156, 245, 0.12);

  /* --- Color: Chat --- */
  --user-bubble: #1c2850;
  --ai-bubble: #18181e;

  /* --- Color: Border --- */
  --border-color: #25252e;
  --border-light: #35353f;
  --border-focus: #4a4a58;

  /* --- Spacing (2px base scale) --- */
  --space-0: 0px;
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 6px;
  --space-4: 8px;
  --space-5: 12px;
  --space-6: 16px;
  --space-7: 20px;
  --space-8: 24px;
  --space-10: 32px;
  --space-12: 40px;

  /* --- Spacing: Semantic aliases --- */
  --space-xxs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 24px;
  --gap: 8px;

  /* --- Border radius --- */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-btn: 6px;

  /* --- Shadow --- */
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.25);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
  --shadow: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
  --shadow-xl: 0 16px 48px rgba(0,0,0,0.55);
  --shadow-glow: 0 0 24px rgba(124, 140, 248, 0.15);
  --shadow-panel-sm: 0 2px 12px rgba(0, 0, 0, 0.2);

  /* --- Shadow: Accent --- */
  --shadow-accent-xs: 0 1px 4px rgba(124, 140, 248, 0.2);
  --shadow-accent-sm: 0 2px 8px rgba(124, 140, 248, 0.25);
  --shadow-accent-md: 0 4px 16px rgba(124, 140, 248, 0.35);
  --shadow-accent-hover: 0 1px 6px rgba(124, 140, 248, 0.2);
  --shadow-accent-sm-hover: 0 2px 10px rgba(124, 140, 248, 0.3);

  /* --- Shadow: Danger --- */
  --shadow-danger-xs: 0 1px 4px rgba(224, 85, 106, 0.2);
  --shadow-danger-sm: 0 2px 8px rgba(224, 85, 106, 0.25);
  --shadow-danger-md: 0 4px 16px rgba(224, 85, 106, 0.35);

  /* --- Blur --- */
  --blur-sm: blur(4px);
  --blur: blur(8px);
  --blur-lg: blur(16px);

  /* --- Font --- */
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* --- Font size (fixed, no clamp) --- */
  --font-size: 14px;
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  --font-size-editor: 16px;

  /* --- Font weight --- */
  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* --- Line height --- */
  --lh-tight: 1.3;
  --lh-normal: 1.6;
  --lh-loose: 1.8;

  /* --- Letter spacing --- */
  --ls-tight: -0.01em;
  --ls-normal: 0;
  --ls-wide: 0.04em;

  /* --- Opacity --- */
  --opacity-0: 0;
  --opacity-30: 0.3;
  --opacity-50: 0.5;
  --opacity-70: 0.7;
  --opacity-100: 1;

  /* --- Transition ---
   * WARNING: Do NOT use var() inside transition shorthand.
   * var() returning a full value causes shorthand parsing failure (duration=0s).
   * Use hardcoded values like "0.12s ease" in shorthand.
   */
  --transition-fast: 0.12s ease;
  --transition: 0.2s ease;
  --transition-slow: 0.3s ease;

  /* --- Easing --- */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* --- Transform --- */
  --tf-press: scale(0.97);
  --tf-lift: translateY(-1px);
  --tf-none: none;

  /* --- Button sizing --- */
  --btn-xs-height: 24px;
  --btn-sm-height: 28px;
  --btn-md-height: 32px;
  --btn-lg-height: 38px;
  --btn-xs-padding: 2px 8px;
  --btn-sm-padding: 4px 12px;
  --btn-md-padding: 6px 16px;
  --btn-lg-padding: 8px 20px;
  --btn-icon-size: 28px;
  --btn-icon-gap: 4px;

  /* --- Form sizing --- */
  --form-height: 28px;
  --form-padding: 4px 8px;

  /* --- Focus --- */
  --focus-ring: 2px solid var(--accent);
  --focus-ring-offset: 2px;
  --focus-glow: 0 0 0 3px var(--accent-dim);

  /* --- z-index --- */
  --z-base: 1;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 500;
  --z-modal: 1000;
  --z-toast: 9999;
  --z-tooltip: 10001;

  /* --- Color scheme --- */
  color-scheme: dark;
}
`;
fs.writeFileSync("styles/tokens.css", css, "utf8");
const lines = css.split("\n").length;
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
const important = (css.match(/!important/g) || []).length;
console.log("tokens.css written:", lines, "lines, brackets:", open + "/" + close, "important:", important);
