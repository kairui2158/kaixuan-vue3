// Shared utilities for Manager modules (browser context)
// Extracted from 6 duplicate uid()/now() definitions (P1 dedup 2026-07-19)
// Rule 23: single source of truth for shared helpers
// Loaded via <script> in renderer.html, exposes window.Utils

(function() {
  "use strict";
  if (window.Utils) return; // already defined, skip

  function makeUid(prefix) {
    return prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return new Date().toISOString();
  }

  window.Utils = { makeUid: makeUid, now: now };
})();
