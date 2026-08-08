const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // Close all modals first
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(500);

  // 1. Capture editor area
  const editorAudit = await page.evaluate(() => {
    const results = {};
    // Editor toolbar
    const toolbar = document.querySelector(".editor-toolbar, .toolbar, #editor-toolbar");
    if (toolbar) {
      const cs = getComputedStyle(toolbar);
      results.toolbar = {
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding,
        gap: cs.gap,
        height: cs.height,
        borderBottom: cs.borderBottom.slice(0, 50)
      };
      // Check toolbar buttons
      const btns = toolbar.querySelectorAll("button, .toolbar-btn, .tool-btn");
      results.toolbarBtns = btns.length;
      if (btns.length > 0) {
        const bcs = getComputedStyle(btns[0]);
        results.toolbarBtn = {
          radius: bcs.borderRadius,
          padding: bcs.padding,
          font: bcs.fontSize,
          bg: bcs.backgroundColor.slice(0, 40)
        };
      }
    } else {
      results.toolbar = null;
    }

    // Editor content area
    const editor = document.querySelector(".editor-content, #editor, .editor-area, [contenteditable]");
    if (editor) {
      const cs = getComputedStyle(editor);
      results.editor = {
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding,
        font: cs.fontSize,
        lineHeight: cs.lineHeight,
        color: cs.color.slice(0, 40)
      };
    }

    // Chat area
    const chat = document.querySelector(".chat-area, #chat-panel, .chat-messages");
    if (chat) {
      const cs = getComputedStyle(chat);
      results.chat = {
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding
      };
    }

    // Left sidebar / tree
    const tree = document.querySelector(".tree, #tree, .chapter-tree, .sidebar-tree");
    if (tree) {
      const cs = getComputedStyle(tree);
      results.tree = {
        bg: cs.backgroundColor.slice(0, 40),
        width: cs.width,
        padding: cs.padding
      };
    }

    // Skill area (bottom left)
    const skillArea = document.querySelector(".skill-area, #skill-bar, .skill-panel");
    if (skillArea) {
      const cs = getComputedStyle(skillArea);
      results.skillArea = {
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding,
        height: cs.height
      };
    }

    // Main layout structure
    const layout = document.querySelector("#app, .app-container, .main-layout");
    if (layout) {
      const cs = getComputedStyle(layout);
      results.layout = {
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        height: cs.height
      };
    }

    // Check for any elements with hardcoded colors
    const allEls = document.querySelectorAll("*");
    let hardcodedColors = 0;
    for (let i = 0; i < Math.min(allEls.length, 500); i++) {
      const cs = getComputedStyle(allEls[i]);
      if (cs.color.startsWith("rgb(255, 255, 255)") || cs.color.startsWith("rgb(0, 0, 0)")) {
        hardcodedColors++;
      }
    }
    results.hardcodedColors = hardcodedColors;

    return results;
  });
  console.log("[EDITOR_AUDIT] " + JSON.stringify(editorAudit, null, 2));

  // 2. Screenshot main view
  await page.screenshot({ path: `test_evidence/deep_audit_main_${ts}.png` });
  console.log("[1] main captured");

  // 3. Try to open settings and capture
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='settings'], #btn-settings");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/deep_audit_settings_${ts}.png` });
  console.log("[2] settings captured");

  // 4. Check settings modal computed styles
  const modalAudit = await page.evaluate(() => {
    const results = {};
    const modal = document.querySelector(".modal.visible, .modal[style*='block'], #settings-modal, #config-modal");
    if (modal) {
      const cs = getComputedStyle(modal);
      results.modal = {
        display: cs.display,
        bg: cs.backgroundColor.slice(0, 40),
        width: cs.width,
        maxWidth: cs.maxWidth
      };
      const content = modal.querySelector(".modal-content, .modal-dialog, .modal-body");
      if (content) {
        const ccs = getComputedStyle(content);
        results.modalContent = {
          radius: ccs.borderRadius,
          padding: ccs.padding,
          bg: ccs.backgroundColor.slice(0, 40),
          shadow: ccs.boxShadow.slice(0, 60)
        };
      }
    }
    return results;
  });
  console.log("[MODAL_AUDIT] " + JSON.stringify(modalAudit, null, 2));

  // Close settings
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });

  await browser.close();
  console.log("[DONE]");
})();
