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

  // 1. Main screen
  await page.screenshot({ path: `test_evidence/audit_main_${ts}.png` });
  console.log("[1] main captured");

  // 2. Audit all visible elements for style consistency
  const audit = await page.evaluate(() => {
    const results = { issues: [], stats: {} };
    const all = document.querySelectorAll("*");
    let counts = { buttons: 0, inputs: 0, selects: 0, modals: 0, panels: 0, tabs: 0, cards: 0, tooltips: 0 };

    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const cls = el.className || "";

      if (tag === "button" || (typeof cls === "string" && cls.includes("btn"))) counts.buttons++;
      if (tag === "input" || tag === "textarea") counts.inputs++;
      if (tag === "select") counts.selects++;
      if (typeof cls === "string" && cls.includes("modal")) counts.modals++;
      if (typeof cls === "string" && cls.includes("panel")) counts.panels++;
      if (typeof cls === "string" && cls.includes("tab")) counts.tabs++;
      if (typeof cls === "string" && cls.includes("card")) counts.cards++;

      // Check for hardcoded colors (not using var)
      if (cs.backgroundColor.includes("rgb(") && !cs.backgroundColor.includes("rgba(0, 0, 0, 0)") && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
        // Skip transparent
      }

      // Check for elements with text that might have rendering issues
      if (tag === "button" || (typeof cls === "string" && cls.includes("btn"))) {
        const r = cs.borderRadius;
        if (r !== "6px" && r !== "0px" && r !== "2px" && r !== "99px" && r !== "50%") {
          results.issues.push({ type: "button_radius", selector: el.id || cls.slice(0, 40), radius: r });
        }
      }
    }
    results.stats = counts;
    return results;
  });
  console.log("[AUDIT] " + JSON.stringify(audit.stats, null, 2));
  if (audit.issues.length > 0) {
    console.log("[ISSUES] " + JSON.stringify(audit.issues.slice(0, 10), null, 2));
  } else {
    console.log("[ISSUES] none");
  }

  // 3. Open settings and screenshot
  try {
    await page.evaluate(() => {
      const btn = document.querySelector("[data-action='settings'], #btn-settings");
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test_evidence/audit_settings_${ts}.png` });
    console.log("[2] settings captured");

    // Check settings panel styles
    const settingsAudit = await page.evaluate(() => {
      const results = {};
      const checkSelectors = [
        ".form-group", ".form-group label", ".form-group select",
        ".modal-header", ".modal-footer", ".modal-body",
        ".btn-primary", ".btn-secondary", ".btn-danger",
        ".settings-section", ".config-section",
        "input[type='text']", "input[type='checkbox']",
        "input[type='range']", "select", "textarea"
      ];
      checkSelectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          const cs = getComputedStyle(el);
          results[sel] = {
            radius: cs.borderRadius,
            font: cs.fontSize,
            padding: cs.padding.slice(0, 30),
            bg: cs.backgroundColor.slice(0, 40),
            border: cs.border.slice(0, 40),
            shadow: cs.boxShadow.slice(0, 50),
            transition: cs.transition.slice(0, 50)
          };
        }
      });
      return results;
    });
    console.log("[SETTINGS_AUDIT] " + JSON.stringify(settingsAudit, null, 2).slice(0, 2000));
  } catch(e) {
    console.log("[SKIP] settings: " + e.message.slice(0, 60));
  }

  // 4. Close settings, try opening pipeline/generator panel
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(300);

  try {
    await page.evaluate(() => {
      const btn = document.querySelector("[data-action='pipeline'], #btn-pipeline, .nav-item[data-action='pipeline']");
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test_evidence/audit_pipeline_${ts}.png` });
    console.log("[3] pipeline captured");
  } catch(e) {
    console.log("[SKIP] pipeline: " + e.message.slice(0, 60));
  }

  // 5. Close all and take final clean shot
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test_evidence/audit_final_${ts}.png` });
  console.log("[4] final captured");

  await browser.close();
  console.log("[DONE]");
})();
