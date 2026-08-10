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

  // Ported from renderer_v2.js:2842 — word count for editor content
  function getWordCount() {
    var editor = document.getElementById("editor-content");
    if (!editor || !editor.value) return 0;
    var text = editor.value.trim();
    if (!text) return 0;
    return text.replace(/\s+/g, "").length;
  }

  // Ported from renderer_v2.js:2659 — estimate token count from text lengths
  function estimateTokens(userText, aiText) {
    var inputLen = (userText || "").length;
    var outputLen = (aiText || "").length;
    return Math.ceil((inputLen + outputLen) / 1.5);
  }

  // Ported from renderer_v2.js:2918 — auto-resize textarea height
  function autoResizeInput() {
    var inp = document.getElementById("user-input");
    if (!inp) return;
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 120) + "px";
  }

  // Ported from renderer_v2.js:3908 — save status info for exit dialog
  function getSaveStatusInfo() {
    var app = window.app || {};
    return {
      hasProject: !!app.currentProjectId,
      lastSaveTime: app._lastSaveTime ? new Date(app._lastSaveTime).toLocaleTimeString('zh-CN') : null,
      projectCount: (typeof ProjectManager !== 'undefined' && ProjectManager.getAll) ? ProjectManager.getAll().length : 0
    };
  }

  // Ported from renderer_v2.js:2092 — detect if text looks like JSON
  function looksLikeJSON(text) {
    if (!text || typeof text !== "string") return false;
    var t = text.trim();
    if (t.length === 0) return false;
    return t.charAt(0) === "[" || t.charAt(0) === "{";
  }

  window.Utils = { makeUid: makeUid, now: now, getWordCount: getWordCount, estimateTokens: estimateTokens, autoResizeInput: autoResizeInput, getSaveStatusInfo: getSaveStatusInfo, looksLikeJSON: looksLikeJSON };
})();
